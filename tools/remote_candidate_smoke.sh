#!/usr/bin/env bash
set -euo pipefail

stage_root="${1:?stage root is required}"
port="${2:?port is required}"
verifier_path="${3:?verifier path is required}"
origin="http://127.0.0.1:${port}"
tmp_data="$(mktemp -d /tmp/niannian-candidate-data.XXXXXX)"
tmp_log="$(mktemp /tmp/niannian-candidate-smoke.XXXXXX.log)"
tmp_status="$(mktemp /tmp/niannian-candidate-smoke.XXXXXX.status)"
tmp_health="$(mktemp /tmp/niannian-candidate-smoke.XXXXXX.health)"

cleanup() {
  if [[ -n "${candidate_pid:-}" ]] && kill -0 "$candidate_pid" 2>/dev/null; then
    kill "$candidate_pid" 2>/dev/null || true
    wait "$candidate_pid" 2>/dev/null || true
  fi
  rm -rf "$tmp_data" "$tmp_log" "$tmp_status" "$tmp_health"
}
trap cleanup EXIT

PORT="$port" DATA_DIR="$tmp_data" NIANNIAN_STEP01_AUTO_EXECUTE=off /opt/node24/bin/node "$stage_root/package/server.js" >"$tmp_log" 2>&1 &
candidate_pid=$!

for attempt in 1 2 3 4 5 6 7 8; do
  if kill -0 "$candidate_pid" 2>/dev/null \
    && /opt/node24/bin/node "$verifier_path" "$stage_root" "$origin" >"$tmp_status" 2>&1 \
    && curl -fsS --max-time 5 "$origin/api/health" >"$tmp_health" 2>/dev/null \
    && /opt/node24/bin/node -e "const fs=require('fs'); const value=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); if(value?.ok!==true) process.exit(1)" "$tmp_health"; then
    cat "$tmp_status"
    cat "$tmp_health"
    exit 0
  fi
  sleep 1
done

cat "$tmp_status" >&2
cat "$tmp_log" >&2
exit 1
