#!/usr/bin/env bash
set -euo pipefail

# The approved release is an explicit deployment decision. Consumer links may
# drift when an incomplete candidate is unpacked, but they must never become
# the source of truth for the running site.
approved_link="/opt/niannian-ai-approved"
app_link="/opt/niannian-ai"
static_link="/var/www/niannian-ai"
node_bin="${NIANNIAN_NODE_BIN:-/opt/node24/bin/node}"
legacy_validator="/usr/local/lib/niannian-release-control/verify_release_target.js"
controller_root="/usr/local/lib/niannian-release-controller"

target="$(readlink -f "$approved_link")"
case "$target" in
  /opt/niannian-ai-releases/*/package) ;;
  *) printf '%s\n' 'invalid_approved_release_target' >&2; exit 1 ;;
esac
stage_root="$(dirname "$target")"
schema="$($node_bin -e 'const fs=require("fs");process.stdout.write(String(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).schema_version||""))' "$stage_root/release-activation.json")"
case "$schema" in
  niannian_release_activation_v2)
    test -f "$legacy_validator"
    "$node_bin" "$legacy_validator" "$target" >/dev/null
    ;;
  niannian_release_activation_v3)
    "$node_bin" "$controller_root/verify-release-stage.js" "$stage_root" >/dev/null
    "$node_bin" "$controller_root/verify-protected-step01.js" "$target" >/dev/null
    ;;
  *) printf '%s\n' 'release_activation_schema_invalid' >&2; exit 1 ;;
esac

if [ "$(readlink -f "$app_link" 2>/dev/null || true)" != "$target" ]; then
  ln -sfn "$target" "$app_link"
fi
if [ "$(readlink -f "$static_link" 2>/dev/null || true)" != "$target" ]; then
  ln -sfn "$target" "$static_link"
fi
