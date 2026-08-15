#!/usr/bin/env bash
set -euo pipefail

stage_root="${1:?stage root is required}"
rollback_root="${2:?rollback root is required}"
runtime_verifier="${3:?runtime verifier is required}"
origin_url="http://127.0.0.1:18083"

old_app="$(readlink -f /opt/niannian-ai)"
old_static="$(readlink -f /var/www/niannian-ai)"
old_current="$(readlink -f /opt/niannian-ai-current)"
test -d "$old_app"
test -d "$old_static"
test -d "$old_current"
test -d "$stage_root/package"
test ! -e "$rollback_root"
systemctl is-active --quiet niannian-ai.service
curl --connect-timeout 3 --max-time 5 -fsS "$origin_url/api/health" >/dev/null

rollback() {
  ln -s "$old_app" /opt/niannian-ai.next
  mv -Tf /opt/niannian-ai.next /opt/niannian-ai
  ln -s "$old_static" /var/www/niannian-ai.next
  mv -Tf /var/www/niannian-ai.next /var/www/niannian-ai
  ln -s "$old_current" /opt/niannian-ai-current.next
  mv -Tf /opt/niannian-ai-current.next /opt/niannian-ai-current
  systemctl restart niannian-ai.service
  for attempt in 1 2 3 4 5 6 7 8; do
    if curl --connect-timeout 3 --max-time 5 -fsS "$origin_url/api/health" >/dev/null; then return 0; fi
    sleep 1
  done
  return 1
}

on_error() {
  status=$?
  rollback || true
  exit "$status"
}
trap on_error ERR

install -d -m 0755 "$rollback_root"
cp -aL /opt/niannian-ai "$rollback_root/app"
cp -aL /var/www/niannian-ai "$rollback_root/static"
cp -a /etc/systemd/system/niannian-ai.service "$rollback_root/niannian-ai.service"
printf '%s\n' "$old_app" >"$rollback_root/old-app-target.txt"
printf '%s\n' "$old_static" >"$rollback_root/old-static-target.txt"
printf '%s\n' "$old_current" >"$rollback_root/old-current-target.txt"

ln -s "$stage_root/package" /opt/niannian-ai.next
mv -Tf /opt/niannian-ai.next /opt/niannian-ai
ln -s "$stage_root/package" /var/www/niannian-ai.next
mv -Tf /var/www/niannian-ai.next /var/www/niannian-ai
ln -s "$stage_root/package" /opt/niannian-ai-current.next
mv -Tf /opt/niannian-ai-current.next /opt/niannian-ai-current
systemctl restart niannian-ai.service

ready=0
for attempt in $(seq 1 45); do
  if curl --connect-timeout 3 --max-time 5 -fsS "$origin_url/api/health" | /opt/node24/bin/node -e "let body='';process.stdin.on('data',chunk=>body+=chunk).on('end',()=>{try{process.exit(JSON.parse(body).ok===true?0:1)}catch{process.exit(1)}})"; then
    ready=1
    break
  fi
  sleep 1
done
test "$ready" = 1

/opt/node24/bin/node "$runtime_verifier" "$stage_root" "$origin_url"
systemctl is-active --quiet niannian-ai.service
trap - ERR
printf '{"ok":true,"active_app":"%s","active_static":"%s","rollback":"%s"}\n' "$(readlink -f /opt/niannian-ai)" "$(readlink -f /var/www/niannian-ai)" "$rollback_root"
