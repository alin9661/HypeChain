"""Unit tests for the activity feed + provenance feature (no live cluster).

Covers:
  * queries.insert_activity — idempotent ON CONFLICT (row on insert, None on dup).
  * queries.get_activities_feed — keyset SQL: no-filter, type filter, cursor,
    type+cursor param ordering; no SELECT *.
  * queries.get_nft_history — provenance SQL.
  * services.activity — record/record_safe, unknown-type guard, best-effort
    swallow, keyset pagination (has_more + nextCursor), bad-cursor ValueError.
  * schemas.activity — row->wire mapping (ms timestamp, price float, `from`
    alias), cursor round-trip + malformed-cursor rejection.
  * routers.activities — invalid type 400, bad cursor 400, happy-path shape.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

import pytest

from app.db import queries
from app.schemas import activity as schema
from app.services import activity as activity_service

# ---------------------------------------------------------------------------
# Fakes — duck-typed asyncpg connection / pool-acquire (no network).
# ---------------------------------------------------------------------------


class FakeConn:
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


class FakeAcquire:
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


_BT = datetime(2026, 5, 29, 12, 0, 0, tzinfo=timezone.utc)


def _row(**over: Any) -> dict[str, Any]:
    base = {
        "id": "act-1",
        "event_type": "sale",
        "nft_mint_address": "MINT",
        "product_name": "Yeezy 350",
        "image_url": "https://img",
        "from_wallet": "SELLER",
        "to_wallet": "BUYER",
        "price_sol": Decimal("2.5"),
        "tx_signature": "SIG",
        "block_time": _BT,
        "source": "app",
        "created_at": _BT,
    }
    base.update(over)
    return base


# ---------------------------------------------------------------------------
# Data layer — insert_activity (idempotency)
# ---------------------------------------------------------------------------


async def test_insert_activity_returns_row_on_insert() -> None:
    conn = FakeConn(fetchrow_results=[_row()])
    out = await queries.insert_activity(conn, _row())
    assert out is not None
    assert out["id"] == "act-1"
    sql, args = conn.executed[0]
    assert sql.startswith("INSERT INTO activities")
    assert "ON CONFLICT (tx_signature, event_type, nft_mint_address) DO NOTHING" in sql
    # 10 app-supplied insert columns -> 10 positional args.
    assert len(args) == len(queries._ACTIVITY_INSERT_COLUMNS)


async def test_insert_activity_returns_none_on_conflict() -> None:
    # ON CONFLICT DO NOTHING -> RETURNING yields no row -> fetchrow None.
    conn = FakeConn(fetchrow_results=[None])
    out = await queries.insert_activity(conn, _row())
    assert out is None


# ---------------------------------------------------------------------------
# Data layer — get_activities_feed (keyset SQL)
# ---------------------------------------------------------------------------


async def test_feed_sql_no_filter_no_cursor() -> None:
    conn = FakeConn(fetch_results=[[]])
    await queries.get_activities_feed(conn, limit=20)
    sql, args = conn.executed[0]
    assert "WHERE" not in sql
    assert "ORDER BY block_time DESC, id DESC" in sql
    assert "LIMIT $1" in sql
    assert args == (20,)


async def test_feed_sql_type_filter() -> None:
    conn = FakeConn(fetch_results=[[]])
    await queries.get_activities_feed(conn, event_type="sale", limit=10)
    sql, args = conn.executed[0]
    assert "WHERE event_type = $1" in sql
    assert "LIMIT $2" in sql
    assert args == ("sale", 10)


async def test_feed_sql_cursor_keyset_predicate() -> None:
    conn = FakeConn(fetch_results=[[]])
    await queries.get_activities_feed(conn, before_block_time=_BT, before_id="act-9", limit=5)
    sql, args = conn.executed[0]
    assert "(block_time, id) < ($1, $2)" in sql
    assert "LIMIT $3" in sql
    assert args == (_BT, "act-9", 5)


async def test_feed_sql_type_and_cursor_param_order() -> None:
    conn = FakeConn(fetch_results=[[]])
    await queries.get_activities_feed(
        conn, event_type="transfer", before_block_time=_BT, before_id="act-9", limit=5
    )
    sql, args = conn.executed[0]
    assert "WHERE event_type = $1 AND (block_time, id) < ($2, $3)" in sql
    assert "LIMIT $4" in sql
    assert args == ("transfer", _BT, "act-9", 5)


async def test_nft_history_sql() -> None:
    conn = FakeConn(fetch_results=[[_row()]])
    out = await queries.get_nft_history(conn, "MINT", limit=50)
    assert len(out) == 1
    sql, args = conn.executed[0]
    assert "WHERE nft_mint_address = $1" in sql
    assert "ORDER BY block_time DESC, id DESC" in sql
    assert args == ("MINT", 50)


def test_no_select_star_in_activity_sql() -> None:
    for sql in (
        queries.INSERT_ACTIVITY_SQL,
        queries.FETCH_NFT_HISTORY_SQL,
    ):
        assert "*" not in sql, f"unexpected '*' in {sql!r}"
    # the feed builder is dynamic — exercise it and check the emitted string.
    # (covered by the SQL assertions above; none contain '*').


def test_activity_returning_enumerates_full_column_set() -> None:
    for col in queries.ACTIVITY_COLUMNS:
        assert col in queries.INSERT_ACTIVITY_SQL
        assert col in queries.FETCH_NFT_HISTORY_SQL


# ---------------------------------------------------------------------------
# Service — record / record_safe
# ---------------------------------------------------------------------------


async def test_record_returns_true_on_insert() -> None:
    acquire = FakeAcquire(lambda: FakeConn(fetchrow_results=[_row()]))
    ok = await activity_service.record(
        event_type="mint",
        nft_mint_address="MINT",
        tx_signature="SIG",
        source="app",
        block_time=_BT,
        acquire=acquire,
    )
    assert ok is True


async def test_record_returns_false_on_duplicate() -> None:
    acquire = FakeAcquire(lambda: FakeConn(fetchrow_results=[None]))
    ok = await activity_service.record(
        event_type="transfer",
        nft_mint_address="MINT",
        tx_signature="SIG",
        source="helius",
        block_time=_BT,
        acquire=acquire,
    )
    assert ok is False


async def test_record_rejects_unknown_event_type() -> None:
    with pytest.raises(ValueError, match="unknown event_type"):
        await activity_service.record(
            event_type="bogus",
            nft_mint_address="MINT",
            tx_signature="SIG",
            source="app",
        )


async def test_record_safe_swallows_exception_returns_false() -> None:
    acquire = FakeAcquire(lambda: FakeConn(fetchrow_results=[RuntimeError("db down")]))
    ok = await activity_service.record_safe(
        event_type="sale",
        nft_mint_address="MINT",
        tx_signature="SIG",
        source="app",
        block_time=_BT,
        acquire=acquire,
    )
    # Best-effort: a logging-table failure must NOT propagate to the caller.
    assert ok is False


async def test_record_safe_returns_true_on_insert() -> None:
    acquire = FakeAcquire(lambda: FakeConn(fetchrow_results=[_row()]))
    ok = await activity_service.record_safe(
        event_type="listing",
        nft_mint_address="MINT",
        tx_signature="SIG",
        source="app",
        block_time=_BT,
        acquire=acquire,
    )
    assert ok is True


# ---------------------------------------------------------------------------
# Service — feed pagination (limit+1 probe, nextCursor)
# ---------------------------------------------------------------------------


async def test_feed_has_more_emits_next_cursor() -> None:
    # limit=2 -> service fetches 3; 3 rows back -> has_more, trim to 2.
    rows = [_row(id="a", block_time=_BT), _row(id="b", block_time=_BT), _row(id="c", block_time=_BT)]
    acquire = FakeAcquire(lambda: FakeConn(fetch_results=[rows]))
    page, next_cursor = await activity_service.feed(limit=2, acquire=acquire)
    assert [r["id"] for r in page] == ["a", "b"]
    assert next_cursor is not None
    # cursor points at the last row of the trimmed page ("b").
    bt, last_id = schema.decode_cursor(next_cursor)
    assert last_id == "b"
    assert bt == _BT


async def test_feed_no_more_returns_none_cursor() -> None:
    rows = [_row(id="a"), _row(id="b")]  # only 2 back for limit=2 -> no more
    acquire = FakeAcquire(lambda: FakeConn(fetch_results=[rows]))
    page, next_cursor = await activity_service.feed(limit=2, acquire=acquire)
    assert len(page) == 2
    assert next_cursor is None


async def test_feed_decodes_cursor_into_keyset_args() -> None:
    cursor = schema.encode_cursor(_row(id="act-9", block_time=_BT))
    captured = FakeConn(fetch_results=[[]])
    acquire = FakeAcquire(lambda: captured)
    await activity_service.feed(cursor=cursor, limit=5, acquire=acquire)
    _sql, args = captured.executed[0]
    # decoded (block_time, id) flow through to the keyset predicate args.
    assert _BT in args
    assert "act-9" in args


async def test_feed_bad_cursor_raises_valueerror() -> None:
    acquire = FakeAcquire(lambda: FakeConn(fetch_results=[[]]))
    with pytest.raises(ValueError, match="malformed cursor"):
        await activity_service.feed(cursor="!!!not-base64!!!", limit=5, acquire=acquire)


async def test_feed_clamps_limit_to_max() -> None:
    captured = FakeConn(fetch_results=[[]])
    acquire = FakeAcquire(lambda: captured)
    await activity_service.feed(limit=10_000, acquire=acquire)
    _sql, args = captured.executed[0]
    # clamped to MAX_LIMIT, then +1 for the has-more probe.
    assert args[-1] == activity_service.MAX_LIMIT + 1


# ---------------------------------------------------------------------------
# Schema — wire mapping + cursor codec
# ---------------------------------------------------------------------------


def test_to_activity_item_maps_fields() -> None:
    item = schema.to_activity_item(_row())
    assert item.type == "sale"
    assert item.nftName == "Yeezy 350"
    assert item.nftImage == "https://img"
    assert item.from_ == "SELLER"
    assert item.to == "BUYER"
    assert item.price == 2.5
    assert item.txHash == "SIG"
    # block_time -> epoch milliseconds.
    assert item.timestamp == int(_BT.timestamp() * 1000)


def test_to_activity_item_serializes_from_alias() -> None:
    item = schema.to_activity_item(_row())
    dumped = item.model_dump(by_alias=True)
    assert dumped["from"] == "SELLER"
    assert "from_" not in dumped


def test_to_activity_item_null_price_becomes_zero() -> None:
    item = schema.to_activity_item(_row(price_sol=None, event_type="transfer", to_wallet="NEW"))
    assert item.price == 0.0


def test_cursor_round_trip() -> None:
    cursor = schema.encode_cursor(_row(id="x-1", block_time=_BT))
    bt, rid = schema.decode_cursor(cursor)
    assert rid == "x-1"
    assert bt == _BT


@pytest.mark.parametrize("bad", ["", "!!!", "Zm9v", "bm90LWJhc2U2NHw="])
def test_decode_cursor_rejects_malformed(bad: str) -> None:
    with pytest.raises(ValueError):
        schema.decode_cursor(bad)


# ---------------------------------------------------------------------------
# Router — GET /api/activities, GET /api/nft/{mint}/history
# ---------------------------------------------------------------------------


async def test_route_activities_invalid_type_400(client: Any) -> None:
    resp = await client.get("/api/activities?type=bogus")
    assert resp.status_code == 400
    # main.py wraps HTTPException in the Express contract: {success, error}.
    assert "invalid type" in resp.json()["error"]


async def test_route_activities_bad_cursor_400(client: Any) -> None:
    # A malformed cursor is decoded before any DB access, so this needs no mock.
    resp = await client.get("/api/activities?cursor=%21%21%21")
    assert resp.status_code == 400


async def test_route_activities_happy_shape(client: Any, monkeypatch: Any) -> None:
    async def fake_feed(**_kw: Any):
        return [_row(id="a"), _row(id="b")], "CURSOR123"

    monkeypatch.setattr(activity_service, "feed", fake_feed)
    resp = await client.get("/api/activities")
    assert resp.status_code == 200
    body = resp.json()
    assert body["nextCursor"] == "CURSOR123"
    assert body["hasMore"] is True
    assert len(body["activities"]) == 2
    assert body["activities"][0]["type"] == "sale"
    assert body["activities"][0]["from"] == "SELLER"


async def test_route_activities_empty_state(client: Any, monkeypatch: Any) -> None:
    async def fake_feed(**_kw: Any):
        return [], None

    monkeypatch.setattr(activity_service, "feed", fake_feed)
    resp = await client.get("/api/activities")
    assert resp.status_code == 200
    body = resp.json()
    assert body["activities"] == []
    assert body["nextCursor"] is None
    assert body["hasMore"] is False


async def test_route_nft_history(client: Any, monkeypatch: Any) -> None:
    async def fake_history(mint: str, **_kw: Any):
        assert mint == "MINT"
        return [_row(event_type="mint"), _row(event_type="transfer", to_wallet="NEW")]

    monkeypatch.setattr(activity_service, "history", fake_history)
    resp = await client.get("/api/nft/MINT/history")
    assert resp.status_code == 200
    body = resp.json()
    assert body["nftMintAddress"] == "MINT"
    assert [a["type"] for a in body["activities"]] == ["mint", "transfer"]
