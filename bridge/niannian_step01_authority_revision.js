const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const SCHEMA = 'niannian.step01_authority_revision.v1';
const POINTER_SCHEMA = 'niannian.step01_current_authority.v1';

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(Buffer.isBuffer(value) ? value : String(value)).digest('hex');
}

function error(code, message, httpStatus = 409) {
  const result = new Error(message || code);
  result.code = code;
  result.httpStatus = httpStatus;
  return result;
}

function safeProjectId(value) {
  const output = String(value || '');
  if (!/^[A-Za-z0-9-]{8,80}$/.test(output)) throw error('STEP01_AUTHORITY_PROJECT_INVALID', '项目标识无效', 422);
  return output;
}

function safeRevisionId(value) {
  const output = String(value || '');
  if (!/^analysis-[A-Za-z0-9-]{8,120}$/.test(output)) throw error('STEP01_AUTHORITY_REVISION_INVALID', '证据 revision 标识无效', 422);
  return output;
}

function projectRoot(root, projectId) {
  return path.join(path.resolve(root), safeProjectId(projectId));
}

function revisionRoot(root, projectId, revisionId) {
  return path.join(projectRoot(root, projectId), 'revisions', safeRevisionId(revisionId));
}

function pointerPath(root, projectId) {
  return path.join(projectRoot(root, projectId), 'current.json');
}

async function readJson(filePath, fallback) {
  try { return JSON.parse(await fsp.readFile(filePath, 'utf8')); }
  catch (caught) { if (caught.code === 'ENOENT' && arguments.length > 1) return fallback; throw caught; }
}

async function atomicWrite(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), {recursive:true});
  const temporary = filePath + '.tmp-' + process.pid + '-' + crypto.randomBytes(6).toString('hex');
  await fsp.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', {flag:'wx'});
  try { await fsp.rename(temporary, filePath); }
  catch (caught) { await fsp.rm(temporary, {force:true}).catch(() => {}); throw caught; }
}

function etag(value) {
  if (!value) return '"step01-authority-none"';
  return '"step01-authority-' + String(value?.pointer_sha256 || '') + '"';
}

function exactSha(value) { return /^[a-f0-9]{64}$/.test(String(value || '')); }
function promotionGateError(revision) {
  const bindingMatches = gate => gate && gate.revision_id === revision.revision_id && gate.source_sha256 === revision.source_sha256 && gate.full_evidence_index_sha256 === revision.full_evidence_index_sha256;
  const visual = revision.gemini_review;
  if (!bindingMatches(visual) || visual.status !== 'completed' || visual.model !== 'gemini-3.1-pro-preview' || Number(visual.reviewed_frames) !== Number(revision.counts.frames) || Number(visual.unique_frame_ids) !== Number(revision.counts.frames) || !exactSha(visual.receipt_set_sha256) || !exactSha(visual.observations_sha256)) return 'gemini_review_incomplete';
  const ocr = revision.ocr_review;
  if (!bindingMatches(ocr) || ocr.status !== 'completed' || Number(ocr.frames_considered) !== Number(revision.counts.frames) || !exactSha(ocr.receipt_set_sha256) || !exactSha(ocr.output_index_sha256) || ocr.visual_fact_override === true) return 'ocr_review_incomplete';
  const source = revision.source_authority;
  if (!bindingMatches(source) || source.status !== 'completed' || Number(source.shots) !== Number(revision.counts.shots) || Number(source.observed_frames) !== Number(revision.counts.frames) || !exactSha(source.ledger_snapshot_sha256) || !exactSha(source.role_card_snapshot_sha256) || !exactSha(source.story_snapshot_sha256)) return 'source_authority_incomplete';
  const stale = revision.downstream_stale;
  if (!bindingMatches(stale) || stale.status !== 'committed' || stale.step01_snapshot !== 'superseded' || stale.role_cards !== 'superseded' || stale.story_authority !== 'superseded' || stale.step02 !== 'stale' || stale.step03 !== 'stale' || stale.step04_created !== false || stale.provider_submitted !== false || !exactSha(stale.event_sha256)) return 'downstream_stale_incomplete';
  const acceptance = revision.candidate_acceptance;
  const viewports = new Set(Array.isArray(acceptance?.viewports) ? acceptance.viewports : []);
  if (!bindingMatches(acceptance) || acceptance.status !== 'accepted' || acceptance.api !== 'passed' || acceptance.cos !== 'passed' || acceptance.pwa !== 'passed' || acceptance.security !== 'passed' || acceptance.post_coding_review !== 'passed' || acceptance.video_range_206 !== true || acceptance.unauthorized_rejected !== true || acceptance.cross_user_rejected !== true || acceptance.expired_rejected !== true || acceptance.secret_scan_passed !== true || !viewports.has('1440x900') || !viewports.has('1366x768') || !viewports.has('390x844') || !exactSha(acceptance.receipt_sha256)) return 'candidate_acceptance_incomplete';
  return null;
}

async function markReadyForPromotion({root, project, revisionId, gates}) {
  const currentRevision = await readRevision({root, project, revisionId});
  if (currentRevision.status === 'accepted') throw error('STEP01_AUTHORITY_REVISION_IMMUTABLE', '已接受 revision 不可修改');
  const next = {...currentRevision,gemini_review:gates?.gemini_review,ocr_review:gates?.ocr_review,source_authority:gates?.source_authority,downstream_stale:gates?.downstream_stale,candidate_acceptance:gates?.candidate_acceptance,status:'promotion_gates_pending',updated_at:new Date().toISOString()};
  const blocked = promotionGateError(next);
  if (blocked) throw error('STEP01_AUTHORITY_PROMOTION_GATES_INCOMPLETE', 'Step01 晋级门不完整: ' + blocked);
  next.status = 'ready_for_promotion';
  await atomicWrite(path.join(revisionRoot(root, project.id, revisionId), 'revision.json'), next);
  return next;
}

async function readRevision({root, project, revisionId}) {
  const filePath = path.join(revisionRoot(root, project.id, revisionId), 'revision.json');
  const revision = await readJson(filePath, null);
  if (!revision || revision.schema_version !== SCHEMA || revision.project_id !== project.id || revision.revision_id !== revisionId) {
    throw error('STEP01_AUTHORITY_REVISION_NOT_FOUND', 'Step01 证据 revision 不存在', 404);
  }
  if (revision.source_sha256 !== project.source?.sha256 || Number(revision.source_bytes) !== Number(project.source?.bytes)) {
    throw error('STEP01_AUTHORITY_SOURCE_MISMATCH', 'Step01 证据 revision 与原片不一致');
  }
  return revision;
}

async function createRevision({root, project, revisionId, sourceRevision, manifestSha256, fullEvidenceIndexSha256, evidenceRootRelative, counts, parentRevisionId = null}) {
  safeRevisionId(revisionId);
  const normalized = {
    schema_version:SCHEMA,
    project_id:project.id,
    revision_id:revisionId,
    source_sha256:project.source?.sha256,
    source_bytes:Number(project.source?.bytes),
    source_revision:Number(sourceRevision),
    strict_manifest_sha256:String(manifestSha256 || ''),
    full_evidence_index_sha256:String(fullEvidenceIndexSha256 || ''),
    evidence_root_relative:String(evidenceRootRelative || 'evidence'),
    counts:{frames:Number(counts?.frames || 0), shots:Number(counts?.shots || 0), triad_frames:Number(counts?.triad_frames || 0)},
    parent_revision_id:parentRevisionId || null,
    status:'verified_evidence_pending_visual_review',
    visual_review:{status:'pending', reviewed_frames:0, expected_frames:Number(counts?.frames || 0)},
    created_at:new Date().toISOString()
  };
  if (!/^[a-f0-9]{64}$/.test(normalized.strict_manifest_sha256) || !/^[a-f0-9]{64}$/.test(normalized.full_evidence_index_sha256) || !Number.isInteger(normalized.source_revision) || normalized.source_revision < 1 || normalized.counts.frames < 1) {
    throw error('STEP01_AUTHORITY_REVISION_INVALID', 'Step01 证据 revision 元数据无效', 422);
  }
  const directory = revisionRoot(root, project.id, revisionId);
  const filePath = path.join(directory, 'revision.json');
  const existing = await readJson(filePath, null);
  if (existing) {
    if (existing.source_sha256 === normalized.source_sha256 && existing.full_evidence_index_sha256 === normalized.full_evidence_index_sha256) return existing;
    throw error('STEP01_AUTHORITY_REVISION_CONFLICT', '同一 revision 标识已绑定其他证据', 409);
  }
  await atomicWrite(filePath, normalized);
  return normalized;
}

async function updateRevision({root, project, revisionId, update}) {
  const current = await readRevision({root, project, revisionId});
  if (update?.status === 'ready_for_promotion' || update?.status === 'accepted') throw error('STEP01_AUTHORITY_STATUS_TRANSITION_FORBIDDEN', '该状态只能由晋级门或原子权威记录产生');
  const next = {...current, ...update, updated_at:new Date().toISOString()};
  await atomicWrite(path.join(revisionRoot(root, project.id, revisionId), 'revision.json'), next);
  return next;
}

async function current({root, project, legacyEvidenceRoot = null, legacyAnalysisRunId = null}) {
  const pointer = await readJson(pointerPath(root, project.id), null);
  if (!pointer) {
    if (!legacyEvidenceRoot) throw error('STEP01_CURRENT_AUTHORITY_MISSING', '当前 Step01 权威尚未建立', 404);
    return {kind:'legacy', revision_id:legacyAnalysisRunId || null, evidence_root:path.resolve(legacyEvidenceRoot), pointer:null};
  }
  if (pointer.schema_version !== POINTER_SCHEMA || pointer.project_id !== project.id || !safeRevisionId(pointer.revision_id) || pointer.source_sha256 !== project.source?.sha256 || Number(pointer.source_bytes) !== Number(project.source?.bytes)) {
    throw error('STEP01_CURRENT_AUTHORITY_INVALID', '当前 Step01 权威指针无效');
  }
  const {pointer_sha256, ...pointerCore} = pointer;
  const expectedSha = sha256(canonical(pointerCore));
  if (pointer.pointer_sha256 !== expectedSha) throw error('STEP01_CURRENT_AUTHORITY_INVALID', '当前 Step01 权威指针校验失败');
  const storedRevision = await readRevision({root, project, revisionId:pointer.revision_id});
  if (pointer.commit_state !== 'committed' || pointer.accepted_revision_sha256 !== sha256(canonical(storedRevision))) throw error('STEP01_CURRENT_AUTHORITY_NOT_ACCEPTED', '当前 Step01 权威尚未接受');
  const revision = {...storedRevision,status:'accepted',accepted_at:pointer.promoted_at};
  const evidenceRoot = path.resolve(revisionRoot(root, project.id, revision.revision_id), revision.evidence_root_relative);
  const allowed = revisionRoot(root, project.id, revision.revision_id) + path.sep;
  if (!evidenceRoot.startsWith(allowed)) throw error('STEP01_CURRENT_AUTHORITY_PATH_INVALID', '当前 Step01 权威路径无效');
  return {kind:'revision', revision_id:revision.revision_id, evidence_root:evidenceRoot, pointer, revision};
}

async function evidenceRootForRevision({root, project, revisionId}) {
  const revision = await readRevision({root, project, revisionId});
  const output = path.resolve(revisionRoot(root, project.id, revision.revision_id), revision.evidence_root_relative);
  const allowed = revisionRoot(root, project.id, revision.revision_id) + path.sep;
  if (!output.startsWith(allowed)) throw error('STEP01_AUTHORITY_REVISION_PATH_INVALID', 'Step01 evidence revision 路径无效');
  return {revision, evidence_root:output};
}

async function promote({root, project, revisionId, ifMatch, atomicWriter = atomicWrite}) {
  const targetPointerPath = pointerPath(root, project.id);
  const writerLock = targetPointerPath + '.writer-lock';
  await fsp.mkdir(path.dirname(writerLock), {recursive:true});
  try { await fsp.mkdir(writerLock); }
  catch (caught) { if (caught.code === 'EEXIST') throw error('STEP01_CURRENT_AUTHORITY_WRITE_CONFLICT', '当前 Step01 权威正在切换'); throw caught; }
  try {
    const previous = await readJson(targetPointerPath, null);
    if (!ifMatch || String(ifMatch).startsWith('W/') || String(ifMatch) !== etag(previous)) throw error('STEP01_CURRENT_AUTHORITY_ETAG_CONFLICT', '当前 Step01 权威已变化');
    const revision = await readRevision({root, project, revisionId});
    if (revision.status !== 'ready_for_promotion' || promotionGateError(revision)) throw error('STEP01_AUTHORITY_PROMOTION_BLOCKED', '完整视觉复核尚未完成，不能切换权威');
    const promotedAt = new Date().toISOString();
    const core = {schema_version:POINTER_SCHEMA,commit_state:'committed',version:Number(previous?.version || 0)+1,project_id:project.id,revision_id:revision.revision_id,source_sha256:revision.source_sha256,source_bytes:revision.source_bytes,source_revision:revision.source_revision,strict_manifest_sha256:revision.strict_manifest_sha256,full_evidence_index_sha256:revision.full_evidence_index_sha256,accepted_revision_sha256:sha256(canonical(revision)),ledger_snapshot_sha256:revision.source_authority.ledger_snapshot_sha256,role_card_snapshot_sha256:revision.source_authority.role_card_snapshot_sha256,story_snapshot_sha256:revision.source_authority.story_snapshot_sha256,downstream_stale:revision.downstream_stale,candidate_acceptance_sha256:revision.candidate_acceptance.receipt_sha256,previous_revision_id:previous?.revision_id || null,previous_pointer_sha256:previous?.pointer_sha256 || null,rollback_target:previous ? {revision_id:previous.revision_id,pointer_sha256:previous.pointer_sha256,version:Number(previous.version || 0),accepted_revision_sha256:previous.accepted_revision_sha256,source_sha256:previous.source_sha256,full_evidence_index_sha256:previous.full_evidence_index_sha256} : null,promoted_at:promotedAt};
    const pointer = {...core, pointer_sha256:sha256(canonical(core))};
    await atomicWriter(targetPointerPath, pointer);
    return pointer;
  } finally { await fsp.rmdir(writerLock).catch(() => {}); }
}

async function rollback({root,project,ifMatch,atomicWriter=atomicWrite}) {
  const targetPointerPath=pointerPath(root,project.id);const writerLock=targetPointerPath+'.writer-lock';
  await fsp.mkdir(path.dirname(writerLock),{recursive:true});
  try{await fsp.mkdir(writerLock);}catch(caught){if(caught.code==='EEXIST')throw error('STEP01_CURRENT_AUTHORITY_WRITE_CONFLICT','当前 Step01 权威正在切换');throw caught;}
  try{
    const currentPointer=await readJson(targetPointerPath,null);
    if(!currentPointer||!ifMatch||String(ifMatch).startsWith('W/')||String(ifMatch)!==etag(currentPointer))throw error('STEP01_CURRENT_AUTHORITY_ETAG_CONFLICT','当前 Step01 权威已变化');
    const target=currentPointer.rollback_target;
    if(!target||!safeRevisionId(target.revision_id)||!exactSha(target.pointer_sha256)||!exactSha(target.accepted_revision_sha256)||target.source_sha256!==project.source?.sha256)throw error('STEP01_AUTHORITY_ROLLBACK_TARGET_INVALID','当前权威没有可验证的回滚目标');
    const revision=await readRevision({root,project,revisionId:target.revision_id});
    if(sha256(canonical(revision))!==target.accepted_revision_sha256||revision.full_evidence_index_sha256!==target.full_evidence_index_sha256||promotionGateError(revision))throw error('STEP01_AUTHORITY_ROLLBACK_TARGET_INVALID','回滚目标 revision 已变化或证据不完整');
    const rolledAt=new Date().toISOString();
    const core={schema_version:POINTER_SCHEMA,commit_state:'committed',operation:'rollback',version:Number(currentPointer.version)+1,project_id:project.id,revision_id:revision.revision_id,source_sha256:revision.source_sha256,source_bytes:revision.source_bytes,source_revision:revision.source_revision,strict_manifest_sha256:revision.strict_manifest_sha256,full_evidence_index_sha256:revision.full_evidence_index_sha256,accepted_revision_sha256:sha256(canonical(revision)),ledger_snapshot_sha256:revision.source_authority.ledger_snapshot_sha256,role_card_snapshot_sha256:revision.source_authority.role_card_snapshot_sha256,story_snapshot_sha256:revision.source_authority.story_snapshot_sha256,downstream_stale:revision.downstream_stale,candidate_acceptance_sha256:revision.candidate_acceptance.receipt_sha256,previous_revision_id:currentPointer.revision_id,previous_pointer_sha256:currentPointer.pointer_sha256,rollback_source_pointer_sha256:target.pointer_sha256,rollback_target:{revision_id:currentPointer.revision_id,pointer_sha256:currentPointer.pointer_sha256,version:Number(currentPointer.version),accepted_revision_sha256:currentPointer.accepted_revision_sha256,source_sha256:currentPointer.source_sha256,full_evidence_index_sha256:currentPointer.full_evidence_index_sha256},forward_recovery_target:{revision_id:currentPointer.revision_id,pointer_sha256:currentPointer.pointer_sha256,version:Number(currentPointer.version)},promoted_at:rolledAt,rolled_back_at:rolledAt};
    const pointer={...core,pointer_sha256:sha256(canonical(core))};await atomicWriter(targetPointerPath,pointer);return pointer;
  }finally{await fsp.rmdir(writerLock).catch(()=>{});}
}

module.exports = {SCHEMA, POINTER_SCHEMA, canonical, sha256, etag, projectRoot, revisionRoot, pointerPath, readRevision, createRevision, updateRevision, markReadyForPromotion, promotionGateError, current, evidenceRootForRevision, promote, rollback};
