#!/bin/bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

VERSION="7.1.1"
ARCHIVE_SHA256="733984395e0dbbe5c046abda2dc49a5544e7e0e1e2366bba849222ae9e3a03b1"
ARCHIVE_URL="https://ffmpeg.org/releases/ffmpeg-${VERSION}.tar.xz"
PREFIX="${HOME}/AI-Brain/tools/ffmpeg-${VERSION}"
LINK_ROOT="${HOME}/AI-Brain/tools/ffmpeg-runtime"
CACHE_ROOT="${HOME}/Library/Caches/niannian-ai/sources"
ARCHIVE_PATH="${CACHE_ROOT}/ffmpeg-${VERSION}.tar.xz"
RECEIPT_PATH="${HOME}/.config/ai-brain/mac-ffmpeg-runtime-receipt.json"
NODE_BIN="${HOME}/.local/bin/node"
MODE="self-test"
[[ "${1:-}" == "--install" ]] && MODE="install"
dependency_network_used=false

sha256_file() { /usr/bin/shasum -a 256 "$1" | /usr/bin/awk '{print $1}'; }

if [[ "$MODE" == "install" && ! -x "$PREFIX/bin/ffmpeg" ]]; then
  mkdir -p "$CACHE_ROOT" "$(dirname "$PREFIX")"
  if [[ ! -f "$ARCHIVE_PATH" ]] || [[ "$(sha256_file "$ARCHIVE_PATH")" != "$ARCHIVE_SHA256" ]]; then
    temporary_archive="${ARCHIVE_PATH}.tmp-$$"
    /usr/bin/curl -fsSL --retry 3 --connect-timeout 20 -o "$temporary_archive" "$ARCHIVE_URL"
    [[ "$(sha256_file "$temporary_archive")" == "$ARCHIVE_SHA256" ]] || { rm -f "$temporary_archive"; printf 'mac_ffmpeg_runtime_install_failed:archive_sha256_mismatch\n' >&2; exit 2; }
    /bin/mv -f "$temporary_archive" "$ARCHIVE_PATH"
    dependency_network_used=true
  fi
  build_root="$(/usr/bin/mktemp -d)"
  trap '[[ -n "${build_root:-}" && "$build_root" == /var/folders/* ]] && /bin/rm -rf "$build_root"' EXIT
  /usr/bin/tar -xJf "$ARCHIVE_PATH" -C "$build_root"
  cd "$build_root/ffmpeg-${VERSION}"
  ./configure \
    --prefix="$PREFIX" \
    --disable-debug \
    --disable-doc \
    --disable-ffplay \
    --disable-network \
    --disable-autodetect \
    --enable-pic
  /usr/bin/make -j"$(/usr/sbin/sysctl -n hw.ncpu)"
  /usr/bin/make install
fi

[[ -x "$PREFIX/bin/ffmpeg" && -x "$PREFIX/bin/ffprobe" ]] || { printf 'mac_ffmpeg_runtime_self_test_failed:binaries_missing\n' >&2; exit 2; }
mkdir -p "$LINK_ROOT" "$(dirname "$RECEIPT_PATH")"
for binary in ffmpeg ffprobe; do
  target="$PREFIX/bin/$binary"
  link="$LINK_ROOT/$binary"
  if [[ -e "$link" && ! -L "$link" ]]; then
    [[ "$MODE" == "install" ]] || { printf 'mac_ffmpeg_runtime_self_test_failed:legacy_binary_requires_install_migration:%s\n' "$binary" >&2; exit 2; }
    existing_sha="$(sha256_file "$link")"
    backup="$LINK_ROOT/${binary}.backup-${existing_sha:0:12}"
    if [[ -e "$backup" ]]; then
      [[ -f "$backup" && "$(sha256_file "$backup")" == "$existing_sha" ]] || { printf 'mac_ffmpeg_runtime_install_failed:legacy_backup_conflict:%s\n' "$binary" >&2; exit 2; }
      /bin/rm -f "$link"
    else
      /bin/mv "$link" "$backup"
    fi
  fi
  temporary_link="${link}.tmp-$$"
  /bin/ln -s "$target" "$temporary_link"
  /bin/mv -f "$temporary_link" "$link"
done

self_test_root="$(/usr/bin/mktemp -d)"
trap '[[ -n "${build_root:-}" && "$build_root" == /var/folders/* ]] && /bin/rm -rf "$build_root"; [[ -n "${self_test_root:-}" && "$self_test_root" == /var/folders/* ]] && /bin/rm -rf "$self_test_root"' EXIT
self_test_video="$self_test_root/runtime-self-test.mp4"
"$LINK_ROOT/ffmpeg" -nostdin -hide_banner -loglevel error -f lavfi -i 'color=c=black:s=720x1280:d=1:r=10' -c:v mpeg4 -pix_fmt yuv420p -y "$self_test_video"
probe_json="$("$LINK_ROOT/ffprobe" -v error -select_streams v:0 -show_entries stream=width,height -show_entries format=duration -of json "$self_test_video")"
width="$(printf '%s' "$probe_json" | /usr/bin/jq -r '.streams[0].width')"
height="$(printf '%s' "$probe_json" | /usr/bin/jq -r '.streams[0].height')"
duration="$(printf '%s' "$probe_json" | /usr/bin/jq -r '.format.duration')"
[[ "$width" == "720" && "$height" == "1280" ]] || { printf 'mac_ffmpeg_runtime_self_test_failed:probe_dimensions_invalid\n' >&2; exit 2; }

ffmpeg_sha="$(sha256_file "$PREFIX/bin/ffmpeg")"
ffprobe_sha="$(sha256_file "$PREFIX/bin/ffprobe")"
checked_at="$(/bin/date -u +'%Y-%m-%dT%H:%M:%SZ')"
temporary_receipt="${RECEIPT_PATH}.tmp-$$"
"$NODE_BIN" - "$temporary_receipt" "$checked_at" "$PREFIX" "$ARCHIVE_SHA256" "$ffmpeg_sha" "$ffprobe_sha" "$width" "$height" "$duration" "$dependency_network_used" <<'NODE'
'use strict';
const fs = require('fs');
const path = require('path');
const [out, checkedAt, prefix, sourceSha, ffmpegSha, ffprobeSha, width, height, duration, dependencyNetworkUsed] = process.argv.slice(2);
const linkRoot = path.join(path.dirname(prefix), 'ffmpeg-runtime');
const legacyBackups = fs.readdirSync(linkRoot).filter(name => /^ff(?:mpeg|probe)\.backup-[a-f0-9]{12}$/.test(name)).sort().map(name => path.join(linkRoot, name));
const receipt = {
  schema_version:'niannian_mac_ffmpeg_runtime_receipt_v1',
  status:'ready_local_media_probe_self_test_passed',
  version:'7.1.1',
  prefix,
  source_archive_sha256:sourceSha,
  binaries:{
    ffmpeg:{exact_path:prefix + '/bin/ffmpeg',sha256:ffmpegSha},
    ffprobe:{exact_path:prefix + '/bin/ffprobe',sha256:ffprobeSha}
  },
  managed_link_root:linkRoot,
  legacy_backups:legacyBackups,
  self_test:{synthetic_evidence_only:true,width:Number(width),height:Number(height),duration_sec:Number(duration),real_user_media_processed:false},
  build_contract:{network_protocols_disabled:true,autodetect_disabled:true,ffplay_disabled:true},
  dependency_network_used:dependencyNetworkUsed === 'true',
  provider_network_requested:false,
  provider_submit_requested:false,
  credentials_read:false,
  checked_at:checkedAt
};
fs.writeFileSync(out, JSON.stringify(receipt, null, 2) + '\n', {encoding:'utf8',mode:0o600});
process.stdout.write(JSON.stringify(receipt) + '\n');
NODE
/bin/mv -f "$temporary_receipt" "$RECEIPT_PATH"
