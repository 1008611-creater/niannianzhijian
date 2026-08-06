'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const JSZip = require('jszip');

const INDEX_SCHEMA = 'niannian_step01_customer_evidence_index_v1';
const DELIVERY_SCHEMA = 'niannian_step01_customer_delivery_manifest_v1';
const RECEIPT_SCHEMA = 'niannian_step01_customer_delivery_receipt_v1';

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function isInside(parent, candidate, allowRoot = false) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  if (!relative) return allowRoot;
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}
function safeRelative(value, code = 'step01_evidence_relative_path_invalid') {
  const normalized = String(value || '').replace(/\\/g, '/');
  const parts = normalized.split('/');
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized) || normalized.includes('\0') || parts.some(part => !part || part === '.' || part === '..')) throw new Error(code);
  return parts.join('/');
}
async function readJson(filePath) { return JSON.parse(await fsp.readFile(filePath, 'utf8')); }
async function atomicFile(filePath, bytes) {
  await fsp.mkdir(path.dirname(filePath), {recursive:true});
  const temporary = filePath + '.tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
  await fsp.writeFile(temporary, bytes, {flag:'wx'});
  await fsp.rename(temporary, filePath);
}
async function atomicJson(filePath, value) { await atomicFile(filePath, Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8')); }
async function fileEvidence(filePath) {
  const stats = await fsp.lstat(filePath);
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error('step01_evidence_file_invalid');
  const bytes = await fsp.readFile(filePath);
  return {exact_path:filePath, sha256:sha256(bytes), bytes:bytes.length};
}
async function resolvePointer(sourceRoot, pointer, role) {
  const relativePath = safeRelative(pointer && pointer.relative_path, 'step01_evidence_pointer_invalid:' + role);
  const exactPath = path.resolve(sourceRoot, relativePath);
  if (!isInside(sourceRoot, exactPath)) throw new Error('step01_evidence_pointer_escape:' + role);
  const evidence = await fileEvidence(exactPath);
  if (evidence.sha256 !== String(pointer.sha256 || '').toLowerCase() || evidence.bytes !== Number(pointer.bytes)) throw new Error('step01_evidence_pointer_mismatch:' + role);
  return {role, relative_path:relativePath, ...evidence};
}
function csvCount(text) { return String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean).slice(1).length; }

async function buildStep01EvidencePackage(options = {}) {
  const sourceRoot = path.resolve(String(options.sourceRoot || ''));
  const outputRoot = path.resolve(String(options.outputRoot || ''));
  const project = options.project || {};
  const analysisRun = options.analysisRun || {};
  if (!project.id || !project.source?.sha256 || !Number.isInteger(Number(project.sourceRevision)) || !analysisRun.id) throw new Error('step01_evidence_build_input_invalid');
  const manifestPath = path.join(sourceRoot, 'step01_evidence_manifest.json');
  const manifest = await readJson(manifestPath);
  if (manifest.schema_version !== 'step01_evidence_manifest_v1' || manifest.status !== 'verified' || !['hq_full','haika-step01-direct-v1'].includes(manifest.profile) || manifest.downstream_consumable !== true || manifest.test_only === true || manifest.source_sha256 !== project.source.sha256 || Number(manifest.source_bytes) !== Number(project.source.bytes)) throw new Error('step01_evidence_manifest_invalid');

  const declared = [];
  const add = async (pointer, role) => { const row = await resolvePointer(sourceRoot, pointer, role); declared.push(row); return row; };
  const probe = await add(manifest.source?.ffprobe, 'source_ffprobe');
  const minuteIndex = await add(manifest.minute_chunks?.index, 'minute_chunks_index');
  const nativeManifest = await add(manifest.native_frames?.manifest, 'native_frame_manifest');
  const acceptedShots = await add(manifest.transnet?.accepted_shots, 'accepted_transnet_shots');
  const shotSupplement = await add(manifest.transnet?.shot_supplement, 'transnet_start_mid_end');
  const audioWav = await add(manifest.audio?.wav, 'source_audio_16k_mono');
  const audioLedger = await add(manifest.audio?.event_ledger, 'audio_event_ledger');
  const mimoReceipt = await add(manifest.audio?.mimo_transcript_receipt, 'mimo_asr_receipt');
  const alignerReceipt = await add(manifest.audio?.forced_aligner_receipt, 'qwen3_forced_aligner_receipt');
  const ocrLedger = await add(manifest.ocr?.ledger, 'paddle_ocr_ledger');
  const ocrReceipt = await add(manifest.ocr?.receipt, 'paddle_ocr_receipt');
  const validationReceipt = await add(manifest.validation?.receipt, 'step01_validation_receipt');
  const frameRows = [];
  for (let index = 0; index < (manifest.native_frames?.frames || []).length; index += 1) frameRows.push(await add(manifest.native_frames.frames[index], 'native_frame_' + String(index + 1).padStart(5, '0')));
  if (!frameRows.length) throw new Error('step01_evidence_native_frames_missing');

  const [probeValue, shotsValue, supplementValue, audioText, ocrText, validationValue] = await Promise.all([
    readJson(probe.exact_path), readJson(acceptedShots.exact_path), readJson(shotSupplement.exact_path),
    fsp.readFile(audioLedger.exact_path, 'utf8'), fsp.readFile(ocrLedger.exact_path, 'utf8'), readJson(validationReceipt.exact_path)
  ]);
  if (!Array.isArray(shotsValue.shots) || !shotsValue.shots.length || !Array.isArray(supplementValue.rows) || validationValue.status !== 'passed') throw new Error('step01_evidence_content_invalid');
  const framesByShot = new Map();
  for (const frame of supplementValue.rows) {
    const point = String(frame.point || '');
    const shotId = String(frame.shot_id || '');
    if (!['start','mid','end'].includes(point) || !shotId) throw new Error('step01_evidence_shot_frame_invalid');
    const row = await resolvePointer(sourceRoot, frame, 'shot_' + shotId + '_' + point);
    const current = framesByShot.get(shotId) || [];
    current.push({point, relative_path:row.relative_path, sha256:row.sha256, bytes:row.bytes});
    framesByShot.set(shotId, current);
    if (!declared.some(item => item.relative_path === row.relative_path)) declared.push(row);
  }
  const acceptedShotIds = shotsValue.shots.map((shot,index) => String(shot.shot_id ?? index + 1));
  if(new Set(acceptedShotIds).size!==acceptedShotIds.length)throw new Error('step01_evidence_shot_id_duplicate');
  if(supplementValue.rows.length!==acceptedShotIds.length*3)throw new Error('step01_evidence_shot_supplement_count_invalid');
  if(framesByShot.size!==acceptedShotIds.length||[...framesByShot.keys()].some(shotId=>!acceptedShotIds.includes(shotId)))throw new Error('step01_evidence_shot_id_set_mismatch');
  let priorEndMs=-1;
  const timeline = shotsValue.shots.map((shot, index) => {
    const sourceShotId = String(shot.shot_id ?? index + 1);
    const frames = (framesByShot.get(sourceShotId) || []).sort((left, right) => ['start','mid','end'].indexOf(left.point) - ['start','mid','end'].indexOf(right.point));
    if (frames.length!==3||new Set(frames.map(frame => frame.point)).size !== 3) throw new Error('step01_evidence_shot_coverage_invalid:' + sourceShotId);
    const startMs=Math.round(Number(shot.start_sec)*1000),endMs=Math.round(Number(shot.end_sec)*1000);
    if(!Number.isFinite(startMs)||!Number.isFinite(endMs)||startMs<0||endMs<=startMs||startMs<priorEndMs)throw new Error('step01_evidence_timeline_order_invalid:' + sourceShotId);
    priorEndMs=endMs;
    return {shot_id:'S' + sourceShotId.padStart(4, '0'), source_shot_id:sourceShotId, start_ms:startMs, end_ms:endMs, evidence:{keyframes:frames}};
  });
  const durationMs = Math.round(Number(probeValue.duration_seconds) * 1000);
  if (!Number.isFinite(durationMs) || durationMs <= 0 || timeline[0].start_ms > 250 || Math.abs(timeline[timeline.length - 1].end_ms - durationMs) > 1000) throw new Error('step01_evidence_time_coverage_invalid');

  await fsp.mkdir(outputRoot, {recursive:true});
  const manifestEvidence = await fileEvidence(manifestPath);
  const index = {
    schema_version:INDEX_SCHEMA, node_id:'step01_evidence', project_id:project.id, analysis_run_id:analysisRun.id,
    source_revision:Number(project.sourceRevision), source_sha256:project.source.sha256, source_bytes:Number(project.source.bytes),
    status:'evidence_ready', quality_profile:manifest.profile, evidence_manifest:{sha256:manifestEvidence.sha256,bytes:manifestEvidence.bytes},
    source_media:{duration_ms:durationMs,width:Number(probeValue.width),height:Number(probeValue.height),fps:probeValue.fps},
    counts:{shots:timeline.length,native_frames:frameRows.length,audio_events:csvCount(audioText),ocr_rows:csvCount(ocrText)},
    timeline, validation:{status:'passed',receipt_sha256:validationReceipt.sha256}, test_only:false,
    full_video_delivered:false, media_provider_submit_requested:false, local_image_editing_requested:false
  };
  const indexPath = path.join(outputRoot, 'step01_customer_evidence_index.json');
  await atomicJson(indexPath, index);
  const indexEvidence = await fileEvidence(indexPath);
  const uniqueFiles = [...new Map(declared.map(item => [item.relative_path, item])).values()].sort((a,b) => a.relative_path.localeCompare(b.relative_path));
  const delivery = {
    schema_version:DELIVERY_SCHEMA, node_id:'step01_evidence', project_id:project.id, analysis_run_id:analysisRun.id,
    source_revision:Number(project.sourceRevision), source_sha256:project.source.sha256, status:'verified',
    evidence_manifest:{relative_path:'step01_evidence_manifest.json',sha256:manifestEvidence.sha256,bytes:manifestEvidence.bytes},
    customer_index:{relative_path:'step01_customer_evidence_index.json',sha256:indexEvidence.sha256,bytes:indexEvidence.bytes},
    included_files:uniqueFiles.map(item => ({role:item.role,relative_path:'evidence/' + item.relative_path,source_relative_path:item.relative_path,sha256:item.sha256,bytes:item.bytes})),
    exclusions:['source_video','internal_logs','credentials','provider_secrets','creative_settings','step02_source_truth','step04_prompts','provider_media'],
    step01_evidence_delivered:false, final_video_delivered:false, test_only:false
  };
  const deliveryPath = path.join(outputRoot, 'step01_customer_delivery_manifest.json');
  await atomicJson(deliveryPath, delivery);
  const deliveryEvidence = await fileEvidence(deliveryPath);
  const zip = new JSZip();
  zip.file('step01_evidence_manifest.json', await fsp.readFile(manifestPath));
  zip.file('step01_customer_evidence_index.json', await fsp.readFile(indexPath));
  zip.file('step01_customer_delivery_manifest.json', await fsp.readFile(deliveryPath));
  for (const item of uniqueFiles) zip.file('evidence/' + item.relative_path, await fsp.readFile(item.exact_path));
  const zipBytes = await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:6}});
  const zipName = 'step01-evidence-' + project.id + '-' + analysisRun.id + '.zip';
  const zipPath = path.join(outputRoot, zipName);
  await atomicFile(zipPath, zipBytes);
  const zipEvidence = await fileEvidence(zipPath);
  const receipt = {
    schema_version:RECEIPT_SCHEMA, project_id:project.id, analysis_run_id:analysisRun.id, source_revision:Number(project.sourceRevision),
    source_sha256:project.source.sha256, status:'verified', bundle:{file_name:zipName,sha256:zipEvidence.sha256,bytes:zipEvidence.bytes},
    evidence_manifest_sha256:manifestEvidence.sha256, customer_index_sha256:indexEvidence.sha256, delivery_manifest_sha256:deliveryEvidence.sha256,
    step01_evidence_delivered:false, final_video_delivered:false, test_only:false
  };
  const receiptPath = path.join(outputRoot, 'step01_customer_delivery_receipt.json');
  await atomicJson(receiptPath, receipt);
  return {index:{...index,...indexEvidence,exact_path:indexPath},delivery:{...delivery,...deliveryEvidence,exact_path:deliveryPath},receipt:{...receipt,...await fileEvidence(receiptPath),exact_path:receiptPath},bundle:{...zipEvidence,exact_path:zipPath,file_name:zipName}};
}

async function validateStep01EvidencePackage(options = {}) {
  const outputRoot = path.resolve(String(options.outputRoot || ''));
  const expected = options.expected || {};
  const [index, delivery, receipt] = await Promise.all([
    readJson(path.join(outputRoot, 'step01_customer_evidence_index.json')),
    readJson(path.join(outputRoot, 'step01_customer_delivery_manifest.json')),
    readJson(path.join(outputRoot, 'step01_customer_delivery_receipt.json'))
  ]);
  if (index.schema_version !== INDEX_SCHEMA || index.status !== 'evidence_ready' || index.test_only === true || index.project_id !== expected.projectId || index.analysis_run_id !== expected.analysisRunId || index.source_sha256 !== expected.sourceSha256 || Number(index.source_revision) !== Number(expected.sourceRevision) || !Array.isArray(index.timeline) || !index.timeline.length) throw new Error('step01_evidence_index_contract_invalid');
  if (delivery.schema_version !== DELIVERY_SCHEMA || delivery.status !== 'verified' || delivery.test_only === true || delivery.project_id !== expected.projectId || delivery.analysis_run_id !== expected.analysisRunId || !Array.isArray(delivery.included_files) || !delivery.included_files.length) throw new Error('step01_evidence_delivery_contract_invalid');
  if (receipt.schema_version !== RECEIPT_SCHEMA || receipt.status !== 'verified' || receipt.test_only === true || receipt.project_id !== expected.projectId || receipt.analysis_run_id !== expected.analysisRunId) throw new Error('step01_evidence_receipt_contract_invalid');
  const indexEvidence = await fileEvidence(path.join(outputRoot, 'step01_customer_evidence_index.json'));
  const deliveryEvidence = await fileEvidence(path.join(outputRoot, 'step01_customer_delivery_manifest.json'));
  const bundlePath = path.join(outputRoot, safeRelative(receipt.bundle?.file_name, 'step01_evidence_bundle_name_invalid'));
  const bundleEvidence = await fileEvidence(bundlePath);
  if (indexEvidence.sha256 !== receipt.customer_index_sha256 || deliveryEvidence.sha256 !== receipt.delivery_manifest_sha256 || bundleEvidence.sha256 !== receipt.bundle?.sha256 || bundleEvidence.bytes !== Number(receipt.bundle?.bytes)) throw new Error('step01_evidence_delivery_hash_mismatch');
  return {index,delivery,receipt,indexEvidence,deliveryEvidence,bundle:{...bundleEvidence,exact_path:bundlePath,file_name:receipt.bundle.file_name}};
}

module.exports = {DELIVERY_SCHEMA,INDEX_SCHEMA,RECEIPT_SCHEMA,buildStep01EvidencePackage,fileEvidence,safeRelative,validateStep01EvidencePackage};
