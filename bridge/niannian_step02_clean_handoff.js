'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const SCHEMA_VERSION = 'niannian.step02_clean_handoff.v1';
const NODE_SCHEMA_VERSION = 'niannian.step02_source_truth_node.v1';
const EXPECTED_COUNTS = Object.freeze({observations:254,source_shots:37,projection_frames:111});
const EFFECT_KEYS = Object.freeze([
  'media_provider_network_requested','media_provider_upload_requested','media_provider_submit_requested',
  'spend_requested','package_send_requested','registry_promotion_requested','deployment_requested',
  'local_image_editing_requested','real_delivery'
]);
const BLOCKER_CLASSES = new Set(['evidence','quality','resource','authorization','provider_policy','contract','infrastructure','transaction']);
const SPEAKER_STATES = new Set(['onscreen_mouth','offscreen_voice','phone_voice','subtitle_only']);
const WINDOW_STATES = new Set(['confirmed_dialogue','background_voice','offscreen_voice','hearing_unclear','hallucination']);
const COMPLEX_TEXT_TYPES = new Set(['phone','document','screen','ui','comment','danmu','layout','post','chat']);
const HARD_SCENE_TYPES = new Set([
  'livestream_ui','floating_comments','readable_screen_evidence','public_crowd_blocking',
  'precise_hand_object_proof','screen_in_screen','reflection_layers','emotional_first_state'
]);
const FORBIDDEN_VALUE = /(speaker_unknown|\bunknown\b|未知|待确认|按原片|见原片|看抽帧|以抽帧为准|native frame|raw[ _-]?(?:asr|ocr)|内部模型|model reasoning|signed[_ -]?url|provider[_ -]?job|生成提示词|视频提示词|Image2|Seedance|[a-z]:\\|\/home\/|\/Users\/)/i;
const FORBIDDEN_KEY = /^(?:raw(?:_|$)|provider(?:_|$)|signed_url$|internal_reasoning$|model_reasoning$|task_id$|thread_id$|receipt_id$|cache_key$|exact_path$|file_path$)/i;

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(Buffer.isBuffer(value) ? value : String(value)).digest('hex');
}

function error(code, message = code, httpStatus = 409) {
  const result = new Error(message);
  result.code = code;
  result.httpStatus = httpStatus;
  return result;
}

function isSha(value) { return /^[a-f0-9]{64}$/.test(String(value || '')); }
function nonempty(value) { return typeof value === 'string' && value.trim().length > 0; }
function finite(value) { return Number.isFinite(Number(value)); }

function assertExactKeys(value, allowed, code) {
  for (const key of Object.keys(value || {})) if (!allowed.has(key)) throw error(code, code + ':' + key, 422);
}

function assertShape(value, required, allowed, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw error(code, code, 422);
  for (const key of required) if (!Object.prototype.hasOwnProperty.call(value, key)) throw error(code, code + ':missing:' + key, 422);
  assertExactKeys(value, new Set(allowed), code);
}

function artifactEnvelope(value, exactPath) {
  const bytes = Buffer.from(canonical(value));
  return {value,exact_path:String(exactPath || ''),sha256:sha256(bytes),bytes:bytes.length};
}

function verifyArtifactEnvelope(envelope, label) {
  assertShape(envelope,['value','exact_path','sha256','bytes'],['value','exact_path','sha256','bytes'],'STEP02_AUTHORITY_ARTIFACT_INVALID');
  if (!nonempty(envelope.exact_path) || !isSha(envelope.sha256)) throw error('STEP02_AUTHORITY_ARTIFACT_INVALID', label);
  const bytes = Buffer.from(canonical(envelope.value));
  if (sha256(bytes) !== envelope.sha256 || bytes.length !== Number(envelope.bytes)) throw error('STEP02_AUTHORITY_ARTIFACT_TAMPERED', label);
  return envelope.value;
}

function semanticObjectDigest(value, omittedKeys) {
  const core = {...value};
  for (const key of omittedKeys) delete core[key];
  return sha256(canonical(core));
}

function scanCleanValue(value, location = 'handoff') {
  if (typeof value === 'string') {
    if (FORBIDDEN_VALUE.test(value)) throw error('STEP02_FORBIDDEN_CLEAN_VALUE', location, 422);
    return;
  }
  if (Array.isArray(value)) return value.forEach((item, index) => scanCleanValue(item, location + '[' + index + ']'));
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key)) throw error('STEP02_FORBIDDEN_CLEAN_FIELD', location + '.' + key, 422);
    scanCleanValue(child, location + '.' + key);
  }
}

function falseEffects() { return Object.fromEntries(EFFECT_KEYS.map(key => [key, false])); }

function assertFalseEffects(effects) {
  assertExactKeys(effects, new Set(EFFECT_KEYS), 'STEP02_EFFECT_FIELD_INVALID');
  for (const key of EFFECT_KEYS) if (effects?.[key] !== false) throw error('STEP02_SIDE_EFFECT_FORBIDDEN', key, 422);
}

function pointerDigest(pointer) {
  const {pointer_sha256, ...core} = pointer || {};
  return sha256(canonical(core));
}

function resolveAcceptedAuthority({pointer, revision, ledger, fullEvidenceIndex, expectedRevisionId}) {
  if (!pointer || !revision || !ledger || !fullEvidenceIndex) throw error('STEP01_AUTHORITY_NOT_ACCEPTED');
  const artifactMap = {pointer,revision,ledger,full_evidence_index:fullEvidenceIndex};
  const pointerValue = verifyArtifactEnvelope(pointer,'pointer');
  const revisionValue = verifyArtifactEnvelope(revision,'revision');
  const ledgerValue = verifyArtifactEnvelope(ledger,'ledger');
  const indexValue = verifyArtifactEnvelope(fullEvidenceIndex,'full_evidence_index');
  pointer = pointerValue; revision = revisionValue; ledger = ledgerValue; fullEvidenceIndex = indexValue;
  if (pointer.schema_version !== 'niannian.step01_current_authority.v1' || revision.schema_version !== 'niannian.step01_authority_revision.v1') throw error('STEP01_AUTHORITY_BINDING_MISMATCH');
  if (pointer.revision_id !== expectedRevisionId || revision.revision_id !== expectedRevisionId || revision.status !== 'accepted') throw error('STEP01_AUTHORITY_NOT_ACCEPTED');
  if (!isSha(pointer.pointer_sha256) || pointer.pointer_sha256 !== pointerDigest(pointer)) throw error('STEP01_AUTHORITY_BINDING_MISMATCH');
  const bindings = ['project_id','revision_id','source_sha256','source_bytes','source_revision','strict_manifest_sha256','full_evidence_index_sha256'];
  for (const key of bindings) if (String(pointer[key]) !== String(revision[key])) throw error('STEP01_AUTHORITY_BINDING_MISMATCH', key);
  if (!isSha(revision.ledger_snapshot_sha256) || revision.ledger_snapshot_sha256 !== ledger.snapshot_sha256 || ledger.snapshot_sha256 !== semanticObjectDigest(ledger,['snapshot_sha256','snapshot_id'])) throw error('STEP01_LEDGER_BINDING_MISMATCH');
  if (ledger.project_id !== pointer.project_id || ledger.source_sha256 !== pointer.source_sha256) throw error('STEP01_LEDGER_BINDING_MISMATCH');
  if (fullEvidenceIndex.project_id !== pointer.project_id || fullEvidenceIndex.source_sha256 !== pointer.source_sha256 || fullEvidenceIndex.index_sha256 !== pointer.full_evidence_index_sha256 || fullEvidenceIndex.index_sha256 !== semanticObjectDigest(fullEvidenceIndex,['index_sha256'])) throw error('STEP01_AUTHORITY_BINDING_MISMATCH');
  const observations = Array.isArray(fullEvidenceIndex.observations) ? fullEvidenceIndex.observations : fullEvidenceIndex.frames;
  if (!Array.isArray(observations) || observations.length !== EXPECTED_COUNTS.observations) throw error('STEP01_OBSERVATION_COVERAGE_INCOMPLETE');
  if (!Array.isArray(ledger.shots) || ledger.shots.length !== EXPECTED_COUNTS.source_shots || new Set(ledger.shots.map(item => item.shot_id)).size !== EXPECTED_COUNTS.source_shots) throw error('STEP01_LEDGER_BINDING_MISMATCH');
  const projectionFrames = ledger.projection_frames;
  if (!Array.isArray(projectionFrames) || projectionFrames.length !== EXPECTED_COUNTS.projection_frames || new Set(projectionFrames.map(item => item.projection_id)).size !== EXPECTED_COUNTS.projection_frames) throw error('STEP01_PROJECTION_COVERAGE_INVALID');
  const core = {
    project_id:pointer.project_id,source_sha256:pointer.source_sha256,source_bytes:Number(pointer.source_bytes),
    source_revision:Number(pointer.source_revision),analysis_run_id:expectedRevisionId,authority_revision_id:expectedRevisionId,
    authority_pointer_sha256:pointer.pointer_sha256,strict_manifest_sha256:pointer.strict_manifest_sha256,
    full_evidence_index_sha256:pointer.full_evidence_index_sha256,ledger_snapshot_sha256:ledger.snapshot_sha256,
    counts:{...EXPECTED_COUNTS}
  };
  const binding = {...core,binding_sha256:sha256(canonical(core))};
  const exact_paths_and_sha256 = Object.fromEntries(Object.entries(artifactMap).map(([key,item]) => [key,{exact_path:item.exact_path,sha256:item.sha256,bytes:item.bytes}]));
  return Object.freeze({binding:Object.freeze(binding),exact_paths_and_sha256:Object.freeze(exact_paths_and_sha256)});
}

function validateAuthorityBinding(binding, current) {
  const keys = ['project_id','source_sha256','source_bytes','source_revision','analysis_run_id','authority_revision_id','authority_pointer_sha256','strict_manifest_sha256','full_evidence_index_sha256','ledger_snapshot_sha256','binding_sha256'];
  for (const key of keys) if (String(binding?.[key]) !== String(current?.[key])) throw error('STEP02_STALE_UPSTREAM', key);
  for (const [key, value] of Object.entries(EXPECTED_COUNTS)) if (Number(binding?.counts?.[key]) !== value) throw error('STEP01_OBSERVATION_COVERAGE_INCOMPLETE', key);
  return true;
}

function validateBlocker(blocker) {
  const required = ['blocker_id','class','code','scope','owner','critical','retryable','automatic_retry_allowed','resume_event','evidence_refs','blocker_signature','created_at','terminal_state'];
  assertShape(blocker,required,[...required,'public_message'],'STEP02_BLOCKER_INVALID');
  if (!required.every(key => Object.prototype.hasOwnProperty.call(blocker || {}, key)) || !BLOCKER_CLASSES.has(blocker.class) || !nonempty(blocker.code) || !nonempty(blocker.blocker_signature) || !Array.isArray(blocker.evidence_refs)) throw error('STEP02_BLOCKER_INVALID', blocker?.code, 422);
}

function validateCleanHandoff(candidate, {currentAuthority, ledgerShotIds, ledgerShots, evidenceWindows, acceptedGlossaryNames = []} = {}) {
  const allowed = new Set(['schema_version','status','downstream_consumable','test_only','fixture_evidence','authority_binding','source_media_contract','sourceRows','dialogueBindings','visualFactCards','textEvidence','assetCandidates','hardSceneCandidates','blockers','effects','metrics']);
  assertShape(candidate,[...allowed],[...allowed],'STEP02_SCHEMA_INVALID');
  if (candidate?.schema_version !== SCHEMA_VERSION || !['analysis_in_progress','candidate'].includes(candidate.status) || candidate.downstream_consumable !== false) throw error('STEP02_SCHEMA_INVALID', 'candidate metadata', 422);
  if (typeof candidate.test_only !== 'boolean' || typeof candidate.fixture_evidence !== 'boolean') throw error('STEP02_SCHEMA_INVALID','fixture flags',422);
  assertShape(candidate.authority_binding,['project_id','source_sha256','source_bytes','source_revision','analysis_run_id','authority_revision_id','authority_pointer_sha256','strict_manifest_sha256','full_evidence_index_sha256','ledger_snapshot_sha256','counts','binding_sha256'],['project_id','source_sha256','source_bytes','source_revision','analysis_run_id','authority_revision_id','authority_pointer_sha256','strict_manifest_sha256','full_evidence_index_sha256','ledger_snapshot_sha256','counts','binding_sha256'],'STEP02_SCHEMA_INVALID');
  assertShape(candidate.authority_binding.counts,['observations','source_shots','projection_frames'],['observations','source_shots','projection_frames'],'STEP02_SCHEMA_INVALID');
  assertShape(candidate.source_media_contract,['duration_seconds','time_axis'],['duration_seconds','time_axis'],'STEP02_SCHEMA_INVALID');
  if (!finite(candidate.source_media_contract.duration_seconds) || Number(candidate.source_media_contract.duration_seconds) <= 0 || candidate.source_media_contract.time_axis !== 'accepted_source_seconds_frozen') throw error('STEP02_SCHEMA_INVALID','source_media_contract',422);
  const metricKeys=['first_trusted_timeline_row_at','final_handoff_at','ocr_reuse_rate','duplicate_submissions','blocker_count','speaker_rework_rate','user_revision_count','recovery_seconds'];
  assertShape(candidate.metrics,metricKeys,metricKeys,'STEP02_SCHEMA_INVALID');
  for(const key of metricKeys){const item=candidate.metrics[key];assertShape(item,['state','value'],['state','value'],'STEP02_SCHEMA_INVALID');if(!['measured','missing','not_applicable'].includes(item.state)||((item.state==='missing'||item.state==='not_applicable')&&item.value!==null)||(item.state==='measured'&&(item.value===null||item.value===undefined||!['string','number'].includes(typeof item.value))))throw error('STEP02_SCHEMA_INVALID','metrics.'+key,422);}
  assertFalseEffects(candidate.effects);
  validateAuthorityBinding(candidate.authority_binding, currentAuthority);
  const sectionNames = ['sourceRows','dialogueBindings','visualFactCards','textEvidence','assetCandidates','hardSceneCandidates','blockers'];
  for (const name of sectionNames) if (!Array.isArray(candidate[name])) throw error('STEP02_SCHEMA_INVALID', name, 422);
  candidate.blockers.forEach(validateBlocker);
  scanCleanValue(Object.fromEntries(sectionNames.map(name => [name, candidate[name]])));
  const sourceLedgerShots = Array.isArray(ledgerShots) ? ledgerShots : null;
  const shots = new Set(sourceLedgerShots ? sourceLedgerShots.map(item => item.shot_id) : (ledgerShotIds || []));
  const ledgerByShot = new Map((sourceLedgerShots || []).map(item => [item.shot_id,item]));
  if (shots.size !== EXPECTED_COUNTS.source_shots || candidate.sourceRows.length !== EXPECTED_COUNTS.source_shots) throw error('STEP02_SOURCE_ROWS_INCOMPLETE');
  const seenShots = new Set(); let previousEnd = -1;
  for (const row of candidate.sourceRows) {
    const rowKeys=['shot_id','source_start_sec','source_end_sec','time_label','story_function','visual_composition','blocking_movement','continuity_state','dialogue_ids','text_evidence_ids','visual_fact_ids'];
    assertShape(row,rowKeys,rowKeys,'STEP02_SOURCE_ROW_INVALID');
    if (!shots.has(row.shot_id) || seenShots.has(row.shot_id) || !finite(row.source_start_sec) || !finite(row.source_end_sec) || Number(row.source_start_sec) < 0 || Number(row.source_end_sec) <= Number(row.source_start_sec) || Number(row.source_start_sec) < previousEnd - 0.001) throw error('STEP02_SOURCE_ROW_INVALID', row?.shot_id, 422);
    const ledgerShot = ledgerByShot.get(row.shot_id);
    if (ledgerShot && (Math.abs(Number(row.source_start_sec) - Number(ledgerShot.start_sec)) > 0.001 || Math.abs(Number(row.source_end_sec) - Number(ledgerShot.end_sec)) > 0.001)) throw error('STEP02_SOURCE_TIME_AXIS_MISMATCH', row.shot_id, 422);
    if (!nonempty(row.time_label) || row.time_label.trim().length < 5) throw error('STEP02_SOURCE_ROW_INVALID', row.shot_id + ':time_label', 422);
    for (const field of ['story_function','visual_composition','blocking_movement','continuity_state']) if (!nonempty(row[field])) throw error('STEP02_SOURCE_ROW_INVALID', row.shot_id + ':' + field, 422);
    for (const field of ['dialogue_ids','text_evidence_ids','visual_fact_ids']) if (!Array.isArray(row[field])) throw error('STEP02_SOURCE_ROW_INVALID', row.shot_id + ':' + field, 422);
    seenShots.add(row.shot_id); previousEnd = Number(row.source_end_sec);
  }
  if ([...shots].some(shot => !seenShots.has(shot))) throw error('STEP02_SOURCE_ROWS_INCOMPLETE');

  const dialogueIds = new Set(); const spokenKeys = new Set();
  for (const line of candidate.dialogueBindings) {
    const required=['dialogue_id','source_start_sec','source_end_sec','onset_shot','best_evidence_shot','source_speaker','source_text','evidence_basis','speaker_attribution_status'];
    assertShape(line,required,[...required,'repeat_proven'],'STEP02_DIALOGUE_BINDING_INVALID');
    if (!nonempty(line.dialogue_id) || dialogueIds.has(line.dialogue_id) || !shots.has(line.onset_shot) || !shots.has(line.best_evidence_shot) || !finite(line.source_start_sec) || !finite(line.source_end_sec) || Number(line.source_end_sec) <= Number(line.source_start_sec) || !nonempty(line.source_speaker) || !nonempty(line.source_text) || !Array.isArray(line.evidence_basis) || !line.evidence_basis.length || !SPEAKER_STATES.has(line.speaker_attribution_status)) throw error('STEP02_DIALOGUE_BINDING_INVALID', line?.dialogue_id, 422);
    const speakerEvidence = line.evidence_basis.some(item => /(mouth|phone|subtitle|offscreen|voice_direction|reverse|story_logic)/i.test(item));
    if (!speakerEvidence || line.evidence_basis.every(item => item === 'centered_subject')) throw error('STEP02_DIALOGUE_SPEAKER_UNRESOLVED',line.dialogue_id,422);
    const key = line.source_speaker.trim() + '|' + line.source_text.trim();
    if (spokenKeys.has(key) && line.repeat_proven !== true) throw error('STEP02_DIALOGUE_DUPLICATED', line.dialogue_id, 422);
    spokenKeys.add(key); dialogueIds.add(line.dialogue_id);
  }
  const dialogueReferences=new Map();
  for (const row of candidate.sourceRows) for (const id of row.dialogue_ids) {
    if (!dialogueIds.has(id)) throw error('STEP02_DIALOGUE_REFERENCE_INVALID', id, 422);
    const line=candidate.dialogueBindings.find(item=>item.dialogue_id===id);
    if (line.onset_shot!==row.shot_id || dialogueReferences.has(id)) throw error('STEP02_DIALOGUE_REFERENCE_INVALID', id, 422);
    dialogueReferences.set(id,row.shot_id);
  }
  if ([...dialogueIds].some(id=>!dialogueReferences.has(id))) throw error('STEP02_DIALOGUE_REFERENCE_INVALID', 'missing onset row', 422);

  const factIds = new Set();
  for (const fact of candidate.visualFactCards) {
    const factKeys=['fact_id','shot_ids','fact_type','visible_fact','evidence_refs'];
    assertShape(fact,factKeys,factKeys,'STEP02_VISUAL_FACT_INVALID');
    if (!nonempty(fact.fact_id) || factIds.has(fact.fact_id) || !Array.isArray(fact.shot_ids) || !fact.shot_ids.length || fact.shot_ids.some(id => !shots.has(id)) || !nonempty(fact.fact_type) || !nonempty(fact.visible_fact) || !Array.isArray(fact.evidence_refs) || !fact.evidence_refs.length) throw error('STEP02_VISUAL_FACT_INVALID', fact?.fact_id, 422);
    factIds.add(fact.fact_id);
  }
  for (const row of candidate.sourceRows) for (const id of row.visual_fact_ids) if (!factIds.has(id)) throw error('STEP02_VISUAL_FACT_REFERENCE_INVALID', id, 422);

  const textIds = new Set();
  for (const item of candidate.textEvidence) {
    const required=['text_evidence_id','shot_id','source_start_sec','source_end_sec','text_type','source_text','screen_region','story_use','evidence_basis','terminal_state'];
    assertShape(item,required,[...required,'dialogue_id'],'STEP02_TEXT_EVIDENCE_INVALID');
    if (!nonempty(item.text_evidence_id) || textIds.has(item.text_evidence_id) || !shots.has(item.shot_id) || !finite(item.source_start_sec) || !finite(item.source_end_sec) || Number(item.source_end_sec) <= Number(item.source_start_sec) || !nonempty(item.text_type) || !nonempty(item.source_text) || !nonempty(item.screen_region) || !nonempty(item.story_use) || !Array.isArray(item.evidence_basis) || !item.evidence_basis.length || !['visible_silent','audible_readout'].includes(item.terminal_state)) throw error('STEP02_TEXT_EVIDENCE_INVALID', item?.text_evidence_id, 422);
    if (!['subtitle','phone','post','screen','document','comment','ui','chat'].includes(item.text_type)) throw error('STEP02_TEXT_EVIDENCE_INVALID',item.text_evidence_id,422);
    if (item.face_binding !== undefined) throw error('STEP02_TEXT_FACE_BINDING_FORBIDDEN', item.text_evidence_id, 422);
    if (item.terminal_state === 'audible_readout' && (!nonempty(item.dialogue_id) || !dialogueIds.has(item.dialogue_id))) throw error('STEP02_TEXT_READOUT_DIALOGUE_REQUIRED', item.text_evidence_id, 422);
    if (item.terminal_state === 'visible_silent' && item.dialogue_id !== undefined) throw error('STEP02_SILENT_TEXT_DIALOGUE_FORBIDDEN', item.text_evidence_id, 422);
    textIds.add(item.text_evidence_id);
  }
  for (const row of candidate.sourceRows) for (const id of row.text_evidence_ids) if (!textIds.has(id)) throw error('STEP02_TEXT_REFERENCE_INVALID', id, 422);

  const assetIds = new Set();
  for (const asset of candidate.assetCandidates) {
    const assetKeys=['asset_id','asset_type','first_seen_shot','visual_identity','story_function'];
    assertShape(asset,assetKeys,assetKeys,'STEP02_ASSET_CANDIDATE_INVALID');
    if (!nonempty(asset.asset_id) || assetIds.has(asset.asset_id) || !['character','scene','wardrobe','prop','document','screen'].includes(asset.asset_type) || !shots.has(asset.first_seen_shot) || !nonempty(asset.visual_identity) || !nonempty(asset.story_function)) throw error('STEP02_ASSET_CANDIDATE_INVALID', asset?.asset_id, 422);
    assetIds.add(asset.asset_id);
  }
  const hardIds = new Set();
  for (const item of candidate.hardSceneCandidates) {
    const required=['candidate_id','shots','source_timecode','difficulty_type','source_visual_info','why_normal_prompt_may_fail','first_state_lock_target','suggested_followup'];
    assertShape(item,required,[...required,'difficulty_label'],'STEP02_HARD_SCENE_INVALID');
    if (!nonempty(item.candidate_id) || hardIds.has(item.candidate_id) || !Array.isArray(item.shots) || !item.shots.length || item.shots.some(id => !shots.has(id)) || !nonempty(item.source_timecode) || !HARD_SCENE_TYPES.has(item.difficulty_type) || !nonempty(item.source_visual_info) || !nonempty(item.why_normal_prompt_may_fail) || !nonempty(item.first_state_lock_target) || !nonempty(item.suggested_followup)) throw error('STEP02_HARD_SCENE_INVALID', item?.candidate_id, 422);
    hardIds.add(item.candidate_id);
  }
  const allowedNames = new Set(acceptedGlossaryNames);
  for (const disputed of ['沈清宁','司若若']) if (!allowedNames.has(disputed) && canonical(sectionNames.map(name => candidate[name])).includes(disputed)) throw error('STEP02_UNPROVEN_CANONICAL_NAME', disputed, 422);
  validateWindowInventory(evidenceWindows,candidate);
  return true;
}

function semanticSha(candidate) {
  const consumed = {source_media_contract:candidate.source_media_contract,sourceRows:candidate.sourceRows,dialogueBindings:candidate.dialogueBindings,visualFactCards:candidate.visualFactCards,textEvidence:candidate.textEvidence,assetCandidates:candidate.assetCandidates,hardSceneCandidates:candidate.hardSceneCandidates,blockers:candidate.blockers};
  return sha256(canonical(consumed));
}

function etag(candidate) { return '"step02-clean-' + semanticSha(candidate) + '"'; }

function requireIfMatch(ifMatch, currentEtag) {
  if (!nonempty(ifMatch)) throw error('STEP02_PRECONDITION_REQUIRED', 'If-Match required', 428);
  if (String(ifMatch).replace(/^W\//, '') !== currentEtag) throw error('STEP02_CAS_CONFLICT', 'Step02 candidate changed', 409);
}

function cacheIdentity(input) {
  const required = ['project_id','source_sha256','source_bytes','authority_revision_id','authority_pointer_sha256','strict_manifest_sha256','full_evidence_index_sha256','ledger_snapshot_sha256','service','model_version','purpose','window_or_region_id','schema_version','compiler_version'];
  if (required.some(key => input?.[key] === undefined || input[key] === null || input[key] === '')) throw error('STEP02_CACHE_IDENTITY_INCOMPLETE', undefined, 422);
  return sha256(canonical(Object.fromEntries(required.map(key => [key,input[key]]))));
}

function bindingDifferences(previous, current) {
  const keys=['project_id','source_sha256','source_bytes','source_revision','authority_revision_id','authority_pointer_sha256','strict_manifest_sha256','full_evidence_index_sha256','ledger_snapshot_sha256','binding_sha256'];
  return keys.filter(key=>String(previous?.[key])!==String(current?.[key]));
}

function transitionDependentState(record, currentBinding) {
  const changed=bindingDifferences(record?.authority_binding,currentBinding);
  if(!changed.length)return {...record,stale:false,superseded:false,invalidated_by:[]};
  const accepted=record?.status==='accepted';
  return {...record,status:accepted?'superseded':'stale',downstream_consumable:false,step04_ready:false,stale:!accepted,superseded:accepted,invalidated_by:changed};
}

function receiptIdentity(input) {
  const required = ['project_id','analysis_run_id','source_sha256','authority_revision_id','ledger_snapshot_sha256','step02_run_id','service','model_version','purpose','window_or_region_id'];
  if (required.some(key => !nonempty(String(input?.[key] ?? '')))) throw error('STEP02_RECEIPT_IDENTITY_INCOMPLETE', undefined, 422);
  const core = Object.fromEntries(required.map(key => [key,input[key]]));
  return {...core,receipt_key:sha256(canonical(core)),namespace:[core.project_id,core.authority_revision_id,core.ledger_snapshot_sha256,core.step02_run_id,core.service,core.purpose,core.window_or_region_id]};
}

function reconcileReceipt(receipts, request) {
  const identity = receiptIdentity(request);
  const matches = (receipts || []).filter(item => item.receipt_key === identity.receipt_key);
  const terminal = [...matches].reverse().find(item => ['done_text','done_empty','verified','failed_terminal'].includes(item.terminal_state));
  if (terminal) return {action:'reuse_terminal',submit:false,identity,receipt:terminal};
  const pending = [...matches].reverse().find(item => ['prepared','submitted','running'].includes(item.terminal_state));
  if (pending) return {action:'wait_reconcile',submit:false,identity,receipt:pending};
  return {action:'prepare_single_attempt',submit:true,identity,attempt_number:matches.length + 1};
}

function appendReceiptAttempt(receipts, request, outcome) {
  const identity=receiptIdentity(request),history=[...(receipts||[])];
  const attemptNumber=history.filter(item=>item.receipt_key===identity.receipt_key).length+1;
  const item={...identity,attempt_number:attemptNumber,terminal_state:outcome.terminal_state,charge_state:outcome.charge_state||'not_applicable',reused:outcome.reused===true,result_evidence_sha256:outcome.result_evidence_sha256||null,created_at:outcome.created_at};
  if(!nonempty(item.created_at)||!['prepared','submitted','running','done_text','done_empty','verified','failed_terminal'].includes(item.terminal_state))throw error('STEP02_RECEIPT_ATTEMPT_INVALID',undefined,422);
  history.push(item);return history;
}

function classifyEvidenceWindow(window) {
  if (!finite(window?.source_start_sec) || !finite(window?.source_end_sec) || Number(window.source_end_sec) <= Number(window.source_start_sec) || !WINDOW_STATES.has(window.classification) || !Array.isArray(window.evidence_basis) || !window.evidence_basis.length) throw error('DIALOGUE_WINDOW_UNCLASSIFIED', window?.window_id, 422);
  if (window.classification === 'hearing_unclear' && window.critical === true && !nonempty(window.blocker_id)) throw error('DIALOGUE_TEXT_UNRESOLVED', window.window_id, 422);
  return true;
}

function validateWindowInventory(windows, candidate) {
  if (!Array.isArray(windows) || windows.length === 0) throw error('STEP02_EVIDENCE_WINDOW_INVENTORY_REQUIRED',undefined,422);
  const ids=new Set(),dialogues=new Map(candidate.dialogueBindings.map(item=>[item.dialogue_id,item]));
  const bound=new Set();
  for(const window of windows){
    assertShape(window,['window_id','source_start_sec','source_end_sec','classification','evidence_basis'],['window_id','source_start_sec','source_end_sec','classification','evidence_basis','dialogue_id','critical','blocker_id','short_candidate_confirmed'],'DIALOGUE_WINDOW_UNCLASSIFIED');
    if(!nonempty(window.window_id)||ids.has(window.window_id))throw error('DIALOGUE_WINDOW_UNCLASSIFIED',window?.window_id,422);
    classifyEvidenceWindow(window);ids.add(window.window_id);
    if(window.classification==='hearing_unclear'&&window.critical===true){
      const blocker=candidate.blockers.find(item=>item.blocker_id===window.blocker_id);
      if(!blocker||blocker.critical!==true||blocker.scope!=='window:'+window.window_id||blocker.code!=='DIALOGUE_TEXT_UNRESOLVED')throw error('DIALOGUE_TEXT_UNRESOLVED',window.window_id,422);
    }
    if(['confirmed_dialogue','offscreen_voice'].includes(window.classification)){
      if(!nonempty(window.dialogue_id)||!dialogues.has(window.dialogue_id)||bound.has(window.dialogue_id))throw error('DIALOGUE_WINDOW_UNCLASSIFIED',window.window_id,422);
      const line=dialogues.get(window.dialogue_id);
      if(Math.abs(Number(line.source_start_sec)-Number(window.source_start_sec))>.2||Math.abs(Number(line.source_end_sec)-Number(window.source_end_sec))>.2)throw error('STEP02_DIALOGUE_WINDOW_MISMATCH',window.window_id,422);
      if(Number(window.source_end_sec)-Number(window.source_start_sec)<=.3&&window.short_candidate_confirmed!==true)throw error('STEP02_SHORT_DIALOGUE_EVIDENCE_REQUIRED',window.window_id,422);
      bound.add(window.dialogue_id);
    }
  }
  if([...dialogues.keys()].some(id=>!bound.has(id)))throw error('STEP02_DIALOGUE_WINDOW_MISSING',undefined,422);
  return true;
}

function paddleModelFor(textType) { return COMPLEX_TEXT_TYPES.has(String(textType || '').toLowerCase()) ? 'PaddleOCR-VL-1.6' : 'PP-OCRv6'; }

function preparePaddleEvidence({textType, runtimeTokenPresent}) {
  if (runtimeTokenPresent !== true) return {ready:false,local_fallback:false,model:paddleModelFor(textType),blocker:{class:'authorization',code:'PADDLE_DAILY_CREDENTIAL_MISSING',critical:true,retryable:true,automatic_retry_allowed:false,resume_event:'current_day_runtime_token_available'}};
  return {ready:true,local_fallback:false,model:paddleModelFor(textType),blocker:null};
}

function classifyHardScene(fact) {
  if (fact?.livestream_ui) return 'livestream_ui';
  if (fact?.floating_comments) return 'floating_comments';
  if (fact?.readable_screen_or_document) return 'readable_screen_evidence';
  if (fact?.public_crowd_layers) return 'public_crowd_blocking';
  if (fact?.precise_hand_object_state) return 'precise_hand_object_proof';
  if (fact?.screen_in_screen) return 'screen_in_screen';
  if (fact?.reflection_layers) return 'reflection_layers';
  if (fact?.ambiguous_critical_first_state) return 'emotional_first_state';
  return null;
}

function dedupeBlockers(blockers) {
  const seen = new Set();
  return (blockers || []).filter(item => { validateBlocker(item); if (seen.has(item.blocker_signature)) return false; seen.add(item.blocker_signature); return true; });
}

function dependencyClosure(failedId, dependencies) {
  const affected=new Set([failedId]);let changed=true;
  while(changed){changed=false;for(const [id,needs] of Object.entries(dependencies||{}))if(!affected.has(id)&&(needs||[]).some(item=>affected.has(item))){affected.add(id);changed=true;}}
  return [...affected].sort();
}

function applyAcceptedUserRevision(candidate, revision) {
  assertShape(revision,['revision_id','accepted_evidence','actor','reason','base_authority_revision_id','base_ledger_snapshot_sha256','changes','created_at'],['revision_id','accepted_evidence','actor','reason','base_authority_revision_id','base_ledger_snapshot_sha256','changes','created_at'],'STEP02_USER_REVISION_INVALID');
  if(revision.accepted_evidence!==true||revision.base_authority_revision_id!==candidate.authority_binding.authority_revision_id||revision.base_ledger_snapshot_sha256!==candidate.authority_binding.ledger_snapshot_sha256||!Array.isArray(revision.changes)||!revision.changes.length)throw error('STEP02_USER_REVISION_INVALID');
  const next=structuredClone(candidate),audit=[];
  for(const change of revision.changes){
    assertShape(change,['entity_type','entity_id','field','before','after'],['entity_type','entity_id','field','before','after'],'STEP02_USER_REVISION_INVALID');
    const list=change.entity_type==='dialogue'?next.dialogueBindings:change.entity_type==='text'?next.textEvidence:null;
    const idKey=change.entity_type==='dialogue'?'dialogue_id':'text_evidence_id';
    const allowed=change.entity_type==='dialogue'?new Set(['source_speaker','source_text']):new Set(['source_text','story_use']);
    const target=list?.find(item=>item[idKey]===change.entity_id);
    if(!target||!allowed.has(change.field)||canonical(target[change.field])!==canonical(change.before)||!nonempty(String(change.after)))throw error('STEP02_USER_REVISION_INVALID',change.entity_id);
    target[change.field]=change.after;
    audit.push({entity_type:change.entity_type,entity_id:change.entity_id,field:change.field,before:change.before,after:change.after});
  }
  return {candidate:next,event:{type:'user_revision_applied',revision_id:revision.revision_id,actor:revision.actor,reason:revision.reason,base_authority_revision_id:revision.base_authority_revision_id,base_ledger_snapshot_sha256:revision.base_ledger_snapshot_sha256,changes:audit,affected:{dialogues:[...new Set(audit.filter(item=>item.entity_type==='dialogue').map(item=>item.entity_id))],text_evidence:[...new Set(audit.filter(item=>item.entity_type==='text').map(item=>item.entity_id))]},created_at:revision.created_at}};
}

function createNodeContract({authorityResolution = null, candidate = null, blocker = null, selectedSkill = 'mx-shortdrama-02-source-timeline', selectedSkillVersion = 'contract-v2'}) {
  const ready = Boolean(authorityResolution?.binding);
  if(ready){
    validateAuthorityBinding(authorityResolution.binding,authorityResolution.binding);
    if(!authorityResolution.exact_paths_and_sha256||Object.keys(authorityResolution.exact_paths_and_sha256).length!==4)throw error('STEP02_NODE_AUTHORITY_EVIDENCE_REQUIRED');
  }
  const authorityBinding=authorityResolution?.binding||null;
  return {
    schema_version:NODE_SCHEMA_VERSION,node_id:'step02_source_truth',status:ready?'candidate_ready':'blocked_upstream',
    authoritative_inputs:ready?['accepted_step01_current_pointer','accepted_step01_revision','full_evidence_index_254','source_ledger_37','accepted_user_glossary']:[],
    expected_outputs:['step02_clean_handoff_candidate','step02_acceptance_manifest','step02_reducer_receipt','artifact_ledger','website_projection'],
    bindings:authorityBinding,selected_skill:{name:selectedSkill,version:selectedSkillVersion},executor:'single_step02_owner',
    allowed_parallelism:{serial:['step01_acceptance','step02_acceptance','cost_authorization','provider_submit'],parallel:['disjoint_evidence_windows','independent_ocr_regions','independent_qa'],single_writer:['shot','dialogue_id','locked_artifact']},
    coverage:ready?{...EXPECTED_COUNTS}:null,quality_result:candidate?{source_rows:candidate.sourceRows.length,blockers:candidate.blockers.length}:null,
    exact_paths_and_sha256:ready?authorityResolution.exact_paths_and_sha256:{},
    blocker:blocker || null,resume_event:ready?'candidate_revision':'step01_authority_promoted',promotion_condition:'strong CAS + current authority/ledger reread + blockers empty + 37/37 + reducer acceptance',
    website_projection:{status:ready?'analysis_in_progress':'waiting_for_source_authority',durable_sources:['node_contract','acceptance_manifest','reducer_receipt','artifact_ledger']},
    completion_level:ready?'structural':'blocked',effects:falseEffects()
  };
}

function planAcceptance({candidate, currentAuthority, ledgerShotIds, ledgerShots, evidenceWindows, ifMatch, acceptedGlossaryNames = [], dryRun = false}) {
  requireIfMatch(ifMatch, etag(candidate));
  validateCleanHandoff(candidate, {currentAuthority,ledgerShotIds,ledgerShots,evidenceWindows,acceptedGlossaryNames});
  if (candidate.blockers.length) throw error('STEP02_CANDIDATE_BLOCKERS_PRESENT');
  if ((candidate.test_only === true || candidate.fixture_evidence === true) && dryRun !== true) throw error('STEP02_FIXTURE_CANDIDATE_NOT_ACCEPTABLE');
  const semantic_sha256 = semanticSha(candidate);
  if (dryRun) return {status:'would_accept_dry_run',downstream_consumable:false,step04_ready:false,semantic_sha256,authority_binding:currentAuthority,effects:falseEffects()};
  return {status:'acceptance_commit_required',downstream_consumable:false,step04_ready:false,semantic_sha256,authority_binding:currentAuthority,effects:falseEffects()};
}

function step04Guard({acceptance, currentAuthority, requiredAcceptanceSha256}) {
  if (!acceptance || acceptance.status !== 'accepted' || acceptance.downstream_consumable !== true || acceptance.artifact_ledger_status !== 'verified' || acceptance.acceptance_sha256 !== requiredAcceptanceSha256) throw error('STEP02_REDUCER_ACCEPTANCE_REQUIRED');
  validateAuthorityBinding(acceptance.authority_binding, currentAuthority);
  if (acceptance.blocker_count !== 0) throw error('STEP02_REDUCER_ACCEPTANCE_REQUIRED');
  return true;
}

function buildWebsiteProjection(candidate) {
  const earliest = candidate.blockers[0] || null;
  return {
    status:candidate.status === 'candidate' ? 'analysis_in_progress' : 'waiting',
    status_label:candidate.status === 'candidate' ? '正在整理镜头事实' : '正在核对原片',
    coverage:{shots:candidate.sourceRows.length,expected_shots:EXPECTED_COUNTS.source_shots},
    summary:{dialogues:candidate.dialogueBindings.length,visible_text:candidate.textEvidence.length,hard_scenes:candidate.hardSceneCandidates.length},
    source_rows:candidate.sourceRows.map(row => ({shot_id:row.shot_id,time_label:row.time_label,story_function:row.story_function,visual_composition:row.visual_composition,blocking_movement:row.blocking_movement,continuity_state:row.continuity_state,dialogues:row.dialogue_ids.map(id => {const line=candidate.dialogueBindings.find(item=>item.dialogue_id===id);return line?{speaker:line.source_speaker,text:line.source_text}:null;}).filter(Boolean),visible_text:row.text_evidence_ids.map(id => {const item=candidate.textEvidence.find(value=>value.text_evidence_id===id);return item?{type:item.text_type,text:item.source_text}:null;}).filter(Boolean)})),
    hard_scenes:candidate.hardSceneCandidates.map(item => ({shots:item.shots,difficulty_label:item.difficulty_label || item.difficulty_type,source_visual_info:item.source_visual_info,why_difficult:item.why_normal_prompt_may_fail})),
    blocker:earliest?{message:earliest.public_message || '原片证据仍在核对，暂不能进入下一步。',retryable:earliest.retryable}:null
  };
}

function metricValue(value, applicable = true) {
  if(!applicable)return {state:'not_applicable',value:null};
  if(value===null||value===undefined)return {state:'missing',value:null};
  return {state:'measured',value};
}

function reduceMetrics(events, applicability = {}) {
  const first = type => (events || []).find(item => item.type === type)?.at || null;
  const ocr = (events || []).filter(item => item.type === 'ocr_terminal');
  const reused = ocr.filter(item => item.reused === true).length;
  const submittedKeys = new Set((events || []).filter(item => item.type === 'service_submitted').map(item => item.receipt_key));
  const submitEvents = (events || []).filter(item => item.type === 'service_submitted').length;
  const recoveryStart = first('recovery_started'), recoveryEnd = first('recovery_completed');
  const speakerReviews=(events||[]).filter(item=>item.type==='speaker_binding_reviewed').length;
  return {
    first_trusted_timeline_row_at:metricValue(first('trusted_timeline_row'),applicability.timeline!==false),
    final_handoff_at:metricValue(first('handoff_finalized'),applicability.handoff!==false),
    ocr_reuse_rate:metricValue(ocr.length?reused/ocr.length:null,applicability.ocr!==false),
    duplicate_submissions:metricValue(submitEvents?submitEvents-submittedKeys.size:null,applicability.submissions!==false),
    blocker_count:metricValue((events || []).filter(item => item.type === 'blocker_opened').length,applicability.blockers!==false),
    speaker_rework_rate:metricValue(speakerReviews?(events||[]).filter(item=>item.type==='speaker_binding_changed').length/speakerReviews:null,applicability.speaker_review!==false),
    user_revision_count:metricValue((events || []).filter(item => item.type === 'user_revision_applied').length,applicability.user_revisions!==false),
    recovery_seconds:metricValue(recoveryStart&&recoveryEnd?(Date.parse(recoveryEnd)-Date.parse(recoveryStart))/1000:null,applicability.recovery!==false)
  };
}

async function atomicWriteJson(filePath,value){
  await fsp.mkdir(path.dirname(filePath),{recursive:true});
  const temporary=filePath+'.tmp-'+process.pid+'-'+crypto.randomBytes(4).toString('hex');
  await fsp.writeFile(temporary,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
  await fsp.rename(temporary,filePath);
}

async function readJson(filePath,fallback){try{return JSON.parse(await fsp.readFile(filePath,'utf8'));}catch(caught){if(caught.code==='ENOENT'&&arguments.length>1)return fallback;throw caught;}}

async function fixtureStoreSnapshot(root){
  const result=[];
  async function visit(directory){
    let entries=[];try{entries=await fsp.readdir(directory,{withFileTypes:true});}catch(caught){if(caught.code==='ENOENT')return;throw caught;}
    for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){const exact=path.join(directory,entry.name);if(entry.isDirectory())await visit(exact);else{const bytes=await fsp.readFile(exact),stat=await fsp.stat(exact);result.push({relative_path:path.relative(root,exact).replace(/\\/g,'/'),sha256:sha256(bytes),bytes:bytes.length,mtime_ms:stat.mtimeMs});}}
  }
  await visit(root);return result;
}

async function casPersistFixtureJson({filePath,currentValue,nextValue,ifMatch}){
  const currentEtag='"fixture-state-'+sha256(canonical(currentValue))+'"';
  requireIfMatch(ifMatch,currentEtag);
  await atomicWriteJson(filePath,nextValue);
  return {etag:'"fixture-state-'+sha256(canonical(nextValue))+'"',value:nextValue};
}

async function replayFixtureAcceptance({root,candidate,currentAuthority,ledgerShots,evidenceWindows,acceptedGlossaryNames=[]}){
  validateCleanHandoff(candidate,{currentAuthority,ledgerShots,evidenceWindows,acceptedGlossaryNames});
  if(candidate.blockers.length)throw error('STEP02_CANDIDATE_BLOCKERS_PRESENT');
  const eventsPath=path.join(root,'events.jsonl'),text=await fsp.readFile(eventsPath,'utf8').catch(caught=>{if(caught.code==='ENOENT')throw error('STEP02_ACCEPTANCE_EVENT_MISSING');throw caught;});
  const events=text.split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
  const event=[...events].reverse().find(item=>item.type==='step02_fixture_acceptance_planned'&&item.semantic_sha256===semanticSha(candidate)&&item.authority_binding_sha256===currentAuthority.binding_sha256);
  if(!event)throw error('STEP02_ACCEPTANCE_EVENT_MISSING');
  const commitId='fixture-'+sha256(event.semantic_sha256+'|'+event.authority_binding_sha256),commitsRoot=path.join(root,'commits'),commitRoot=path.join(commitsRoot,commitId);
  const acceptance={schema_version:'niannian.step02_acceptance_fixture.v1',status:'simulated_acceptance',fixture_evidence:true,downstream_consumable:false,step04_ready:false,semantic_sha256:event.semantic_sha256,authority_binding:currentAuthority,blocker_count:0,created_at:event.at,effects:falseEffects()};
  const reducer={schema_version:'niannian.step02_reducer_fixture.v1',status:'simulated_replay_complete',accepted:false,downstream_consumable:false,step04_ready:false,event_id:event.event_id,semantic_sha256:event.semantic_sha256,replay_reproducible:true,effects:falseEffects()};
  const ledger={schema_version:'artifact_ledger_fixture.v1',status:'simulation_only',artifacts:[{artifact_id:'step02_acceptance_fixture',status:'simulation_only',downstream_consumable_by:[]}],effects:falseEffects()};
  const checkpoint={schema_version:1,status:'simulation_complete',current_node:'Step02',earliest_incomplete_node:'Step02',next_action:'Wait for formally accepted Step01 and production integration.',step04_ready:false};
  const projection=buildWebsiteProjection(candidate);
  if(!fs.existsSync(commitRoot)){
    await fsp.mkdir(commitsRoot,{recursive:true});const staging=commitRoot+'.staging-'+crypto.randomBytes(4).toString('hex');await fsp.mkdir(staging,{recursive:true});
    try{for(const [name,value] of Object.entries({'acceptance.json':acceptance,'reducer.json':reducer,'artifact-ledger.json':ledger,'checkpoint.json':checkpoint,'website-projection.json':projection}))await fsp.writeFile(path.join(staging,name),JSON.stringify(value,null,2)+'\n');await fsp.rename(staging,commitRoot);}catch(caught){await fsp.rm(staging,{recursive:true,force:true});throw caught;}
  }
  const current={schema_version:'niannian.step02_fixture_commit_pointer.v1',commit_id:commitId,semantic_sha256:event.semantic_sha256,simulation_only:true,updated_at:event.at};
  await atomicWriteJson(path.join(root,'current.json'),current);
  return {commit_id:commitId,commit_root:commitRoot,current,acceptance,reducer,ledger,checkpoint,projection};
}

async function commitFixtureAcceptance({root,candidate,currentAuthority,ledgerShots,evidenceWindows,ifMatch,acceptedGlossaryNames=[],now='2026-07-27T08:00:00.000Z',crashAfterEvent=false}){
  planAcceptance({candidate,currentAuthority,ledgerShots,evidenceWindows,ifMatch,acceptedGlossaryNames,dryRun:true});
  const semantic_sha256=semanticSha(candidate),event={event_id:'S02FIX-'+sha256(semantic_sha256+'|'+currentAuthority.binding_sha256).slice(0,24),type:'step02_fixture_acceptance_planned',semantic_sha256,authority_binding_sha256:currentAuthority.binding_sha256,at:now,simulation_only:true};
  const eventsPath=path.join(root,'events.jsonl');let events=[];try{events=(await fsp.readFile(eventsPath,'utf8')).split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));}catch(caught){if(caught.code!=='ENOENT')throw caught;}
  const prior=events.find(item=>item.event_id===event.event_id);if(prior&&canonical(prior)!==canonical(event))throw error('STEP02_EVENT_ID_COLLISION');
  if(!prior){events.push(event);await fsp.mkdir(root,{recursive:true});const temporary=eventsPath+'.tmp-'+crypto.randomBytes(4).toString('hex');await fsp.writeFile(temporary,events.map(item=>JSON.stringify(item)).join('\n')+'\n');await fsp.rename(temporary,eventsPath);}
  if(crashAfterEvent)throw error('STEP02_FIXTURE_CRASH_AFTER_EVENT');
  return replayFixtureAcceptance({root,candidate,currentAuthority,ledgerShots,evidenceWindows,acceptedGlossaryNames});
}

module.exports = {
  BLOCKER_CLASSES,EFFECT_KEYS,EXPECTED_COUNTS,HARD_SCENE_TYPES,NODE_SCHEMA_VERSION,SCHEMA_VERSION,SPEAKER_STATES,WINDOW_STATES,
  appendReceiptAttempt,applyAcceptedUserRevision,artifactEnvelope,bindingDifferences,buildWebsiteProjection,cacheIdentity,canonical,casPersistFixtureJson,classifyEvidenceWindow,classifyHardScene,commitFixtureAcceptance,createNodeContract,dedupeBlockers,dependencyClosure,error,etag,falseEffects,fixtureStoreSnapshot,paddleModelFor,preparePaddleEvidence,
  planAcceptance,pointerDigest,receiptIdentity,reconcileReceipt,reduceMetrics,replayFixtureAcceptance,requireIfMatch,resolveAcceptedAuthority,semanticSha,
  sha256,step04Guard,transitionDependentState,validateAuthorityBinding,validateBlocker,validateCleanHandoff,validateWindowInventory
};
