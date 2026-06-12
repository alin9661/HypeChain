"""Config / startup guards — PR1 foundations.

Covers two fail-loud invariants the on-chain buy loop depends on:

1. **E5 — one real custodial keypair.** The platform custodial wallet must be
   the *real* server keypair's pubkey (``get_server_wallet().pubkey()``), not a
   non-decodable vanity placeholder. It must base58-decode to 32 bytes AND pass
   ``is_valid_solana_pubkey`` (on-curve) so the custodial seller binding the
   payment flow checks (``payment.py:63``) does not reject it.

2. **T8 — program-id startup guard.** Outside dev/test, the app must refuse to
   start with the program ID unset or left at the Anchor scaffold placeholder,
   so a half-configured deploy fails loud instead of silently targeting the
   wrong program. Dev/test keeps working.
"""

from __future__ import annotations

import base58
import pytest
from solders.keypair import Keypair

import app.services.solana as solana
from app.config.settings import (
    PLACEHOLDER_PROGRAM_ID,
    get_settings,
    require_marketplace_program_id,
)
from app.utils.solana_validation import is_valid_solana_pubkey

# A fresh keypair stands in for the real server wallet.
_SERVER_KP = Keypair()
_SERVER_SECRET_B58 = base58.b58encode(bytes(_SERVER_KP)).decode()


@pytest.fixture
def server_wallet(monkeypatch):
    """Inject a known server keypair + reset the cached custodial pubkey."""
    monkeypatch.setattr(solana, "_server_wallet", _SERVER_KP)
    monkeypatch.setattr(solana, "_platform_custodial_pubkey", None, raising=False)
    settings = get_settings()
    monkeypatch.setattr(
        settings, "hacknyu_server_wallet_private_key", _SERVER_SECRET_B58
    )
    return _SERVER_KP


# ──────────────────────────────────────────────────────────────────────────────
# E5 — custodial wallet is the real server keypair
# ──────────────────────────────────────────────────────────────────────────────
def test_platform_custodial_pubkey_equals_server_wallet(server_wallet):
    custodial = solana.get_platform_custodial_pubkey()
    assert str(custodial) == str(server_wallet.pubkey())


def test_platform_custodial_pubkey_is_valid_base58_onchain_pubkey(server_wallet):
    custodial = str(solana.get_platform_custodial_pubkey())
    # base58-decodes to exactly 32 bytes...
    assert len(base58.b58decode(custodial)) == 32
    # ...and passes the on-curve wallet validation used by payment.py:63.
    assert is_valid_solana_pubkey(custodial)


def test_old_placeholder_was_not_a_valid_pubkey():
    # Regression guard: the retired vanity placeholder is NOT a valid pubkey.
    # (If anyone reintroduces it as the custodial seller, payment binding breaks.)
    assert not is_valid_solana_pubkey(
        "HypeChainPlatformWallet1111111111111111111111111"
    )


def test_platform_custodial_pubkey_cached(server_wallet):
    first = solana.get_platform_custodial_pubkey()
    second = solana.get_platform_custodial_pubkey()
    assert first == second


# ──────────────────────────────────────────────────────────────────────────────
# T8 — program-id startup guard
# ──────────────────────────────────────────────────────────────────────────────
def test_require_program_id_raises_in_production_when_unset(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "node_env", "production")
    monkeypatch.setattr(settings, "hacknyu_marketplace_program_id", None)
    with pytest.raises(RuntimeError):
        require_marketplace_program_id(allow_test_bypass=False)


def test_require_program_id_raises_in_production_on_placeholder(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "node_env", "production")
    monkeypatch.setattr(
        settings, "hacknyu_marketplace_program_id", PLACEHOLDER_PROGRAM_ID
    )
    with pytest.raises(RuntimeError):
        require_marketplace_program_id(allow_test_bypass=False)


def test_require_program_id_allows_dev_unset(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "node_env", "development")
    monkeypatch.setattr(settings, "hacknyu_marketplace_program_id", None)
    # In dev the guard is a no-op (returns None / does not raise) even with the
    # test bypass disabled.
    assert require_marketplace_program_id(allow_test_bypass=False) is None


def test_require_program_id_returns_real_id_in_production(monkeypatch):
    real = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"
    settings = get_settings()
    monkeypatch.setattr(settings, "node_env", "production")
    monkeypatch.setattr(settings, "hacknyu_marketplace_program_id", real)
    assert require_marketplace_program_id(allow_test_bypass=False) == real


def test_startup_guard_bypassed_under_pytest(monkeypatch):
    """The default-arg startup call (app.main.create_app) must NOT raise during
    the test suite even with production env + unset program id."""
    settings = get_settings()
    monkeypatch.setattr(settings, "node_env", "production")
    monkeypatch.setattr(settings, "hacknyu_marketplace_program_id", None)
    # allow_test_bypass defaults to True → bypassed under pytest.
    assert require_marketplace_program_id() is None
