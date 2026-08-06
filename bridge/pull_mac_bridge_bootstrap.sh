#!/bin/bash
set -Eeuo pipefail
IFS=$'\n\t'
[ "$#" -eq 0 ] || exit 64
: "${NIANNIAN_EXPECTED_RELEASE_VERSION:?}"
: "${NIANNIAN_EXPECTED_MANIFEST_SHA256:?}"
: "${NIANNIAN_EXPECTED_ARCHIVE_SHA256:?}"
[[ "$NIANNIAN_EXPECTED_RELEASE_VERSION" =~ ^20[0-9]{2}\.[0-9]{2}\.[0-9]{2}\.[0-9]+$ ]] || exit 64
[[ "$NIANNIAN_EXPECTED_MANIFEST_SHA256" =~ ^[a-f0-9]{64}$ ]] || exit 64
[[ "$NIANNIAN_EXPECTED_ARCHIVE_SHA256" =~ ^[a-f0-9]{64}$ ]] || exit 64
root="$HOME/AI-Brain/niannian-ai-canonical-local"
cfg="$HOME/.config/ai-brain/mac-relay-ssh-gateway.conf"
bundle="$root/output/mac-employee-training/mac-bridge-release"
tmp="$bundle.incoming-$$"
parent="$(dirname "$bundle")"
val(){ awk -F= -v k="$1" '$1==k{print substr($0,length(k)+2);exit}' "$cfg"; }
[ -f "$cfg" ] && [ ! -L "$cfg" ] || exit 65
host="$(val WINDOWS_HOST)"; user="$(val WINDOWS_USER)"; key="$(val WINDOWS_KEY_PATH)"
[[ "$host" =~ ^[A-Za-z0-9._-]+$ && "$user" =~ ^[A-Za-z0-9._-]+$ ]] && [ -f "$key" ] && [ ! -L "$key" ] || exit 66
mkdir -p "$tmp"
[ -d "$parent" ] && [ ! -L "$parent" ] || exit 67
[ ! -e "$bundle" ] || { [ -d "$bundle" ] && [ ! -L "$bundle" ]; } || exit 68
trap 'rm -rf "$tmp"' EXIT
scp -i "$key" -o BatchMode=yes -o PasswordAuthentication=no "$user@$host:C:/Users/$user/ai-brain-relay/releases/mac-bridge-release/release.zip" "$user@$host:C:/Users/$user/ai-brain-relay/releases/mac-bridge-release/release.json" "$tmp/"
"/Users/lsb/.local/bin/node" "$root/bridge/verify_mac_bridge_release_pull.js" "$tmp/release.zip" "$tmp/release.json" "$tmp"
backup="$bundle.backup-$$"
if [ -e "$bundle" ]; then mv "$bundle" "$backup"; fi
if ! mv "$tmp/release" "$bundle"; then [ ! -e "$backup" ] || mv "$backup" "$bundle"; exit 69; fi
rm -rf "$backup"; trap - EXIT
"/Users/lsb/.local/bin/node" "$bundle/bridge/bootstrap_mac_bridge_release.js"
