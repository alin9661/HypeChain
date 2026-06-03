#!/usr/bin/env bash
#
# smoke-test.sh — post-deploy smoke test for the HypeChain FastAPI backend.
#
# Asserts the always-on, side-effect-free endpoints (GET / and GET /health)
# return 200 against a base URL (the Lambda Function URL). Then provides a
# COMMENTED create-listing -> payment round-trip skeleton: it documents the
# exact request shapes the frontend sends, but does NOT fire them by default
# because create-listing spends real AI / IPFS / Solana-devnet resources and
# mutates state. Uncomment + supply a real base64 image to exercise it.
#
# Contract parity: the response key-sets the frontend depends on are pinned in
# backend-py/tests/test_parity.py (CREATE_LISTING_SUCCESS_KEYS, etc.). After a
# live create-listing, diff the returned JSON keys against those constants (and,
# if EXPRESS_URL is set, against the Express response) to catch silent drift.
#
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: smoke-test.sh <base-url>
   or: BASE_URL=<base-url> smoke-test.sh

Curls GET / and GET /health against <base-url> and asserts HTTP 200.
<base-url> is the Lambda Function URL, e.g. https://abc123.lambda-url.us-east-1.on.aws

The create-listing -> payment round trip is included as a COMMENTED skeleton
(request shapes only) — it is not run automatically because it costs real
resources and mutates state. See the comments below to enable it.
EOF
}

BASE_URL="${1:-${BASE_URL:-}}"
if [ -z "$BASE_URL" ] || [ "$BASE_URL" = "-h" ] || [ "$BASE_URL" = "--help" ]; then
  usage
  [ -z "${BASE_URL:-}" ] && exit 2 || exit 0
fi

# Strip any trailing slash so we build clean URLs.
BASE_URL="${BASE_URL%/}"

PASS=0
FAIL=0

# assert_200 <path> <human-label>
assert_200() {
  local path="$1" label="$2" url status
  url="${BASE_URL}${path}"
  echo "--- GET ${url}  (${label}) ---"
  # -s silent, -S show errors, -o body to stdout, write the status code last.
  status="$(curl -sS -o /tmp/smoke_body.$$ -w '%{http_code}' "$url" || true)"
  echo "  status: ${status}"
  echo "  body  : $(cat /tmp/smoke_body.$$ 2>/dev/null)"
  rm -f /tmp/smoke_body.$$
  if [ "$status" = "200" ]; then
    echo "  PASS"
    PASS=$((PASS + 1))
  else
    echo "  FAIL (expected 200)"
    FAIL=$((FAIL + 1))
  fi
  echo
}

echo "=== HypeChain backend smoke test against ${BASE_URL} ==="
echo

# ---------------------------------------------------------------------------
# 1) Liveness — root discovery doc and health probe. Both must be 200.
# ---------------------------------------------------------------------------
assert_200 "/"        "root discovery document"
assert_200 "/health"  "health probe (Function URL health check)"

# ---------------------------------------------------------------------------
# 2) Create-listing -> payment round trip — COMMENTED SKELETON (request shapes).
#
# These DO mutate state and spend AI/IPFS/Solana resources, so they are left
# commented. To exercise the round trip:
#   a) export PRODUCT_IMAGE_B64 with a real "data:image/png;base64,..." string
#      (or a bare base64 payload — the backend validates both forms),
#   b) uncomment the blocks below,
#   c) run against a DEVNET deployment only.
#
# Field names are the camelCase WIRE names the frontend sends (pydantic aliases
# in app/schemas/listing.py and app/schemas/payment.py).
# ---------------------------------------------------------------------------
#
# # --- 2a) Create a listing (POST /api/create-listing) ---
# # Request shape (CreateListingRequest):
# #   userWallet | userEmail   (one required)
# #   productImage             (base64 / data-URL; required)
# #   optionalPriceSol         (number, optional)
# #   verificationModelId      (optional; must be a valid vision model)
# #   imageGenModelId          (optional; must be a valid image-gen model)
# CREATE_RESP="$(curl -sS -X POST "${BASE_URL}/api/create-listing" \
#   -H 'Content-Type: application/json' \
#   -d "$(cat <<JSON
# {
#   "userWallet": "REPLACE_WITH_DEVNET_PUBKEY",
#   "productImage": "${PRODUCT_IMAGE_B64}",
#   "optionalPriceSol": 0.1
# }
# JSON
# )")"
# echo "create-listing response: ${CREATE_RESP}"
# #
# # PARITY CHECK: the success body must carry exactly these keys (see
# # tests/test_parity.py CREATE_LISTING_SUCCESS_KEYS):
# #   success, listing_id, nft_mint_address, nft_image_url, product_name,
# #   listing_price_sol, status, is_pending_claim, message, verification
# # Diff them, e.g. with jq:
# #   echo "$CREATE_RESP" | jq -S 'keys'
# # and compare against the documented set (and against EXPRESS_URL if running a
# # live Express instance for the parity diff).
# #
# LISTING_ID="$(echo "$CREATE_RESP" | jq -r '.listing_id')"
#
# # --- 2b) Create a payment for that listing (POST /api/payments/create) ---
# # Request shape (PaymentCreateRequest): listingId, buyerWallet
# PAY_CREATE_RESP="$(curl -sS -X POST "${BASE_URL}/api/payments/create" \
#   -H 'Content-Type: application/json' \
#   -d "$(cat <<JSON
# {
#   "listingId": "${LISTING_ID}",
#   "buyerWallet": "REPLACE_WITH_DEVNET_BUYER_PUBKEY"
# }
# JSON
# )")"
# echo "payment-create response: ${PAY_CREATE_RESP}"
#
# # --- 2c) Verify the payment after signing the tx on-chain (POST /api/payments/verify) ---
# # Request shape (PaymentVerifyRequest): signature, listingId, buyerWallet, buyerUserId
# # (signature comes from the wallet after it submits the Solana Pay transaction.)
# curl -sS -X POST "${BASE_URL}/api/payments/verify" \
#   -H 'Content-Type: application/json' \
#   -d "$(cat <<JSON
# {
#   "signature": "REPLACE_WITH_TX_SIGNATURE",
#   "listingId": "${LISTING_ID}",
#   "buyerWallet": "REPLACE_WITH_DEVNET_BUYER_PUBKEY"
# }
# JSON
# )"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo "=== smoke summary: ${PASS} passed, ${FAIL} failed ==="
if [ "$FAIL" -ne 0 ]; then
  exit 1
fi
echo "Liveness OK. To exercise the create-listing -> payment round trip, uncomment"
echo "section 2 and run against a devnet deployment."
