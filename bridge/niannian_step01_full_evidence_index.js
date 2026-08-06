'use strict';

// This index is analysis-only. It preserves native evidence frame identities and
// must never be used as a production image or a locally edited derivative.
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const SCHEMA = 'niannian.step01_full_evidence_index.v1';

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function canonical(value) { if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'; if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}'; return JSON.stringify(value); }
function fail(code, message) { const error = new Error(message || code); error.code = code; error.httpStatus = 409; return error; }
function safeRelative(value) {
  const relative = String(value || '').replace(/\\/g, '/');
  if (!relative || relative.startsWith('/') || relative.includes('\0') || path.posix.normalize(relative) !== relative || relative.startsWith('../')) throw fail('STEP01_FULL_EVIDENCE_PATH_INVALID', '完整原片证据路径无效');
  return relative;
}
function isInside(root, candidate) { const relative = path.relative(root, candidate); return Boolean(relative) && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative); }
async function readJson(filePath) { return JSON.parse(await fsp.readFile(filePath, 'utf8')); }
async function walk(root, output = []) {
  for (const entry of await fsp.readdir(root, {withFileTypes:true})) {
    const item = path.join(root, entry.name);
    if (entry.isDirectory()) await walk(item, output);
    else if (entry.isFile() && !entry.isSymbolicLink()) output.push(item);
  }
  return output;
}
function pngSize(bytes) {
  if (bytes.length < 24 || bytes.toString('hex', 0, 8) !== '89504e470d0a1a0a') return null;
  return {width:bytes.readUInt32BE(16), height:bytes.readUInt32BE(20), mime:'image/png'};
}
function timeFromName(name) {
  const match = name.match(/(\d\d)-(\d\d)-(\d\d)\.(\d{3})/);
  return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000 : null;
}
function reasonFromName(name) {
  const match = name.match(/\d{2}-\d{2}-\d{2}\.\d{3}_(.+)\.png$/i);
  return match ? match[1].replace(/[_-]+/g, '_') : 'native_evidence';
}
function shotForTime(shots, timeSec) {
  const match = shots.find(shot => Number(timeSec) >= Number(shot.start_sec) - 0.02 && Number(timeSec) <= Number(shot.end_sec) + 0.02);
  return match ? 'S' + String(match.shot_id).replace(/^S/i, '').padStart(3, '0') : null;
}

async function build({evidenceRoot, project, outputPath = null}) {
  const root = path.resolve(evidenceRoot);
  const artifactRoot = path.join(root, 'artifacts');
  const manifest = await readJson(path.join(artifactRoot, 'step01_evidence_manifest.json'));
  if (manifest.status !== 'verified' || manifest.downstream_consumable !== true || manifest.source?.sha256 !== project.source?.sha256 || Number(manifest.source?.bytes) !== Number(project.source?.bytes)) throw fail('STEP01_FULL_EVIDENCE_MANIFEST_INVALID', '完整原片证据清单未通过校验');
  const frameRoot = path.join(artifactRoot, 'reference_frames_original');
  const shotFile = path.join(artifactRoot, 'transnet_shots', 'EP001_transnet_shots.json');
  const frameManifestFile = path.join(artifactRoot, 'EP001_frame_manifest.json');
  const shots = await readJson(shotFile);
  if (!Array.isArray(shots) || !shots.length) throw fail('STEP01_FULL_EVIDENCE_SHOTS_MISSING', '镜头边界不可用');
  const files = (await walk(frameRoot)).filter(file => /\.png$/i.test(file)).sort();
  if (!files.length) throw fail('STEP01_FULL_EVIDENCE_FRAMES_MISSING', '完整原始证据帧不可用');
  const frameManifest = await readJson(frameManifestFile).catch(() => []);
  const manifestShotByFile = new Map((Array.isArray(frameManifest) ? frameManifest : []).map(row => [String(row?.file || ''), 'S' + String(row?.shot_id || '').replace(/^S/i, '').padStart(3, '0')]));
  const frames = [];
  for (const filePath of files) {
    const bytes = await fsp.readFile(filePath);
    const image = pngSize(bytes);
    if (!image || image.width !== Number(manifest.source.ffprobe?.width) || image.height !== Number(manifest.source.ffprobe?.height)) throw fail('STEP01_FULL_EVIDENCE_FRAME_INVALID', '原始证据帧尺寸或格式无效');
    const relative_path = safeRelative(path.relative(artifactRoot, filePath));
    const time_sec = timeFromName(path.basename(filePath));
    if (!Number.isFinite(time_sec)) throw fail('STEP01_FULL_EVIDENCE_TIMECODE_INVALID', '原始证据帧缺少时间码');
    const shot_id = manifestShotByFile.get(path.basename(filePath)) || shotForTime(shots, time_sec);
    if (!shot_id) throw fail('STEP01_FULL_EVIDENCE_SHOT_BINDING_INVALID', '原始证据帧无法绑定镜头');
    frames.push({frame_id:'F-' + sha256(relative_path + ':' + sha256(bytes)).slice(0, 20), shot_id, time_sec:Number(time_sec.toFixed(3)), timecode:new Date(time_sec * 1000).toISOString().slice(11, 23), extraction_reason:reasonFromName(path.basename(filePath)), storage_key:relative_path, sha256:sha256(bytes), bytes:bytes.length, mime:image.mime, width:image.width, height:image.height});
  }
  const core = {schema_version:SCHEMA, project_id:project.id, analysis_run_id:project.analysis?.runId || null, source_sha256:project.source.sha256, source_bytes:Number(project.source.bytes), evidence_manifest_sha256:sha256(canonical(manifest)), frame_root:'reference_frames_original', frames, created_at:new Date().toISOString()};
  const index = {...core, index_sha256:sha256(canonical(core))};
  if (outputPath) {
    const target = path.resolve(outputPath);
    if (!isInside(artifactRoot, target)) throw fail('STEP01_FULL_EVIDENCE_INDEX_PATH_INVALID', '完整证据索引输出路径无效');
    await fsp.mkdir(path.dirname(target), {recursive:true});
    await fsp.writeFile(target, JSON.stringify(index, null, 2) + '\n', 'utf8');
  }
  return index;
}

async function readVerified({evidenceRoot, project}) {
  const artifactRoot = path.resolve(evidenceRoot, 'artifacts');
  const index = await readJson(path.join(artifactRoot, 'full_evidence_index.json'));
  const core = {...index}; delete core.index_sha256;
  if (index.schema_version !== SCHEMA || index.project_id !== project.id || index.source_sha256 !== project.source?.sha256 || Number(index.source_bytes) !== Number(project.source?.bytes) || index.index_sha256 !== sha256(canonical(core)) || !Array.isArray(index.frames) || !index.frames.length) throw fail('STEP01_FULL_EVIDENCE_INDEX_INVALID', '完整证据索引未通过校验');
  const resolved = [];
  for (const frame of index.frames) {
    const relative = safeRelative(frame.storage_key);
    if (!relative.startsWith('reference_frames_original/')) throw fail('STEP01_FULL_EVIDENCE_FRAME_PATH_INVALID', '完整证据帧路径无效');
    const filePath = path.resolve(artifactRoot, ...relative.split('/'));
    if (!isInside(artifactRoot, filePath)) throw fail('STEP01_FULL_EVIDENCE_FRAME_PATH_INVALID', '完整证据帧路径越界');
    const bytes = await fsp.readFile(filePath).catch(() => null);
    const image = bytes && pngSize(bytes);
    if (!image || bytes.length !== Number(frame.bytes) || sha256(bytes) !== frame.sha256 || image.mime !== frame.mime || image.width !== Number(frame.width) || image.height !== Number(frame.height)) throw fail('STEP01_FULL_EVIDENCE_INTEGRITY_FAILED', '完整证据帧完整性校验失败');
    resolved.push({...frame, absolute_path:filePath});
  }
  return {...index, frames:resolved};
}

function batches(index, maxFrames = 12) {
  const grouped = new Map();
  for (const frame of index.frames) { const list = grouped.get(frame.shot_id) || []; list.push(frame); grouped.set(frame.shot_id, list); }
  const output = [];
  for (const [shot_id, frames] of grouped) for (let start = 0; start < frames.length; start += maxFrames) output.push({shot_id, frames:frames.slice(start, start + maxFrames), previous_anchor:start ? frames[start - 1] : null, next_anchor:start + maxFrames < frames.length ? frames[start + maxFrames] : null});
  return output;
}

module.exports = {SCHEMA, build, readVerified, batches, sha256, canonical};
