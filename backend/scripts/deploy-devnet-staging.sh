#!/usr/bin/env bash
# Deploy the HypeChain backend to AWS Lambda (devnet staging).
#
# Secrets are read from your shell env so they never land in samconfig, git, or
# a process listing's argv beyond this invocation. Set them first:
#
#   export HACKNYU_OPENROUTER_API_KEY=...   # https://openrouter.ai/keys
#   export HACKNYU_NFT_STORAGE_API_KEY=...  # https://nft.storage/manage
#   # optional (activity feed): export HACKNYU_HELIUS_WEBHOOK_SECRET=$(openssl rand -hex 32)
#   # optional (activity backfill): export HACKNYU_HELIUS_API_KEY=...
#   # optional (admin export):  export HACKNYU_WAITLIST_EXPORT_TOKEN=$(openssl rand -hex 32)
#   # optional (waitlist email — set the VERIFIED sender to turn emails on):
#   #   export HACKNYU_SES_SENDER="noreply@yourdomain.com"
#   #   export HACKNYU_WAITLIST_ADMIN_EMAIL="you@example.com"   # admin-notify target
#
# Then:  cd backend && ./scripts/deploy-devnet-staging.sh
#
# After `sam deploy`, this script applies schema/001_dsql_schema.sql to the
# cluster (idempotent) so the DB never drifts behind the app code.
#
# Prereqs already provisioned (us-east-1):
#   • Aurora DSQL cluster qjt3zldyhx2oaemd37zt3yypcu
#   • Secrets Manager secret hypechain/server-wallet (custodial key)
#   • `sam build` runs clean (arm64 image)
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
DSQL_ENDPOINT="qjt3zldyhx2oaemd37zt3yypcu.dsql.us-east-1.on.aws"
DSQL_CLUSTER_ARN="arn:aws:dsql:us-east-1:012417848464:cluster/qjt3zldyhx2oaemd37zt3yypcu"

: "${HACKNYU_OPENROUTER_API_KEY:?set HACKNYU_OPENROUTER_API_KEY in your env first}"
: "${HACKNYU_NFT_STORAGE_API_KEY:?set HACKNYU_NFT_STORAGE_API_KEY in your env first}"

cd "$(dirname "$0")/.."

sam build

PARAM_OVERRIDES=(
  "DsqlEndpoint=${DSQL_ENDPOINT}"
  "DsqlClusterArn=${DSQL_CLUSTER_ARN}"
  "DsqlRegion=${REGION}"
  "DsqlDatabase=postgres"
  "CustodialSecretId=hypechain/server-wallet"
  "FrontendUrl=https://hypechain.vercel.app"
  "SolanaRpcUrl=https://api.devnet.solana.com"
  "DasRpcUrl=https://api.devnet.solana.com"
  # Deployed devnet marketplace program ID (contracts/.../lib.rs declare_id!).
  # Required: evidence-locker-client.js throws at module load in production if
  # this is empty or the Anchor scaffold placeholder.
  "MarketplaceProgramId=2pTtzWXELYNXAsXkWq3zgErbYnJTANfq5LmBptdk5uiF"
  "OpenRouterApiKey=${HACKNYU_OPENROUTER_API_KEY}"
  "NftStorageApiKey=${HACKNYU_NFT_STORAGE_API_KEY}"
)

# Helius webhook secret is optional (powers the activity feed). Only pass it
# when set: SAM rejects an empty "Key=" value, and the template defaults this
# parameter to '' so omitting it is the correct "not configured" state.
if [ -n "${HACKNYU_HELIUS_WEBHOOK_SECRET:-}" ]; then
  PARAM_OVERRIDES+=( "HeliusWebhookSecret=${HACKNYU_HELIUS_WEBHOOK_SECRET}" )
fi

# Helius API key is optional (deferred activity backfill). Same rule: only
# pass it when set. The live stack has this set, so omitting the env var on a
# redeploy reverts it to '' — export it alongside the webhook secret.
if [ -n "${HACKNYU_HELIUS_API_KEY:-}" ]; then
  PARAM_OVERRIDES+=( "HeliusApiKey=${HACKNYU_HELIUS_API_KEY}" )
fi

# Admin export token is optional. Same rule as Helius: SAM rejects an empty
# "Key=" and the template defaults it to '', so only pass it when set. Without
# it, GET /api/waitlist/export returns EXPORT_NOT_CONFIGURED by design.
if [ -n "${HACKNYU_WAITLIST_EXPORT_TOKEN:-}" ]; then
  PARAM_OVERRIDES+=( "WaitlistExportToken=${HACKNYU_WAITLIST_EXPORT_TOKEN}" )
fi

# Waitlist emails are gated on the VERIFIED sender, not on a separate enable
# flag. email.js throws without HACKNYU_SES_SENDER, so a deploy that "enabled"
# emails with no sender would 500 every send; gating the whole block on the
# sender means "forgot the sender => emails stay off" (matches the template's
# WaitlistEmailsEnabled=false default) rather than "on but broken".
if [ -n "${HACKNYU_SES_SENDER:-}" ]; then
  PARAM_OVERRIDES+=(
    "WaitlistEmailsEnabled=true"
    "SesSender=${HACKNYU_SES_SENDER}"
  )
  # Admin-notify target is optional: without it, sendAdminSignupNotification
  # skips with { skipped: 'no-recipient' } and the user confirmation still sends.
  if [ -n "${HACKNYU_WAITLIST_ADMIN_EMAIL:-}" ]; then
    PARAM_OVERRIDES+=( "WaitlistAdminEmail=${HACKNYU_WAITLIST_ADMIN_EMAIL}" )
  fi
  # NOTE: the SES IAM grant is intentionally Resource: '*' (template.yaml) — SES
  # authorizes ses:SendEmail against the RECIPIENT identity too, and waitlist
  # recipients are arbitrary, so a sender-identity scope can't work. No
  # SesIdentityArn override is passed.
fi

# Make THIS deploy's waitlist email/export state visible. CloudFormation reverts
# any parameter you don't re-pass to its template default, so a redeploy from a
# shell that forgot to re-export HACKNYU_SES_SENDER / HACKNYU_WAITLIST_EXPORT_TOKEN
# silently flips emails back off and clears the export token. Printing the state
# makes that reset loud instead of silent — read it before walking away.
if [ -n "${HACKNYU_SES_SENDER:-}" ]; then
  echo "waitlist email:  ON  (sender=${HACKNYU_SES_SENDER}, admin=${HACKNYU_WAITLIST_ADMIN_EMAIL:-<unset>})"
else
  echo "waitlist email:  OFF (HACKNYU_SES_SENDER not set — emails disabled this deploy)"
fi
if [ -n "${HACKNYU_WAITLIST_EXPORT_TOKEN:-}" ]; then
  echo "waitlist export: ENABLED (token passed)"
else
  echo "waitlist export: DISABLED (HACKNYU_WAITLIST_EXPORT_TOKEN not set — export returns 500)"
fi

# Apply the DSQL schema BEFORE deploying the function, so new code never goes
# live against a cluster that's missing a table it expects. Idempotent
# (CREATE ... IF NOT EXISTS) and fail-closed: a bad apply aborts the deploy
# (set -e), so a fresh table like `waitlist` is guaranteed present before the
# code that reads it ships — instead of 500ing with `relation ... does not exist`.
echo "Applying DSQL schema (idempotent)..."
HACKNYU_DSQL_ENDPOINT="$DSQL_ENDPOINT" AWS_REGION="$REGION" \
  ./scripts/apply-dsql-schema.sh

sam deploy \
  --stack-name hypechain-backend \
  --region "$REGION" \
  --capabilities CAPABILITY_IAM \
  --resolve-image-repos \
  --resolve-s3 \
  --no-confirm-changeset \
  --no-fail-on-empty-changeset \
  --parameter-overrides "${PARAM_OVERRIDES[@]}"

echo
echo "Done. Grab the Function URL from the Outputs above, then:"
echo "  curl <FunctionUrl>/health"
echo "  curl <FunctionUrl>/api/activities"
echo "Then set NEXT_PUBLIC_API_URL=<FunctionUrl> on Vercel (Production + Preview) and redeploy."
