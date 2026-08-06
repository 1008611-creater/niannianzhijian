#!/usr/bin/env bash
set -euo pipefail

stage_root="${1:?stage root is required}"
rollback_root="${2:?rollback root is required}"
runtime_verifier="${3:?runtime verifier is required}"
importer="${4:?importer is required}"
import_manifest="${5:?import manifest is required}"
staged_source="${6:?staged source is required}"
staged_evidence="${7:?staged evidence is required}"
origin_url="http://127.0.0.1:18082"
projects_path="/var/lib/niannian-ai/projects.json"
users_path="/var/lib/niannian-ai/users.json"

old_app="$(readlink -f /opt/niannian-ai)"
old_static="$(readlink -f /var/www/niannian-ai)"
source_destination="$(/opt/node24/bin/node -e "const m=require(process.argv[1]);process.stdout.write(m.source.destination)" "$import_manifest")"
evidence_destination="$(/opt/node24/bin/node -e "const m=require(process.argv[1]);process.stdout.write(m.evidence.destination)" "$import_manifest")"
project_backup="$rollback_root/projects.json.before"
projects_uid="$(stat -c %u "$projects_path")"
projects_gid="$(stat -c %g "$projects_path")"
projects_mode="$(stat -c %a "$projects_path")"
source_created=0
evidence_created=0

case "$source_destination" in /var/lib/niannian-ai/uploads/*) ;; *) echo 'step01_source_destination_invalid' >&2; exit 1 ;; esac
case "$evidence_destination" in /var/lib/niannian-ai/step01-evidence/*) ;; *) echo 'step01_evidence_destination_invalid' >&2; exit 1 ;; esac
test -d "$old_app"
test -d "$old_static"
test -d "$stage_root/package"
test -f "$staged_source"
test -d "$staged_evidence"
test -f "$importer"
test -f "$import_manifest"
test ! -e "$rollback_root"
test ! -e "$source_destination"
test ! -e "$evidence_destination"
systemctl is-active --quiet niannian-ai.service
curl --connect-timeout 3 --max-time 5 -fsS "$origin_url/api/health" >/dev/null
/opt/node24/bin/node "$importer" verify-assets --manifest "$import_manifest" --source "$staged_source" --evidenceRoot "$staged_evidence" >/dev/null

rollback() {
  if [[ -f "$project_backup" ]]; then
    cp "$project_backup" "$projects_path.rollback-tmp"
    chown "$projects_uid:$projects_gid" "$projects_path.rollback-tmp"
    chmod "$projects_mode" "$projects_path.rollback-tmp"
    mv -Tf "$projects_path.rollback-tmp" "$projects_path"
  fi
  if [[ "$source_created" = 1 ]]; then rm -f -- "$source_destination"; fi
  if [[ "$evidence_created" = 1 ]]; then rm -rf -- "$evidence_destination"; fi
  ln -s "$old_app" /opt/niannian-ai.next
  mv -Tf /opt/niannian-ai.next /opt/niannian-ai
  ln -s "$old_static" /var/www/niannian-ai.next
  mv -Tf /var/www/niannian-ai.next /var/www/niannian-ai
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

install -d -o www-data -g www-data -m 0750 "$(dirname "$source_destination")"
source_temporary="$source_destination.importing-$$"
cp --reflink=auto --sparse=always "$staged_source" "$source_temporary"
chown www-data:www-data "$source_temporary"
chmod 0640 "$source_temporary"
mv -T "$source_temporary" "$source_destination"
source_created=1

install -d -o www-data -g www-data -m 0750 "$(dirname "$evidence_destination")"
evidence_temporary="$evidence_destination.importing-$$"
cp -a "$staged_evidence" "$evidence_temporary"
chown -R www-data:www-data "$evidence_temporary"
find "$evidence_temporary" -type d -exec chmod 0750 {} +
find "$evidence_temporary" -type f -exec chmod 0640 {} +
mv -T "$evidence_temporary" "$evidence_destination"
evidence_created=1

/opt/node24/bin/node "$importer" apply --manifest "$import_manifest" --users "$users_path" --projects "$projects_path" --backup "$project_backup" >/dev/null
test "$(stat -c %u "$projects_path")" = "$projects_uid"
test "$(stat -c %g "$projects_path")" = "$projects_gid"
test "$(stat -c %a "$projects_path")" = "$projects_mode"

ln -s "$stage_root/package" /opt/niannian-ai.next
mv -Tf /opt/niannian-ai.next /opt/niannian-ai
ln -s "$stage_root/package" /var/www/niannian-ai.next
mv -Tf /var/www/niannian-ai.next /var/www/niannian-ai
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
/opt/node24/bin/node "$importer" verify-assets --manifest "$import_manifest" --source "$source_destination" --evidenceRoot "$evidence_destination" >/dev/null
trap - ERR
printf '{"ok":true,"active_app":"%s","active_static":"%s","rollback":"%s","project_imported":true,"source_verified":true,"evidence_verified":true}\n' "$(readlink -f /opt/niannian-ai)" "$(readlink -f /var/www/niannian-ai)" "$rollback_root"
