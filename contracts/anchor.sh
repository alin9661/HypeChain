#!/usr/bin/env bash
# Anchor wrapper — REQUIRED for `anchor build` (and anything that builds,
# e.g. `anchor test`) on this repo.
#
# anchor-cli 0.30.1's IDL step hardcodes `cargo +nightly` and anchor-syn
# 0.30.1 needs `proc_macro2::Span::source_file()`, which modern nightlies
# (>= ~2025-03) removed. We pin a 2024 nightly for the whole invocation.
# See DEPLOY.md "Toolchain note" and the comment in
# programs/hypechain-marketplace/Cargo.toml for the matching lockfile pins.
#
# Usage:  ./anchor.sh            -> anchor build
#         ./anchor.sh keys sync  -> anchor keys sync
#         ./anchor.sh test       -> anchor test
set -euo pipefail
cd "$(dirname "$0")"

PINNED_NIGHTLY=nightly-2024-11-01
rustup toolchain list | grep -q "^${PINNED_NIGHTLY}" ||
  rustup toolchain install "${PINNED_NIGHTLY}" --profile minimal

export RUSTUP_TOOLCHAIN="${PINNED_NIGHTLY}"
exec anchor "${@:-build}"
