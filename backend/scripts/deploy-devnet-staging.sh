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

sam deploy \
  --stack-name hypechain-backend \
  --region "$REGION" \
  --capabilities CAPABILITY_IAM \
  --resolve-image-repos \
  --no-confirm-changeset \
  --parameter-overrides \
    "DsqlEndpoint=${DSQL_ENDPOINT}" \
    "DsqlClusterArn=${DSQL_CLUSTER_ARN}" \
    "DsqlRegion=${REGION}" \
    "DsqlDatabase=postgres" \
    "CustodialSecretId=hypechain/server-wallet" \
    "FrontendUrl=https://hypechain.vercel.app" \
    "SolanaRpcUrl=https://api.devnet.solana.com" \
    "DasRpcUrl=https://api.devnet.solana.com" \
    "OpenRouterApiKey=${HACKNYU_OPENROUTER_API_KEY}" \
    "NftStorageApiKey=${HACKNYU_NFT_STORAGE_API_KEY}" \
    "HeliusWebhookSecret=${HACKNYU_HELIUS_WEBHOOK_SECRET:-}"

echo
echo "Done. Grab the Function URL from the Outputs above, then:"
echo "  curl <FunctionUrl>/health"
echo "  curl <FunctionUrl>/api/activities"
echo "Then set NEXT_PUBLIC_API_URL=<FunctionUrl> on Vercel (Production + Preview) and redeploy."
