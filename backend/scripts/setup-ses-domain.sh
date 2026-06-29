#!/usr/bin/env bash
# Verify a domain as an Amazon SES sending identity via EasyDKIM, end-to-end.
#
# This is Part B2 of the waitlist go-live (see docs/deployment/WAITLIST_GOLIVE_RUNBOOK.md).
# It assumes the domain is ALREADY registered in Route 53 (Part B1) — registering
# a domain charges your account and needs your WHOIS contact info, so this script
# deliberately does NOT do it. When you register via Route 53 Domains, a hosted
# zone is created automatically; this script finds that zone and writes the DKIM
# records into it, then waits for SES to mark the identity Verified.
#
# What it does (all free + reversible — no money, no purchase):
#   1. Create the SES email identity for the domain (EasyDKIM; idempotent).
#   2. Read the 3 DKIM CNAME tokens SES generated.
#   3. UPSERT those 3 CNAMEs into the domain's Route 53 hosted zone.
#   4. Poll until SES reports DKIM verification SUCCESS (DNS propagation: minutes).
#
# After this succeeds, `noreply@<domain>` (any address @<domain>) can be used as
# HACKNYU_SES_SENDER. You still need Part B4 (production access) before the
# sandbox will deliver to unverified public recipients.
#
# Usage:  ./scripts/setup-ses-domain.sh <domain> [region]
#   e.g.  ./scripts/setup-ses-domain.sh hypechain.ai
set -euo pipefail

DOMAIN="${1:?usage: setup-ses-domain.sh <domain> [region]   (e.g. hypechain.ai)}"
REGION="${2:-${AWS_REGION:-us-east-1}}"

command -v aws >/dev/null 2>&1 || { echo "error: aws CLI not found on PATH" >&2; exit 1; }

# Normalize: strip any trailing dot and lowercase, so "Hypechain.AI." == "hypechain.ai".
DOMAIN="$(printf '%s' "$DOMAIN" | tr '[:upper:]' '[:lower:]' | sed 's/\.$//')"

# Reject anything outside the LDH (letters/digits/hyphen) + dot charset of a real
# domain. $DOMAIN is operator-supplied (not an attacker surface) and only ever
# reaches a file:// change-batch, never `eval` — so this isn't a shell-injection
# fix. But a stray quote, backslash, or space would silently corrupt the JSON
# change-batch (built with printf below) and produce a confusing Route 53 error
# instead of a clear one. Fail loudly here on a malformed name.
[[ "$DOMAIN" =~ ^[a-z0-9.-]+$ ]] || { echo "error: invalid domain '${DOMAIN}' (expected letters/digits/hyphen/dot)" >&2; exit 1; }

echo "==> SES identity for ${DOMAIN} (region ${REGION})"

# 1. Create the identity if it doesn't exist yet. create-email-identity defaults
#    to EasyDKIM (SES generates the keypair + tokens). It errors if the identity
#    already exists, so check first and treat "already there" as success — the
#    whole script is safe to re-run.
if aws sesv2 get-email-identity --email-identity "$DOMAIN" --region "$REGION" >/dev/null 2>&1; then
  echo "    identity already exists — reusing it"
else
  echo "    creating identity (EasyDKIM)..."
  aws sesv2 create-email-identity --email-identity "$DOMAIN" --region "$REGION" >/dev/null
fi

# 2. Read the 3 DKIM tokens. EasyDKIM always yields exactly 3; fail loudly if not,
#    rather than write a partial record set that can never verify.
echo "==> Reading DKIM tokens"
read -r -a TOKENS <<<"$(aws sesv2 get-email-identity --email-identity "$DOMAIN" \
  --region "$REGION" --query 'DkimAttributes.Tokens' --output text)"
if [ "${#TOKENS[@]}" -ne 3 ]; then
  echo "error: expected 3 DKIM tokens, got ${#TOKENS[@]} (${TOKENS[*]:-none}). Is EasyDKIM enabled?" >&2
  exit 1
fi
printf '    %s\n' "${TOKENS[@]}"

# 3. Find the hosted zone for this exact domain. Registering the domain in Route 53
#    auto-creates this zone; if it's missing, the domain isn't on Route 53 DNS and
#    you must add the CNAMEs at whatever registrar/DNS host is authoritative.
#
#    Route 53 allows MORE THAN ONE zone with the same name (a public + a private
#    split-horizon zone, or a leftover duplicate). Blindly taking [0] could write
#    the DKIM records into a zone the registrar's NS delegation does not point at
#    — DKIM would never resolve publicly and the poll below would burn the full
#    timeout with no hint why. So require exactly one match and fail loudly on
#    ambiguity. Zone IDs are `/hostedzone/<id>` (no spaces), so the unquoted
#    word-split into the array is safe and stays bash 3.2-compatible (macOS).
echo "==> Locating Route 53 hosted zone for ${DOMAIN}"
ZONE_LIST="$(aws route53 list-hosted-zones-by-name --dns-name "$DOMAIN" \
  --query "HostedZones[?Name=='${DOMAIN}.'].Id" --output text)"
ZONE_IDS=()
for _z in $ZONE_LIST; do [ -n "$_z" ] && [ "$_z" != "None" ] && ZONE_IDS+=("$_z"); done
if [ "${#ZONE_IDS[@]}" -eq 0 ]; then
  echo "error: no Route 53 hosted zone for ${DOMAIN}." >&2
  echo "       If the domain lives at another DNS host, add these 3 CNAMEs there instead:" >&2
  for t in "${TOKENS[@]}"; do
    echo "         ${t}._domainkey.${DOMAIN}.  CNAME  ${t}.dkim.amazonses.com" >&2
  done
  exit 1
fi
if [ "${#ZONE_IDS[@]}" -gt 1 ]; then
  echo "error: ${#ZONE_IDS[@]} hosted zones match ${DOMAIN}; refusing to guess which to write to:" >&2
  printf '         %s\n' "${ZONE_IDS[@]}" >&2
  echo "       Remove the duplicate (or pick the public one the registrar delegates to) and re-run." >&2
  exit 1
fi
ZONE_ID="${ZONE_IDS[0]#/hostedzone/}"
echo "    zone: ${ZONE_ID}"

# 4. UPSERT the 3 DKIM CNAMEs. UPSERT (not CREATE) keeps the script idempotent —
#    re-running overwrites the same records instead of erroring on "already exists".
echo "==> Writing DKIM CNAME records (UPSERT)"
CHANGES=""
for t in "${TOKENS[@]}"; do
  [ -n "$CHANGES" ] && CHANGES+=","
  CHANGES+=$(cat <<JSON
{"Action":"UPSERT","ResourceRecordSet":{"Name":"${t}._domainkey.${DOMAIN}","Type":"CNAME","TTL":1800,"ResourceRecords":[{"Value":"${t}.dkim.amazonses.com"}]}}
JSON
)
done
BATCH_FILE="$(mktemp)"
trap 'rm -f "$BATCH_FILE"' EXIT
printf '{"Comment":"SES EasyDKIM for %s","Changes":[%s]}' "$DOMAIN" "$CHANGES" >"$BATCH_FILE"
CHANGE_ID="$(aws route53 change-resource-record-sets --hosted-zone-id "$ZONE_ID" \
  --change-batch "file://${BATCH_FILE}" --query 'ChangeInfo.Id' --output text)"
echo "    submitted change ${CHANGE_ID}"

# 5. Poll SES for DKIM verification. Propagation is usually minutes; cap the wait
#    so the script can't hang forever in CI/automation.
echo "==> Waiting for SES to verify DKIM (this is DNS propagation; usually a few minutes)"
DEADLINE=$(( $(date +%s) + 1800 ))   # 30 min cap
while :; do
  STATUS="$(aws sesv2 get-email-identity --email-identity "$DOMAIN" \
    --region "$REGION" --query 'DkimAttributes.Status' --output text 2>/dev/null || echo UNKNOWN)"
  case "$STATUS" in
    SUCCESS)
      echo "    DKIM verified ✔"
      break
      ;;
    FAILED)
      echo "error: SES reports DKIM status FAILED for ${DOMAIN}. Check the CNAMEs resolve." >&2
      exit 1
      ;;
    *)
      if [ "$(date +%s)" -ge "$DEADLINE" ]; then
        echo "error: timed out waiting for DKIM verification (last status: ${STATUS})." >&2
        echo "       DNS can take longer; re-run this script later to resume polling." >&2
        exit 1
      fi
      printf '    status=%s … rechecking in 30s\n' "$STATUS"
      sleep 30
      ;;
  esac
done

echo
echo "Done. ${DOMAIN} is a verified SES sender."
echo "  • Use it as the From address:  export HACKNYU_SES_SENDER=\"noreply@${DOMAIN}\""
echo "  • Still in the SES sandbox — request production access (Part B4) before"
echo "    real public recipients receive mail; until then, verify each recipient."
