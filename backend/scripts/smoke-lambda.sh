#!/usr/bin/env bash
# Smoke-test the deployed Lambda Function URL.
#
# Usage:
#   ./scripts/smoke-lambda.sh https://<fn-id>.lambda-url.<region>.on.aws
#
# Or pull the URL straight from the CloudFormation stack outputs:
#   ./scripts/smoke-lambda.sh "$(aws cloudformation describe-stacks \
#     --stack-name hypechain-backend \
#     --query 'Stacks[0].Outputs[?OutputKey==`FunctionUrl`].OutputValue' \
#     --output text)"
#
# What this verifies:
#   1. The Function URL is reachable (DNS + TLS work).
#   2. /health returns 200 with the expected JSON shape — proves the
#      container booted, env vars are loaded, and Express is responding.
#   3. / returns the API info JSON — proves routing is wired.
#   4. CORS preflight from the Vercel frontend origin returns 200 with
#      Access-Control-Allow-Origin matching the expected value.
#
# What this does NOT do:
#   - Create a listing (would mint a real devnet NFT — burn server-wallet SOL).
#   - Process a payment (requires a buyer wallet + signed transaction).
#   Do those from the production frontend after wiring NEXT_PUBLIC_API_URL.

set -euo pipefail

URL="${1:-}"
if [[ -z "$URL" ]]; then
  echo "ERROR: pass the Function URL as the first arg." >&2
  echo "Usage: $0 https://<fn-id>.lambda-url.<region>.on.aws" >&2
  exit 2
fi

# Strip trailing slash for clean concatenation
URL="${URL%/}"

FRONTEND_ORIGIN="${FRONTEND_ORIGIN:-https://hypechain.vercel.app}"

pass() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1"; FAILED=1; }
FAILED=0

echo "Target: $URL"
echo "Frontend origin (for CORS check): $FRONTEND_ORIGIN"
echo

# ---------------------------------------------------------------------------
# 1. /health — proves the container booted and Express is responding
# ---------------------------------------------------------------------------
echo "[1/3] GET /health"
HEALTH_RESPONSE=$(curl -s -o /tmp/smoke-health.json -w '%{http_code}' \
  --max-time 30 \
  "$URL/health" || echo "000")

if [[ "$HEALTH_RESPONSE" == "200" ]]; then
  pass "HTTP 200"
  STATUS=$(python3 -c "import json; print(json.load(open('/tmp/smoke-health.json')).get('status', 'MISSING'))" 2>/dev/null || echo "PARSE_ERROR")
  if [[ "$STATUS" == "healthy" ]]; then
    pass "JSON status: healthy"
  else
    fail "JSON status was: $STATUS (expected 'healthy')"
    cat /tmp/smoke-health.json
  fi
else
  fail "HTTP $HEALTH_RESPONSE (expected 200) — cold start? check CloudWatch logs"
  cat /tmp/smoke-health.json 2>/dev/null || echo "(no response body)"
fi
echo

# ---------------------------------------------------------------------------
# 2. / — proves routing is wired
# ---------------------------------------------------------------------------
echo "[2/3] GET /"
ROOT_RESPONSE=$(curl -s -o /tmp/smoke-root.json -w '%{http_code}' \
  --max-time 15 \
  "$URL/" || echo "000")

if [[ "$ROOT_RESPONSE" == "200" ]]; then
  pass "HTTP 200"
  HAS_ENDPOINTS=$(python3 -c "import json; d=json.load(open('/tmp/smoke-root.json')); print('yes' if 'endpoints' in d else 'no')" 2>/dev/null || echo "no")
  if [[ "$HAS_ENDPOINTS" == "yes" ]]; then
    pass "API info JSON includes 'endpoints' map"
  else
    fail "JSON missing 'endpoints' field — wrong app booted?"
  fi
else
  fail "HTTP $ROOT_RESPONSE (expected 200)"
fi
echo

# ---------------------------------------------------------------------------
# 3. CORS preflight from the Vercel frontend
# ---------------------------------------------------------------------------
echo "[3/3] OPTIONS /api/create-listing (CORS preflight from $FRONTEND_ORIGIN)"
CORS_HEADERS=$(curl -s -i -o /dev/null -D /tmp/smoke-cors.headers -w '%{http_code}' \
  --max-time 15 \
  -X OPTIONS \
  -H "Origin: $FRONTEND_ORIGIN" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  "$URL/api/create-listing" || echo "000")

if [[ "$CORS_HEADERS" == "200" || "$CORS_HEADERS" == "204" ]]; then
  pass "HTTP $CORS_HEADERS"
  if grep -qi "access-control-allow-origin" /tmp/smoke-cors.headers; then
    ALLOWED=$(grep -i "access-control-allow-origin" /tmp/smoke-cors.headers | tr -d '\r' | sed 's/.*: //')
    if [[ "$ALLOWED" == "$FRONTEND_ORIGIN" || "$ALLOWED" == "*" ]]; then
      pass "Access-Control-Allow-Origin: $ALLOWED"
    else
      fail "Access-Control-Allow-Origin: $ALLOWED (expected $FRONTEND_ORIGIN)"
    fi
  else
    fail "no Access-Control-Allow-Origin header in response"
    cat /tmp/smoke-cors.headers
  fi
else
  fail "HTTP $CORS_HEADERS (expected 200 or 204)"
  cat /tmp/smoke-cors.headers 2>/dev/null || true
fi
echo

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
if [[ "$FAILED" -eq 0 ]]; then
  printf '\033[32m✓ All smoke checks passed.\033[0m Lambda is ready for frontend wiring.\n'
  printf '\nNext: set NEXT_PUBLIC_API_URL=%s on Vercel (Production + Preview),\n' "$URL"
  printf 'redeploy the frontend, then create a listing from the production UI.\n'
  exit 0
else
  printf '\033[31m✗ One or more checks failed.\033[0m Tail CloudWatch logs:\n'
  printf '  sam logs --stack-name hypechain-backend --tail\n'
  exit 1
fi
