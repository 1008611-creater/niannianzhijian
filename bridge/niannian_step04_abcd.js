const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

// The website bridge and the local compiler must emit the same contract family.
// The old niannian.v1 envelope is retained only in archived fixtures.
const SCHEMA = 'mx_shortdrama_step04_abcd_contract_v2';
const LAYERS = Object.freeze(['A_entity_binding', 'B_asset_continuity', 'C_prompt_ir', 'D_delivery_manifest']);
const SEMANTIC_ALIGNMENT_POLICY = 'continuous_observation_local_interval_plus_segment_start; never_ordinal_shot_mapping';

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(Buffer.isBuffer(value) ? value : String(value)).digest('hex');
}

function contractDigest(contract) {
  const payload = {...contract};
  delete payload.contract_sha256;
  return sha256(canonical(payload));
}

function codedError(code, status, message) {
  const error = new Error(message || code);
  error.code = code;
  error.status = status;
  return error;
}

function array(value) { return Array.isArray(value) ? value : []; }

const PROMPT_BOILERPLATE = Object.freeze([
  '当前发言或反应带来视线、表情或手势的自然变化。',
  '当前发言或反应带来视线、表情或手势自然变化。',
  '保持空间状态。'
]);

function compactFact(value) {
  let text = String(value || '').replace(/\s+/g, ' ').trim();
  for (const phrase of PROMPT_BOILERPLATE) text = text.split(phrase).join('');
  const clauses = text.split(/(?<=[。！？；;])/).map(part => part.trim().replace(/^[ ；;，,]+|[ ；;，,]+$/g, '')).filter(Boolean);
  const seen = new Set();
  return clauses.filter(clause => {
    const key = clause.replace(/\s+/g, '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join('；');
}

function relativeSecondsRange(startMs, endMs, groupStartMs) {
  return `${((Number(startMs) - Number(groupStartMs)) / 1000).toFixed(3)}–${((Number(endMs) - Number(groupStartMs)) / 1000).toFixed(3)}秒`;
}

function compactEventLines(events, namesByInstance, groupStartMs = 0) {
  const lines = [];
  let previousEndState = '';
  for (const event of events) {
    const subject = namesByInstance.get(String(event.subject_instance_id || '')) || '';
    const objectName = namesByInstance.get(String(event.object_instance_id || '')) || '';
    const startState = compactFact(event.start_state);
    const endState = compactFact(event.end_state);
    let change = compactFact(event.change || event.action);
    let dialogueText = '';
    if (event.dialogue) {
      dialogueText = compactFact(event.dialogue.text || event.dialogue.content);
      for (const duplicate of [
        `在动作末段说“${dialogueText}”`,
        `在动作末段说"${dialogueText}"`,
        `说“${dialogueText}”`,
        `说"${dialogueText}"`
      ]) change = change.split(duplicate).join('');
      change = compactFact(change);
    }
    let transition = '';
    if (startState && startState !== previousEndState) transition += `起[${startState}]`;
    if (change) transition += `${transition ? '→' : ''}${change}`;
    if (endState && endState !== startState) transition += `${transition ? '→' : ''}止[${endState}]`;
    let line = `${relativeSecondsRange(event.timecode_ms[0], event.timecode_ms[1], groupStartMs)}：${subject}${transition}`;
    if (objectName) line += `；对象${objectName}`;
    if (event.dialogue) {
      const dialogue = event.dialogue;
      const speaker = namesByInstance.get(String(dialogue.speaker_instance_id || dialogue.speaker_id || '')) || '';
      line += `；${speaker}说“${dialogueText}”`;
    }
    lines.push(line);
    previousEndState = endState || previousEndState;
  }
  return lines;
}

function compactSound(value, hasDialogue) {
  let text = compactFact(value);
  if (hasDialogue) {
    text = text.replace(/对白由[^；。]*说出/g, '').replace(/对白[^；。]*/g, '');
    text = compactFact(text);
  }
  return text;
}

function assertChineseDisplayName(value, assetId) {
  const displayName = String(value || '');
  if (!/^@[\u3400-\u9fff]+$/.test(displayName)) {
    throw codedError('STEP04_ASSET_DISPLAY_NAME_INVALID', 409, `资产 ${assetId} 必须使用纯中文 @ 名称`);
  }
  return displayName;
}

function assertSha256(value, label) {
  const sha = String(value || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha)) throw codedError('STEP04_SHA256_INVALID', 409, `${label} 必须是 SHA-256`);
  return sha;
}

function assertSafeProjectId(value) {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id) || id === '.' || id === '..') {
    throw codedError('STEP04_PROJECT_ID_INVALID', 422, '项目 ID 无效');
  }
  return id;
}

function fileSha256(exactPath) {
  if (!exactPath || !fs.existsSync(exactPath)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(exactPath)).digest('hex');
}

function shotId(value) {
  const id = String(value || '').trim();
  if (!/^S?\d{1,5}$/i.test(id)) throw codedError('STEP04_SHOT_ID_INVALID', 422, '镜头 ID 无效');
  return id.toUpperCase().startsWith('S') ? id.toUpperCase() : 'S' + id.padStart(3, '0');
}

function slotShotId(id) {
  return String(id).replace(/^S/i, '').padStart(3, '0');
}

function assertSemanticGate(manifest) {
  if (!manifest || typeof manifest !== 'object') throw codedError('STEP04_STEP02_MANIFEST_REQUIRED', 422, '缺少 Step02 语义验收清单');
  const failures = [];
  if (manifest.status !== 'accepted') failures.push(`status=${manifest.status || 'missing'}`);
  if (manifest.semantic_status !== 'accepted') failures.push(`semantic_status=${manifest.semantic_status || 'missing'}`);
  if (manifest.acceptance_mode !== 'semantic') failures.push(`acceptance_mode=${manifest.acceptance_mode || 'missing'}`);
  const alignment = manifest.semantic_alignment || {};
  if (alignment.status !== 'accepted') failures.push(`semantic_alignment.status=${alignment.status || 'missing'}`);
  if (alignment.mapping_policy !== SEMANTIC_ALIGNMENT_POLICY) failures.push('semantic_alignment.mapping_policy=invalid');
  const semanticUnitIds = new Set(array(alignment.semantic_unit_ids).map(String).filter(Boolean));
  if (!semanticUnitIds.size) failures.push('semantic_alignment.semantic_unit_ids=missing');
  const cards = array(manifest.cards);
  const contextShots = new Set(array(manifest.asset_requirements).filter(row => ['scene','prop'].includes(String(row?.kind || ''))).flatMap(row => array(row.required_shot_ids).map(shotId)));
  const seen = new Set();
  let previousEnd = -1;
  let previousShotNumber = 0;
  for (const card of cards) {
    const id = shotId(card.shot_id);
    const shotNumber = Number(id.slice(1));
    if (seen.has(id)) failures.push(`${id}:duplicate_shot_id`);
    seen.add(id);
    const start = Number(card.source_start_ms ?? card.start_ms ?? card.source_start_sec * 1000);
    const end = Number(card.source_end_ms ?? card.end_ms ?? card.source_end_sec * 1000);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) failures.push(`${id}:invalid_time_range`);
    if (Number.isFinite(start) && start < previousEnd) failures.push(`${id}:time_overlap_or_out_of_order`);
    if (Number.isFinite(end)) previousEnd = end;
    if (shotNumber <= previousShotNumber) failures.push(`${id}:shot_order_invalid`);
    previousShotNumber = shotNumber;
    const verdict = String(card.verdict || card.terra_audit?.verdict || '').toLowerCase();
    if (card.needs_targeted_recheck === true || card.terra_audit?.needs_targeted_recheck === true) failures.push(`${card.shot_id}:needs_targeted_recheck`);
    if (['conflict', 'uncertain'].includes(verdict)) failures.push(`${card.shot_id}:verdict=${verdict}`);
    if (verdict && verdict !== 'pass') failures.push(`${card.shot_id}:verdict=${verdict}`);
    if (!verdict) failures.push(`${card.shot_id}:missing_verdict`);
    if (!array(card.evidence_ids).length && !array(card.terra_audit?.evidence_paths).length) failures.push(`${id}:evidence_missing`);
    const hasEntities = array(card.entity_instances || card.person_instances || card.entities).length > 0;
    if (!hasEntities && !contextShots.has(id)) failures.push(`${id}:entity_instances_missing`);
    if (!array(card.event_blocks || card.events).length && hasEntities) failures.push(`${id}:event_blocks_missing`);
    const units = array(card.semantic_unit_ids).map(String).filter(Boolean);
    if (!units.length || units.some(unitId => !semanticUnitIds.has(unitId))) failures.push(`${id}:semantic_unit_binding_invalid`);
    for (const [index, event] of array(card.event_blocks || card.events).entries()) {
      const timecode = array(event?.timecode_ms || event?.time_ms);
      if (timecode.length !== 2 || !timecode.every(value => Number.isFinite(Number(value)))) failures.push(`${id}:event_${index + 1}:timecode_missing`);
      if (!array(event?.evidence_ids).length) failures.push(`${id}:event_${index + 1}:evidence_missing`);
    }
  }
  if (!cards.length) failures.push('cards=0');
  if (failures.length) {
    const error = codedError('STEP04_STEP02_SEMANTIC_GATE_BLOCKED', 409, 'Step02 事实尚未语义放行，不能编译 Step04');
    error.details = { failed_checks: failures.slice(0, 200), failed_count: failures.length };
    throw error;
  }
  return true;
}

function normalizeIdentityBindings(bindings) {
  const rows = array(bindings?.bindings || bindings);
  const normalized = [];
  const failures = [];
  rows.forEach((row, index) => {
    const shotIds = array(row?.shot_ids).map(shotId);
    const instanceIdsByShot = {};
    const rawInstanceIds = row?.instance_ids;
    if (rawInstanceIds && typeof rawInstanceIds === 'object' && !Array.isArray(rawInstanceIds)) {
      for (const [rawShot, rawInstanceId] of Object.entries(rawInstanceIds)) {
        if (String(rawInstanceId || '').trim()) instanceIdsByShot[shotId(rawShot)] = String(rawInstanceId).trim();
      }
    } else if (Array.isArray(rawInstanceIds)) {
      if (rawInstanceIds.length !== shotIds.length) failures.push(`bindings[${index}].instance_ids`);
      else shotIds.forEach((shot, shotIndex) => { if (String(rawInstanceIds[shotIndex] || '').trim()) instanceIdsByShot[shot] = String(rawInstanceIds[shotIndex]).trim(); });
    } else if (String(row?.instance_id || '').trim()) {
      if (shotIds.length !== 1) failures.push(`bindings[${index}].instance_id_requires_one_shot`);
      else instanceIdsByShot[shotIds[0]] = String(row.instance_id).trim();
    }
    const normalizedRow = {
      binding_id: String(row?.binding_id || ''),
      canonical_role: String(row?.canonical_role || ''),
      target_ref: String(row?.target_ref || row?.localized_ref || ''),
      target_asset: String(row?.target_asset || ''),
      identity_status: String(row?.identity_status || row?.status || ''),
      shot_ids: shotIds,
      evidence_ids: array(row?.evidence_ids).map(String).filter(Boolean),
      instance_ids_by_shot: instanceIdsByShot
    };
    if (!normalizedRow.binding_id) failures.push(`bindings[${index}].binding_id`);
    if (!normalizedRow.canonical_role) failures.push(`bindings[${index}].canonical_role`);
    if (!normalizedRow.target_ref || !normalizedRow.target_ref.startsWith('@')) failures.push(`bindings[${index}].target_ref`);
    if (!/^@[\u3400-\u9fff]+$/.test(normalizedRow.target_ref)) failures.push(`bindings[${index}].target_ref_chinese`);
    if (!normalizedRow.target_asset) failures.push(`bindings[${index}].target_asset`);
    if (normalizedRow.identity_status !== 'resolved') failures.push(`bindings[${index}].identity_status`);
    if (!normalizedRow.shot_ids.length) failures.push(`bindings[${index}].shot_ids`);
    if (!normalizedRow.evidence_ids.length) failures.push(`bindings[${index}].evidence_ids`);
    normalized.push(normalizedRow);
  });
  const seen = new Set();
  for (const row of normalized) {
    for (const shot of row.shot_ids) {
      const instanceId = row.instance_ids_by_shot[shot] || `${shot}:${row.target_asset}`;
      const key = `${shot}|${row.target_asset}|${row.target_ref}|${instanceId}`;
      if (seen.has(key)) failures.push(`duplicate:${key}`);
      seen.add(key);
    }
  }
  if (failures.length) {
    const error = codedError('STEP04_IDENTITY_BINDING_INVALID', 409, '身份绑定存在未闭合字段');
    error.details = {fields: failures};
    throw error;
  }
  return normalized;
}

function bindingsForShot(bindings, id) {
  return bindings.filter(row => row.shot_ids.includes(id));
}

function buildEntityLayer({cards, identityBindings, assetRequirements = []}) {
  const entities = [];
  const contextShots = new Set(normalizeAssetRequirements(assetRequirements).flatMap(row => row.required_shot_ids));
  for (const card of cards) {
    const id = shotId(card.shot_id);
    const rows = bindingsForShot(identityBindings, id);
    const instances = array(card.entity_instances || card.person_instances || card.entities);
    if (!instances.length && !rows.length && contextShots.has(id)) continue;
    if (!instances.length || !rows.length) throw codedError('STEP04_ENTITY_BINDING_MISSING', 409, `${id} 缺少镜头人物实例或已验收身份绑定`);
    const authoritative = rows.map(row => ({
      instance_id: row.instance_ids_by_shot[id] || `${id}:${row.target_asset}`,
      shot_id: id,
      role_ref: row.target_ref,
      source_role: row.canonical_role,
      asset_id: row.target_asset,
      evidence_ids: row.evidence_ids,
      status: row.identity_status
    }));
    const byAsset = new Map();
    for (const item of authoritative) (byAsset.get(item.asset_id) || (byAsset.set(item.asset_id, []), byAsset.get(item.asset_id))).push(item);
    for (const [assetId, assetRows] of byAsset) {
      if (assetRows.length > 1 && assetRows.some(item => item.instance_id === `${id}:${assetId}`)) {
        throw codedError('STEP04_ENTITY_INSTANCE_ID_AMBIGUOUS', 409, `${id} 同一资产在同一镜头缺少唯一 instance_id`);
      }
      if (assetRows.length > 1 && new Set(assetRows.map(item => item.instance_id)).size !== assetRows.length) {
        throw codedError('STEP04_ENTITY_INSTANCE_ID_AMBIGUOUS', 409, `${id} 同一资产的 instance_id 重复`);
      }
    }
    if (instances.length) {
      const supplied = instances.map(row => ({
        instance_id: String(row.instance_id || `${id}:${row.target_asset || row.asset_id || ''}`),
        role_ref: String(row.target_ref || row.role_ref || ''),
        asset_id: String(row.target_asset || row.asset_id || ''),
        source_role: String(row.canonical_role || row.source_role || ''),
        status: String(row.identity_status || row.status || ''),
        evidence_ids: array(row.evidence_ids).map(String).filter(Boolean),
      }));
      for (const row of supplied) {
        if (!row.evidence_ids?.length || !/^@[\u3400-\u9fff]+$/.test(row.role_ref)) throw codedError('STEP04_ENTITY_INSTANCE_UNRESOLVED', 409, `${id} 卡片人物实例缺少中文身份引用或证据`);
        const match = authoritative.find(item => item.asset_id === row.asset_id && item.role_ref === row.role_ref);
        if (!match || row.status !== 'resolved') throw codedError('STEP04_ENTITY_BINDING_MISMATCH', 409, `${id} 卡片人物实例与权威身份绑定不一致`);
      }
      const suppliedKeys = new Set(supplied.map(row => `${row.instance_id}|${row.asset_id}|${row.role_ref}`));
      const authoritativeKeys = new Set(authoritative.map(row => `${row.instance_id}|${row.asset_id}|${row.role_ref}`));
      if (suppliedKeys.size !== authoritativeKeys.size || [...authoritativeKeys].some(key => !suppliedKeys.has(key))) {
        throw codedError('STEP04_ENTITY_BINDING_MISMATCH', 409, `${id} 卡片人物实例集合与权威身份绑定不一致`);
      }
    }
    for (const row of authoritative) {
      const instance = {
        instance_id: row.instance_id,
        shot_id: id,
        role_ref: row.role_ref,
        source_role: row.source_role,
        asset_id: row.asset_id,
        evidence_ids: row.evidence_ids,
        status: row.status
      };
      if (!instance.role_ref || !instance.asset_id || instance.status !== 'resolved') throw codedError('STEP04_ENTITY_INSTANCE_UNRESOLVED', 409, `${id} 存在未闭合人物实例`);
      entities.push(instance);
    }
  }
  const duplicate = new Set();
  for (const entity of entities) {
    if (duplicate.has(`${entity.shot_id}:${entity.instance_id}`)) throw codedError('STEP04_ENTITY_INSTANCE_DUPLICATE', 409, `${entity.shot_id} 人物实例重复`);
    duplicate.add(`${entity.shot_id}:${entity.instance_id}`);
  }
  return { schema_version: 'niannian.step04a_entity_binding.v1', entities };
}

function normalizeAssetRequirements(value) {
  const requirements = array(value);
  const seen = new Set();
  const normalized = requirements.map((row, index) => {
    const assetId = String(row?.asset_id || row?.id || '');
    const kind = String(row?.kind || '');
    const purpose = String(row?.purpose || '').trim();
    const evidenceIds = array(row?.evidence_ids).map(String).filter(Boolean);
    const requiredShotIds = array(row?.required_shot_ids).map(shotId);
    if (!assetId || !['scene', 'prop'].includes(kind) || !purpose || !evidenceIds.length || !requiredShotIds.length) {
      throw codedError('STEP04_ASSET_REQUIREMENT_INVALID', 409, `资产需求 ${index + 1} 缺少 asset_id/kind/purpose/evidence_ids/required_shot_ids`);
    }
    requiredShotIds.forEach(id => {
      const key = `${assetId}|${id}`;
      if (seen.has(key)) throw codedError('STEP04_ASSET_REQUIREMENT_DUPLICATE', 409, `资产 ${assetId} 在 ${id} 重复声明`);
      seen.add(key);
    });
    return {asset_id:assetId, kind, purpose, evidence_ids:evidenceIds, required_shot_ids:[...new Set(requiredShotIds)]};
  });
  const byShot = new Map();
  for (const row of normalized) {
    for (const shot of row.required_shot_ids) {
      const key = `${shot}|${row.asset_id}`;
      if (byShot.has(key)) throw codedError('STEP04_ASSET_REQUIREMENT_DUPLICATE', 409, `资产 ${row.asset_id} 在 ${shot} 重复声明`);
      byShot.set(key, row.kind);
    }
  }
  return normalized;
}

function verifiedAsset(assetId, asset, fallbackName, fallbackPurpose) {
  const exactPath = String(asset?.exact_path || asset?.path || '');
  const sha = String(asset?.sha256 || '');
  const status = String(asset?.status || '');
  if (!exactPath || !sha) throw codedError('STEP04_ASSET_REFERENCE_INCOMPLETE', 409, `资产 ${assetId} 缺少路径或 SHA-256`);
  if (status !== 'accepted') throw codedError('STEP04_ASSET_NOT_ACCEPTED', 409, `资产 ${assetId} 尚未验收`);
  const displayName = assertChineseDisplayName(asset?.display_name || fallbackName, assetId);
  const actualSha = fileSha256(exactPath);
  if (!actualSha || actualSha !== sha) throw codedError('STEP04_ASSET_SHA_MISMATCH', 409, `资产 ${assetId} 文件摘要不匹配`);
  const imagePrompt = String(asset?.generation_prompt || asset?.image_prompt || asset?.prompt || '').trim();
  if (!imagePrompt) throw codedError('STEP04_ASSET_PROMPT_MISSING', 409, `资产 ${assetId} 缺少已验收的生图提示词`);
  return {exact_path:exactPath, sha256:sha, status, display_name:displayName, purpose:String(asset?.purpose || fallbackPurpose), image_prompt:imagePrompt, evidence_path:String(asset?.evidence_path || '')};
}

function buildAssetLayer({entities, assetRegistry, assetRequirements = [], shotIds = []}) {
  const registry = new Map();
  const duplicateAssetIds = [];
  for (const asset of array(assetRegistry?.assets || assetRegistry)) {
    const assetId = String(asset?.asset_id || asset?.id || '');
    if (!assetId) throw codedError('STEP04_ASSET_ID_MISSING', 409, '资产注册表存在缺少 asset_id 的条目');
    if (registry.has(assetId)) duplicateAssetIds.push(assetId);
    registry.set(assetId, asset);
  }
  if (duplicateAssetIds.length) throw codedError('STEP04_ASSET_REGISTRY_DUPLICATE', 409, `资产注册表存在重复 asset_id: ${[...new Set(duplicateAssetIds)].join(',')}`);
  const slots = [];
  const slotKeys = new Set();
  const slotsByShotAsset = new Map();
  for (const entity of entities) {
    const asset = registry.get(entity.asset_id);
    if (!asset) throw codedError('STEP04_ASSET_REFERENCE_MISSING', 409, `资产 ${entity.asset_id} 未登记`);
    const verified = verifiedAsset(entity.asset_id, asset, entity.role_ref, '锁定人物身份与连续性');
    const allowed = array(asset.allowed_instance_ids || asset.allowedInstanceIds).map(String);
    if (!allowed.includes(entity.instance_id) && allowed.length) throw codedError('STEP04_ASSET_INSTANCE_NOT_ALLOWED', 409, `资产 ${entity.asset_id} 不允许用于 ${entity.instance_id}`);
    const shotAssetKey = `${entity.shot_id}|${entity.asset_id}`;
    const existingCharacterSlot = slotsByShotAsset.get(shotAssetKey);
    if (existingCharacterSlot) {
      existingCharacterSlot.allowed_instance_ids = [...new Set([...(existingCharacterSlot.allowed_instance_ids || []), entity.instance_id])];
      existingCharacterSlot.evidence_ids = [...new Set([...(existingCharacterSlot.evidence_ids || []), ...entity.evidence_ids])];
      continue;
    }
    const characterSlotId = `REF-${slotShotId(entity.shot_id)}-${entity.asset_id}`;
    if (slotKeys.has(characterSlotId)) throw codedError('STEP04_REFERENCE_SLOT_DUPLICATE', 409, `参考槽位重复: ${characterSlotId}`);
    slotKeys.add(characterSlotId);
    const characterSlot = {
      // Stable slot IDs are shared with the Python compiler: one slot per
      // shot/asset, while the allowed instance list preserves identity.
      reference_slot_id: characterSlotId,
      shot_id: entity.shot_id,
      instance_id: entity.instance_id,
      asset_id: entity.asset_id,
      display_name: verified.display_name,
      role_ref: entity.role_ref,
       kind: 'character',
       purpose: verified.purpose,
       image_prompt: verified.image_prompt,
      evidence_ids: entity.evidence_ids,
      allowed_instance_ids: [entity.instance_id],
       evidence_path: verified.evidence_path,
      exact_path: verified.exact_path,
      sha256: verified.sha256,
      status: verified.status
    };
    slots.push(characterSlot);
    slotsByShotAsset.set(shotAssetKey, characterSlot);
  }
  const validShots = new Set([...shotIds, ...entities.map(entity => entity.shot_id)]);
  for (const requirement of normalizeAssetRequirements(assetRequirements)) {
    const asset = registry.get(requirement.asset_id);
    if (!asset) throw codedError('STEP04_ASSET_REFERENCE_MISSING', 409, `资产 ${requirement.asset_id} 未登记`);
    const verified = verifiedAsset(requirement.asset_id, asset, String(asset.display_name || ''), requirement.purpose);
    requirement.required_shot_ids.forEach(id => {
      if (!validShots.has(id)) throw codedError('STEP04_ASSET_REQUIREMENT_SHOT_INVALID', 409, `资产 ${requirement.asset_id} 指向没有人物实例的 ${id}`);
      const contextSlotId = `REF-${slotShotId(id)}-${requirement.asset_id}`;
      if (slotKeys.has(contextSlotId)) throw codedError('STEP04_REFERENCE_SLOT_DUPLICATE', 409, `参考槽位重复: ${contextSlotId}`);
      slotKeys.add(contextSlotId);
      slots.push({reference_slot_id:contextSlotId,shot_id:id,instance_id:'',asset_id:requirement.asset_id,display_name:verified.display_name,role_ref:'',kind:requirement.kind,purpose:requirement.purpose,image_prompt:verified.image_prompt,evidence_path:verified.evidence_path,evidence_ids:requirement.evidence_ids,allowed_instance_ids:[],exact_path:verified.exact_path,sha256:verified.sha256,status:verified.status});
    });
  }
  return { schema_version: 'niannian.step04b_asset_continuity.v2', reference_slots: slots };
}

function buildPromptLayer({cards, entities, referenceSlots}) {
  const entitiesByShot = new Map();
  for (const entity of entities) (entitiesByShot.get(entity.shot_id) || (entitiesByShot.set(entity.shot_id, []), entitiesByShot.get(entity.shot_id))).push(entity);
  const slotsByShot = new Map();
  for (const slot of referenceSlots) (slotsByShot.get(slot.shot_id) || (slotsByShot.set(slot.shot_id, []), slotsByShot.get(slot.shot_id))).push(slot);
  const promptGroups = cards.map(card => {
    const id = shotId(card.shot_id);
    const people = entitiesByShot.get(id) || [];
    const refs = slotsByShot.get(id) || [];
    if (!refs.length) throw codedError('STEP04_PROMPT_REFERENCE_CONSUMPTION_MISSING', 409, `${id} 没有可消费的镜头参考`);
    const events = array(card.event_blocks || card.events);
    if (!events.length && people.length) throw codedError('STEP04_EVENT_BLOCK_MISSING', 409, `${id} 没有事件块`);
    const entityIds = new Set(people.map(entity => entity.instance_id));
    const slotIds = new Set(refs.map(slot => slot.reference_slot_id));
    const shotStart = Number(card.source_start_ms ?? card.start_ms ?? card.source_start_sec * 1000);
    const shotEnd = Number(card.source_end_ms ?? card.end_ms ?? card.source_end_sec * 1000);
    let previousEnd = shotStart;
    const normalizedEvents = events.map((event, eventIndex) => {
      const timecode = array(event.timecode_ms || event.time_ms || []).map(Number);
      if (timecode.length !== 2 || !timecode.every(Number.isFinite) || timecode[1] <= timecode[0]) throw codedError('STEP04_EVENT_TIMECODE_INVALID', 409, `${id} 事件 ${eventIndex + 1} 时间无效`);
      if (timecode[0] < shotStart || timecode[1] > shotEnd || timecode[0] < previousEnd) throw codedError('STEP04_EVENT_TIMECODE_INVALID', 409, `${id} 事件 ${eventIndex + 1} 越出镜头或乱序`);
      previousEnd = timecode[1];
      if (!entityIds.has(String(event.subject_instance_id || ''))) throw codedError('STEP04_EVENT_SUBJECT_INVALID', 409, `${id} 事件 ${eventIndex + 1} 主语未绑定`);
      if (event.object_instance_id && !entityIds.has(String(event.object_instance_id))) throw codedError('STEP04_EVENT_OBJECT_INVALID', 409, `${id} 事件 ${eventIndex + 1} 客体未绑定`);
      const dialogue = event.dialogue || null;
      if (dialogue) {
        const speaker = String(dialogue.speaker_instance_id || dialogue.speaker_id || '');
        if (/unknown|未确认|人物[AB]/i.test(speaker)) throw codedError('STEP04_DIALOGUE_SPEAKER_UNRESOLVED', 409, `${id} 对白说话人未闭合`);
        if (!speaker || !entityIds.has(speaker)) throw codedError('STEP04_DIALOGUE_SPEAKER_INVALID', 409, `${id} 对白说话人未绑定`);
        if (!String(dialogue.text || dialogue.content || '').trim()) throw codedError('STEP04_DIALOGUE_TEXT_MISSING', 409, `${id} 对白缺少台词文本`);
        const dt = array(dialogue.timecode_ms || dialogue.time_ms).map(Number);
        if (dt.length !== 2 || !dt.every(Number.isFinite) || dt[0] < timecode[0] || dt[1] > timecode[1] || dt[1] <= dt[0]) throw codedError('STEP04_DIALOGUE_TIMECODE_INVALID', 409, `${id} 对白必须有且只能有位于动作事件内的毫秒区间`);
        if (!array(dialogue.evidence_ids).length) throw codedError('STEP04_DIALOGUE_EVIDENCE_MISSING', 409, `${id} 对白缺少说话人/文本证据`);
      }
      if (!array(event.evidence_ids).length) throw codedError('STEP04_EVENT_EVIDENCE_MISSING', 409, `${id} 事件缺少证据`);
      if (!String(event.action || event.change || '').trim()) throw codedError('STEP04_EVENT_ACTION_MISSING', 409, `${id} 事件缺少动作变化`);
      if (!String(event.start_state || '').trim() || !String(event.end_state || '').trim()) throw codedError('STEP04_EVENT_STATE_MISSING', 409, `${id} 事件必须同时有起始状态和结束状态`);
      const refsUsed = array(event.reference_slot_ids || event.reference_slots).map(String);
      if (refsUsed.some(refId => !slotIds.has(refId))) throw codedError('STEP04_EVENT_REFERENCE_INVALID', 409, `${id} 事件引用了不存在的资产槽位`);
      const entityRefs = [...new Set([String(event.subject_instance_id || ''), String(event.object_instance_id || '')].filter(Boolean).map(instanceId => {
        const slot = refs.find(item => item.instance_id === instanceId || (item.allowed_instance_ids || []).includes(instanceId));
        if (!slot) throw codedError('STEP04_EVENT_REFERENCE_SLOT_MISSING', 409, `${id} 事件实例缺少人物参考槽位`);
        return slot.reference_slot_id;
      }))];
      const speakerInstanceId = dialogue ? String(dialogue.speaker_instance_id || dialogue.speaker_id || '') : '';
      const speakerRef = dialogue ? refs.find(item => item.instance_id === speakerInstanceId || (item.allowed_instance_ids || []).includes(speakerInstanceId))?.reference_slot_id : '';
      if (dialogue && !speakerRef) throw codedError('STEP04_DIALOGUE_REFERENCE_SLOT_MISSING', 409, `${id} 对白说话人缺少人物参考槽位`);
      if (speakerRef && !entityRefs.includes(speakerRef)) entityRefs.push(speakerRef);
      if (refsUsed.length && entityRefs.some(refId => !refsUsed.includes(refId))) throw codedError('STEP04_EVENT_REFERENCE_CONSUMPTION_MISSING', 409, `${id} 事件未消费其主语/客体/说话人人物参考槽位`);
      return {
        timecode_ms: timecode,
        subject_instance_id: String(event.subject_instance_id),
        object_instance_id: String(event.object_instance_id || ''),
        start_state: String(event.start_state || ''),
        action: String(event.action || event.change || ''),
        change: String(event.change || event.action || ''),
        end_state: String(event.end_state || ''),
        dialogue,
        evidence_ids: array(event.evidence_ids).map(String).filter(Boolean),
        reference_slot_ids: refsUsed.length ? [...new Set(refsUsed)] : entityRefs
      };
    });
    const declaredContextRefs = array(card.context_reference_slot_ids || card.context_reference_slots).map(String);
    if (declaredContextRefs.some(refId => !slotIds.has(refId))) throw codedError('STEP04_CONTEXT_REFERENCE_INVALID', 409, `${id} 场景/道具参考槽位不存在`);
    const requiredContextRefs = refs.filter(slot => ['scene', 'prop'].includes(slot.kind)).map(slot => slot.reference_slot_id);
    if (new Set(declaredContextRefs).size !== new Set(requiredContextRefs).size || requiredContextRefs.some(refId => !declaredContextRefs.includes(refId))) {
      throw codedError('STEP04_CONTEXT_REFERENCE_DECLARATION_MISMATCH', 409, `${id} 场景/道具参考槽位声明与 B 层不一致`);
    }
    const consumedRefs = new Set(normalizedEvents.flatMap(event => event.reference_slot_ids));
    for (const ref of refs.filter(slot => ['scene', 'prop'].includes(slot.kind))) {
      if (!consumedRefs.has(ref.reference_slot_id) && !declaredContextRefs.includes(ref.reference_slot_id)) {
        throw codedError('STEP04_CONTEXT_REFERENCE_UNCONSUMED', 409, `${id} 场景/道具参考槽位未被 C 层消费`);
      }
    }
    const requiredCharacterRefs = new Set(refs.filter(slot => slot.kind === 'character').map(slot => slot.reference_slot_id));
    const consumedCharacterRefs = new Set([...consumedRefs].filter(refId => refs.find(slot => slot.reference_slot_id === refId)?.kind === 'character'));
    if ([...requiredCharacterRefs].some(refId => !consumedCharacterRefs.has(refId))) {
      throw codedError('STEP04_CHARACTER_REFERENCE_UNCONSUMED', 409, `${id} 人物资产没有被事件实际消费`);
    }
    const namesByInstance = new Map(people.map(entity => [String(entity.instance_id), String(entity.role_ref || '')]));
    const compactScene = compactFact(card.scene_identity);
    const compactEnvironment = compactFact(card.environment_identity);
    const compactComposition = compactFact(card.composition || card['画面构图']);
    const compactCamera = compactFact(card.camera_motion_detail || card['镜头运动细节']);
    const compactLight = compactFact(card.lighting || card['光线氛围']);
    const compactSoundText = compactSound(card.audio_observation || card['声音与表演'], normalizedEvents.some(event => Boolean(event.dialogue)));
    const referenceNames = refs.map(slot => String(slot.display_name || slot.reference_key || '')).join('、');
    const rawReferenceNames = refs.map(slot => `${slot.display_name || slot.reference_key || ''}（${slot.purpose || slot.duty || ''}）`).join('；');
    const compactEvents = compactEventLines(normalizedEvents, namesByInstance, shotStart);
    const promptText = [
      `场景：${compactScene}`,
      `环境：${compactEnvironment}`,
      `参考图：${referenceNames}`,
      `构图：${id} ${relativeSecondsRange(shotStart, shotEnd, shotStart)}；${compactComposition}`,
      `变化：${compactEvents.join('；')}`,
      `镜头：${compactCamera}`,
      `光线：${compactLight}`,
      `声音：${compactSoundText}`
    ].filter(line => !line.endsWith('：')).join('\n');
    const rawPromptText = [
      `场景：${card.scene_identity || ''}`,
      `环境：${card.environment_identity || ''}`,
      `参考图：${rawReferenceNames}`,
      `构图：${id} ${shotStart}-${shotEnd}ms；${card.composition || card['画面构图'] || ''}`,
      `变化：${compactEvents.join('；')}`,
      `镜头：${card.camera_motion_detail || card['镜头运动细节'] || ''}`,
      `光线：${card.lighting || card['光线氛围'] || ''}`,
      `声音：${card.audio_observation || card['声音与表演'] || ''}`
    ].join('\n');
    return {
      group_id: `VG-${id}`,
      shot_id: id,
      source_start_ms: shotStart,
      source_end_ms: shotEnd,
      reference_slots: refs.map(slot => slot.reference_slot_id),
      context_reference_slots: declaredContextRefs,
      scene_identity: compactScene,
      environment_identity: compactEnvironment,
      composition: compactComposition,
      camera: compactCamera,
      light: compactLight,
      sound: compactSoundText,
      reference_text_policy: 'reference_locked_only_describe_temporal_changes',
      events: normalizedEvents,
      prompt_text: promptText,
      prompt_compression: {
        policy: 'references_lock_stable_facts; emit_temporal_changes_only; exact_boilerplate_dedupe',
        raw_chars: rawPromptText.length,
        compressed_chars: promptText.length,
        reduction_chars: Math.max(0, rawPromptText.length - promptText.length),
        reduction_ratio: rawPromptText ? Number(((rawPromptText.length - promptText.length) / rawPromptText.length).toFixed(4)) : 0
      }
    };
  });
  if (promptGroups.some(group => !group.scene_identity || !group.environment_identity || !group.composition || !group.camera || !group.light || !group.sound)) {
    throw codedError('STEP04_C_FACTS_MISSING', 409, 'C 层缺少场景、构图、镜头、光线或声音事实');
  }
  return {
    schema_version: 'niannian.step04c_prompt_ir.v4_compact',
    prompt_policy: {
      references_lock_stable_facts: true,
      emit_temporal_changes_only: true,
      dialogue_in_event: true,
      remove_exact_boilerplate_only: true,
      never_drop_structured_evidence: true
    },
    prompt_groups: promptGroups
  };
}

function buildDeliveryLayer({source, a, b, c}) {
  return {
    schema_version: 'niannian.step04d_delivery_manifest.v1',
    source: { project_id: String(source.project_id || ''), source_sha256: String(source.source_sha256 || ''), step02_acceptance_sha256: String(source.step02_acceptance_sha256 || '') },
    layers: { A: a.schema_version, B: b.schema_version, C: c.schema_version },
    outputs: { word: null, markdown: null, json: null },
    input_sha256: {
      A: sha256(canonical(a)),
      B: sha256(canonical(b)),
      C: sha256(canonical(c))
    },
    provider_calls: { image: false, video: false },
    renderer_policy: 'D renders only; it never changes facts, identities, asset mappings, shot count, or event order.',
    render_input: {
      a_sha256: sha256(canonical(a)),
      b_sha256: sha256(canonical(b)),
      c_sha256: sha256(canonical(c)),
      immutable: true
    }
  };
}

function compile(input) {
  assertSemanticGate(input.step02Manifest);
  const sourceSha = assertSha256(input.source?.source_sha256 || input.step02Manifest.source_sha256, '原片 source_sha256');
  const manifestSourceSha = String(input.step02Manifest.source_sha256 || '').toLowerCase();
  if (manifestSourceSha && manifestSourceSha !== sourceSha) throw codedError('STEP04_SOURCE_SHA_PROVENANCE_MISMATCH', 409, 'Step02 manifest 的原片 SHA-256 与 Step04 输入不一致');
  const step02Sha = assertSha256(input.source?.step02_acceptance_sha256, 'Step02 acceptance_sha256');
  const cards = array(input.step02Manifest.cards);
  const identityBindings = normalizeIdentityBindings(input.identityBindings);
  const a = buildEntityLayer({cards, identityBindings, assetRequirements: input.step02Manifest.asset_requirements});
  const b = buildAssetLayer({entities: a.entities, assetRegistry: input.assetRegistry, assetRequirements: input.step02Manifest.asset_requirements, shotIds: cards.map(card => shotId(card.shot_id))});
  const c = buildPromptLayer({cards, entities: a.entities, referenceSlots: b.reference_slots});
  const d = buildDeliveryLayer({source: {...(input.source || {}), source_sha256: sourceSha, step02_acceptance_sha256: step02Sha}, a, b, c});
  const contract = {
    schema_version: SCHEMA,
    created_at: new Date().toISOString(),
    source: {...(input.source || {}), source_sha256: sourceSha, step02_acceptance_sha256: step02Sha},
    source_provenance: {
      semantic_alignment: {
        mapping_policy: input.step02Manifest.semantic_alignment.mapping_policy,
        semantic_unit_ids: input.step02Manifest.semantic_alignment.semantic_unit_ids
      }
    },
    layers: { A: a, B: b, C: c, D: d }
  };
  contract.contract_sha256 = contractDigest(contract);
  return contract;
}

function createStep04AbcdService({root}) {
  if (!root) throw new Error('STEP04_RUNTIME_ROOT_REQUIRED');
  async function save({projectId, input}) {
    const contract = compile(input);
    const safeProjectId = assertSafeProjectId(projectId);
    const directory = path.join(root, safeProjectId);
    await fsp.mkdir(directory, {recursive:true});
    const target = path.join(directory, 'contract.json');
    const temp = target + '.' + process.pid + '.tmp';
    await fsp.writeFile(temp, JSON.stringify(contract, null, 2) + '\n', {encoding:'utf8', mode:0o600});
    await fsp.rename(temp, target);
    const saved = JSON.parse(await fsp.readFile(target, 'utf8'));
    const contractSha = contractDigest(saved);
    if (saved.contract_sha256 !== contractSha) throw codedError('STEP04_CONTRACT_SHA_MISMATCH', 500, 'Step04 合同回读摘要不一致');
    return {contract, exact_path:target, sha256:contractSha, bytes:Buffer.byteLength(JSON.stringify(contract))};
  }
  async function get({projectId}) {
    const target = path.join(root, assertSafeProjectId(projectId), 'contract.json');
    try { return JSON.parse(await fsp.readFile(target, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') throw codedError('STEP04_CONTRACT_NOT_FOUND',404,'Step04 合同尚未生成'); throw error; }
  }
  return {compile, save, get, schema:SCHEMA, layers:LAYERS};
}

module.exports = { SCHEMA, LAYERS, canonical, sha256, contractDigest, codedError, assertSemanticGate, buildEntityLayer, buildAssetLayer, buildPromptLayer, buildDeliveryLayer, compile, createStep04AbcdService };
