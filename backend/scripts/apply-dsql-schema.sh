#!/usr/bin/env bash
# Apply backend/schema/001_dsql_schema.sql to the live Aurora DSQL cluster.
#
# Aurora DSQL has no migration framework, so schema and app code drift the moment
# a table is added in git but never re-applied to the cluster. (That is exactly
# how the `waitlist` table went missing: the cluster was hand-applied once before
# the table existed.) This script makes the apply idempotent and repeatable — the
# schema uses CREATE TABLE IF NOT EXISTS / CREATE INDEX ASYNC IF NOT EXISTS
# throughout, so re-running only creates what is missing.
#
# Auth mirrors the runtime path in src/db/pool.js: an admin DB-connect token
# minted with @aws-sdk/dsql-signer (the `aws dsql` CLI subcommand is not in
# aws-cli 2.17). Requires: AWS creds in env, psql, and `bun install` having run
# in backend/ (so @aws-sdk/dsql-signer is resolvable).
#
# Usage:  cd backend && ./scripts/apply-dsql-schema.sh
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
DSQL_ENDPOINT="${HACKNYU_DSQL_ENDPOINT:-qjt3zldyhx2oaemd37zt3yypcu.dsql.us-east-1.on.aws}"
DSQL_DATABASE="${HACKNYU_DSQL_DATABASE:-postgres}"

# Connect via discrete libpq env vars, NOT a single conninfo string. A conninfo
# string interpolating ${DSQL_DATABASE} would let a poisoned value smuggle extra
# keywords (e.g. dbname='postgres host=evil') — libpq lets a later host= override
# the earlier one, redirecting the freshly-minted admin token to an attacker
# host. Discrete PG* vars are never re-parsed into other keywords.
export PGHOST="$DSQL_ENDPOINT"
export PGPORT=5432
export PGUSER=admin
export PGDATABASE="$DSQL_DATABASE"
export PGSSLMODE=require

command -v psql >/dev/null 2>&1 || { echo "error: psql not found on PATH" >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "error: node not found on PATH" >&2; exit 1; }

cd "$(dirname "$0")/.."
SCHEMA_FILE="schema/001_dsql_schema.sql"
[ -f "$SCHEMA_FILE" ] || { echo "error: $SCHEMA_FILE not found (run from backend/)" >&2; exit 1; }

# Derive the must-exist table set from the schema itself, so this drift-guard
# can't drift from the DDL it verifies. Guard against an empty parse, which would
# silently turn the assertion below into a no-op — the exact failure we kill.
REQUIRED_TABLES=()
while IFS= read -r _t; do
  [ -n "$_t" ] && REQUIRED_TABLES+=("$_t")
# Anchor at line start so a real `CREATE TABLE x` statement matches but prose in
# a `-- ... CREATE TABLE above ...` comment does not (comment lines start `--`).
done < <(grep -oiE '^create table (if not exists )?[a-z_]+' "$SCHEMA_FILE" | awk '{print tolower($NF)}' | sort -u)
[ "${#REQUIRED_TABLES[@]}" -gt 0 ] || { echo "error: no CREATE TABLE statements found in $SCHEMA_FILE" >&2; exit 1; }

echo "Minting DSQL admin auth token for ${DSQL_ENDPOINT} (${REGION})..."
# Dynamic import() works whether the SDK ships as ESM or CJS. The token is the
# DB password; it is never placed on a command line (passed via PGPASSWORD).
TOKEN="$(
  DSQL_ENDPOINT="$DSQL_ENDPOINT" REGION="$REGION" node -e '
    import("@aws-sdk/dsql-signer")
      .then(async ({ DsqlSigner }) => {
        const signer = new DsqlSigner({ hostname: process.env.DSQL_ENDPOINT, region: process.env.REGION });
        process.stdout.write(await signer.getDbConnectAdminAuthToken());
      })
      .catch((e) => { console.error(e?.message || e); process.exit(1); });
  '
)"
[ -n "$TOKEN" ] || { echo "error: failed to mint DSQL auth token" >&2; exit 1; }

echo "Applying ${SCHEMA_FILE} to ${PGDATABASE}@${PGHOST}..."
# Statement-by-statement autocommit (NOT --single-transaction): DSQL caps DDL per
# transaction, so each CREATE runs independently. ON_ERROR_STOP surfaces failures.
PGPASSWORD="$TOKEN" psql -v ON_ERROR_STOP=1 -f "$SCHEMA_FILE"

echo
echo "Schema applied. Verifying required tables exist..."
PGPASSWORD="$TOKEN" psql -c "\dt"

missing=()
for t in "${REQUIRED_TABLES[@]}"; do
  present="$(PGPASSWORD="$TOKEN" psql -tAc "SELECT to_regclass('public.${t}') IS NOT NULL")"
  [ "$present" = "t" ] || missing+=("$t")
done
if [ "${#missing[@]}" -gt 0 ]; then
  echo "error: tables missing after apply: ${missing[*]}" >&2
  exit 1
fi
echo "All ${#REQUIRED_TABLES[@]} required tables present."
