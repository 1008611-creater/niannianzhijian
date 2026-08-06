#!/usr/bin/env bash
set -euo pipefail

source_root="${NIANNIAN_CANONICAL_SOURCE_ROOT:-/mnt/e/codex/niannianai/niannianai}"
runtime_root="${NIANNIAN_WSL_RUNTIME_ROOT:-$HOME/niannianai-wsl-runtime}"
deps_root="${NIANNIAN_WSL_DEPS_ROOT:-$HOME/niannianai-wsl-deps}"

if [[ "$source_root" != "/mnt/e/codex/niannianai/niannianai" ]]; then
  printf '%s\n' 'NIANNIAN_CANONICAL_SOURCE_ROOT must point to the canonical project root.' >&2
  exit 2
fi
if [[ ! -f "$source_root/server.js" || ! -d "$deps_root/node_modules/sharp" ]]; then
  printf '%s\n' 'Canonical source or Linux dependency runtime is missing.' >&2
  exit 2
fi

mkdir -p "$runtime_root"
rsync -a --delete \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude 'data/' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude '*.log' \
  "$source_root/" "$runtime_root/"
ln -sfn "$deps_root/node_modules" "$runtime_root/node_modules"
printf 'WSL_RUNTIME_SYNCED %s\n' "$runtime_root"
