#!/bin/bash
# Forced-command gateway for Windows -> Mac relay control.
# It deliberately exposes only exact allowlisted relay verbs; it never provides
# an interactive shell or arbitrary command execution.
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

readonly PROJECT_ROOT="${HOME}/AI-Brain/niannian-ai-canonical-local"
readonly CONFIG_PATH="${HOME}/.config/ai-brain/mac-relay-ssh-gateway.conf"
readonly LOCK_PATH="${HOME}/.local/state/ai-brain/mac-relay-ssh-gateway.lock"
readonly CAPABILITY_STATUS_PATH="${HOME}/.config/ai-brain/runtime_capability_status.json"
readonly MIMO_N06_CAPABILITY_STATUS_PATH="${HOME}/.config/ai-brain/mimo-n06-capability-status.json"

fail() {
  printf '{"ok":false,"error":"%s"}\n' "$1" >&2
  exit 1
}

config_value() {
  local key="$1"
  local value
  value="$(awk -F= -v expected_key="$key" '$1 == expected_key { print substr($0, length(expected_key) + 2); exit }' "$CONFIG_PATH")"
  [ -n "$value" ] || fail "mac_relay_gateway_config_${key}_missing"
  printf '%s' "$value"
}

require_safe_value() {
  local value="$1"
  local pattern="$2"
  [[ "$value" =~ $pattern ]] || fail "mac_relay_gateway_config_value_invalid"
}

read_config() {
  [ -f "$CONFIG_PATH" ] || fail "mac_relay_gateway_config_missing"
  [ ! -L "$CONFIG_PATH" ] || fail "mac_relay_gateway_config_symlink_rejected"
  [ -d "$PROJECT_ROOT" ] || fail "mac_relay_gateway_project_missing"

  WINDOWS_HOST="$(config_value WINDOWS_HOST)"
  WINDOWS_USER="$(config_value WINDOWS_USER)"
  WINDOWS_KEY_PATH="$(config_value WINDOWS_KEY_PATH)"
  NODE_BIN="$(config_value NODE_BIN)"

  require_safe_value "$WINDOWS_HOST" '^[A-Za-z0-9._-]+$'
  require_safe_value "$WINDOWS_USER" '^[A-Za-z0-9._-]+$'
  [ -f "$WINDOWS_KEY_PATH" ] || fail "mac_relay_gateway_windows_key_missing"
  [ ! -L "$WINDOWS_KEY_PATH" ] || fail "mac_relay_gateway_windows_key_symlink_rejected"
  [ -x "$NODE_BIN" ] || fail "mac_relay_gateway_node_missing"
}

release_lock() {
  rmdir "$LOCK_PATH" 2>/dev/null || true
}

run_status() {
  local lock_state="idle"
  local capability_report
  local capability_exit
  local mimo_capability_report
  local mimo_capability_exit
  [ -d "$LOCK_PATH" ] && lock_state="busy"
  set +e
  capability_report="$("$NODE_BIN" "$PROJECT_ROOT/bridge/niannian_runtime_capability_status.js" --source-root "$PROJECT_ROOT" --profile mac-step01-strict-evidence-v1 2>/dev/null)"
  capability_exit=$?
  set -e
  if [ "$capability_exit" -ne 0 ] && [[ "$capability_report" != \{*\} ]]; then
    capability_report='{"ready":false,"issue":"capability_audit_unavailable","capabilities":{}}'
  fi
  set +e
  mimo_capability_report="$($NODE_BIN "$PROJECT_ROOT/bridge/niannian_runtime_capability_status.js" --source-root "$PROJECT_ROOT" --profile mac-n06-mimo-preflight-v1 2>/dev/null)"
  mimo_capability_exit=$?
  set -e
  if [ "$mimo_capability_exit" -ne 0 ] && [[ "$mimo_capability_report" != \{*\} ]]; then
    mimo_capability_report='{"ready":false,"issue":"capability_audit_unavailable","capabilities":{}}'
  fi
  printf '{"ok":true,"service":"ai-brain-mac-relay","shell":false,"lock":"%s","project_present":true,"capability_audit":%s,"mimo_n06_capability_audit":%s,"state_mutated":false}\n' "$lock_state" "$capability_report" "$mimo_capability_report"
}

run_execute_once() {
  local job_id="$1"
  mkdir -p "$(dirname "$LOCK_PATH")"
  if ! mkdir "$LOCK_PATH" 2>/dev/null; then
    fail "mac_relay_gateway_busy"
  fi
  trap release_lock EXIT HUP INT TERM

  cd "$PROJECT_ROOT"
  "$NODE_BIN" bridge/niannian_mac_worker_relay.js \
    --execute \
    --job-id "$job_id" \
    --windows-host "$WINDOWS_HOST" \
    --windows-user "$WINDOWS_USER" \
    --key-path "$WINDOWS_KEY_PATH"
}

run_prepare() {
  local job_id="$1"
  mkdir -p "$(dirname "$LOCK_PATH")"
  if ! mkdir "$LOCK_PATH" 2>/dev/null; then
    fail "mac_relay_gateway_busy"
  fi
  trap release_lock EXIT HUP INT TERM

  cd "$PROJECT_ROOT"
  "$NODE_BIN" bridge/niannian_mac_worker_relay.js \
    --job-id "$job_id" \
    --windows-host "$WINDOWS_HOST" \
    --windows-user "$WINDOWS_USER" \
    --key-path "$WINDOWS_KEY_PATH"
}

run_app_turn() {
  local request_id="$1"
  local thread_id="$2"
  local envelope_sha="$3"
  local envelope_b64="$4"
  cd "$PROJECT_ROOT"
  "$NODE_BIN" bridge/mac_codex_app_fixed_thread_turn.js \
    "$request_id" \
    "$thread_id" \
    "$envelope_sha" \
    "$envelope_b64"
}

run_app_readback() {
  local request_id="$1"
  local thread_id="$2"
  cd "$PROJECT_ROOT"
  "$NODE_BIN" bridge/mac_codex_app_fixed_thread_readback.js \
    "$request_id" \
    "$thread_id"
}

run_step01_phase_execute() {
  local request_id="$1"
  local job_id="$2"
  local phase_key="$3"
  local manifest_sha="$4"
  mkdir -p "$(dirname "$LOCK_PATH")"
  if ! mkdir "$LOCK_PATH" 2>/dev/null; then
    fail "mac_relay_gateway_busy"
  fi
  trap release_lock EXIT HUP INT TERM
  cd "$PROJECT_ROOT"
  "$NODE_BIN" bridge/niannian_redraw_step01_fixed_app_phase_executor.js \
    "$request_id" "$job_id" "$phase_key" "$manifest_sha" --broker-envelope-stdin 1
}

run_install_release() {
  local request_id="$1"
  local release_version="$2"
  local manifest_sha="$3"
  local archive_sha="$4"
  mkdir -p "$(dirname "$LOCK_PATH")"
  if ! mkdir "$LOCK_PATH" 2>/dev/null; then
    fail "mac_relay_gateway_busy"
  fi
  trap 'rmdir "$LOCK_PATH" 2>/dev/null || true' EXIT INT TERM
  cd "$PROJECT_ROOT"
  "$NODE_BIN" bridge/niannian_mac_bridge_install_release_runner.js \
    "$request_id" "$release_version" "$manifest_sha" "$archive_sha"
  rmdir "$LOCK_PATH" 2>/dev/null || true
  trap - EXIT INT TERM
}

run_hq_composite() {
  local exit_receipt="$PROJECT_ROOT/output/mac-employee-training/step01-hq-composite-probe-exit.json"
  local launch_agent="$HOME/Library/LaunchAgents/com.niannian.ai-brain.hq-refresh.plist"
  local service="gui/$(/usr/bin/id -u)/com.niannian.ai-brain.hq-refresh"
  [ -f "$launch_agent" ] || fail "mac_relay_gateway_hq_refresh_agent_missing"
  [ ! -L "$launch_agent" ] || fail "mac_relay_gateway_hq_refresh_agent_symlink_rejected"
  mkdir -p "$(dirname "$LOCK_PATH")"
  if ! mkdir "$LOCK_PATH" 2>/dev/null; then
    fail "mac_relay_gateway_busy"
  fi
  trap release_lock EXIT HUP INT TERM

  cd "$PROJECT_ROOT"
  /bin/rm -f "$exit_receipt"
  /bin/launchctl kickstart -k "$service" || fail "mac_relay_gateway_hq_refresh_agent_start_failed"
  local waited=0
  while [ "$waited" -lt 900 ] && [ ! -f "$exit_receipt" ]; do /bin/sleep 1; waited=$((waited + 1)); done
  [ -f "$exit_receipt" ] && [ ! -L "$exit_receipt" ] || fail "mac_relay_gateway_hq_composite_exit_receipt_missing"
  /bin/cat "$exit_receipt"
  /usr/bin/grep -Eq '"exit_code"[[:space:]]*:[[:space:]]*0' "$exit_receipt" || return 1
}

run_hq_readback() {
  cd "$PROJECT_ROOT"
  "$NODE_BIN" bridge/niannian_mac_hq_readback.js
}

run_hq_diagnose() {
  cd "$PROJECT_ROOT"
  "$NODE_BIN" bridge/niannian_mac_hq_diagnose.js
}

run_model_channel_audit() {
  cd "$PROJECT_ROOT"
  "$NODE_BIN" bridge/repair_mac_krill_env_only_config.js --audit
}

run_model_channel_repair() {
  cd "$PROJECT_ROOT"
  "$NODE_BIN" bridge/repair_mac_krill_env_only_config.js
}

run_model_channel_rollback() {
  cd "$PROJECT_ROOT"
  "$NODE_BIN" bridge/repair_mac_krill_env_only_config.js --rollback-latest
}

main() {
  read_config
  case "${SSH_ORIGINAL_COMMAND:-}" in
    "ai-brain-relay status")
      run_status
      ;;
    "ai-brain-relay prepare "*)
      local_job_id="${SSH_ORIGINAL_COMMAND#ai-brain-relay prepare }"
      [[ "$local_job_id" =~ ^web_n[ns]-[a-z0-9-]{10,100}$ ]] || fail "mac_relay_gateway_job_id_rejected"
      run_prepare "$local_job_id"
      ;;
    "ai-brain-relay execute-once "*)
      local_job_id="${SSH_ORIGINAL_COMMAND#ai-brain-relay execute-once }"
      [[ "$local_job_id" =~ ^web_n[ns]-[a-z0-9-]{10,100}$ ]] || fail "mac_relay_gateway_job_id_rejected"
      run_execute_once "$local_job_id"
      ;;
    "ai-brain-relay app-turn "*)
      app_turn_args="${SSH_ORIGINAL_COMMAND#ai-brain-relay app-turn }"
      set -f
      old_ifs="$IFS"
      IFS=' '
      set -- $app_turn_args
      IFS="$old_ifs"
      set +f
      [ "$#" -eq 4 ] || fail "mac_relay_gateway_app_turn_arg_count_rejected"
      request_id="$1"
      fixed_thread_id="$2"
      envelope_sha="$3"
      envelope_b64="$4"
      [[ "$request_id" =~ ^[A-Za-z0-9._-]+$ ]] || fail "mac_relay_gateway_app_turn_request_id_rejected"
      [ "${#request_id}" -ge 8 ] && [ "${#request_id}" -le 96 ] || fail "mac_relay_gateway_app_turn_request_id_rejected"
      case "$fixed_thread_id" in
        019f6201-c013-7cf3-b155-61d2789085f4|019f6201-cb91-7cf0-819e-696eeabd9e78|019f6201-d5e8-7083-884d-c714eb1a78b0|019f6201-dff9-7f63-94d8-7f9020b3c223|019f6201-ea1b-7e22-9dd0-a3b851b15b69) ;;
        *) fail "mac_relay_gateway_app_turn_thread_rejected" ;;
      esac
      [[ "$envelope_sha" =~ ^[a-f0-9]+$ ]] || fail "mac_relay_gateway_app_turn_sha_rejected"
      [ "${#envelope_sha}" -eq 64 ] || fail "mac_relay_gateway_app_turn_sha_rejected"
      [[ "$envelope_b64" =~ ^[A-Za-z0-9_-]+$ ]] || fail "mac_relay_gateway_app_turn_envelope_rejected"
      [ "${#envelope_b64}" -le 90000 ] || fail "mac_relay_gateway_app_turn_envelope_rejected"
      run_app_turn "$request_id" "$fixed_thread_id" "$envelope_sha" "$envelope_b64"
      ;;
    "ai-brain-relay app-readback "*)
      app_readback_args="${SSH_ORIGINAL_COMMAND#ai-brain-relay app-readback }"
      set -f
      old_ifs="$IFS"
      IFS=' '
      set -- $app_readback_args
      IFS="$old_ifs"
      set +f
      [ "$#" -eq 2 ] || fail "mac_relay_gateway_app_readback_arg_count_rejected"
      request_id="$1"
      fixed_thread_id="$2"
      [[ "$request_id" =~ ^[A-Za-z0-9._-]{8,96}$ ]] || fail "mac_relay_gateway_app_readback_request_id_rejected"
      case "$fixed_thread_id" in
        019f6201-c013-7cf3-b155-61d2789085f4|019f6201-cb91-7cf0-819e-696eeabd9e78|019f6201-d5e8-7083-884d-c714eb1a78b0|019f6201-dff9-7f63-94d8-7f9020b3c223|019f6201-ea1b-7e22-9dd0-a3b851b15b69) ;;
        *) fail "mac_relay_gateway_app_readback_thread_rejected" ;;
      esac
      run_app_readback "$request_id" "$fixed_thread_id"
      ;;
    "ai-brain-relay model-channel-rollback")
      run_model_channel_rollback
      ;;
    "ai-brain-relay install-release "*)
      install_args="${SSH_ORIGINAL_COMMAND#ai-brain-relay install-release }"
      set -f
      old_ifs="$IFS"
      IFS=' '
      set -- $install_args
      IFS="$old_ifs"
      set +f
      [ "$#" -eq 4 ] || fail "mac_relay_gateway_install_arg_count_rejected"
      request_id="$1"
      release_version="$2"
      manifest_sha="$3"
      archive_sha="$4"
      [[ "$request_id" =~ ^[A-Za-z0-9._-]{8,96}$ ]] || fail "mac_relay_gateway_install_request_id_rejected"
      [[ "$release_version" =~ ^20[0-9]{2}\.[0-9]{2}\.[0-9]{2}\.[0-9]+$ ]] || fail "mac_relay_gateway_install_version_rejected"
      [[ "$manifest_sha" =~ ^[a-f0-9]{64}$ ]] || fail "mac_relay_gateway_install_manifest_sha_rejected"
      [[ "$archive_sha" =~ ^[a-f0-9]{64}$ ]] || fail "mac_relay_gateway_install_archive_sha_rejected"
      run_install_release "$request_id" "$release_version" "$manifest_sha" "$archive_sha"
      ;;
    "ai-brain-relay step01-phase-execute "*)
      execute_args="${SSH_ORIGINAL_COMMAND#ai-brain-relay step01-phase-execute }"
      set -f
      old_ifs="$IFS"
      IFS=' '
      set -- $execute_args
      IFS="$old_ifs"
      set +f
      [ "$#" -eq 4 ] || fail "mac_relay_gateway_step01_phase_execute_arg_count_rejected"
      request_id="$1"
      local_job_id="$2"
      phase_key="$3"
      manifest_sha="$4"
      [[ "$request_id" =~ ^[A-Za-z0-9._-]{8,96}$ ]] || fail "mac_relay_gateway_step01_phase_execute_request_id_rejected"
      [[ "$local_job_id" =~ ^web_nn-[a-z0-9-]{10,100}$ ]] || fail "mac_relay_gateway_step01_phase_execute_job_id_rejected"
      [[ "$phase_key" =~ ^step01phase-[a-f0-9]{64}$ ]] || fail "mac_relay_gateway_step01_phase_execute_phase_key_rejected"
      [[ "$manifest_sha" =~ ^[a-f0-9]{64}$ ]] || fail "mac_relay_gateway_step01_phase_execute_manifest_sha_rejected"
      run_step01_phase_execute "$request_id" "$local_job_id" "$phase_key" "$manifest_sha"
      ;;
    "ai-brain-relay hq-composite")
      run_hq_composite
      ;;
    "ai-brain-relay hq-readback")
      run_hq_readback
      ;;
    "ai-brain-relay hq-diagnose")
      run_hq_diagnose
      ;;
    "ai-brain-relay model-channel-audit")
      run_model_channel_audit
      ;;
    "ai-brain-relay model-channel-repair")
      run_model_channel_repair
      ;;
    *)
      fail "mac_relay_gateway_command_rejected"
      ;;
  esac
}

main "$@"
