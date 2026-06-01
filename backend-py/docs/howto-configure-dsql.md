# How-to: Configure Aurora DSQL

Provision the database the backend talks to, apply the schema, and grant the IAM permission the
app needs to authenticate. The backend uses Amazon Aurora DSQL (serverless, Postgres-compatible)
instead of Supabase — see [Design decisions](explanation-design-decisions.md) for why.

## Prerequisites
- AWS CLI configured with permission to create a DSQL cluster.
- A Postgres client (`psql`) for applying the schema.

## Step 1: Create a DSQL cluster

Create a cluster in your region (console or CLI) and note its **endpoint** host. The backend
connects as the `admin` user on port `5432` over TLS, authenticating with a short-lived IAM
token (no password).

## Step 2: Grant the IAM permission

The execution principal (your local user for dev, the Lambda execution role for prod) must be
allowed to mint the admin auth token. Attach a policy granting:

```json
{ "Effect": "Allow", "Action": "dsql:DbConnectAdmin", "Resource": "<your-cluster-arn>" }
```

The pool calls `boto3`'s `generate_db_connect_admin_auth_token` per new connection; without
this permission every connection attempt is rejected.

## Step 3: Apply the schema

The DSQL-adapted DDL lives at `backend-py/schema/001_dsql_schema.sql` (tables `users`,
`listings`, `transactions`; no foreign keys, triggers, or RLS — those constraints are
unsupported by DSQL and enforced in app code instead).

```bash
PGSSLMODE=require psql \
  "host=<cluster-endpoint> port=5432 dbname=postgres user=admin" \
  -f backend-py/schema/001_dsql_schema.sql
```

(For the interactive `psql` password prompt, paste a token from
`aws dsql generate-db-connect-admin-auth-token --hostname <endpoint> --region <region>`.)

## Step 4: Point the backend at the cluster

Set in `.env` (local) or on the Lambda function (prod):

```bash
HACKNYU_DSQL_ENDPOINT=<cluster-endpoint>
HACKNYU_DSQL_REGION=us-east-1
HACKNYU_DSQL_DATABASE=postgres
```

AWS credentials for the token come from the standard `boto3` chain (env vars locally, the
execution role on Lambda) — there is no password setting.

## How the connection behaves

`app/db/pool.py` maintains a small async pool (2–5 connections) reused across warm Lambda
invocations, with two DSQL-specific details:
- **`statement_cache_size=0`** — DSQL limits prepared-statement reuse; without this the second
  query on a connection errors.
- **Per-connection IAM token** — the token authenticates connection *setup*, not each query, so
  established connections keep working after the token's mint window; new connections get a
  fresh token.

Writes that can race (the user-volume increment) are wrapped in
`app/db/occ.py::retry_on_serialization_error`, which retries on DSQL optimistic-concurrency
failures (`40001`).

## Verification

```bash
cd backend-py
uv run python -c "
import asyncio
from app.db.pool import get_pool, acquire, close_pool
async def main():
    async with acquire() as conn:
        print('users rows:', await conn.fetchval('SELECT count(*) FROM users'))
    await close_pool()
asyncio.run(main())
"
```
Prints a row count (0 on a fresh cluster) if connectivity + IAM + schema are all correct.

## Troubleshooting
- **`AccessDenied` / auth failure** → the principal lacks `dsql:DbConnectAdmin`, or
  `HACKNYU_DSQL_REGION` doesn't match the cluster.
- **`prepared statement` errors** → ensure you're going through `app/db/pool.py` (it sets
  `statement_cache_size=0`); don't open raw asyncpg connections without it.
- **`relation "users" does not exist`** → the schema wasn't applied (Step 3).

## Related
- [Reference: Service & data layer](reference-services.md) (`app/db`) · [How-to: Deploy to AWS Lambda](howto-deploy-lambda.md)
