const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const SCHEMA = 'niannian.step01_role_card_authority.v1';
const REVISION_SCHEMA = 'niannian.step01_role_card_authority_revision.v1';
const DERIVATION_VERSION = 6;

function canonical(value) { if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'; if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}'; return JSON.stringify(value); }
function sha256(value) { return crypto.createHash('sha256').update(Buffer.isBuffer(value) ? value : String(value)).digest('hex'); }
function now() { return new Date().toISOString(); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function text(value, limit = 1200) { return String(value || '').replace(/\r\n/g, '\n').trim().slice(0, limit); }
function error(code, httpStatus, message) { const result = new Error(message || code); result.code = code; result.httpStatus = httpStatus; return result; }
function safeProjectId(value) { const id = String(value || ''); if (!/^[A-Za-z0-9-]{8,80}$/.test(id)) throw error('STEP01_ROLE_CARD_PROJECT_INVALID', 422, '项目标识无效'); return id; }
function statePath(root, project) {
  const projectId = typeof project === 'string' ? project : project?.id;
  const revisionId = typeof project === 'object' ? String(project?.analysis?.authorityRevisionId || '') : '';
  const base = path.join(path.resolve(root), safeProjectId(projectId));
  if (revisionId && !/^analysis-[A-Za-z0-9-]{8,120}$/.test(revisionId)) throw error('STEP01_ROLE_CARD_AUTHORITY_REVISION_INVALID', 422, '角色卡权威 revision 无效');
  return revisionId ? path.join(base, 'revisions-by-authority', revisionId, 'role-cards.json') : path.join(base, 'role-cards.json');
}
async function readJson(filePath, fallback) { try { return JSON.parse(await fsp.readFile(filePath, 'utf8')); } catch (caught) { if (caught.code === 'ENOENT') return fallback; throw caught; } }
async function writeAtomic(filePath, value) { await fsp.mkdir(path.dirname(filePath), {recursive:true}); const temporary = filePath + '.tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex'); await fsp.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', {flag:'wx'}); await fsp.rename(temporary, filePath); }
function unique(values, limit = 24) { return [...new Set(values.map(value => text(value, 800)).filter(Boolean))].slice(0, limit); }
function namedSeed(name, ledger) {
  const appearances = [], dialogue = [];
  for (const shot of ledger.shots || []) {
    const lines = (shot.dialogue_ids || []).map(id => ledger.dialogue_rows?.find(row => row.dialogue_id === id)?.source_text).filter(Boolean);
    if (lines.some(line => line.includes(name))) { appearances.push(String(shot.shot_id)); dialogue.push(...lines.filter(line => line.includes(name))); }
  }
  return {card_id:'RC-NAME-' + sha256(name).slice(0, 10).toUpperCase(), role_label:'原剧称呼', original_name:name, visual_alias:'姓名已证实，尚未确认对应人物', importance:'important', narrative_function:'原片对白中出现的姓名或稳定称呼', relationships:[], appearances:unique(appearances, 80), visible_appearance:[], visible_actions:[], verified_dialogue:unique(dialogue, 16), verified_ocr:[], confirmed_facts:['原片对白出现“' + name + '”。'], unresolved:['尚无同镜头直接证据证明该姓名对应哪一位视觉人物。'], identity_assessment:{status:'source_name_confirmed',confidence:'high',reason:'该称呼来自原片已提取对白，不与任何视觉人物自动绑定。'}, name_binding:{status:'unbound', visual_card_id:null}, status:'system_identified'};
}
function normalizeCard(card, original) {
  const value = card && typeof card === 'object' ? card : {};
  const importance = ['important','ordinary','incidental'].includes(value.importance) ? value.importance : original.importance;
  const originalName = text(value.original_name, 80);
  const visualAlias = text(value.visual_alias, 100) || original.visual_alias;
  const userBound = Boolean(originalName && originalName !== original.original_name);
  const binding = userBound ? {status:'user_source_revision', visual_card_id:original.card_id} : clone(original.name_binding || {status:'unbound', visual_card_id:null});
  return {
    ...original,
    role_label:text(value.role_label, 100) || original.role_label,
    original_name:originalName,
    visual_alias:visualAlias,
    importance,
    narrative_function:text(value.narrative_function, 500),
    relationships:unique(Array.isArray(value.relationships) ? value.relationships : String(value.relationships || '').split('\n'), 20),
    appearances:unique(Array.isArray(value.appearances) ? value.appearances : String(value.appearances || '').split(/[\s,，]+/), 80),
    visible_appearance:unique(Array.isArray(value.visible_appearance) ? value.visible_appearance : String(value.visible_appearance || '').split('\n'), 20),
    visible_actions:unique(Array.isArray(value.visible_actions) ? value.visible_actions : String(value.visible_actions || '').split('\n'), 20),
    verified_dialogue:unique(Array.isArray(value.verified_dialogue) ? value.verified_dialogue : String(value.verified_dialogue || '').split('\n'), 20),
    verified_ocr:unique(Array.isArray(value.verified_ocr) ? value.verified_ocr : String(value.verified_ocr || '').split('\n'), 20),
    confirmed_facts:unique(Array.isArray(value.confirmed_facts) ? value.confirmed_facts : String(value.confirmed_facts || '').split('\n'), 20),
    unresolved:unique(Array.isArray(value.unresolved) ? value.unresolved : String(value.unresolved || '').split('\n'), 20),
    name_binding:binding,
    evidence_status:userBound ? 'user_source_revision' : (original.evidence_status || 'visual_identity_confirmed_name_unbound'),
    status:original.status
  };
}
function finalize(state) { const next = clone(state); delete next.snapshot_id; delete next.snapshot_sha256; const digest = sha256(canonical(next)); next.snapshot_id = 'S01ROLE-' + digest.slice(0, 24); next.snapshot_sha256 = digest; return next; }
function etag(state) { return '"step01-role-cards-' + state.snapshot_sha256 + '"'; }
function allImportantConfirmed(state) { return (state.cards || []).filter(card => card.importance === 'important').every(card => ['confirmed','system_identified','user_edited'].includes(card.status)); }

function manualCard(body, actor) {
  const value = body && typeof body === 'object' ? body : {};
  const cardId = 'RC-MANUAL-' + sha256(canonical({actor, at:Date.now(), name:value.visual_alias || value.role_label || '角色'})).slice(0, 12).toUpperCase();
  return {
    card_id:cardId, role_label:text(value.role_label, 100) || '待确认', original_name:text(value.original_name, 80),
    visual_alias:text(value.visual_alias, 100) || '新增角色（待补充）', importance:['important','ordinary','incidental'].includes(value.importance) ? value.importance : 'ordinary',
    narrative_function:'用户新增角色，待补充原片事实', relationships:[], appearances:[], visible_appearance:[], visible_actions:[],
    verified_dialogue:[], verified_ocr:[], confirmed_facts:[], unresolved:['请补充该角色的原片证据与出场镜头。'], name_evidence:[], relationship_evidence:[],
    first_appearance_shot:null, first_appearance_evidence:[], evidence_status:'manual_unverified',
    identity_assessment:{status:'manual_draft', confidence:'none', reason:'用户新增角色，尚未绑定原片证据。'}, name_binding:{status:'unbound', visual_card_id:null}, status:'user_edited'
  };
}

function sourceVisualClusters({ledger, story, fullEvidenceIndex}) {
  const shotByFrame = new Map((fullEvidenceIndex?.frames || []).map(frame => [frame.frame_id, String(frame.shot_id)]));
  const clusters = new Map();
  for (const row of story?.gemini_sidecar?.frame_observations || []) {
    const shotId = shotByFrame.get(String(row?.frame_id || ''));
    if (!shotId) continue;
    for (const subject of row?.visual_subjects || []) {
      const key = text(subject?.continuity_key, 180);
      if (!key || subject?.uncertain === true) continue;
      const cluster = clusters.get(key) || {key, appearances:[], visible_appearance:[], visible_actions:[], frames:[], frame_shots:{}};
      cluster.appearances.push(shotId);
      cluster.frames.push(String(row.frame_id));
      cluster.frame_shots[String(row.frame_id)] = shotId;
      cluster.visible_appearance.push(text(subject.visible_description, 400));
      cluster.visible_actions.push(text(subject.visible_action, 400));
      clusters.set(key, cluster);
    }
  }
  return [...clusters.values()].filter(cluster => unique(cluster.appearances, 80).length).map(cluster => ({...cluster, appearances:unique(cluster.appearances, 80), frames:unique(cluster.frames, 24), visible_appearance:unique(cluster.visible_appearance, 16), visible_actions:unique(cluster.visible_actions, 16)}));
}
function cardFromCluster(cluster, ledger) {
  const cardId = 'RC-VISUAL-' + sha256(cluster.key).slice(0, 12).toUpperCase();
  const dialogue = [], ocr = [];
  for (const shot of ledger.shots || []) if (cluster.appearances.includes(String(shot.shot_id))) {
    dialogue.push(...(shot.dialogue_ids || []).map(id => ledger.dialogue_rows?.find(row => row.dialogue_id === id)?.source_text).filter(Boolean));
    ocr.push(...(shot.ocr_ids || []).map(id => ledger.ocr_rows?.find(row => row.ocr_id === id)?.source_text).filter(Boolean));
  }
  return {card_id:cardId, role_label:'视觉人物（待命名）', original_name:'', visual_alias:cluster.key, importance:cluster.appearances.length >= 3 ? 'important' : 'ordinary', narrative_function:'由完整原片视觉连续性聚合，等待姓名与关系的直接证据。', relationships:[], appearances:cluster.appearances, visible_appearance:cluster.visible_appearance, visible_actions:cluster.visible_actions, verified_dialogue:unique(dialogue, 16), verified_ocr:unique(ocr, 16), confirmed_facts:['完整原片帧中出现的同一视觉连续性候选。'], name_evidence:[], relationship_evidence:[], first_appearance_shot:cluster.appearances[0] || null, first_appearance_evidence:cluster.frames.slice(0, 4).map(frame_id => ({frame_id, shot_id:cluster.frame_shots?.[frame_id] || cluster.appearances[0] || null, kind:'source_frame', status:'available'})), evidence_status:'visual_identity_confirmed_name_unbound', unresolved:['尚无直接可定位的姓名证据，不能将原剧姓名自动绑定到该视觉人物。'], identity_assessment:{status:'system_identified', confidence:cluster.appearances.length >= 3 ? 'high' : 'medium', reason:'基于完整原片帧的连续性键、相邻镜头、可见外观、动作与空间位置聚合；服装仅为辅助信息。'}, name_binding:{status:'unbound', visual_card_id:cardId}, status:'system_identified'};
}
function derive({project, ledger, story, fullEvidenceIndex = null, previous = null}) {
  const cards = sourceVisualClusters({ledger, story, fullEvidenceIndex}).map(cluster => cardFromCluster(cluster, ledger));
  const names = new Set();
  for (const row of ledger.dialogue_rows || []) {
    const match = String(row.source_text || '').match(/^([\u4e00-\u9fa5]{2,4})[，,:：]/);
    if (match && !['他们','同样','可以'].includes(match[1])) names.add(match[1]);
  }
  for (const name of names) {
    if (!cards.some(card => card.original_name === name || card.visual_alias === name)) cards.push(namedSeed(name, ledger));
  }
  const seen = new Set();
  const clean = cards.filter(card => { const key = card.card_id; if (seen.has(key)) return false; seen.add(key); return true; });
  const preservedUserRevisions = (previous?.revisions || []).filter(row => ['save_draft','confirm','add','delete'].includes(row.action));
  return finalize({schema_version:SCHEMA, derivation_version:DERIVATION_VERSION, project_id:project.id, source_ledger_snapshot_id:ledger.snapshot_id, source_ledger_snapshot_sha256:ledger.snapshot_sha256, story_snapshot_id:story?.snapshot_id || null, full_evidence_index_sha256:fullEvidenceIndex?.index_sha256 || null, cards:clean, revisions:[], preserved_user_revisions:preservedUserRevisions, created_at:now(), updated_at:now()});
}
async function get({root, project}) { return readJson(statePath(root, project), null); }
async function generate({root, project, ledger, story, fullEvidenceIndex = null}) { const current = await get({root, project}); if (current?.source_ledger_snapshot_sha256 === ledger.snapshot_sha256 && current.derivation_version === DERIVATION_VERSION && current.full_evidence_index_sha256 === (fullEvidenceIndex?.index_sha256 || null)) return current; const state = derive({project, ledger, story, fullEvidenceIndex, previous:current}); await writeAtomic(statePath(root, project), state); return state; }
async function revise({root, project, ledger, ifMatch, idempotencyKey, body, actor}) {
  const current = await get({root, project});
  if (!current) throw error('STEP01_ROLE_CARDS_NOT_READY', 409, '请先生成角色卡');
  if (current.source_ledger_snapshot_sha256 !== ledger.snapshot_sha256) throw error('STEP01_ROLE_CARDS_LEDGER_SUPERSEDED', 409, '原片权威时间轴已更新，请重新生成角色卡');
  const replayKey = text(idempotencyKey, 180);
  if (!replayKey) throw error('STEP01_ROLE_CARDS_IDEMPOTENCY_REQUIRED', 422, '缺少 Idempotency-Key');
  if ((current.revisions || []).some(revision => revision.idempotency_key === replayKey)) return current;
  if (!ifMatch || String(ifMatch).replace(/^W\//, '') !== etag(current)) throw error('STEP01_ROLE_CARDS_REVISION_CONFLICT', 409, '角色卡已变化，请刷新后重试');
  const action = text(body?.action || 'save_draft', 40);
  if (action === 'add') {
    const added = manualCard(body?.card, actor);
    const next = clone(current); next.cards.push(added); next.updated_at = now();
    next.revisions.push({schema_version:REVISION_SCHEMA, revision_id:'S01ROLEREV-' + sha256(canonical({actor, action, cardId:added.card_id, at:Date.now()})).slice(0, 20), idempotency_key:replayKey, card_id:added.card_id, action, reason:text(body?.reason, 800), created_by:sha256(String(actor || 'unknown')), created_at:next.updated_at});
    const finalized = finalize(next); await writeAtomic(statePath(root, project), finalized); return finalized;
  }
  if (!['save_draft','confirm','delete'].includes(action)) throw error('STEP01_ROLE_CARD_ACTION_INVALID', 422, '角色卡操作无效');
  const cardId = text(body?.card_id, 120); const original = current.cards.find(card => card.card_id === cardId);
  if (!original) throw error('STEP01_ROLE_CARD_NOT_FOUND', 404, '角色卡不存在');
  const next = clone(current); const index = next.cards.findIndex(card => card.card_id === cardId);
  const revised = action === 'delete' ? {...clone(original), status:'deleted', deleted_at:now()} : normalizeCard(body?.card, original);
  revised.status = action === 'confirm' ? 'confirmed' : (action === 'delete' ? 'deleted' : 'user_edited');
  next.cards[index] = revised;
  next.updated_at = now();
  next.revisions.push({schema_version:REVISION_SCHEMA, revision_id:'S01ROLEREV-' + sha256(canonical({actor, cardId, action, at:Date.now(), card:revised})).slice(0, 20), idempotency_key:replayKey, card_id:cardId, action, reason:text(body?.reason, 800), created_by:sha256(String(actor || 'unknown')), created_at:next.updated_at});
  const finalized = finalize(next); await writeAtomic(statePath(root, project), finalized); return finalized;
}

module.exports = {SCHEMA, REVISION_SCHEMA, DERIVATION_VERSION, get, generate, revise, etag, allImportantConfirmed, derive, error};
