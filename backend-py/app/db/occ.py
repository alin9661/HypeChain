"""Optimistic-concurrency-control retry helper for Aurora DSQL.

Spec §3.5 step 2. Aurora DSQL uses optimistic concurrency control: instead of
locking rows, it lets concurrent transactions proceed and aborts the loser at
COMMIT with a serialization failure. PostgreSQL signals this with SQLSTATE
``40001`` (``serialization_failure``), which asyncpg raises as
``asyncpg.SerializationError``.

A write that may race another writer on the same row (notably the seller
``total_volume`` increment in ``queries.increment_user_volume``) must therefore
be wrapped so that, on a 40001 abort, the whole operation is retried from
scratch. This helper provides that retry-on-serialization-error loop with
bounded attempts and exponential backoff.
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import TypeVar

import asyncpg

# Postgres / DSQL serialization failure. asyncpg maps it to SerializationError,
# but we also match by SQLSTATE so a bare PostgresError with this code is caught.
SERIALIZATION_FAILURE_SQLSTATE = "40001"

T = TypeVar("T")

DEFAULT_MAX_ATTEMPTS = 5
DEFAULT_BASE_DELAY_S = 0.01


def _is_serialization_error(exc: BaseException) -> bool:
    if isinstance(exc, asyncpg.SerializationError):
        return True
    sqlstate = getattr(exc, "sqlstate", None)
    return sqlstate == SERIALIZATION_FAILURE_SQLSTATE


async def retry_on_serialization_error(
    op: Callable[[], Awaitable[T]],
    *,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
    base_delay_s: float = DEFAULT_BASE_DELAY_S,
) -> T:
    """Run ``op`` and retry it on a DSQL serialization failure (SQLSTATE 40001).

    ``op`` MUST be an idempotent, self-contained coroutine factory — i.e. each
    call performs the entire transaction afresh (acquire connection, run the
    statement(s)), because a retried attempt starts a brand-new transaction.

    Args:
        op: zero-arg coroutine factory performing the transactional work.
        max_attempts: total tries before giving up and re-raising.
        base_delay_s: base for exponential backoff (delay = base * 2**attempt),
            with a tiny jitter to de-correlate competing retriers.

    Returns:
        Whatever ``op`` returns on the first successful attempt.

    Raises:
        The last serialization error if every attempt fails, or immediately
        re-raises any non-serialization error.
    """
    last_exc: BaseException | None = None
    for attempt in range(max_attempts):
        try:
            return await op()
        except (asyncpg.SerializationError, asyncpg.PostgresError) as exc:
            if not _is_serialization_error(exc):
                raise
            last_exc = exc
            if attempt + 1 >= max_attempts:
                break
            # Exponential backoff with light jitter.
            delay = base_delay_s * (2**attempt)
            await asyncio.sleep(delay)
    assert last_exc is not None  # loop only breaks after catching a serialization error
    raise last_exc
