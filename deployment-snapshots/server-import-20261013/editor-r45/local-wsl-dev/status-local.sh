#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="$ROOT/local-wsl-dev/runtime"

for name in main editor; do
  pid_file="$RUNTIME_DIR/$name.pid"
  log_file="$RUNTIME_DIR/$name.log"
  if [[ -s "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
    echo "$name: running (PID $(cat "$pid_file"))"
  else
    echo "$name: stopped"
  fi
  if [[ -f "$log_file" ]]; then
    echo "  log: $log_file"
    tail -n 3 "$log_file" | sed 's/^/  | /'
  fi
done

