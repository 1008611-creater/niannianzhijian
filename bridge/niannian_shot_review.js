'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const CONTRACT_SHA256 = '9887052943ef52a0721fb93ccc08acfcad8792de2f1e734bea7dc12387398a25';
const SCHEMA_VERSION = 'niannian.shot_review_model.v1';
const REVISION_SCHEMA_VERSION = 'niannian.shot_revision_overlay.v1';
const MAPPING_POLICY = 'niannian.shot_text_overlap.v1';
const ALLOWED_PATCH_FIELDS = Object.freeze(['dialogue', 'ocr', 'speaker', 'scene', 'action', 'camera', 'review_status']);
const EVIDENCE_FILE_SHA256 = Object.freeze({
  'step01-evidence-manifest.json':'c8dbbe6f8e73297147e033464d2af0a4626b7a977e02770ad27f3d876a2b947d',
  'artifacts/step01_evidence_manifest.json':'2c5c2618ea4b675562935bce5774b0085c72aae9198de3a813dfba6b32ff72b2',
  'artifacts/transnet_shots/EP001_transnet_shots.json':'ddb5c7073bc0508824d7f9052ad400a5758c0dcf261acd13e8caecda6dce31bc',
  'artifacts/shotlevel_start_mid_end_manifest.json':'ccacead3a112c015328cc353fa864010dac51dc41f562ccba917de37a48dd395',
  'artifacts/EP001_dialogue_ledger.json':'0b973b96c2f2faf58112592a5437f6c9e5bce55d2de2337cb6ba11606b3ad471',
  'artifacts/smart_ocr/EP001_smart_ocr_ledger.json':'c69f9c6a49d779f6c4998dc1ba41d55424ed30109422b29ce7db5a72918754c9',
  'artifacts/EP001_qwen3_forced_aligner_receipt.json':'314c5e3ad2094aede83676e59575dcae72060ecae55a5f3cdebe1591a581f94c'
});
const EVIDENCE_FRAME_LEDGER_SHA256 = '8c2b182bad577df4901183330ed1e677f699ccdd8c0611b3d0be0ec194f752d5';

function codedError(code, status, message) {
  const error = new Error(message || code);
  error.code = code;
  error.status = status;
  return error;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function round(value) { return Number(Number(value).toFixed(3)); }
function safeSegment(value, pattern, code) {
  const text = String(value || '');
  if (!pattern.test(text)) throw codedError(code || 'SHOT_REVIEW_IDENTIFIER_INVALID', 400, '镜头核对标识无效');
  return text;
}
function exactKeys(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.keys(value).every(key => allowed.includes(key));
}
async function readJson(file) { return JSON.parse(await fsp.readFile(file, 'utf8')); }
async function fileHash(file) { return sha256(await fsp.readFile(file)); }

function framePngInfo(buffer, file) {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || buffer.toString('ascii', 12, 16) !== 'IHDR') {
    throw codedError('SHOT_REVIEW_EVIDENCE_TAMPERED', 409, 'Step01 镜头证据未通过完整性校验');
  }
  return {bytes:buffer.length, sha256:sha256(buffer), readable:true, width:buffer.readUInt32BE(16), height:buffer.readUInt32BE(20), file};
}

function dialogueMappings(row, shots) {
  if (row.start_sec === null || row.start_sec === undefined || row.end_sec === null || row.end_sec === undefined) return [];
  const start = Number(row.start_sec), end = Number(row.end_sec);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
  const positive = shots.map(shot => ({shot, overlap:round(Math.max(0, Math.min(end, shot.end_sec) - Math.max(start, shot.start_sec)))})).filter(item => item.overlap > 0);
  if (positive.length) return positive;
  const starting = shots.find(shot => shot.start_sec === start);
  if (starting) return [{shot:starting, overlap:0, boundary_rule:'starts_at_shot_start'}];
  const ending = [...shots].reverse().find(shot => shot.end_sec === start);
  return ending ? [{shot:ending, overlap:0, boundary_rule:'starts_at_shot_end'}] : [];
}

function ocrMapping(row, shots) {
  if (row.time_sec === null || row.time_sec === undefined || !Number.isFinite(Number(row.time_sec))) return null;
  const point = Number(row.time_sec);
  return shots.filter(shot => point >= shot.start_sec && point <= shot.end_sec).sort((a,b) => b.start_sec - a.start_sec || a.sequence - b.sequence)[0] || null;
}

function validateProjectBinding(project, analysisRunId, expected) {
  if (!project) throw codedError('PROJECT_NOT_FOUND', 404, '项目不存在');
  if (project.id !== expected.projectId || analysisRunId !== expected.analysisRunId || project.analysis?.runId !== expected.analysisRunId || project.analysis?.sourceSha256 !== expected.sourceSha256 || project.source?.sha256 !== expected.sourceSha256 || Number(project.source?.bytes) !== expected.sourceBytes) {
    throw codedError('EVIDENCE_BINDING_MISMATCH', 409, '项目、分析 run 或原始证据绑定不一致');
  }
}

function validatePatchValue(field, value) {
  if (field === 'dialogue' || field === 'ocr') {
    if (!Array.isArray(value) || value.some(item => !item || typeof item !== 'object' || Array.isArray(item))) throw codedError('REVISION_PATCH_INVALID', 422, '修订字段格式无效');
  } else if (field === 'speaker') {
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string') || new Set(value).size !== value.length) throw codedError('REVISION_PATCH_INVALID', 422, 'speaker 必须是唯一字符串数组');
  } else if (field === 'scene' || field === 'action' || field === 'camera') {
    if (value !== null && (!value || typeof value !== 'object' || Array.isArray(value))) throw codedError('REVISION_PATCH_INVALID', 422, '结构化镜头字段必须是对象或 null');
  } else if (field === 'review_status') {
    if (!['unreviewed','in_review','accepted','needs_revision'].includes(value)) throw codedError('REVISION_PATCH_INVALID', 422, 'review_status 无效');
  }
}

function createShotReviewService(options) {
  const contractRoot = path.resolve(options.contractRoot);
  const evidenceRoot = path.resolve(options.evidenceRoot);
  const overlayRoot = path.resolve(options.overlayRoot);
  const expected = Object.freeze({...options.expected});
  const lockTimeoutMs = Number(options.lockTimeoutMs || 8000);
  const staleLockMs = Number(options.staleLockMs || 30000);
  let contractSignature = null;
  let evidenceCache = null;

  async function verifyContract() {
    const manifestFile = path.join(contractRoot, 'contract-manifest.json');
    const manifest = await readJson(manifestFile).catch(() => { throw codedError('SHOT_REVIEW_CONTRACT_INVALID', 503, '镜头核对合同不可用'); });
    const files = Array.isArray(manifest.files) ? [...manifest.files].sort((a,b) => a.path.localeCompare(b.path)) : [];
    if (manifest.aggregate_sha256 !== CONTRACT_SHA256 || !files.length) throw codedError('SHOT_REVIEW_CONTRACT_INVALID', 503, '镜头核对合同版本不匹配');
    const signatures = [];
    for (const entry of files) {
      if (!entry || typeof entry.path !== 'string' || entry.path.includes('..') || path.isAbsolute(entry.path)) throw codedError('SHOT_REVIEW_CONTRACT_INVALID', 503, '镜头核对合同路径无效');
      const file = path.resolve(contractRoot, entry.path);
      if (!file.startsWith(contractRoot + path.sep)) throw codedError('SHOT_REVIEW_CONTRACT_INVALID', 503, '镜头核对合同路径无效');
      const stats = await fsp.stat(file).catch(() => null);
      if (!stats || !stats.isFile() || stats.size !== Number(entry.bytes)) throw codedError('SHOT_REVIEW_CONTRACT_INVALID', 503, '镜头核对合同文件不完整');
      const actual = await fileHash(file);
      if (actual !== entry.sha256) throw codedError('SHOT_REVIEW_CONTRACT_INVALID', 503, '镜头核对合同哈希不匹配');
      signatures.push(entry.path + ':' + actual);
    }
    if (sha256(Buffer.from(signatures.join('\n'))) !== CONTRACT_SHA256) throw codedError('SHOT_REVIEW_CONTRACT_INVALID', 503, '镜头核对合同聚合哈希不匹配');
    contractSignature = CONTRACT_SHA256;
    return contractSignature;
  }

  async function evidenceStatSignature() {
    const artifactRoot = path.join(evidenceRoot, 'artifacts');
    const files = [
      path.join(evidenceRoot, 'step01-evidence-manifest.json'),
      path.join(artifactRoot, 'step01_evidence_manifest.json'),
      path.join(artifactRoot, 'transnet_shots', 'EP001_transnet_shots.json'),
      path.join(artifactRoot, 'shotlevel_start_mid_end_manifest.json'),
      path.join(artifactRoot, 'EP001_dialogue_ledger.json'),
      path.join(artifactRoot, 'smart_ocr', 'EP001_smart_ocr_ledger.json'),
      path.join(artifactRoot, 'EP001_qwen3_forced_aligner_receipt.json')
    ];
    const frameDir = path.join(artifactRoot, 'shotlevel_start_mid_end_frames');
    const frameNames = (await fsp.readdir(frameDir)).filter(name => name.toLowerCase().endsWith('.png')).sort();
    for (const name of frameNames) files.push(path.join(frameDir, name));
    const signatures = [];
    for (const file of files) {
      const stats = await fsp.stat(file).catch(() => null);
      if (!stats || !stats.isFile()) throw codedError('SHOT_REVIEW_EVIDENCE_TAMPERED', 409, 'Step01 镜头证据不完整');
      signatures.push(file + ':' + stats.size + ':' + stats.mtimeMs);
    }
    return sha256(Buffer.from(signatures.join('\n')));
  }

  async function buildBaseModel() {
    await verifyContract();
    const statSignature = await evidenceStatSignature();
    if (evidenceCache?.statSignature === statSignature && evidenceCache?.contractSignature === contractSignature) return clone(evidenceCache.model);
    const artifactRoot = path.join(evidenceRoot, 'artifacts');
    for (const [relative,expectedSha] of Object.entries(EVIDENCE_FILE_SHA256)) {
      if (await fileHash(path.join(evidenceRoot,...relative.split('/'))).catch(() => null) !== expectedSha) throw codedError('SHOT_REVIEW_EVIDENCE_TAMPERED',409,'Step01 evidence 文件哈希不匹配');
    }
    const wrapper = await readJson(path.join(evidenceRoot, 'step01-evidence-manifest.json'));
    const strict = await readJson(path.join(artifactRoot, 'step01_evidence_manifest.json'));
    const rawShots = await readJson(path.join(artifactRoot, 'transnet_shots', 'EP001_transnet_shots.json'));
    const frameRows = await readJson(path.join(artifactRoot, 'shotlevel_start_mid_end_manifest.json'));
    const dialogueLedger = await readJson(path.join(artifactRoot, 'EP001_dialogue_ledger.json'));
    const ocrRows = await readJson(path.join(artifactRoot, 'smart_ocr', 'EP001_smart_ocr_ledger.json'));
    const aligner = await readJson(path.join(artifactRoot, 'EP001_qwen3_forced_aligner_receipt.json'));
    if (wrapper.projectId !== expected.projectId || wrapper.analysisRunId !== expected.analysisRunId || wrapper.source?.sha256 !== expected.sourceSha256 || Number(wrapper.source?.bytes) !== expected.sourceBytes || wrapper.status !== 'completed') throw codedError('SHOT_REVIEW_EVIDENCE_TAMPERED', 409, 'Step01 wrapper binding 无效');
    if (strict.schema !== 'niannian.step01_evidence_manifest.v1' || strict.status !== 'verified' || strict.downstream_consumable !== true || strict.source?.sha256 !== expected.sourceSha256 || Number(strict.source?.bytes) !== expected.sourceBytes) throw codedError('SHOT_REVIEW_EVIDENCE_TAMPERED', 409, 'Step01 strict manifest 无效');
    const dialogueRows = Array.isArray(dialogueLedger.rows) ? dialogueLedger.rows : [];
    if (!Array.isArray(rawShots) || rawShots.length !== 37 || !Array.isArray(frameRows) || frameRows.length !== 111 || dialogueRows.length !== 13 || !Array.isArray(ocrRows) || ocrRows.length !== 34 || aligner.ok !== true || aligner.timestamps_are_forced_alignment !== true || Number(aligner.segments) !== 13) throw codedError('SHOT_REVIEW_EVIDENCE_TAMPERED', 409, 'Step01 evidence 计数或 forced alignment 无效');
    const shots = rawShots.map((row,index) => {
      const sequence = Number(row.shot_id), start = Number(row.start_sec), end = Number(row.end_sec), mid = Number(row.mid_sec);
      if (sequence !== index + 1 || !Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(mid) || start > mid || mid > end || (index && start <= Number(rawShots[index - 1].end_sec))) throw codedError('SHOT_REVIEW_EVIDENCE_TAMPERED', 409, '镜头时间线无效');
      return {shot_id:'S' + String(sequence).padStart(3,'0'),sequence,start_sec:start,end_sec:end,duration_sec:round(end-start),start_timecode:String(row.start_timecode),end_timecode:String(row.end_timecode),frames:{},dialogue:[],forced_alignment:[],ocr:[],speaker:[],review_status:'unreviewed',active_revision:null};
    });
    const frameDir = path.join(artifactRoot, 'shotlevel_start_mid_end_frames');
    const frameLedger = [];
    for (const row of frameRows) {
      const shot = shots[Number(row.shot_id) - 1];
      if (!shot || !['start','mid','end'].includes(row.point) || shot.frames[row.point] || Number(row.source_start) !== shot.start_sec || Number(row.source_end) !== shot.end_sec || Number(row.time_sec) < shot.start_sec || Number(row.time_sec) > shot.end_sec || path.basename(String(row.file)) !== String(row.file)) throw codedError('SHOT_REVIEW_EVIDENCE_TAMPERED', 409, '关键帧归属无效');
      const buffer = await fsp.readFile(path.join(frameDir, row.file)).catch(() => { throw codedError('SHOT_REVIEW_EVIDENCE_TAMPERED', 409, '关键帧文件不可读'); });
      const info = framePngInfo(buffer, row.file);
      frameLedger.push([row.shot_id,row.point,info.sha256,info.bytes].join(':'));
      shot.frames[row.point] = {point:row.point,time_sec:Number(row.time_sec),timecode:String(row.timecode),frame_index:Number(row.frame_index),path:'/api/reference-evidence/' + encodeURIComponent(expected.evidenceId) + '/shots/' + shot.sequence + '/' + row.point,bytes:info.bytes,sha256:info.sha256,readable:true,width:info.width,height:info.height};
    }
    if (sha256(Buffer.from(frameLedger.join('\n'))) !== EVIDENCE_FRAME_LEDGER_SHA256) throw codedError('SHOT_REVIEW_EVIDENCE_TAMPERED',409,'Step01 关键帧账本哈希不匹配');
    if (shots.some(shot => Object.keys(shot.frames).sort().join(',') !== 'end,mid,start')) throw codedError('SHOT_REVIEW_EVIDENCE_TAMPERED', 409, '镜头三帧不完整');
    const unassignedDialogue = [];
    for (const row of dialogueRows) {
      const mappings = dialogueMappings(row, shots);
      if (!mappings.length) { unassignedDialogue.push({...row,reason:'missing_or_invalid_time'}); continue; }
      for (const mapping of mappings) {
        const item = {event_id:String(row.event_id),start_sec:Number(row.start_sec),end_sec:Number(row.end_sec),text:String(row.text),speaker:String(row.speaker || 'speaker_unknown'),overlap_sec:mapping.overlap,source_tool:String(row.source_tool || ''),...(mapping.boundary_rule ? {boundary_rule:mapping.boundary_rule} : {})};
        mapping.shot.dialogue.push(item);
        mapping.shot.forced_alignment.push({event_id:item.event_id,start_sec:item.start_sec,end_sec:item.end_sec,overlap_sec:item.overlap,timing_basis:String(aligner.timing_basis),receipt_path:'artifacts/EP001_qwen3_forced_aligner_receipt.json'});
        if (!mapping.shot.speaker.includes(item.speaker)) mapping.shot.speaker.push(item.speaker);
      }
    }
    const unassignedOcr = [];
    for (const row of ocrRows) {
      const shot = ocrMapping(row, shots);
      if (!shot) { unassignedOcr.push({...row,reason:'missing_or_invalid_time'}); continue; }
      shot.ocr.push({row_id:'ocr-' + String(row.order).padStart(4,'0'),time_sec:Number(row.time_sec),timecode:String(row.timecode),text:String(row.ocr_text),region:String(row.region),model:String(row.paddle_model),source_frame_file:String(row.frame_file)});
    }
    if (unassignedDialogue.length || unassignedOcr.length) throw codedError('SHOT_REVIEW_EVIDENCE_TAMPERED', 409, '权威文本 evidence 出现未归属项');
    const binding = sha256(Buffer.from([expected.projectId,expected.analysisRunId,expected.sourceSha256].join(':')));
    const model = {schema_version:SCHEMA_VERSION,project_id:expected.projectId,episode_id:'EP001',analysis_run_id:expected.analysisRunId,source_evidence:{source_sha256:expected.sourceSha256,source_bytes:expected.sourceBytes,immutable:true,wrapper_manifest_path:'step01-evidence-manifest.json',strict_manifest_path:'artifacts/step01_evidence_manifest.json',forced_alignment_receipt_path:'artifacts/EP001_qwen3_forced_aligner_receipt.json',evidence_binding_sha256:binding},mapping_policy:MAPPING_POLICY,shots,unassigned_dialogue:[],unassigned_ocr:[]};
    evidenceCache = {statSignature, contractSignature, model:clone(model)};
    return model;
  }

  function namespace(ownerId, shot) {
    const ownerHash = sha256(Buffer.from(String(ownerId)));
    const project = safeSegment(expected.projectId, /^[A-Za-z0-9-]{8,80}$/);
    const runHash = sha256(Buffer.from(expected.analysisRunId));
    const shotId = safeSegment(shot.shot_id, /^S\d{3,}$/);
    return path.join(overlayRoot, 'v1', 'owners', ownerHash, 'projects', project, 'runs', runHash, 'shots', shotId);
  }

  async function loadCommits(ownerId, shot) {
    const directory = namespace(ownerId, shot);
    const names = await fsp.readdir(directory).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error));
    const commitNames = names.filter(name => /^\d{8}-[a-f0-9]{64}\.json$/.test(name)).sort();
    const commits = [];
    let active = null;
    const revisionIds = new Set();
    for (const [index,name] of commitNames.entries()) {
      const envelope = await readJson(path.join(directory,name)).catch(() => { throw codedError('SHOT_REVIEW_STORE_CORRUPT', 503, '镜头修订存储损坏'); });
      try { validateRevision(envelope.revision,shot); }
      catch { throw codedError('SHOT_REVIEW_STORE_CORRUPT',503,'镜头修订内容校验失败'); }
      const expectedName = String(index + 1).padStart(8,'0') + '-' + sha256(Buffer.from(envelope.revision.revision_id)) + '.json';
      if (envelope.schema_version !== 'niannian.shot_revision_commit.v1' || envelope.sequence !== index + 1 || name !== expectedName || revisionIds.has(envelope.revision.revision_id) || envelope.payload_sha256 !== sha256(Buffer.from(canonical(envelope.revision))) || envelope.revision?.base_revision !== active || envelope.revision?.shot_id !== shot.shot_id) throw codedError('SHOT_REVIEW_STORE_CORRUPT', 503, '镜头修订链校验失败');
      revisionIds.add(envelope.revision.revision_id);
      active = envelope.revision.revision_id;
      commits.push(envelope);
    }
    return {directory, commits, active};
  }

  async function acquireLock(directory) {
    await fsp.mkdir(directory, {recursive:true});
    const lockFile = path.join(directory, '.write.lock');
    const deadline = Date.now() + lockTimeoutMs;
    while (true) {
      try {
        const handle = await fsp.open(lockFile, 'wx');
        await handle.writeFile(JSON.stringify({pid:process.pid,created_at:new Date().toISOString()}));
        return async () => { await handle.close().catch(() => {}); await fsp.rm(lockFile,{force:true}).catch(() => {}); };
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const stats = await fsp.stat(lockFile).catch(() => null);
        if (stats && Date.now() - stats.mtimeMs > staleLockMs) { await fsp.rm(lockFile,{force:true}).catch(() => {}); continue; }
        if (Date.now() >= deadline) throw codedError('REVISION_STORE_BUSY', 503, '镜头修订正在写入，请稍后重试');
        await new Promise(resolve => setTimeout(resolve, 15));
      }
    }
  }

  function validateRevision(revision, shot) {
    const allowedKeys = ['schema_version','project_id','analysis_run_id','shot_id','base_revision','revision_id','actor_type','actor_id','changed_fields','patch','source_evidence_binding','candidate_request_id','created_at'];
    if (!exactKeys(revision, allowedKeys)) throw codedError('REVISION_SCHEMA_INVALID', 422, '修订包含未授权字段');
    const required = ['schema_version','project_id','analysis_run_id','shot_id','base_revision','revision_id','actor_type','changed_fields','patch','source_evidence_binding','created_at'];
    if (required.some(key => !Object.prototype.hasOwnProperty.call(revision,key)) || revision.schema_version !== REVISION_SCHEMA_VERSION || revision.project_id !== expected.projectId || revision.analysis_run_id !== expected.analysisRunId || revision.shot_id !== shot.shot_id || revision.actor_type !== 'human') throw codedError('REVISION_SCHEMA_INVALID', 422, '修订 schema 或证据身份无效');
    safeSegment(revision.revision_id, /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/, 'REVISION_ID_INVALID');
    if (revision.base_revision !== null && typeof revision.base_revision !== 'string') throw codedError('REVISION_SCHEMA_INVALID', 422, 'base_revision 无效');
    if (!Array.isArray(revision.changed_fields) || !revision.changed_fields.length || new Set(revision.changed_fields).size !== revision.changed_fields.length || revision.changed_fields.some(field => !ALLOWED_PATCH_FIELDS.includes(field)) || !revision.patch || typeof revision.patch !== 'object' || Array.isArray(revision.patch) || Object.keys(revision.patch).sort().join(',') !== [...revision.changed_fields].sort().join(',')) throw codedError('REVISION_CHANGED_FIELDS_MISMATCH', 422, 'changed_fields 必须与 patch 顶层字段完全一致');
    for (const field of revision.changed_fields) validatePatchValue(field, revision.patch[field]);
    if (!Number.isFinite(Date.parse(revision.created_at))) throw codedError('REVISION_SCHEMA_INVALID', 422, 'created_at 必须是 ISO 时间');
    const binding = revision.source_evidence_binding;
    const bindingKeys = ['source_sha256','analysis_run_id','shot_id','start_sec','end_sec','frame_sha256'];
    const expectedFrames = ['start','mid','end'].map(point => shot.frames[point].sha256);
    if (!exactKeys(binding,bindingKeys) || bindingKeys.some(key => !Object.prototype.hasOwnProperty.call(binding,key)) || binding.source_sha256 !== expected.sourceSha256 || binding.analysis_run_id !== expected.analysisRunId || binding.shot_id !== shot.shot_id || Number(binding.start_sec) !== shot.start_sec || Number(binding.end_sec) !== shot.end_sec || !Array.isArray(binding.frame_sha256) || canonical(binding.frame_sha256) !== canonical(expectedFrames)) throw codedError('REVISION_EVIDENCE_BINDING_MISMATCH', 409, '修订与当前镜头 evidence 不一致');
  }

  function etagFor(active, model) { return '"' + (active || ('evidence-' + model.source_evidence.evidence_binding_sha256)) + '"'; }

  async function getReview({ownerId,project,analysisRunId}) {
    validateProjectBinding(project,analysisRunId,expected);
    const model = await buildBaseModel();
    const vector = [];
    for (const shot of model.shots) {
      const chain = await loadCommits(ownerId,shot);
      for (const commit of chain.commits) Object.assign(shot,clone(commit.revision.patch));
      shot.active_revision = chain.active;
      vector.push(shot.shot_id + ':' + (chain.active || 'evidence'));
    }
    return {model,etag:'"model-' + sha256(Buffer.from(vector.join('|'))) + '"'};
  }

  async function getShot({ownerId,project,analysisRunId,shotId}) {
    validateProjectBinding(project,analysisRunId,expected);
    const model = await buildBaseModel();
    const shot = model.shots.find(item => item.shot_id === String(shotId).toUpperCase());
    if (!shot) throw codedError('SHOT_NOT_FOUND',404,'镜头不存在');
    const chain = await loadCommits(ownerId,shot);
    for (const commit of chain.commits) Object.assign(shot,clone(commit.revision.patch));
    shot.active_revision = chain.active;
    return {shot,revision_history:chain.commits.map(commit => clone(commit.revision)),etag:etagFor(chain.active,model)};
  }

  async function createRevision({ownerId,project,analysisRunId,shotId,ifMatch,revision}) {
    validateProjectBinding(project,analysisRunId,expected);
    const model = await buildBaseModel();
    const shot = model.shots.find(item => item.shot_id === String(shotId).toUpperCase());
    if (!shot) throw codedError('SHOT_NOT_FOUND',404,'镜头不存在');
    validateRevision(revision,shot);
    if (!ifMatch) throw codedError('PRECONDITION_REQUIRED',428,'必须提供 If-Match');
    const directory = namespace(ownerId,shot);
    const release = await acquireLock(directory);
    try {
      const chain = await loadCommits(ownerId,shot);
      const payloadSha = sha256(Buffer.from(canonical(revision)));
      const existing = chain.commits.find(commit => commit.revision.revision_id === revision.revision_id);
      if (existing) {
        if (existing.payload_sha256 !== payloadSha) throw codedError('IDEMPOTENCY_PAYLOAD_MISMATCH',409,'相同 revision_id 对应不同 payload');
        return {revision:clone(existing.revision),idempotent:true,etag:etagFor(chain.active,model)};
      }
      const expectedEtag = etagFor(chain.active,model);
      if (String(ifMatch) !== expectedEtag || revision.base_revision !== chain.active) throw codedError('REVISION_CONFLICT',409,'基础 revision 已变化');
      const sequence = chain.commits.length + 1;
      const envelope = {schema_version:'niannian.shot_revision_commit.v1',sequence,payload_sha256:payloadSha,committed_at:new Date().toISOString(),revision:clone(revision)};
      const fileName = String(sequence).padStart(8,'0') + '-' + sha256(Buffer.from(revision.revision_id)) + '.json';
      const finalFile = path.join(directory,fileName);
      const tempFile = path.join(directory,'.tmp-' + process.pid + '-' + crypto.randomBytes(8).toString('hex'));
      await fsp.writeFile(tempFile,JSON.stringify(envelope,null,2) + '\n',{flag:'wx'});
      try { await fsp.rename(tempFile,finalFile); }
      catch (error) { await fsp.rm(tempFile,{force:true}).catch(() => {}); throw error; }
      return {revision:clone(revision),idempotent:false,etag:etagFor(revision.revision_id,model)};
    } finally { await release(); }
  }

  async function unavailableReanalysis({ownerId,project,analysisRunId,shotId}) {
    const result = await getShot({ownerId,project,analysisRunId,shotId});
    return {code:'SHOT_REANALYSIS_EXECUTOR_UNAVAILABLE',capability:'single_shot_evidence_only',available:false,shot_id:result.shot.shot_id,model_requested:false,provider_requested:false,candidate_created:false,step02_started:false};
  }

  return {getReview,getShot,createRevision,unavailableReanalysis,contractSha256:CONTRACT_SHA256,overlayRoot};
}

module.exports = {createShotReviewService,CONTRACT_SHA256};
