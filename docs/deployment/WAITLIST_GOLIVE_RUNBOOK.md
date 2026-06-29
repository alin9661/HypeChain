# Waitlist go-live runbook (SES domain → deploy → live form)

Operator runbook for taking the waitlist from "stores signups" to "stores signups
**and** sends DKIM-signed email from a custom domain, to real public recipients."

Every step here is **yours to run** — they spend money (domain), submit AWS
approvals (production access), or use secrets only you hold (API keys, custodial
deploy). Commands are copy-paste ready. The worked example domain is
`hypechain.ai`; substitute whatever you register.

```
B1 register domain ──► B2 DKIM-verify (setup-ses-domain.sh) ──► C deploy (emails on)
   (money, one-time)      (free, ~minutes)                          (needs B2 + secrets)
                       └► B3 verify gmail recipient (sandbox bridge)
                       └► B4 request production access (AWS approval, hours–day)
D Vercel wiring + live smoke test — independent of B; do anytime, but the
  end-to-end email check needs C deployed and B2/B4 done.
```

**Prerequisite:** the Part A PR (`feat/waitlist-emails`) must be merged — it adds
`@aws-sdk/client-ses` and the deploy-script SES wiring this runbook relies on.

Set once per shell:

```bash
export DOMAIN=hypechain.ai
export REGION=us-east-1
```

---

## B1 — Register the domain (you run; charges your account)

`.ai` via Route 53 is **$129/yr** (registration + renewal). Registering also
auto-creates the Route 53 hosted zone that B2 writes DKIM records into.

**Easiest:** AWS Console → Route 53 → *Registered domains* → *Register domains* →
search `hypechain.ai` → add to cart → fill contact info → enable privacy
protection → confirm the $129 charge.

**Or via CLI** (needs a contact JSON; registration is async — watch the operation
id). Save your contact block to `contact.json`:

```json
{
  "FirstName": "Aaron", "LastName": "Lin",
  "ContactType": "PERSON",
  "AddressLine1": "…", "City": "…", "State": "…",
  "CountryCode": "US", "ZipCode": "…",
  "PhoneNumber": "+1.5555555555",
  "Email": "aaronlin098@gmail.com"
}
```

```bash
aws route53domains register-domain \
  --region us-east-1 \
  --domain-name "$DOMAIN" \
  --duration-in-years 1 \
  --admin-contact file://contact.json \
  --registrant-contact file://contact.json \
  --tech-contact file://contact.json \
  --privacy-protect-admin-contact \
  --privacy-protect-registrant-contact \
  --privacy-protect-tech-contact
# → returns an OperationId; registration completes asynchronously (minutes).
# Watch it:  aws route53domains get-operation-detail --operation-id <id> --region us-east-1
```

> ⚠️ `rm -f contact.json` when done — it holds your WHOIS PII.

Confirm the hosted zone exists before B2:
```bash
aws route53 list-hosted-zones-by-name --dns-name "$DOMAIN" \
  --query "HostedZones[?Name=='${DOMAIN}.'].Id" --output text
```

---

## B2 — DKIM-verify the domain in SES (free, scripted)

```bash
cd backend && ./scripts/setup-ses-domain.sh "$DOMAIN" "$REGION"
```

This creates the SES identity (EasyDKIM), writes the 3 DKIM CNAMEs into the
hosted zone, and polls until SES reports **SUCCESS**. Re-runnable if DNS is slow.
On success, `noreply@$DOMAIN` is a usable sender.

---

## B3 — Verify your gmail as a recipient (sandbox bridge)

Until production access lands (B4), the SES **sandbox** only delivers to *verified*
recipients. Verify the admin/test inbox so admin-notify + your own test signups
arrive in the meantime:

```bash
aws ses verify-email-identity --email-address aaronlin098@gmail.com --region "$REGION"
# → check that inbox and click the AWS verification link.
```

---

## B4 — Request SES production access (AWS approval, hours–day)

Submits the account out of the sandbox so **any** public recipient receives mail.

```bash
aws sesv2 put-account-details \
  --region "$REGION" \
  --production-access-enabled \
  --mail-type TRANSACTIONAL \
  --website-url "https://$DOMAIN" \
  --use-case-description "Transactional waitlist email: a confirmation to each signup and an internal admin notification. No marketing/bulk. Recipients opt in by submitting the waitlist form." \
  --additional-contact-email-addresses aaronlin098@gmail.com \
  --contact-language EN
```

Check status later:
```bash
aws sesv2 get-account --region "$REGION" --query 'ProductionAccessEnabled'
```

---

## C — Deploy the backend with emails ON (needs B2 + your secrets)

Setting `HACKNYU_SES_SENDER` is the switch: the deploy script then passes
`WaitlistEmailsEnabled=true` + the sender. This same deploy activates the
merged-but-not-yet-live `/api/users` routes and re-applies the DSQL schema. (The
SES IAM grant is `Resource: '*'` by design — SES authorizes `ses:SendEmail`
against the recipient identity too, and waitlist recipients are arbitrary, so it
can't be scoped to the sender identity.)

```bash
export HACKNYU_OPENROUTER_API_KEY=…           # https://openrouter.ai/keys
export HACKNYU_NFT_STORAGE_API_KEY=…          # https://nft.storage/manage
export HACKNYU_SES_SENDER="noreply@$DOMAIN"
export HACKNYU_WAITLIST_ADMIN_EMAIL="aaronlin098@gmail.com"
export HACKNYU_WAITLIST_EXPORT_TOKEN="$(openssl rand -hex 32)"   # SAVE this — needed to export
# Persist it to a 0600 file instead of echoing — this is a NoEcho secret, so
# keep it out of terminal scrollback / CI logs:
( umask 077; printf '%s\n' "$HACKNYU_WAITLIST_EXPORT_TOKEN" > ~/.hypechain-waitlist-export-token )
echo "export token saved to ~/.hypechain-waitlist-export-token (mode 600)"

cd backend && ./scripts/deploy-devnet-staging.sh
```

Grab the **FunctionUrl** from the deploy Outputs (current:
`https://2eunvpj7fhgybnzzcqpilkdip40lvhgb.lambda-url.us-east-1.on.aws`).

> ⚠️ **Re-export these on EVERY redeploy.** CloudFormation reverts any parameter
> you don't pass back to its template default. A later `deploy-devnet-staging.sh`
> run from a shell that doesn't re-export `HACKNYU_SES_SENDER` /
> `HACKNYU_WAITLIST_EXPORT_TOKEN` will silently flip `WaitlistEmailsEnabled` back
> to `false` and reset the export token to empty (export → 500). The deploy script
> prints a `waitlist email:` / `waitlist export:` state line near the end — read it
> and confirm it matches what you intend before walking away.

---

## D — Frontend wiring + live smoke test

The frontend posts to `NEXT_PUBLIC_API_URL` (inlined at **build** time, so a
change requires a redeploy). Confirm it points at the Lambda for both scopes:

```bash
cd frontend
vercel env ls                      # confirm NEXT_PUBLIC_API_URL = the Function URL (Production + Preview)
# if missing/wrong:
#   vercel env add NEXT_PUBLIC_API_URL production
#   vercel env add NEXT_PUBLIC_API_URL preview
vercel --prod                      # redeploy so the value is inlined
```

Then run the live smoke test (ships on branch `feat/waitlist-live-verify`). With
emails ON, the smoke signup triggers a real confirmation send, so `SMOKE_EMAIL`
**must be a deliverable inbox you control** — never a reserved/undeliverable TLD
(that hard-bounces and dings your fresh-out-of-sandbox sender reputation). It
defaults to `$HACKNYU_WAITLIST_ADMIN_EMAIL`; override if you want a different one:

```bash
cd backend
FUNCTION_URL="https://2eunvpj7fhgybnzzcqpilkdip40lvhgb.lambda-url.us-east-1.on.aws" \
SMOKE_EMAIL="$HACKNYU_WAITLIST_ADMIN_EMAIL" \
HACKNYU_WAITLIST_EXPORT_TOKEN="$(cat ~/.hypechain-waitlist-export-token)" \
  ./scripts/verify-live-waitlist.sh
```

> The smoke signup leaves **one** persistent row in the production `waitlist`
> table (the source of truth), so it also appears in the admin CSV export. It
> dedupes on re-run (no pile-up), but scrub that one row before sharing an export.

---

## End-to-end verification

1. `curl -X POST <FunctionUrl>/api/waitlist -d '{"name":"T","email":"you@…","interest":"collect"}' -H 'Content-Type: application/json'` → `200` + `HC-W-XXXX` (the route returns 200 on both a fresh signup and a dup; it never returns 201).
2. Live form at the Vercel URL `/waitlist` → submit → success receipt shows the server `HC-W-XXXX` (proves D wiring, not a same-origin 404).
3. DSQL row present + stamped:
   `psql … -c "SELECT email,intent,confirmation_sent_at FROM waitlist ORDER BY created_at DESC LIMIT 5"` — `confirmation_sent_at` non-NULL once emails are on.
4. Confirmation email arrives at the signup; admin-notify at `aaronlin098@gmail.com`.
5. `curl <FunctionUrl>/api/waitlist/export -H "Authorization: Bearer $HACKNYU_WAITLIST_EXPORT_TOKEN"` → CSV with the row.
6. CloudWatch shows **no** `Cannot find package '@aws-sdk/client-ses'` on a signup (confirms Part A).
