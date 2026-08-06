#!/bin/bash
# One-time Mac installer for the restricted Windows -> Mac relay endpoint.
# Run as the normal Mac login user. It intentionally pauses at sudo so the
# owner confirms enabling macOS Remote Login bound to the Tailscale address.
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

usage() {
  cat <<'EOF'
Usage:
  install_mac_relay_ssh_gateway.sh \
    --public-key-file <Windows relay .pub file> \
    --windows-key-path <existing Mac-to-Windows private key path> \
    --windows-host 100.125.247.33 \
    --windows-user lsb \
    --windows-tailscale-ip 100.125.247.33 \
    --mac-tailscale-ip 100.68.119.126
EOF
}

fail() {
  printf 'mac_relay_ssh_gateway_install_failed:%s\n' "$1" >&2
  exit 1
}

require_value() {
  [ -n "${2:-}" ] || fail "missing_$1"
  printf '%s' "$2"
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PUBLIC_KEY_FILE=""
WINDOWS_KEY_PATH=""
WINDOWS_HOST=""
WINDOWS_USER=""
WINDOWS_TAILSCALE_IP=""
MAC_TAILSCALE_IP=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --public-key-file) PUBLIC_KEY_FILE="$(require_value public_key_file "${2:-}")"; shift 2 ;;
    --windows-key-path) WINDOWS_KEY_PATH="$(require_value windows_key_path "${2:-}")"; shift 2 ;;
    --windows-host) WINDOWS_HOST="$(require_value windows_host "${2:-}")"; shift 2 ;;
    --windows-user) WINDOWS_USER="$(require_value windows_user "${2:-}")"; shift 2 ;;
    --windows-tailscale-ip) WINDOWS_TAILSCALE_IP="$(require_value windows_tailscale_ip "${2:-}")"; shift 2 ;;
    --mac-tailscale-ip) MAC_TAILSCALE_IP="$(require_value mac_tailscale_ip "${2:-}")"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) fail "unknown_argument" ;;
  esac
done

[ -f "$PUBLIC_KEY_FILE" ] && [ ! -L "$PUBLIC_KEY_FILE" ] || fail "public_key_file_missing"
[ -f "$WINDOWS_KEY_PATH" ] && [ ! -L "$WINDOWS_KEY_PATH" ] || fail "windows_key_path_missing"
[[ "$WINDOWS_HOST" =~ ^[A-Za-z0-9._-]+$ ]] || fail "windows_host_invalid"
[[ "$WINDOWS_USER" =~ ^[A-Za-z0-9._-]+$ ]] || fail "windows_user_invalid"
[[ "$WINDOWS_TAILSCALE_IP" =~ ^100\.([0-9]{1,3}\.){2}[0-9]{1,3}$ ]] || fail "windows_tailscale_ip_invalid"
[[ "$MAC_TAILSCALE_IP" =~ ^100\.([0-9]{1,3}\.){2}[0-9]{1,3}$ ]] || fail "mac_tailscale_ip_invalid"
NODE_BIN="$(command -v node || true)"
[ -n "$NODE_BIN" ] && [ -x "$NODE_BIN" ] || fail "node_not_available_in_current_mac_user_environment"

PUBLIC_KEY="$(tr -d '\r\n' < "$PUBLIC_KEY_FILE")"
[[ "$PUBLIC_KEY" =~ ^ssh-ed25519[[:space:]][A-Za-z0-9+/=]+[[:space:]]ai-brain-windows-to-mac-relay-20260712$ ]] || fail "public_key_format_invalid"

GATEWAY_SOURCE="${SCRIPT_DIR}/mac_relay_ssh_gateway.sh"
[ -f "$GATEWAY_SOURCE" ] || fail "gateway_source_missing"

CURRENT_USER="$(id -un)"
USER_HOME="$HOME"
GATEWAY_DIR="${USER_HOME}/.local/bin"
GATEWAY_PATH="${GATEWAY_DIR}/ai-brain-mac-relay-gateway.sh"
CONFIG_DIR="${USER_HOME}/.config/ai-brain"
CONFIG_PATH="${CONFIG_DIR}/mac-relay-ssh-gateway.conf"
SSH_DIR="${USER_HOME}/.ssh"
AUTHORIZED_KEYS="${SSH_DIR}/authorized_keys"

install -d -m 700 "$GATEWAY_DIR" "$CONFIG_DIR" "$SSH_DIR"
install -m 700 "$GATEWAY_SOURCE" "$GATEWAY_PATH"
printf 'WINDOWS_HOST=%s\nWINDOWS_USER=%s\nWINDOWS_KEY_PATH=%s\nNODE_BIN=%s\n' \
  "$WINDOWS_HOST" "$WINDOWS_USER" "$WINDOWS_KEY_PATH" "$NODE_BIN" > "$CONFIG_PATH"
chmod 600 "$CONFIG_PATH"
touch "$AUTHORIZED_KEYS"
chmod 600 "$AUTHORIZED_KEYS"

AUTHORIZATION_LINE="restrict,from=\"${WINDOWS_TAILSCALE_IP}\",command=\"${GATEWAY_PATH}\",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding ${PUBLIC_KEY}"
if ! grep -Fqx "$AUTHORIZATION_LINE" "$AUTHORIZED_KEYS"; then
  printf '%s\n' "$AUTHORIZATION_LINE" >> "$AUTHORIZED_KEYS"
fi

# Do not combine this limited policy with an unknown existing SSH access policy.
SSHD_CONFIG="/etc/ssh/sshd_config"
[ -f "$SSHD_CONFIG" ] || fail "sshd_config_missing"
if grep -Eq '^[[:space:]]*(ListenAddress|AllowUsers|DenyUsers)[[:space:]]+' "$SSHD_CONFIG"; then
  fail "existing_sshd_access_policy_requires_manual_review"
fi
if [ -d /etc/ssh/sshd_config.d ]; then
  while IFS= read -r -d '' included_config; do
    if grep -Eq '^[[:space:]]*(ListenAddress|AllowUsers|DenyUsers)[[:space:]]+' "$included_config"; then
      fail "included_sshd_access_policy_requires_manual_review"
    fi
  done < <(find /etc/ssh/sshd_config.d -type f -print0 2>/dev/null)
fi

echo 'mac_relay_ssh_gateway_ready_for_admin_confirmation'
echo 'A macOS administrator confirmation is now required to enable Remote Login bound only to the Mac Tailscale IP.'
sudo -v

BACKUP="${SSHD_CONFIG}.ai-brain-backup-$(date +%Y%m%d%H%M%S)"
CONFIG_APPLIED=false
INSTALL_SUCCEEDED=false
REMOTE_LOGIN_WAS_ON="$(sudo /usr/sbin/systemsetup -getremotelogin | grep -Eqi 'on|已开启|开启' && printf true || printf false)"

restore_on_failure() {
  local exit_code="$?"
  if [ "$INSTALL_SUCCEEDED" != true ] && [ "$CONFIG_APPLIED" = true ]; then
    sudo cp -p "$BACKUP" "$SSHD_CONFIG" 2>/dev/null || true
    if [ "$REMOTE_LOGIN_WAS_ON" = true ]; then
      sudo /bin/launchctl kickstart -k system/com.openssh.sshd 2>/dev/null || true
    else
      sudo /usr/sbin/systemsetup -setremotelogin off 2>/dev/null || true
    fi
  fi
  exit "$exit_code"
}
trap restore_on_failure EXIT HUP INT TERM

sudo cp -p "$SSHD_CONFIG" "$BACKUP"
sudo sh -c "cat >> '$SSHD_CONFIG'" <<EOF

# AI Brain restricted Windows-to-Mac relay: managed by install_mac_relay_ssh_gateway.sh
ListenAddress ${MAC_TAILSCALE_IP}
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
AllowUsers ${CURRENT_USER}@${WINDOWS_TAILSCALE_IP}
EOF
CONFIG_APPLIED=true

if ! sudo /usr/sbin/sshd -t -f "$SSHD_CONFIG"; then
  fail "sshd_config_validation_failed_restored_backup"
fi

sudo /usr/sbin/systemsetup -setremotelogin on
sudo /bin/launchctl kickstart -k system/com.openssh.sshd 2>/dev/null || true

LISTENERS="$(sudo /usr/sbin/lsof -nP -iTCP:22 -sTCP:LISTEN 2>/dev/null || true)"
printf '%s\n' "$LISTENERS" | grep -Fq "${MAC_TAILSCALE_IP}:22" || fail "sshd_tailscale_listener_not_verified"
printf '%s\n' "$LISTENERS" | grep -Eq '[*]:22|0\.0\.0\.0:22|\[::\]:22' && fail "sshd_non_tailscale_listener_detected"

printf '{"ok":true,"status":"mac_relay_ssh_gateway_installed","mac_user":"%s","source":"%s","listen_address":"%s","allowed_source":"%s","gateway":"%s"}\n' \
  "$CURRENT_USER" "$WINDOWS_TAILSCALE_IP" "$MAC_TAILSCALE_IP" "$WINDOWS_TAILSCALE_IP" "$GATEWAY_PATH"
INSTALL_SUCCEEDED=true
