#!/usr/bin/env bash
# Deploy the HypeChain backend to AWS Lambda (devnet staging).
#
# Secrets are read from your shell env so they never land in samconfig, git, or
# a process listing's argv beyond this invocation. Set them first:
#
#   export HACKNYU_OPENROUTER_API_KEY=...   # https://openrouter.ai/keys
#   export HACKNYU_NFT_STORAGE_API_KEY=...  # https://nft.storage/manage
#   # optional (activity feed): export HACKNYU_HELIUS_WEBHOOK_SECRET=$(openssl rand -hex 32)
#
# Then:  cd backend && ./scripts/deploy-devnet-staging.sh
#
# Prereqs already provisioned (us-east-1):
#   • Aurora DSQL cluster qjt3zldyhx2oaemd37zt3yypcu (schema applied)
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
