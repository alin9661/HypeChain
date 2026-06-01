"""Aurora DSQL data-access layer.

Ports the Supabase data access from the Express backend
(`backend/src/routes/listing.js`, `backend/src/services/payment.js`) to
Amazon Aurora DSQL over asyncpg, per spec §3.5 / §3.6.

Modules:
    pool    — module-level IAM-token-aware async connection pool (warm-reused).
    occ     — optimistic-concurrency-control retry helper (DSQL SQLSTATE 40001).
    queries — explicit, column-enumerated SQL (no SELECT *) + history JOIN shape.
"""
