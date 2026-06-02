"""Module-level Aurora DSQL connection pool (asyncpg).

Spec §3.5 step 3:

  * A single module-level async pool (min 2, max 5 connections) created lazily
    and reused across warm Lambda invocations — NOT per-request. Mangum runs
    with ``lifespan="off"``, so there is no FastAPI startup hook to open the
    pool; we open it on first ``get_pool()`` / ``acquire()`` and let the warm
    container keep it.

  * ``statement_cache_size=0`` is MANDATORY. Aurora DSQL rejects/limits the
    server-side prepared statements asyncpg caches by default; with caching on,
    the *second* query on a connection errors. Disabling the cache makes every
    statement a simple ad-hoc execute. (Regression-guarded in tests/test_dsql.py.)

  * Authentication uses a short-lived DSQL IAM auth token (not a static
    password). The token authenticates *connection setup*, not each query, so
    we mint a fresh token in asyncpg's per-connection ``connect`` callback —
    i.e. only when a brand-new physical connection is created (initial fill +
    replacements), never on acquire/release of an already-open connection.

The pool is intentionally not closed per-request; ``close_pool()`` exists for
test teardown and graceful shutdown only.
"""

from __future__ import annotations

import asyncio
import ssl
from typing import Any

import asyncpg

from app.config.settings import get_settings

# DSQL listens on the standard Postgres port and the admin DB user is "admin".
_DSQL_PORT = 5432
_DSQL_USER = "admin"
_POOL_MIN_SIZE = 2
_POOL_MAX_SIZE = 5

# Module-level singletons. Reused across warm invocations; guarded by a lock so
# concurrent first-requests in one warm container don't race two pools open.
_pool: asyncpg.Pool | None = None
_lock: asyncio.Lock = asyncio.Lock()


def _generate_dsql_auth_token(endpoint: str, region: str) -> str:
    """Mint a short-lived DSQL IAM auth token via boto3.

    boto3 is imported lazily so importing this module (and running the unit
    tests, which mock the pool) never requires AWS credentials or network.
    """
    import boto3

    client = boto3.client("dsql", region_name=region)
    # The admin connection token is the standard auth path for the "admin" user.
    # generate_db_connect_admin_auth_token(endpoint, region) -> token string.
    return client.generate_db_connect_admin_auth_token(endpoint, region)


def _build_ssl_context() -> ssl.SSLContext:
    """DSQL requires TLS. Use the platform trust store (DSQL certs are public-CA)."""
    ctx = ssl.create_default_context()
    return ctx


async def _create_pool() -> asyncpg.Pool:
    settings = get_settings()

    # LOCAL/CI escape hatch (spec local-dev parity). When HACKNYU_DATABASE_URL is
    # set, connect to a plain Postgres with normal DSN/password auth instead of
    # the DSQL IAM-token + TLS path — DSQL is "plain Postgres over asyncpg", so
    # the same queries run unchanged against a local container. We KEEP
    # statement_cache_size=0 so local behavior matches the DSQL prepared-statement
    # constraint (no "works locally, breaks on DSQL" surprises).
    #
    # FAIL-CLOSED: this path drops TLS + IAM auth, so it must NEVER activate in
    # production. It is gated on the same `is_development` signal the rest of the
    # app uses (node_env defaults to "production" — see config/settings.py). If
    # HACKNYU_DATABASE_URL is set while NODE_ENV is anything but "development",
    # we refuse rather than silently downgrade to a plaintext, unauthenticated
    # connection. Production reaches the DSQL path below.
    local_dsn = settings.hacknyu_database_url
    if local_dsn:
        if not settings.is_development:
            raise RuntimeError(
                "HACKNYU_DATABASE_URL is only honored when NODE_ENV=development. "
                "Refusing to open a plaintext, non-IAM Postgres connection outside "
                "development — production must use the Aurora DSQL IAM-token + TLS path."
            )
        return await asyncpg.create_pool(
            dsn=local_dsn,
            min_size=_POOL_MIN_SIZE,
            max_size=_POOL_MAX_SIZE,
            statement_cache_size=0,
        )

    endpoint = settings.hacknyu_dsql_endpoint
    if not endpoint:
        raise RuntimeError(
            "HACKNYU_DSQL_ENDPOINT is not set — cannot open the Aurora DSQL pool. "
            "Set it in the environment (see app/config/settings.py)."
        )
    region = settings.hacknyu_dsql_region
    database = settings.hacknyu_dsql_database
    ssl_ctx = _build_ssl_context()

    async def _setup(_conn: asyncpg.Connection) -> None:
        # Hook reserved for per-connection session setup if ever needed; the
        # IAM token is supplied via the ``password`` callable below.
        return None

    def _password() -> str:
        # asyncpg accepts a callable password; it is invoked only when a new
        # physical connection is established, which is exactly when a fresh IAM
        # token is needed (token authenticates connection setup, not queries).
        return _generate_dsql_auth_token(endpoint, region)

    return await asyncpg.create_pool(
        host=endpoint,
        port=_DSQL_PORT,
        user=_DSQL_USER,
        password=_password,
        database=database,
        ssl=ssl_ctx,
        min_size=_POOL_MIN_SIZE,
        max_size=_POOL_MAX_SIZE,
        # DSQL prepared-statement limit — MUST be 0 or the 2nd query errors.
        statement_cache_size=0,
        setup=_setup,
    )


async def get_pool() -> asyncpg.Pool:
    """Return the process-wide DSQL pool, creating it on first use.

    Safe under concurrency: double-checked locking ensures exactly one pool is
    opened per warm container.
    """
    global _pool
    if _pool is not None:
        return _pool
    async with _lock:
        if _pool is None:
            _pool = await _create_pool()
    return _pool


def acquire() -> Any:
    """Acquire a pooled connection as an async context manager.

    Usage::

        async with acquire() as conn:
            await conn.fetch(...)

    Returns asyncpg's pool-acquire context manager. We return the awaitable
    proxy directly (rather than ``async with await get_pool()``) so callers get
    a clean ``async with acquire() as conn`` ergonomic.
    """
    return _PoolAcquire()


class _PoolAcquire:
    """Lazy ``async with`` proxy that resolves the pool then acquires a conn."""

    def __init__(self) -> None:
        self._cm: Any = None

    async def __aenter__(self) -> asyncpg.Connection:
        pool = await get_pool()
        self._cm = pool.acquire()
        return await self._cm.__aenter__()

    async def __aexit__(self, *exc: object) -> None:
        if self._cm is not None:
            await self._cm.__aexit__(*exc)


async def close_pool() -> None:
    """Close and drop the module-level pool (graceful shutdown / test teardown)."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def _reset_for_tests(pool: asyncpg.Pool | None) -> None:
    """Test hook: inject a fake pool (or clear it). Not used in production code."""
    global _pool
    _pool = pool
