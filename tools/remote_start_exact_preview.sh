#!/usr/bin/env bash
set -euo pipefail

archive_path="${1:?archive path is required}"
pull_request="${2:?pull request is required}"
git_sha="${3:?git SHA is required}"
port="${4:?port is required}"

[[ "$archive_path" =~ ^/tmp/niannian-preview-pr-[0-9]+-[a-f0-9]{12}\.tar\.gz$ ]] || { echo preview_archive_path_invalid >&2; exit 1; }
[[ "$pull_request" =~ ^[0-9]+$ ]] || { echo preview_pr_invalid >&2; exit 1; }
[[ "$git_sha" =~ ^[a-f0-9]{40}$ ]] || { echo preview_git_sha_invalid >&2; exit 1; }
[[ "$port" =~ ^[0-9]+$ ]] && (( port >= 19000 && port <= 19999 )) || { echo preview_port_invalid >&2; exit 1; }

short_sha="${git_sha:0:12}"
release_id="pr-${pull_request}-${short_sha}"
preview_root="/opt/niannian-ai-previews"
release_root="${preview_root}/${release_id}"
data_root="/var/lib/niannian-ai-previews/${release_id}"
incoming_root="${preview_root}/.incoming-${release_id}-$$"
app_unit="niannian-preview-pr-${pull_request}.service"
tunnel_unit="niannian-preview-pr-${pull_request}-tunnel.service"

cleanup() {
  rm -rf -- "$incoming_root"
  rm -f -- "$archive_path"
}
trap cleanup EXIT

install -d -m 0755 "$preview_root"
[[ ! -e "$release_root" ]] || { echo preview_release_already_exists >&2; exit 1; }
install -d -m 0755 "$incoming_root"
tar -xzf "$archive_path" -C "$incoming_root"

/opt/node24/bin/node - "$incoming_root/release-package-manifest.json" "$git_sha" <<'NODE'
const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (manifest?.release?.source_git_revision !== process.argv[3]) {
  throw new Error('preview_manifest_git_sha_mismatch');
}
NODE

cd "$incoming_root/package"
/opt/node24/bin/npm ci --omit=dev --ignore-scripts=false
mv "$incoming_root" "$release_root"
trap 'rm -f -- "$archive_path"' EXIT

install -d -o www-data -g www-data -m 0750 "$data_root"

systemctl disable --now "$tunnel_unit" >/dev/null 2>&1 || true
systemctl disable --now "$app_unit" >/dev/null 2>&1 || true

cat >"/etc/systemd/system/${app_unit}" <<UNIT
[Unit]
Description=NianNian exact-commit preview PR ${pull_request}
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=${release_root}/package
Environment=NODE_ENV=production
Environment=PORT=${port}
Environment=DATA_DIR=${data_root}
Environment=NIANNIAN_PREVIEW=1
Environment=NIANNIAN_RELEASE_SHA=${git_sha}
Environment=NIANNIAN_RELEASE_ID=${release_id}
Environment=NIANNIAN_STEP01_AUTO_EXECUTE=off
ExecStart=/opt/node24/bin/node ${release_root}/package/server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=full
ReadWritePaths=${data_root}

[Install]
WantedBy=multi-user.target
UNIT

cat >"/etc/systemd/system/${tunnel_unit}" <<UNIT
[Unit]
Description=NianNian HTTPS tunnel for exact-commit preview PR ${pull_request}
After=network-online.target ${app_unit}
Requires=${app_unit}

[Service]
Type=simple
ExecStart=/usr/local/bin/cloudflared tunnel --no-autoupdate --url http://127.0.0.1:${port}
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now "$app_unit"

for _ in $(seq 1 30); do
  if curl -fsS --connect-timeout 2 --max-time 5 "http://127.0.0.1:${port}/api/health" \
    | /opt/node24/bin/node -e "let value='';process.stdin.on('data',c=>value+=c).on('end',()=>{const body=JSON.parse(value);if(body?.release?.gitSha!==process.argv[1]||body?.release?.preview!==true)process.exit(1)})" "$git_sha"; then
    break
  fi
  sleep 1
done

systemctl enable --now "$tunnel_unit"
preview_url=""
for _ in $(seq 1 45); do
  preview_url="$(journalctl -u "$tunnel_unit" --since '-2 minutes' --no-pager 2>/dev/null | grep -Eo 'https://[-a-z0-9]+\.trycloudflare\.com' | tail -1 || true)"
  [[ -z "$preview_url" ]] || break
  sleep 1
done
[[ -n "$preview_url" ]] || { journalctl -u "$tunnel_unit" --since '-2 minutes' --no-pager >&2; exit 1; }

printf '{"ok":true,"previewUrl":"%s","gitSha":"%s","releaseId":"%s","port":%s}\n' "$preview_url" "$git_sha" "$release_id" "$port"
