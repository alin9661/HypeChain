"""Service-level tests for verify_payment's on-chain checks.

These exercise the buyer-binding guard (the fix for the payment-hijacking
finding): a payment is only valid if the *claimed buyer* is itself a funding
source in the transaction. Without it, anyone could submit a signature where a
third party paid the recipient and claim the purchase.
"""

from __future__ import annotations

import contextlib
import time

import app.services.payment as payment

LAMPORTS = 1_000_000_000


class _Obj:
    def __init__(self, **kw):
        self.__dict__.update(kw)


class _FakeRpc:
    def __init__(self, tx):
        self._tx = tx

    def get_transaction(self, signature):  # noqa: ARG002 — signature unused in fake
        return self._tx


def _fake_tx(account_keys, pre, post, *, err=None):
    return _Obj(
        meta=_Obj(err=err, pre_balances=pre, post_balances=post),
        message=_Obj(account_keys=account_keys),
        block_time=int(time.time()),
        slot=42,
    )


@contextlib.asynccontextmanager
async def _fake_acquire():
    yield None


async def _no_existing(conn, signature):  # noqa: ARG001 — replay guard returns "unused"
    return None


async def test_verify_payment_valid_when_buyer_funds(monkeypatch):
    # Buyer B spends 0.500005 SOL (amount + fee); seller S receives 0.5.
    tx = _fake_tx(["B", "S"], pre=[LAMPORTS, 0], post=[LAMPORTS - 500_005_000, 500_000_000])
    monkeypatch.setattr(payment.queries, "get_transaction_id_by_signature", _no_existing)
    out = await payment.verify_payment(
        "sig", "S", 0.5, "L1", "B", acquire=_fake_acquire, rpc=_FakeRpc(tx)
    )
    assert out["valid"] is True
    assert abs(out["amountTransferred"] - 0.5) < 1e-9


async def test_verify_payment_rejects_when_buyer_absent(monkeypatch):
    # Seller paid by A; the claimed buyer B is not in the transaction at all.
    tx = _fake_tx(["A", "S"], pre=[LAMPORTS, 0], post=[LAMPORTS - 500_005_000, 500_000_000])
    monkeypatch.setattr(payment.queries, "get_transaction_id_by_signature", _no_existing)
    out = await payment.verify_payment(
        "sig", "S", 0.5, "L1", "B", acquire=_fake_acquire, rpc=_FakeRpc(tx)
    )
    assert out["valid"] is False
    assert "buyer" in out["error"].lower()


async def test_verify_payment_rejects_hijack_when_buyer_did_not_fund(monkeypatch):
    # The forgery case: Mallory (M) claims the purchase, but Alice (A) actually
    # funded the seller. M's balance is unchanged -> must be rejected.
    tx = _fake_tx(
        ["M", "S", "A"],
        pre=[LAMPORTS, 0, LAMPORTS],
        post=[LAMPORTS, 500_000_000, LAMPORTS - 500_005_000],
    )
    monkeypatch.setattr(payment.queries, "get_transaction_id_by_signature", _no_existing)
    out = await payment.verify_payment(
        "sig", "S", 0.5, "L1", "M", acquire=_fake_acquire, rpc=_FakeRpc(tx)
    )
    assert out["valid"] is False
    assert "fund" in out["error"].lower()
