#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EDITOR_DIR="$ROOT"
MAIN_DIR="${NIANNIAN_MAIN_DIR:-/mnt/e/codex/aisp/aidaihuo/niannian-ai-web}"
RUNTIME_DIR="$ROOT/local-wsl-dev/runtime"
DATA_DIR="$ROOT/local-wsl-dev/data"
EDITOR_PORT="${EDITOR_PORT:-5199}"
MAIN_PORT="${MAIN_PORT:-3026}"

mkdir -p "$RUNTIME_DIR" "$DATA_DIR/editor-media" "$DATA_DIR/editor-cache" "$DATA_DIR/main"

require_dir() {
  if [[ ! -d "$1" ]]; then
    echo "缺少源码目录：$1" >&2
    exit 1
  fi
}

is_running() {
  local pid_file="$1"
  [[ -s "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null
}

start_one() {
  local name="$1"
  local dir="$2"
  local log_file="$RUNTIME_DIR/$name.log"
  local pid_file="$RUNTIME_DIR/$name.pid"
  local command="$3"
  local health_url="$4"

  if is_running "$pid_file"; then
    echo "$name 已在运行：PID $(cat "$pid_file")"
    return
  fi

  : > "$log_file"
  setsid bash -lc "cd '$dir' && $command" >> "$log_file" 2>&1 &
  local launcher_pid=$!
  echo "$launcher_pid" > "$pid_file"
  for _ in $(seq 1 180); do
    if ! is_running "$pid_file"; then
      echo "$name 启动失败，查看日志：$log_file" >&2
      tail -n 60 "$log_file" >&2 || true
      exit 1
    fi
    if curl --fail --silent --show-error --max-time 1 "$health_url" >/dev/null 2>&1; then
      echo "$name 已启动：PID $(cat "$pid_file")"
      return
    fi
    sleep 1
  done
  echo "$name 启动超时，健康检查未通过：$health_url；查看日志：$log_file" >&2
  tail -n 60 "$log_file" >&2 || true
  exit 1
}

require_dir "$EDITOR_DIR"
require_dir "$MAIN_DIR"

# 主站只使用源码目录里已有的本地环境，并覆盖本地地址和开发模式。
MAIN_COMMAND="set -a; [[ -f .env.local ]] && source .env.local; set +a; export AUTH_MAIL_MODE=local AUTH_COOKIE_SECURE=false APP_ORIGIN=http://127.0.0.1:${MAIN_PORT} NEXT_DIST_DIR=.next-local-wsl NIANNIAN_EDITOR_SSO_SECRET=local-wsl-editor-sso-secret-20260807 NIANNIAN_MAIN_ORIGIN=http://127.0.0.1:${MAIN_PORT} NIANNIAN_EDITOR_ORIGIN=http://127.0.0.1:${EDITOR_PORT}; exec npm exec -- next dev -p ${MAIN_PORT}"

# 智剪不读取线上环境；本地测试默认不配置付费供应商，积分扣除价格为 0。
# Qwen weights are public development dependencies.  Keep the source cache in
# the repository but read the runtime copy from WSL's native filesystem so a
# first alignment does not stream multi-gigabyte weights through /mnt.
QWEN_NATIVE_ROOT="${QWEN_FORCED_ALIGNER_NATIVE_ROOT:-$HOME/.cache/niannianzhijian/qwen-forced-aligner}"
EDITOR_COMMAND="export LOCAL_WSL_DEV=1 MEDIA_DIR='$DATA_DIR/editor-media' HF_ENDPOINT='${HF_ENDPOINT:-https://hf-mirror.com}' QWEN_FORCED_ALIGNER_NATIVE_ROOT='$QWEN_NATIVE_ROOT' NIANNIAN_MAIN_ORIGIN=http://127.0.0.1:${MAIN_PORT} NIANNIAN_EDITOR_ORIGIN=http://127.0.0.1:${EDITOR_PORT} NIANNIAN_EDITOR_SSO_SECRET=local-wsl-editor-sso-secret-20260807 NIANNIAN_EDITOR_STEP_PRICES='mimo_asr:0,mimo_qwen_asr:0,forced_align:0,mimo_tts:0,export:0' RESOURCE_PREVIEW_TOKEN=local-wsl-preview; exec npm run dev -- --host 0.0.0.0 --port ${EDITOR_PORT}"

start_one "main" "$MAIN_DIR" "$MAIN_COMMAND" "http://127.0.0.1:${MAIN_PORT}/"
start_one "editor" "$EDITOR_DIR" "$EDITOR_COMMAND" "http://127.0.0.1:${EDITOR_PORT}/api/niannian-auth/session"

echo ""
echo "本地主站： http://127.0.0.1:${MAIN_PORT}"
echo "本地智剪： http://127.0.0.1:${EDITOR_PORT}"
echo "状态命令： bash local-wsl-dev/status-local.sh"
echo "停止命令： bash local-wsl-dev/stop-local.sh"
