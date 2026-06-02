"""Unit tests for the Aurora DSQL data layer (no live cluster).

Covers (spec §6):
  * OCC retry: serialization failure (SQLSTATE 40001) retried then succeeds;
    non-serialization errors propagate immediately.
  * History builder produces the nested `listing` shape via the JOIN query.
  * increment_user_volume issues an ADDITIVE UPDATE (total_volume + amount),
    wrapped in OCC retry, against a fresh connection per attempt.
  * No `SELECT *` in any emitted query string (column-enumeration guard).
  * [SKIPPED] statement_cache_size=0 second-query behavior — needs live DSQL.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

import asyncpg
import pytest

from app.db import occ, queries


# ---------------------------------------------------------------------------
# Fakes — duck-typed asyncpg connection / pool-acquire, no network.
# ---------------------------------------------------------------------------


class FakeConn:
    """Records SQL + args; returns scripted rows.

    ``fetchrow_results`` / ``fetch_results`` are popped (FIFO) per call so a
    test can script a sequence (e.g. first call raises, second returns a row).
    An item that is an Exception instance is raised instead of returned.
    """

    def __init__(
        self,
        *,
        fetchrow_results: list[Any] | None = None,
        fetch_results: list[Any] | None = None,
    ) -> None:
        self.fetchrow_results = list(fetchrow_results or [])
        self.fetch_results = list(fetch_results or [])
        self.executed: list[tuple[str, tuple[Any, ...]]] = []

    async def fetchrow(self, sql: str, *args: Any) -> Any:
        self.executed.append((sql, args))
        result = self.fetchrow_results.pop(0)
        if isinstance(result, BaseException):
            raise result
        return result

    async def fetch(self, sql: str, *args: Any) -> Any:
        self.executed.append((sql, args))
        result = self.fetch_results.pop(0)
        if isinstance(result, BaseException):
            raise result
        return result

    async def execute(self, sql: str, *args: Any) -> str:
        self.executed.append((sql, args))
        return "OK"


class FakeAcquire:
    """`async with FakeAcquire() as conn` -> a (possibly fresh) FakeConn.

    Tracks how many times it was entered so OCC-retry-uses-fresh-connection is
    observable. ``conn_factory`` yields the connection for each acquire.
    """

    def __init__(self, conn_factory: Any) -> None:
        self._conn_factory = conn_factory
        self.enter_count = 0
        self.conns: list[FakeConn] = []

    def __call__(self) -> FakeAcquire:
        return self

    async def __aenter__(self) -> FakeConn:
        self.enter_count += 1
        conn = self._conn_factory()
        self.conns.append(conn)
        return conn

    async def __aexit__(self, *exc: object) -> None:
        return None


def _serialization_error() -> asyncpg.SerializationError:
    """Construct an asyncpg SerializationError carrying SQLSTATE 40001."""
    err = asyncpg.SerializationError("could not serialize access")
    # asyncpg exposes the SQLSTATE via .sqlstate; set it for the by-code path too.
    try:
        err.sqlstate = occ.SERIALIZATION_FAILURE_SQLSTATE  # type: ignore[attr-defined]
    except (AttributeError, TypeError):
        pass
    return err


# ---------------------------------------------------------------------------
# OCC retry behavior
# ---------------------------------------------------------------------------


async def test_occ_retries_on_40001_then_succeeds() -> None:
    attempts = 0

    async def op() -> str:
        nonlocal attempts
        attempts += 1
        if attempts < 3:
            raise _serialization_error()
        return "ok"

    result = await occ.retry_on_serialization_error(op, base_delay_s=0)
    assert result == "ok"
    assert attempts == 3


async def test_occ_gives_up_after_max_attempts() -> None:
    attempts = 0

    async def op() -> str:
        nonlocal attempts
        attempts += 1
        raise _serialization_error()

    with pytest.raises(asyncpg.SerializationError):
        await occ.retry_on_serialization_error(op, max_attempts=4, base_delay_s=0)
    assert attempts == 4


async def test_occ_does_not_retry_other_errors() -> None:
    attempts = 0

    async def op() -> str:
        nonlocal attempts
        attempts += 1
        raise asyncpg.UniqueViolationError("dup signature")

    with pytest.raises(asyncpg.UniqueViolationError):
        await occ.retry_on_serialization_error(op, base_delay_s=0)
    assert attempts == 1


# ---------------------------------------------------------------------------
# increment_user_volume — additive UPDATE, OCC-wrapped, fresh conn per retry
# ---------------------------------------------------------------------------


async def test_increment_issues_additive_update() -> None:
    conn = FakeConn(fetchrow_results=[{"id": "user-1", "total_volume": Decimal("3.5")}])
    acquire = FakeAcquire(lambda: conn)

    result = await queries.increment_user_volume("user-1", Decimal("1.5"), acquire=acquire)

    assert result == {"id": "user-1", "total_volume": Decimal("3.5")}
    sql, args = conn.executed[0]
    # Additive, not read-modify-write: column referenced on both sides.
    assert "total_volume = total_volume + $2" in sql
    assert "updated_at = NOW()" in sql
    assert args == ("user-1", Decimal("1.5"))


async def test_increment_retries_on_serialization_with_fresh_connection() -> None:
    calls = 0

    def conn_factory() -> FakeConn:
        nonlocal calls
        calls += 1
        if calls == 1:
            return FakeConn(fetchrow_results=[_serialization_error()])
        return FakeConn(fetchrow_results=[{"id": "u", "total_volume": Decimal("2")}])

    acquire = FakeAcquire(conn_factory)
    result = await queries.increment_user_volume("u", 2, acquire=acquire)

    assert result == {"id": "u", "total_volume": Decimal("2")}
    # A retry must acquire a brand-new connection (fresh transaction).
    assert acquire.enter_count == 2


async def test_increment_returns_none_when_user_missing() -> None:
    conn = FakeConn(fetchrow_results=[None])
    acquire = FakeAcquire(lambda: conn)
    result = await queries.increment_user_volume("ghost", 1, acquire=acquire)
    assert result is None


# ---------------------------------------------------------------------------
# History builder — nested `listing` shape via JOIN
# ---------------------------------------------------------------------------


async def test_history_builds_nested_listing_shape() -> None:
    row = {
        "id": "tx-1",
        "listing_id": "l-1",
        "buyer_wallet": "BUYER",
        "seller_wallet": "SELLER",
        "amount_sol": Decimal("1.0"),
        "signature": "sig",
        "status": "confirmed",
        # asyncpg would already have parsed json_build_object into a dict.
        "listing": {
            "product_name": "Yeezy 350",
            "image_url": "https://img",
            "nft_mint_address": "MINT",
        },
    }
    conn = FakeConn(fetch_results=[[row]])

    out = await queries.get_transaction_history(conn, "BUYER", type="all")

    assert len(out) == 1
    assert out[0]["listing"] == {
        "product_name": "Yeezy 350",
        "image_url": "https://img",
        "nft_mint_address": "MINT",
    }
    sql, args = conn.executed[0]
    assert "json_build_object" in sql
    assert "JOIN listings" in sql
    assert "ORDER BY t.created_at DESC" in sql
    assert args == ("BUYER",)


@pytest.mark.parametrize(
    ("hist_type", "expected_where"),
    [
        ("buyer", "WHERE t.buyer_wallet = $1"),
        ("seller", "WHERE t.seller_wallet = $1"),
        ("all", "WHERE t.buyer_wallet = $1 OR t.seller_wallet = $1"),
    ],
)
async def test_history_filter_branches(hist_type: str, expected_where: str) -> None:
    conn = FakeConn(fetch_results=[[]])
    await queries.get_transaction_history(conn, "W", type=hist_type)
    sql, _ = conn.executed[0]
    assert expected_where in sql


# ---------------------------------------------------------------------------
# Insert / fetch / update helpers run the enumerated SQL with the right args
# ---------------------------------------------------------------------------


async def test_insert_listing_passes_enumerated_args() -> None:
    returned = {c: None for c in queries.LISTING_COLUMNS}
    returned["id"] = "new-id"
    conn = FakeConn(fetchrow_results=[returned])

    payload = {
        "nft_mint_address": "MINT",
        "seller_wallet": None,  # guest listing -> NULL seller
        "seller_user_id": None,
        "product_name": "Item",
        "image_url": "https://img",
        "price_sol": Decimal("0"),  # price-0 listing allowed (CHECK >= 0)
        "status": "pending_wallet",
        "ai_verified": True,
        "is_pending_claim": True,
        "guest_email": "g@example.com",
        "is_compressed": False,
    }
    out = await queries.insert_listing(conn, payload)

    assert out["id"] == "new-id"
    sql, args = conn.executed[0]
    assert sql.startswith("INSERT INTO listings")
    assert "RETURNING" in sql
    # 19 insert columns -> 19 positional args, order matching the manifest.
    assert len(args) == len(queries._LISTING_INSERT_COLUMNS)
    assert args[0] == "MINT"  # nft_mint_address is first
    assert args[1] is None  # seller_wallet


async def test_get_user_id_by_wallet_returns_none_on_miss() -> None:
    conn = FakeConn(fetchrow_results=[None])
    assert await queries.get_user_id_by_wallet(conn, "nope") is None


async def test_fetch_listing_by_id_returns_dict() -> None:
    returned = {c: None for c in queries.LISTING_COLUMNS}
    returned["id"] = "l-1"
    conn = FakeConn(fetchrow_results=[returned])
    out = await queries.fetch_listing_by_id(conn, "l-1")
    assert out is not None
    assert out["id"] == "l-1"


async def test_update_listing_status_sets_updated_at_and_returns_row() -> None:
    returned = {c: None for c in queries.LISTING_COLUMNS}
    returned["id"] = "l-1"
    returned["status"] = "sold"
    conn = FakeConn(fetchrow_results=[returned])

    out = await queries.update_listing_status(
        conn,
        "l-1",
        status="sold",
        sold_at="2026-05-29T00:00:00+00:00",
        buyer_wallet="BUYER",
        buyer_user_id=None,
        transaction_signature="sig",
    )
    assert out is not None
    assert out["status"] == "sold"
    sql, args = conn.executed[0]
    assert "updated_at = NOW()" in sql
    assert args[0] == "l-1"
    assert args[1] == "sold"


async def test_insert_transaction_passes_enumerated_args() -> None:
    returned = {c: None for c in queries.TRANSACTION_COLUMNS}
    returned["id"] = "tx-1"
    conn = FakeConn(fetchrow_results=[returned])

    out = await queries.insert_transaction(
        conn,
        {
            "listing_id": "l-1",
            "buyer_wallet": "BUYER",
            "seller_wallet": "SELLER",
            "amount_sol": Decimal("1.5"),
            "signature": "sig",
            "status": "confirmed",
            "payment_method": "SOL",
            "blockchain_confirmed": True,
            "confirmed_at": "2026-05-29T00:00:00+00:00",
        },
    )
    assert out["id"] == "tx-1"
    sql, args = conn.executed[0]
    assert sql.startswith("INSERT INTO transactions")
    assert len(args) == len(queries._TRANSACTION_INSERT_COLUMNS)


# ---------------------------------------------------------------------------
# Column-enumeration guard — NO `SELECT *` anywhere in the query module
# ---------------------------------------------------------------------------


def test_no_select_star_in_any_query_string() -> None:
    candidates = [
        queries.INSERT_LISTING_SQL,
        queries.GET_USER_ID_BY_WALLET_SQL,
        queries.FETCH_LISTING_BY_ID_SQL,
        queries.UPDATE_LISTING_STATUS_SQL,
        queries.INSERT_TRANSACTION_SQL,
        queries.INCREMENT_USER_VOLUME_SQL,
        queries._HISTORY_BASE_SQL,
    ]
    for sql in candidates:
        assert "SELECT *" not in sql.upper().replace("  ", " ")
        assert "*" not in sql, f"unexpected '*' in query: {sql!r}"


def test_select_statements_enumerate_full_column_set() -> None:
    # fetch-by-id and the RETURNING clauses must list every listing column.
    for col in queries.LISTING_COLUMNS:
        assert col in queries.FETCH_LISTING_BY_ID_SQL
        assert col in queries.INSERT_LISTING_SQL
    for col in queries.TRANSACTION_COLUMNS:
        assert col in queries.INSERT_TRANSACTION_SQL


# ---------------------------------------------------------------------------
# statement_cache_size=0 — requires a live DSQL cluster to exercise the
# second-query prepared-statement limit. Stubbed per spec §6.
# ---------------------------------------------------------------------------


@pytest.mark.skip(reason="needs live DSQL cluster")
async def test_statement_cache_disabled_allows_second_query() -> None:
    """With statement_cache_size=0, two sequential queries on one pooled
    connection must both succeed (DSQL rejects asyncpg's default cached
    prepared statements on the 2nd query). Verifiable only against a live
    Aurora DSQL endpoint.
    """
    from app.db import pool as pool_module

    p = await pool_module.get_pool()
    async with p.acquire() as conn:
        await conn.fetch(queries.FETCH_LISTING_BY_ID_SQL, "00000000-0000-0000-0000-000000000000")
        await conn.fetch(queries.GET_USER_ID_BY_WALLET_SQL, "any-wallet")


# ---------------------------------------------------------------------------
# LOCAL/CI escape hatch — HACKNYU_DATABASE_URL uses plain DSN/password auth
# instead of the DSQL IAM-token + TLS path (no network: asyncpg mocked).
# ---------------------------------------------------------------------------


async def test_local_dsn_uses_plain_password_auth(monkeypatch: Any) -> None:
    from app.config.settings import get_settings
    from app.db import pool as pool_module

    captured: dict[str, Any] = {}

    async def fake_create_pool(**kwargs: Any) -> object:
        captured.update(kwargs)
        return object()  # stand-in pool; never used

    monkeypatch.setattr(pool_module.asyncpg, "create_pool", fake_create_pool)
    monkeypatch.setenv("HACKNYU_DATABASE_URL", "postgres://admin:pw@localhost:5432/hypechain")
    # The escape hatch is fail-closed: only honored in development.
    monkeypatch.setenv("NODE_ENV", "development")
    # Ensure NO DSQL endpoint is needed on the local path.
    monkeypatch.delenv("HACKNYU_DSQL_ENDPOINT", raising=False)
    get_settings.cache_clear()
    try:
        result = await pool_module._create_pool()
    finally:
        get_settings.cache_clear()

    assert result is not None
    # Local path: DSN passed through, cache still disabled (DSQL parity), and
    # NONE of the DSQL-only machinery (IAM password callable, forced TLS).
    assert captured["dsn"] == "postgres://admin:pw@localhost:5432/hypechain"
    assert captured["statement_cache_size"] == 0
    assert "password" not in captured
    assert "ssl" not in captured


async def test_local_dsn_rejected_outside_development(monkeypatch: Any) -> None:
    """Fail-closed: HACKNYU_DATABASE_URL set while NOT in development must RAISE,
    not silently downgrade to a plaintext/non-IAM connection.

    NODE_ENV is set EXPLICITLY to "production" rather than unset: an env var
    overrides any local `.env` (which a dev checkout has, with NODE_ENV=development),
    so this asserts the security property regardless of the developer's `.env`.
    Settings already default node_env to "production" when truly unset.
    """
    from app.config.settings import get_settings
    from app.db import pool as pool_module

    called = False

    async def fake_create_pool(**_kwargs: Any) -> object:
        nonlocal called
        called = True
        return object()

    monkeypatch.setattr(pool_module.asyncpg, "create_pool", fake_create_pool)
    monkeypatch.setenv("HACKNYU_DATABASE_URL", "postgres://admin:pw@evil:5432/db")
    monkeypatch.setenv("NODE_ENV", "production")
    get_settings.cache_clear()
    try:
        with pytest.raises(RuntimeError, match="only honored when NODE_ENV=development"):
            await pool_module._create_pool()
    finally:
        get_settings.cache_clear()
    # The plaintext pool must never have been opened.
    assert called is False


async def test_no_local_dsn_requires_dsql_endpoint(monkeypatch: Any) -> None:
    from app.config.settings import get_settings
    from app.db import pool as pool_module

    monkeypatch.delenv("HACKNYU_DATABASE_URL", raising=False)
    monkeypatch.delenv("HACKNYU_DSQL_ENDPOINT", raising=False)
    get_settings.cache_clear()
    try:
        with pytest.raises(RuntimeError, match="HACKNYU_DSQL_ENDPOINT is not set"):
            await pool_module._create_pool()
    finally:
        get_settings.cache_clear()
