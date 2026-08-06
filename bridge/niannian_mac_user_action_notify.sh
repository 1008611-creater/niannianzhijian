#!/bin/bash
set -Eeuo pipefail

request_file="${1:-}"
action_card="${NIANNIAN_MAC_ACTION_CARD:-}"
[[ -n "$request_file" && -f "$request_file" ]] || { echo 'usage: niannian_mac_user_action_notify.sh <user-action-requests.json>' >&2; exit 2; }
[[ "$(/usr/bin/stat -f%Su /dev/console)" != "root" ]] || { echo 'mac_gui_bridge_bootstrap_required' >&2; exit 3; }

action_flags="$(python3 - "$request_file" <<'PY'
import json, sys
with open(sys.argv[1], encoding='utf-8') as handle:
    payload = json.load(handle)
needs_mimo = False
needs_step01_credentials = False
for request in payload.get('requests', []):
    capability = str(request.get('capability', 'Mac capability'))[:100]
    observed_status = str(request.get('observed_status', ''))[:40]
    observed_reason = str(request.get('observed_reason', '')).lower()[:120]
    print(capability)
    if capability in {'credential:mimo_8001_session', 'channel:mimo_8001_nonbillable_preflight'}:
        needs_mimo = True
    if capability in {'credential:mimo_asr', 'credential:paddle_ocr'} and observed_status == 'failed' and any(token in observed_reason for token in ('auth', 'authoriz', 'permission', 'provider_service', 'server')):
        needs_step01_credentials = True
print('__NIANNIAN_MIMO_LOGIN__=' + ('1' if needs_mimo else '0'))
print('__NIANNIAN_STEP01_CREDENTIALS__=' + ('1' if needs_step01_credentials else '0'))
PY
)"
printf '%s\n' "$action_flags" | while IFS= read -r capability; do
  [[ "$capability" == __NIANNIAN_MIMO_LOGIN__=* || "$capability" == __NIANNIAN_STEP01_CREDENTIALS__=* ]] && continue
  # Stale proof is intentionally absent from action_flags. Do not surface a GUI
  # action unless a real authentication/authorization failure was classified.
done
if printf '%s\n' "$action_flags" | /usr/bin/grep -Eq '^__NIANNIAN_(MIMO_LOGIN|STEP01_CREDENTIALS)=1$'; then
  osascript - <<'APPLESCRIPT'
display notification "Provider 鉴权失败，需要完成受控登录后再重试。" with title "念念 AI 需要你的操作"
APPLESCRIPT
  # ChatGPT.app registers the supported codex:// scheme. This branch is reachable
  # only after a real authentication/authorization failure, never stale proof.
  open "codex://" || open -a ChatGPT || true
  if [[ -n "$action_card" && -f "$action_card" ]]; then open "$action_card"; fi
fi
if printf '%s\n' "$action_flags" | /usr/bin/grep -q '^__NIANNIAN_MIMO_LOGIN__=1$'; then
  mimo_launcher="$HOME/Downloads/NianNian-Mimo-Session-Bridge.command"
  [[ -x "$mimo_launcher" ]] && open "$mimo_launcher" || true
fi
if printf '%s\n' "$action_flags" | /usr/bin/grep -q '^__NIANNIAN_STEP01_CREDENTIALS__=1$'; then
  step01_launcher="$HOME/Downloads/NianNian-Step01-Credentials.command"
  [[ -x "$step01_launcher" ]] && open "$step01_launcher" || true
fi
