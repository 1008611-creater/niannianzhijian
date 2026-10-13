#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="$ROOT/local-wsl-dev/runtime"

for name in editor main; do
  pid_file="$RUNTIME_DIR/$name.pid"
  if [[ -s "$pid_file" ]]; then
    pid="$(cat "$pid_file")"
    if kill -0 "$pid" 2>/dev/null; then
      # The launcher is a separate session, so a negative PID targets only its local group.
      kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
      echo "$name 已停止：PID $pid"
    else
      echo "$name 已不在运行"
    fi
    rm -f "$pid_file"
  else
    echo "$name 未启动"
  fi
done
