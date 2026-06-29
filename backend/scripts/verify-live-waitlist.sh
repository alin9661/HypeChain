#!/usr/bin/env bash
# Live smoke test for the deployed waitlist endpoint (Part D verification).
#
# Hits the real Lambda Function URL — no AWS creds needed, just the public URL —
# and checks the storage path end-to-end: health, a signup POST, and (if you
# pass the export token) the admin CSV export. It does NOT assert email delivery
# (that's a manual inbox check) — only that the API round-trips and persists.
#
# Idempotent by design: it submits a FIXED smoke address, so re-runs hit the
# route's dedupe path (alreadyOnList) instead of piling junk rows into the
# waitlist table. The signup returns 200 on both a fresh row and a dup — the
# route has no 201 path. It still leaves ONE persistent row in the production
# waitlist table (the source of truth), which also shows in the admin export;
# scrub that row before sharing an export.
#
# SMOKE_EMAIL must be a DELIVERABLE inbox you control: with emails enabled a
# fresh signup sends a real SES confirmation, so an undeliverable address (a
# reserved TLD like .test, or any dead mailbox) hard-bounces and dings sender
# reputation right when the account is newly out of the sandbox. It defaults to
# $HACKNYU_WAITLIST_ADMIN_EMAIL.
#
# Usage:
#   FUNCTION_URL=https://<id>.lambda-url.us-east-1.on.aws \
#   [SMOKE_EMAIL=you@yourdomain.com] [HACKNYU_WAITLIST_EXPORT_TOKEN=<token>] \
#     ./scripts/verify-live-waitlist.sh
set -euo pipefail

FUNCTION_URL="${FUNCTION_URL:?set FUNCTION_URL to the deployed Lambda Function URL}"
FUNCTION_URL="${FUNCTION_URL%/}"   # strip any trailing slash
TOKEN="${HACKNYU_WAITLIST_EXPORT_TOKEN:-}"

command -v curl >/dev/null 2>&1 || { echo "error: curl not found on PATH" >&2; exit 1; }
fail() { echo "FAIL: $*" >&2; exit 1; }

# Resolve a DELIVERABLE smoke recipient. Default to the admin inbox (exported at
# deploy); require one rather than fall back to an undeliverable placeholder.
SMOKE_EMAIL="${SMOKE_EMAIL:-${HACKNYU_WAITLIST_ADMIN_EMAIL:-}}"
[ -n "$SMOKE_EMAIL" ] || fail "set SMOKE_EMAIL (or HACKNYU_WAITLIST_ADMIN_EMAIL) to a deliverable inbox you control"
# Reject RFC 2606 / 6761 reserved TLDs — they can't receive mail, so with emails
# enabled they guarantee a hard bounce.
case "${SMOKE_EMAIL##*.}" in
  test|example|invalid|localhost)
    fail "SMOKE_EMAIL '${SMOKE_EMAIL}' uses a reserved/undeliverable TLD — use a real inbox" ;;
esac

# curl helper: prints the body, then a final line "<<<HTTP <code>" so we can
# split status from body without -o/-D temp files.
http() { curl -sS -m 30 -w '\n<<<HTTP %{http_code}' "$@"; }
status_of() { printf '%s' "$1" | sed -n 's/^<<<HTTP //p' | tail -1; }
body_of()   { printf '%s' "$1" | sed '$d'; }   # everything but the trailing status line

echo "==> Target: ${FUNCTION_URL}"

# 1. Health — fast fail if the function isn't up at all.
echo "==> [1/3] GET /health"
RES="$(http "${FUNCTION_URL}/health")" || fail "health request errored"
[ "$(status_of "$RES")" = "200" ] || fail "health returned $(status_of "$RES") (expected 200)"
printf '%s' "$(body_of "$RES")" | grep -q '"status":"healthy"' || fail "health body not healthy: $(body_of "$RES")"
echo "    healthy ✔"

# 2. Signup — the core storage path. The route returns 200 on both a fresh row
#    and a dup (no 201 path); accept 200/201 defensively.
echo "==> [2/3] POST /api/waitlist (${SMOKE_EMAIL})"
RES="$(http -X POST "${FUNCTION_URL}/api/waitlist" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Smoke Test\",\"email\":\"${SMOKE_EMAIL}\",\"interest\":\"collect\"}")" \
  || fail "signup request errored"
CODE="$(status_of "$RES")"; BODY="$(body_of "$RES")"
case "$CODE" in
  200|201) : ;;
  *) fail "signup returned ${CODE} (expected 200/201). Body: ${BODY}" ;;
esac
printf '%s' "$BODY" | grep -q '"success":true' || fail "signup body missing success:true: ${BODY}"
# A fresh row and a normal dup both carry an HC-W- receipt id. The route also has
# a rare race-loss branch (insert lost to a concurrent signup, row not yet
# visible) that returns success + alreadyOnList with NO id — still a healthy 2xx,
# so accept it rather than false-FAIL on a working server.
if printf '%s' "$BODY" | grep -qE '"id":"HC-W-[A-Z0-9]+"'; then
  SUBMISSION_ID="$(printf '%s' "$BODY" | sed -n 's/.*"id":"\(HC-W-[A-Z0-9]*\)".*/\1/p')"
  echo "    ${CODE} — submission ${SUBMISSION_ID} ✔"
elif printf '%s' "$BODY" | grep -q '"alreadyOnList":true'; then
  echo "    ${CODE} — alreadyOnList, no receipt id (race-loss branch) ✔"
else
  fail "signup body has neither an HC-W- id nor alreadyOnList: ${BODY}"
fi

# 3. Export — only if a Bearer token was provided. Without one the endpoint
#    fails closed (EXPORT_NOT_CONFIGURED / 500), which is correct, not a smoke
#    failure — so we skip rather than fail when the token is absent.
echo "==> [3/3] GET /api/waitlist/export"
if [ -z "$TOKEN" ]; then
  echo "    skipped (set HACKNYU_WAITLIST_EXPORT_TOKEN to exercise the CSV export)"
else
  # Pass the bearer token via a 0600 curl config file, not argv — a token on the
  # command line is readable by other local users via `ps`/proc (the same reason
  # the deploy script keeps secrets out of argv). mktemp creates the file 0600;
  # the EXIT trap removes it even on `fail`.
  CURL_CFG="$(mktemp)"; trap 'rm -f "$CURL_CFG"' EXIT
  printf 'header = "Authorization: Bearer %s"\n' "$TOKEN" > "$CURL_CFG"
  RES="$(http --config "$CURL_CFG" "${FUNCTION_URL}/api/waitlist/export")" \
    || fail "export request errored"
  [ "$(status_of "$RES")" = "200" ] || fail "export returned $(status_of "$RES") (expected 200; check the token matches the deploy)"
  # grep -F: match the address literally — an email's . / + are regex metachars.
  printf '%s' "$(body_of "$RES")" | grep -qF "$SMOKE_EMAIL" \
    || fail "export CSV did not contain the smoke signup ${SMOKE_EMAIL}"
  echo "    200 — CSV contains ${SMOKE_EMAIL} ✔"
fi

echo
echo "PASS — live waitlist storage path is healthy."
echo "Note: this verifies API + persistence only. Email delivery + confirmation_sent_at"
echo "      stamping require a real signup with emails enabled (check the inbox + DSQL)."
