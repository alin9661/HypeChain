#!/usr/bin/env bash
# Deploy the HypeChain backend to AWS Lambda (devnet staging).
#
# Secrets are read from your shell env so they never land in samconfig, git, or
# a process listing's argv beyond this invocation. Set them first:
#
#   export HACKNYU_OPENROUTER_API_KEY=...   # https://openrouter.ai/keys
#   export HACKNYU_NFT_STORAGE_API_KEY=...  # https://nft.storage/manage
#   # optional (activity feed): export HACKNYU_HELIUS_WEBHOOK_SECRET=$(openssl rand -hex 32)
#   # optional (admin export):  export HACKNYU_WAITLIST_EXPORT_TOKEN=$(openssl rand -hex 32)
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

# Admin export token is optional. Same rule as Helius: SAM rejects an empty
# "Key=" and the template defaults it to '', so only pass it when set. Without
# it, GET /api/waitlist/export returns EXPORT_NOT_CONFIGURED by design.
if [ -n "${HACKNYU_WAITLIST_EXPORT_TOKEN:-}" ]; then
  PARAM_OVERRIDES+=( "WaitlistExportToken=${HACKNYU_WAITLIST_EXPORT_TOKEN}" )
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
  --parameter-overrides "${PARAM_OVERRIDES[@]}"

echo
echo "Done. Grab the Function URL from the Outputs above, then:"
echo "  curl <FunctionUrl>/health"
echo "  curl <FunctionUrl>/api/activities"
echo "Then set NEXT_PUBLIC_API_URL=<FunctionUrl> on Vercel (Production + Preview) and redeploy."
