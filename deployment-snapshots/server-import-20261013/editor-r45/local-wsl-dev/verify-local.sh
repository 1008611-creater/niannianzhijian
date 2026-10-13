#!/usr/bin/env bash
set -Eeuo pipefail

EDITOR_PORT="${EDITOR_PORT:-5199}"
MAIN_PORT="${MAIN_PORT:-3026}"

check_page() {
  local name="$1"
  local url="$2"
  local expected="$3"
  local body
  body="$(curl --fail --max-time 30 -sS -L "$url")"
  if [[ "$body" != *"$expected"* ]]; then
    echo "$name 校验失败：页面没有找到预期标识：$expected" >&2
    exit 1
  fi
  echo "$name: 200，已找到 $expected"
}

check_page "主站" "http://127.0.0.1:${MAIN_PORT}/" "念念AI视频工作台"
check_page "智剪" "http://127.0.0.1:${EDITOR_PORT}/" "念念智剪"
