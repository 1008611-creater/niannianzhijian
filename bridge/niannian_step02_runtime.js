const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const SNAPSHOT_SCHEMA = 'niannian.step01_snapshot.v1';
const VARIANT_SCHEMA = 'niannian.step02_variant.v1';
const QA_SCHEMA = 'niannian.step02_qa.v1';
const BUNDLE_VERSION = 'shortdrama-localization-runtime-1';
const LOCALES = Object.freeze({
  'es-MX': {market:'Mexico', language:'Español (México)', label:'墨西哥 · Español'},
  'pt-BR': {market:'Brazil', language:'Português (Brasil)', label:'巴西 · Português'},
  'en-US': {market:'United States', language:'English (United States)', label:'美国 · English'}
});
const EDITABLE_FIELDS = Object.freeze([
  'source_shot_ids','target_people_identity','localized_setting','action','target_dialogue',
  'chinese_back_translation','expression_intent','cultural_replacements',
  'continuity_requirements','duration_fit','structure_change','manual_notes','review_status'
]);

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(Buffer.isBuffer(value) ? value : Buffer.from(String(value))).digest('hex');
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function codedError(code, status, message) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function safeSegment(value, pattern = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/) {
  const text = String(value || '');
  if (!pattern.test(text)) throw codedError('STEP02_IDENTITY_INVALID', 422, 'Step02 身份字段无效');
  return text;
}

async function atomicWriteJson(filePath, value, {exclusive = false} = {}) {
  await fsp.mkdir(path.dirname(filePath), {recursive:true});
  const temporary = path.join(path.dirname(filePath), '.tmp-' + process.pid + '-' + crypto.randomBytes(8).toString('hex'));
  await fsp.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', {flag:'wx'});
  try {
    if (exclusive) await fsp.link(temporary, filePath);
    else {
      for (let attempt = 0; ; attempt += 1) {
        try { await fsp.rename(temporary, filePath); break; }
        catch (error) {
          if (!['EPERM','EBUSY','ENOTEMPTY'].includes(error.code) || attempt >= 5) throw error;
          await new Promise(resolve => setTimeout(resolve,10 * (2 ** attempt)));
        }
      }
    }
  } catch (error) {
    await fsp.rm(temporary, {force:true}).catch(() => {});
    if (exclusive && error.code === 'EEXIST') return false;
    throw error;
  }
  if (exclusive) await fsp.rm(temporary, {force:true});
  return true;
}

async function readJson(filePath) {
  return JSON.parse(await fsp.readFile(filePath, 'utf8'));
}

function extractResponseText(response) {
  if (typeof response?.output_text === 'string') return response.output_text;
  const text = [];
  for (const item of response?.output || []) for (const content of item?.content || []) if (typeof content?.text === 'string') text.push(content.text);
  if (!text.length) throw codedError('MCGROX_RESPONSE_TEXT_MISSING', 502, '模型响应没有结构化文本');
  return text.join('\n');
}

function parseJsonObject(text) {
  try {
    const value = JSON.parse(String(text || ''));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not_object');
    return value;
  } catch {
    const error = codedError('MCGROX_JSON_INVALID', 502, '模型未返回有效 JSON');
    error.raw = String(text || '').slice(0,200000);
    throw error;
  }
}

function stringField(value, name, max = 4000, allowEmpty = true) {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) throw codedError('STEP02_SCHEMA_INVALID', 422, name + ' 无效');
  return value.trim();
}

function stringArray(value, name, maxItems = 20, maxLength = 600) {
  if (!Array.isArray(value) || value.length > maxItems || value.some(item => typeof item !== 'string' || item.length > maxLength)) throw codedError('STEP02_SCHEMA_INVALID', 422, name + ' 无效');
  return value.map(item => item.trim()).filter(Boolean);
}

function shotPlanJsonSchema() {
  return {
    type:'object', additionalProperties:false,
    required:['shot_id','source_shot_ids','target_people_identity','localized_setting','action','target_dialogue','chinese_back_translation','expression_intent','cultural_replacements','continuity_requirements','duration_fit','structure_change'],
    properties:{
      shot_id:{type:'string',pattern:'^S\\d{3}$'},
      source_shot_ids:{type:'array',minItems:1,maxItems:1,items:{type:'string',pattern:'^S\\d{3}$'}},
      target_people_identity:{type:'string',minLength:1,maxLength:1200},
      localized_setting:{type:'string',minLength:1,maxLength:1600},
      action:{type:'string',minLength:1,maxLength:2400},
      target_dialogue:{type:'string',maxLength:2400},
      chinese_back_translation:{type:'string',maxLength:2400},
      expression_intent:{type:'string',minLength:1,maxLength:1200},
      cultural_replacements:{type:'array',maxItems:20,items:{type:'string',maxLength:600}},
      continuity_requirements:{type:'array',maxItems:20,items:{type:'string',maxLength:600}},
      duration_fit:{type:'object',additionalProperties:false,required:['estimated_speech_seconds','fits','note'],properties:{estimated_speech_seconds:{type:'number',minimum:0,maximum:120},fits:{type:'boolean'},note:{type:'string',minLength:1,maxLength:800}}},
      structure_change:{type:'object',additionalProperties:false,required:['type','reason'],properties:{type:{type:'string',enum:['preserve','merge','split','add']},reason:{type:'string',minLength:1,maxLength:800}}}
    }
  };
}

function batchJsonSchema(expectedShotCount = null) {
  const count = Number.isInteger(expectedShotCount) && expectedShotCount > 0 ? expectedShotCount : null;
  return {type:'object',additionalProperties:false,required:['shots'],properties:{shots:{type:'array',minItems:count || 1,maxItems:count || 10,items:shotPlanJsonSchema()}}};
}

function qaJsonSchema() {
  return {
    type:'object',additionalProperties:false,
    required:['passed','all_source_shots_mapped','character_continuity_passed','plot_causality_passed','language_naturalness_passed','back_translation_consistent','duration_fit_passed','findings'],
    properties:{
      passed:{type:'boolean'},all_source_shots_mapped:{type:'boolean'},character_continuity_passed:{type:'boolean'},plot_causality_passed:{type:'boolean'},language_naturalness_passed:{type:'boolean'},back_translation_consistent:{type:'boolean'},duration_fit_passed:{type:'boolean'},
      findings:{type:'array',maxItems:80,items:{type:'object',additionalProperties:false,required:['shot_id','severity','message','suggestion'],properties:{shot_id:{type:['string','null'],pattern:'^S\\d{3}$'},severity:{type:'string',enum:['info','warning','error']},message:{type:'string',minLength:1,maxLength:1200},suggestion:{type:'string',maxLength:1200}}}}
    }
  };
}

function validatePlanShot(value, sourceShot) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw codedError('STEP02_SCHEMA_INVALID', 422, '镜头改编对象无效');
  const allowed = ['shot_id','source_shot_ids','target_people_identity','localized_setting','action','target_dialogue','chinese_back_translation','expression_intent','cultural_replacements','continuity_requirements','duration_fit','structure_change'];
  if (Object.keys(value).sort().join(',') !== allowed.sort().join(',') || value.shot_id !== sourceShot.shot_id) throw codedError('STEP02_SHOT_BINDING_INVALID', 422, sourceShot.shot_id + ' 镜头绑定无效');
  const sourceIds = stringArray(value.source_shot_ids, 'source_shot_ids', 5, 4);
  if (sourceIds.length !== 1 || sourceIds[0] !== sourceShot.shot_id) throw codedError('STEP02_SHOT_BINDING_INVALID', 422, sourceShot.shot_id + ' 原片映射必须一一对应');
  const duration = value.duration_fit;
  if (!duration || typeof duration !== 'object' || !Number.isFinite(Number(duration.estimated_speech_seconds)) || Number(duration.estimated_speech_seconds) < 0 || Number(duration.estimated_speech_seconds) > 120 || typeof duration.fits !== 'boolean') throw codedError('STEP02_SCHEMA_INVALID',422,'对白时长适配无效');
  const structure = value.structure_change;
  if (!structure || !['preserve','merge','split','add'].includes(structure.type)) throw codedError('STEP02_SCHEMA_INVALID',422,'镜头结构说明无效');
  return {
    shot_id:sourceShot.shot_id,
    source_shot_ids:sourceIds,
    start_sec:sourceShot.start_sec,
    end_sec:sourceShot.end_sec,
    duration_sec:sourceShot.duration_sec,
    target_people_identity:stringField(value.target_people_identity,'target_people_identity',1200,false),
    localized_setting:stringField(value.localized_setting,'localized_setting',1600,false),
    action:stringField(value.action,'action',2400,false),
    target_dialogue:stringField(value.target_dialogue,'target_dialogue',2400),
    chinese_back_translation:stringField(value.chinese_back_translation,'chinese_back_translation',2400),
    expression_intent:stringField(value.expression_intent,'expression_intent',1200,false),
    cultural_replacements:stringArray(value.cultural_replacements,'cultural_replacements'),
    continuity_requirements:stringArray(value.continuity_requirements,'continuity_requirements'),
    duration_fit:{estimated_speech_seconds:Number(duration.estimated_speech_seconds),fits:duration.fits,note:stringField(duration.note,'duration_fit.note',800,false)},
    structure_change:{type:structure.type,reason:stringField(structure.reason,'structure_change.reason',800,false)},
    manual_notes:'',review_status:'unreviewed',manual_locked:false,active_revision:null
  };
}

function validateQa(value) {
  const booleans = ['passed','all_source_shots_mapped','character_continuity_passed','plot_causality_passed','language_naturalness_passed','back_translation_consistent','duration_fit_passed'];
  const allowed = [...booleans,'findings'];
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== allowed.sort().join(',') || booleans.some(key => typeof value[key] !== 'boolean') || !Array.isArray(value.findings) || value.findings.length > 80) throw codedError('STEP02_QA_SCHEMA_INVALID',422,'整集 QA 结果无效');
  const findings = value.findings.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).sort().join(',') !== ['message','severity','shot_id','suggestion'].sort().join(',') || !['info','warning','error'].includes(item.severity) || !(item.shot_id === null || /^S(?:00[1-9]|0[12]\d|03[0-7])$/.test(item.shot_id))) throw codedError('STEP02_QA_SCHEMA_INVALID',422,'整集 QA finding 无效');
    return {shot_id:item.shot_id,severity:item.severity,message:stringField(item.message,'qa.finding.message',1200,false),suggestion:stringField(item.suggestion,'qa.finding.suggestion',1200)};
  });
  const passed = booleans.slice(1).every(key => value[key] === true) && !findings.some(item => item.severity === 'error');
  if (value.passed !== passed) throw codedError('STEP02_QA_VERDICT_INCONSISTENT',422,'QA 结论与检查项不一致');
  return {schema_version:QA_SCHEMA,...Object.fromEntries(booleans.map(key=>[key,value[key]])),findings};
}

function validateGlobalContext(value) {
  const keys = ['character_map','continuity_rules','causality','localization_principles'];
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== keys.sort().join(',')) throw codedError('STEP02_GLOBAL_CONTEXT_INVALID',422,'整集上下文结果无效');
  if (!Array.isArray(value.character_map) || value.character_map.length > 30) throw codedError('STEP02_GLOBAL_CONTEXT_INVALID',422,'人物映射无效');
  const characterMap = value.character_map.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).sort().join(',') !== ['function','localized_identity','source_identity'].sort().join(',')) throw codedError('STEP02_GLOBAL_CONTEXT_INVALID',422,'人物映射无效');
    return {source_identity:stringField(item.source_identity,'source_identity',500,false),localized_identity:stringField(item.localized_identity,'localized_identity',500,false),function:stringField(item.function,'function',900,false)};
  });
  return {character_map:characterMap,continuity_rules:stringArray(value.continuity_rules,'continuity_rules',40,1000),causality:stringArray(value.causality,'causality',40,1000),localization_principles:stringArray(value.localization_principles,'localization_principles',30,1000)};
}

function publicError(error) {
  const code = typeof error?.code === 'string' ? error.code : 'STEP02_GENERATION_FAILED';
  if (/KEY|TOKEN|AUTHORIZATION|COOKIE|SECRET/i.test(String(error?.message || ''))) return {code,message:'服务器模型凭据或上游认证不可用'};
  return {code,message:String(error?.message || 'Step02 生成失败').slice(0,300)};
}

function createResponsesClient(fetchImpl = global.fetch) {
  function endpoint() {
    const base = String(process.env.NIANNIAN_GPT_API_BASE_URL || 'https://www.mcgrox.top').replace(/\/+$/,'');
    const requestPath = String(process.env.NIANNIAN_GPT_RESPONSES_PATH || '/responses');
    if (!base.startsWith('https://') || !requestPath.startsWith('/') || requestPath.includes('..')) throw codedError('MCGROX_PROFILE_NOT_CONFIGURED',503,'服务器模型配置无效');
    return base + requestPath;
  }
  async function call(body) {
    const key = process.env.NIANNIAN_GPT_API_KEY;
    if (!key) throw codedError('MCGROX_CREDENTIAL_NOT_CONFIGURED',503,'服务器模型凭据未配置');
    const response = await fetchImpl(endpoint(), {method:'POST',headers:{authorization:'Bearer ' + key,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(Math.max(30000,Number(process.env.NIANNIAN_GPT_TIMEOUT_MS || 180000)))});
    if (!response.ok) throw codedError('MCGROX_RESPONSES_HTTP_' + response.status,502,'模型请求失败 (' + response.status + ')');
    return response.json();
  }
  return {call};
}

function imageDataUrl(bytes) { return 'data:image/png;base64,' + bytes.toString('base64'); }

function evidenceCounts(model) {
  const shots = Array.isArray(model?.shots) ? model.shots : [];
  return {
    shots:shots.length,
    frames:shots.reduce((sum, shot) => sum + Object.keys(shot.frames || {}).length, 0),
    dialogue:new Set(shots.flatMap(shot => (shot.dialogue || []).map(item => String(item.event_id || '')).filter(Boolean))).size,
    ocr:shots.reduce((sum, shot) => sum + (shot.ocr || []).length, 0)
  };
}

function createStep02Service(options) {
  const expected = options.expected;
  const root = path.resolve(options.root);
  const evidenceRoot = path.resolve(options.evidenceRoot);
  const shotReviewService = options.shotReviewService;
  const responsesClient = options.responsesClient || createResponsesClient(options.fetchImpl);
  const bundleRoot = path.resolve(options.bundleRoot);
  const configuredBatchSize = Number(options.batchSize ?? process.env.NIANNIAN_STEP02_BATCH_SIZE ?? 4);
  const generationBatchSize = Number.isInteger(configuredBatchSize) && configuredBatchSize >= 1 && configuredBatchSize <= 4 ? configuredBatchSize : 4;
  const running = new Map();
  const writeLocks = new Map();

  async function withWriteLock(key, operation) {
    const previous = writeLocks.get(key) || Promise.resolve();
    let release;
    const turn = new Promise(resolve => { release = resolve; });
    const tail = previous.then(() => turn);
    writeLocks.set(key,tail);
    await previous;
    try { return await operation(); }
    finally {
      release();
      if (writeLocks.get(key) === tail) writeLocks.delete(key);
    }
  }

  function ownerRoot(ownerId) { return path.join(root,'v1','owners',sha256(String(ownerId)),'projects',safeSegment(expected.projectId,/^[A-Za-z0-9-]{8,80}$/)); }
  function snapshotDirectory(ownerId) { return path.join(ownerRoot(ownerId),'step01-snapshots'); }
  function variantDirectory(ownerId, snapshotId, locale) { return path.join(ownerRoot(ownerId),'step02-variants',safeSegment(snapshotId),safeSegment(locale,/^(es-MX|pt-BR|en-US)$/)); }
  function validateProject(project, analysisRunId = expected.analysisRunId) {
    if (!project || project.id !== expected.projectId || project.analysis?.runId !== expected.analysisRunId || analysisRunId !== expected.analysisRunId || project.source?.sha256 !== expected.sourceSha256 || Number(project.source?.bytes) !== expected.sourceBytes) throw codedError('STEP02_SOURCE_BINDING_MISMATCH',409,'项目、run 或源视频绑定不一致');
  }

  async function loadBundle() {
    const manifestPath = path.join(bundleRoot,'manifest.json');
    const bytes = await fsp.readFile(manifestPath);
    const manifest = JSON.parse(bytes.toString('utf8'));
    if (manifest.schema_version !== 'niannian.server_skill_bundle.v1' || manifest.bundle_version !== BUNDLE_VERSION || manifest.runtime_kind !== 'shortdrama_localization' || !Array.isArray(manifest.files)) throw codedError('STEP02_SKILL_BUNDLE_INVALID',503,'Step02 Skill Bundle 身份无效');
    const instructions = [];
    for (const file of manifest.files) {
      const fileBytes = await fsp.readFile(path.join(bundleRoot,...file.path.split('/')));
      if (fileBytes.length !== file.bytes || sha256(fileBytes) !== file.sha256) throw codedError('STEP02_SKILL_BUNDLE_TAMPERED',503,'Step02 Skill Bundle 校验失败');
      if (/\.md$/i.test(file.path)) instructions.push(fileBytes.toString('utf8'));
    }
    return {manifest,manifestSha256:sha256(bytes),instructions};
  }

  async function confirmStep01({ownerId,project,analysisRunId,ifMatch,confirmedBy}) {
    validateProject(project,analysisRunId);
    if (!ifMatch) throw codedError('PRECONDITION_REQUIRED',428,'确认第一步前必须读回服务器版本');
    const review = await shotReviewService.getReview({ownerId,project,analysisRunId});
    if (String(ifMatch) !== review.etag) throw codedError('STEP01_SNAPSHOT_CONFLICT',409,'Step01 已变化，请保存并重新读取后再确认');
    const model = review.model;
    const counts = evidenceCounts(model);
    if (!counts.shots || counts.frames !== counts.shots * 3) throw codedError('STEP01_SNAPSHOT_INCOMPLETE',409,'Step01 三帧镜头证据不完整');
    const revisionVector = model.shots.map(shot => ({shot_id:shot.shot_id,active_revision:shot.active_revision || null}));
    const content = {schema_version:SNAPSHOT_SCHEMA,project_id:expected.projectId,analysis_run_id:expected.analysisRunId,source_sha256:expected.sourceSha256,source_bytes:expected.sourceBytes,counts,revision_vector_sha256:sha256(canonical(revisionVector)),revision_vector:revisionVector,shot_review_etag:review.etag,shots:clone(model.shots)};
    const contentSha = sha256(canonical(content));
    const snapshotId = 'S01-' + contentSha.slice(0,24);
    const filePath = path.join(snapshotDirectory(ownerId),snapshotId + '.json');
    let snapshot;
    let created = false;
    try { snapshot = await readJson(filePath); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const confirmedAt = new Date().toISOString();
      const unsigned = {...content,snapshot_id:snapshotId,content_sha256:contentSha,confirmed_by:String(confirmedBy || ownerId),confirmed_at:confirmedAt};
      snapshot = {...unsigned,snapshot_sha256:sha256(canonical(unsigned)),immutable:true};
      created = await atomicWriteJson(filePath,snapshot,{exclusive:true});
      if (!created) snapshot = await readJson(filePath);
    }
    verifySnapshot(snapshot);
    await atomicWriteJson(path.join(snapshotDirectory(ownerId),'current.json'),{schema_version:'niannian.step01_snapshot_pointer.v1',snapshot_id:snapshot.snapshot_id,snapshot_sha256:snapshot.snapshot_sha256,content_sha256:snapshot.content_sha256,updated_at:new Date().toISOString()});
    return {snapshot:publicSnapshot(snapshot),idempotent:!created};
  }

  function publicSnapshot(snapshot) {
    return {schema_version:snapshot.schema_version,snapshot_id:snapshot.snapshot_id,snapshot_sha256:snapshot.snapshot_sha256,project_id:snapshot.project_id,analysis_run_id:snapshot.analysis_run_id,source_sha256:snapshot.source_sha256,source_bytes:snapshot.source_bytes,counts:snapshot.counts,revision_vector_sha256:snapshot.revision_vector_sha256,shot_review_revision:snapshot.shot_review_etag,confirmed_by:snapshot.confirmed_by,confirmed_at:snapshot.confirmed_at,immutable:true};
  }

  function verifySnapshot(snapshot, pointer = null) {
    if (!snapshot || snapshot.schema_version !== SNAPSHOT_SCHEMA || snapshot.immutable !== true || snapshot.project_id !== expected.projectId || snapshot.analysis_run_id !== expected.analysisRunId || snapshot.source_sha256 !== expected.sourceSha256 || Number(snapshot.source_bytes) !== Number(expected.sourceBytes)) throw codedError('STEP01_SNAPSHOT_TAMPERED',409,'Step01 Snapshot 身份校验失败');
    if (!/^S01-[a-f0-9]{24}$/.test(String(snapshot.snapshot_id || '')) || !/^[a-f0-9]{64}$/.test(String(snapshot.snapshot_sha256 || '')) || !/^[a-f0-9]{64}$/.test(String(snapshot.content_sha256 || ''))) throw codedError('STEP01_SNAPSHOT_TAMPERED',409,'Step01 Snapshot 哈希字段无效');
    const derivedCounts = evidenceCounts(snapshot);
    if (!snapshot.counts || canonical(snapshot.counts) !== canonical(derivedCounts) || !derivedCounts.shots || derivedCounts.frames !== derivedCounts.shots * 3 || !Array.isArray(snapshot.shots) || !Array.isArray(snapshot.revision_vector) || snapshot.revision_vector.length !== derivedCounts.shots) throw codedError('STEP01_SNAPSHOT_TAMPERED',409,'Step01 Snapshot 内容不完整');
    if (sha256(canonical(snapshot.revision_vector)) !== snapshot.revision_vector_sha256) throw codedError('STEP01_SNAPSHOT_TAMPERED',409,'Step01 Snapshot 修订向量无效');
    const content = {schema_version:snapshot.schema_version,project_id:snapshot.project_id,analysis_run_id:snapshot.analysis_run_id,source_sha256:snapshot.source_sha256,source_bytes:snapshot.source_bytes,counts:snapshot.counts,revision_vector_sha256:snapshot.revision_vector_sha256,revision_vector:snapshot.revision_vector,shot_review_etag:snapshot.shot_review_etag,shots:snapshot.shots};
    if (sha256(canonical(content)) !== snapshot.content_sha256 || snapshot.snapshot_id !== 'S01-' + snapshot.content_sha256.slice(0,24)) throw codedError('STEP01_SNAPSHOT_TAMPERED',409,'Step01 Snapshot 内容哈希无效');
    const unsigned = clone(snapshot); delete unsigned.snapshot_sha256; delete unsigned.immutable;
    if (sha256(canonical(unsigned)) !== snapshot.snapshot_sha256) throw codedError('STEP01_SNAPSHOT_TAMPERED',409,'Step01 Snapshot 哈希无效');
    if (pointer && (pointer.schema_version !== 'niannian.step01_snapshot_pointer.v1' || pointer.snapshot_id !== snapshot.snapshot_id || pointer.snapshot_sha256 !== snapshot.snapshot_sha256 || pointer.content_sha256 !== snapshot.content_sha256)) throw codedError('STEP01_SNAPSHOT_TAMPERED',409,'Step01 Snapshot 指针无效');
    return snapshot;
  }

  async function currentSnapshot(ownerId) {
    const pointer = await readJson(path.join(snapshotDirectory(ownerId),'current.json')).catch(error => { if (error.code === 'ENOENT') throw codedError('STEP01_SNAPSHOT_REQUIRED',409,'请先确认第一步'); throw error; });
    const snapshot = await readJson(path.join(snapshotDirectory(ownerId),safeSegment(pointer.snapshot_id) + '.json'));
    return verifySnapshot(snapshot,pointer);
  }

  async function getCurrentSnapshot({ownerId,project}) {
    validateProject(project);
    return publicSnapshot(await currentSnapshot(ownerId));
  }

  async function readVariantFiles(ownerId, snapshotId, locale) {
    const directory = variantDirectory(ownerId,snapshotId,locale);
    const descriptor = await readJson(path.join(directory,'variant.json'));
    const expectedGenerationKey = sha256([expected.projectId,descriptor.snapshot_sha256,locale,'whole_episode_v1'].join(':'));
    if (descriptor.schema_version !== VARIANT_SCHEMA || descriptor.project_id !== expected.projectId || descriptor.analysis_run_id !== expected.analysisRunId || descriptor.snapshot_id !== snapshotId || descriptor.locale !== locale || descriptor.market !== LOCALES[locale]?.market || descriptor.language !== LOCALES[locale]?.language || descriptor.bundle_version !== BUNDLE_VERSION || descriptor.generation_key !== expectedGenerationKey || descriptor.variant_id !== 'S02-' + locale + '-' + expectedGenerationKey.slice(0,20)) throw codedError('STEP02_VARIANT_STORE_CORRUPT',503,'Step02 市场版本身份损坏');
    const snapshot = await readJson(path.join(snapshotDirectory(ownerId),safeSegment(snapshotId) + '.json'));
    verifySnapshot(snapshot);
    if (descriptor.shots?.length && (descriptor.shots.length !== snapshot.shots.length || descriptor.generation_sha256 !== sha256(canonical({snapshot_sha256:descriptor.snapshot_sha256,locale,shots:descriptor.shots})))) throw codedError('STEP02_VARIANT_STORE_CORRUPT',503,'Step02 市场版本内容哈希损坏');
    const statePath = path.join(directory,'state.json');
    let state = await readJson(statePath).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
    if (!state) {
      const initial = {schema_version:'niannian.step02_variant_state.v1',status:'created',completed_batches:[],qa:null,error:null,updated_at:new Date().toISOString()};
      await atomicWriteJson(statePath,initial,{exclusive:true});
      state = await readJson(statePath);
    }
    if (state.schema_version !== 'niannian.step02_variant_state.v1' || !['created','generating','ready','qa_failed','failed','confirmed'].includes(state.status)) throw codedError('STEP02_VARIANT_STORE_CORRUPT',503,'Step02 市场版本状态损坏');
    return {directory,descriptor,state,snapshot};
  }

  function variantEtag(state, revisions) { return '"step02-' + sha256(canonical({state,revisions})) + '"'; }
  function normalizeStep02IfMatch(value) { return String(value || '').replace(/^W\//, ''); }

  async function loadShotRevisions(directory, shotId) {
    const target = path.join(directory,'shot-revisions',safeSegment(shotId,/^S\d{3}$/));
    const names = (await fsp.readdir(target).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error))).filter(name => /^\d{8}-[a-f0-9]{64}\.json$/.test(name)).sort();
    const commits = [];
    let active = null;
    for (const [index,name] of names.entries()) {
      const commit = await readJson(path.join(target,name));
      const revision = commit.revision;
      const expectedRequestSha = sha256(canonical({revision_id:revision?.revision_id,variant_id:revision?.variant_id,shot_id:revision?.shot_id,base_revision:revision?.base_revision || null,patch:revision?.patch}));
      const expectedName = String(index + 1).padStart(8,'0') + '-' + sha256(String(revision?.revision_id || '')) + '.json';
      if (name !== expectedName || commit.sequence !== index + 1 || revision?.shot_id !== shotId || revision?.base_revision !== active || commit.request_sha256 !== expectedRequestSha || commit.payload_sha256 !== sha256(canonical(revision))) throw codedError('STEP02_REVISION_STORE_CORRUPT',503,'Step02 修订链损坏');
      active = commit.revision.revision_id;
      commits.push(commit);
    }
    return {target,commits,active};
  }

  async function projectVariant(ownerId, descriptor, state, directory) {
    const shots = clone(descriptor.shots || []);
    const vector = [];
    for (const shot of shots) {
      const chain = await loadShotRevisions(directory,shot.shot_id);
      for (const commit of chain.commits) Object.assign(shot,clone(commit.revision.patch),{manual_locked:true});
      shot.active_revision = chain.active;
      vector.push([shot.shot_id,chain.active || 'generated']);
    }
    return {...clone(descriptor),status:state.status,error:state.error || null,qa:state.qa || null,progress:{completed_shots:(state.completed_batches||[]).reduce((sum,batch)=>sum+(batch.shots?.length||0),0),total_shots:shots.length},confirmed_at:state.confirmed_at || null,confirmed_sha256:state.confirmed_sha256 || null,shots,etag:variantEtag(state,vector),updated_at:state.updated_at};
  }

  async function createVariantUnlocked({ownerId,project,locale,idempotencyKey}) {
    validateProject(project);
    if (!LOCALES[locale]) throw codedError('STEP02_LOCALE_UNSUPPORTED',422,'目标市场不支持');
    if (!idempotencyKey || !/^[A-Za-z0-9._:-]{12,160}$/.test(String(idempotencyKey))) throw codedError('IDEMPOTENCY_KEY_REQUIRED',400,'必须提供稳定的幂等键');
    const snapshot = await currentSnapshot(ownerId);
    const expectedKey = sha256([expected.projectId,snapshot.snapshot_sha256,locale,'whole_episode_v1'].join(':'));
    if (String(idempotencyKey) !== expectedKey) throw codedError('IDEMPOTENCY_KEY_INVALID',422,'幂等键与 Snapshot/市场不一致');
    const variantId = 'S02-' + locale + '-' + expectedKey.slice(0,20);
    const directory = variantDirectory(ownerId,snapshot.snapshot_id,locale);
    const descriptorPath = path.join(directory,'variant.json');
    let descriptor;
    let created = false;
    try { descriptor = await readJson(descriptorPath); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      descriptor = {schema_version:VARIANT_SCHEMA,variant_id:variantId,project_id:expected.projectId,analysis_run_id:expected.analysisRunId,snapshot_id:snapshot.snapshot_id,snapshot_sha256:snapshot.snapshot_sha256,locale,market:LOCALES[locale].market,language:LOCALES[locale].language,bundle_version:BUNDLE_VERSION,bundle_manifest_sha256:null,generation_key:expectedKey,shots:[],created_at:new Date().toISOString()};
      created = await atomicWriteJson(descriptorPath,descriptor,{exclusive:true});
      if (created) await atomicWriteJson(path.join(directory,'state.json'),{schema_version:'niannian.step02_variant_state.v1',status:'created',completed_batches:[],qa:null,error:null,updated_at:new Date().toISOString()},{exclusive:true});
      else descriptor = await readJson(descriptorPath);
    }
    const {state} = await readVariantFiles(ownerId,snapshot.snapshot_id,locale);
    if (['created','generating','failed'].includes(state.status)) startGeneration(ownerId,snapshot,locale,variantId);
    return {variant_id:variantId,snapshot_id:snapshot.snapshot_id,locale,status:['created','generating','failed'].includes(state.status)?'generating':state.status,idempotent:!created,poll_url:'/api/projects/' + expected.projectId + '/step02/variants/' + encodeURIComponent(variantId)};
  }

  async function createVariant(args) {
    validateProject(args.project);
    const locale = safeSegment(args.locale,/^(es-MX|pt-BR|en-US)$/);
    return withWriteLock('variant-create:' + sha256(String(args.ownerId)) + ':' + locale,() => createVariantUnlocked(args));
  }

  async function listVariants({ownerId,project}) {
    validateProject(project);
    const snapshot = await currentSnapshot(ownerId);
    const variants = [];
    for (const locale of Object.keys(LOCALES)) {
      try {
        const files = await readVariantFiles(ownerId,snapshot.snapshot_id,locale);
        variants.push({variant_id:files.descriptor.variant_id,snapshot_id:snapshot.snapshot_id,snapshot_sha256:snapshot.snapshot_sha256,locale,market:files.descriptor.market,language:files.descriptor.language,status:files.state.status,qa_passed:files.state.qa?.passed === true,confirmed_at:files.state.confirmed_at || null,confirmed_sha256:files.state.confirmed_sha256 || null,updated_at:files.state.updated_at});
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    return {snapshot:publicSnapshot(snapshot),variants};
  }

  function startGeneration(ownerId,snapshot,locale,variantId) {
    return startGenerationAt(variantDirectory(ownerId,snapshot.snapshot_id,locale),snapshot,locale,variantId);
  }

  function startGenerationAt(directory,snapshot,locale,variantId) {
    const key = path.resolve(directory) + ':' + variantId;
    if (running.has(key)) return running.get(key);
    const promise = runGenerationAt(directory,snapshot,locale,variantId).catch(() => {}).finally(() => running.delete(key));
    running.set(key,promise);
    return promise;
  }

  async function frameManifest() {
    const rows = await readJson(path.join(evidenceRoot,'artifacts','shotlevel_start_mid_end_manifest.json'));
    return Array.isArray(rows) ? rows : rows.frames;
  }

  async function batchInput(snapshot, shots, locale, globalContext) {
    const manifest = await frameManifest();
    const content = [{type:'input_text',text:JSON.stringify({action:'shortdrama_localize_shot_batch',locale,market:LOCALES[locale],global_context:globalContext,shots:shots.map(shot => ({shot_id:shot.shot_id,start_sec:shot.start_sec,end_sec:shot.end_sec,duration_sec:shot.duration_sec,source_dialogue:(shot.dialogue||[]).map(row => ({speaker:row.speaker,text:row.text,start_sec:row.start_sec,end_sec:row.end_sec})),ocr:(shot.ocr||[]).map(row => ({text:row.text,time_sec:row.time_sec,region:row.region})),people:shot.speaker||[],scene:shot.scene||null,action:shot.action||null,camera:shot.camera||null}))})}];
    for (const shot of shots) {
      for (const point of ['start','mid','end']) {
        const row = manifest.find(item => Number(item.shot_id) === shot.sequence && item.point === point);
        if (!row || path.basename(String(row.file)) !== row.file) throw codedError('STEP02_FRAME_BINDING_MISSING',409,shot.shot_id + ' 缺少 ' + point + ' 帧');
        const bytes = await fsp.readFile(path.join(evidenceRoot,'artifacts','shotlevel_start_mid_end_frames',row.file));
        if (sha256(bytes) !== shot.frames[point].sha256) throw codedError('STEP02_FRAME_BINDING_MISMATCH',409,shot.shot_id + ' ' + point + ' 帧哈希不一致');
        content.push({type:'input_text',text:shot.shot_id + ' ' + point + ' @ ' + shot.frames[point].timecode});
        content.push({type:'input_image',image_url:imageDataUrl(bytes)});
      }
    }
    return [{role:'user',content}];
  }

  async function callStrictJson({instructions,input,name,schema}) {
    const body = {model:process.env.NIANNIAN_GPT56_MODEL || 'gpt-5.6',store:false,instructions,input,text:{format:{type:'json_schema',name,strict:true,schema}}};
    try { return parseJsonObject(extractResponseText(await responsesClient.call(body))); }
    catch (error) {
      if (error.code !== 'MCGROX_JSON_INVALID') throw error;
      const repair = await responsesClient.call({model:process.env.NIANNIAN_GPT56_MODEL || 'gpt-5.6',store:false,instructions:'修复下面内容为满足给定 schema 的严格 JSON。只输出 JSON，不添加解释。',input:String(error.raw || ''),text:{format:{type:'json_schema',name:name + '_repair',strict:true,schema}}});
      return parseJsonObject(extractResponseText(repair));
    }
  }

  async function globalContext(snapshot,bundle) {
    const response = await callStrictJson({
      instructions:['你是念念AI短剧海外改编的全局连续性分析器。只返回严格 JSON，不调用工具。','保留核心因果、人物关系功能、主要冲突、情绪升级、反转和结尾悬念；页面仍按镜头组织。',...bundle.instructions].join('\n\n'),
      input:JSON.stringify({locale:snapshot.locale,shots:snapshot.shots.map(shot => ({shot_id:shot.shot_id,time:[shot.start_sec,shot.end_sec],dialogue:(shot.dialogue||[]).map(row=>({speaker:row.speaker,text:row.text})),ocr:(shot.ocr||[]).map(row=>row.text),people:shot.speaker||[],scene:shot.scene||null,action:shot.action||null}))}),
      name:'step02_global_context_v1',
      schema:{type:'object',additionalProperties:false,required:['character_map','continuity_rules','causality','localization_principles'],properties:{character_map:{type:'array',maxItems:30,items:{type:'object',additionalProperties:false,required:['source_identity','localized_identity','function'],properties:{source_identity:{type:'string',minLength:1,maxLength:500},localized_identity:{type:'string',minLength:1,maxLength:500},function:{type:'string',minLength:1,maxLength:900}}}},continuity_rules:{type:'array',maxItems:40,items:{type:'string',maxLength:1000}},causality:{type:'array',maxItems:40,items:{type:'string',maxLength:1000}},localization_principles:{type:'array',maxItems:30,items:{type:'string',maxLength:1000}}}}
    });
    return validateGlobalContext(response);
  }

  function validateGeneratedBatch(result, sourceShots) {
    if (!Array.isArray(result?.shots) || result.shots.length !== sourceShots.length) throw codedError('STEP02_BATCH_INCOMPLETE',502,'模型返回的镜头批次不完整');
    const byShotId = new Map();
    for (const shot of result.shots) {
      if (!shot || typeof shot.shot_id !== 'string' || byShotId.has(shot.shot_id)) throw codedError('STEP02_BATCH_INCOMPLETE',502,'模型返回的镜头批次绑定不完整');
      byShotId.set(shot.shot_id,shot);
    }
    if (byShotId.size !== sourceShots.length || sourceShots.some(shot => !byShotId.has(shot.shot_id))) throw codedError('STEP02_BATCH_INCOMPLETE',502,'模型返回的镜头批次绑定不完整');
    return sourceShots.map(shot => validatePlanShot(byShotId.get(shot.shot_id),shot));
  }

  async function generateShotBatch({snapshot,sourceShots,locale,context,bundle}) {
    const expectedShotIds = sourceShots.map(shot => shot.shot_id);
    const input = await batchInput(snapshot,sourceShots,locale,context);
    const baseInstructions = ['你是念念AI逐镜头海外短剧改编器。只输出严格 JSON，不调用工具。','严格按输入 shot_id 一一输出，不丢镜头；每行 source_shot_ids 必须且只能是当前 shot_id。默认保持顺序、功能和时间；如需说明合并、拆分或新增，只能写入 structure_change，不得跨行重复绑定来源镜头。','目标语言对白必须自然；同时给出中文回译和表达意图。人物、身份、场景和文化元素按目标市场本地化，但不改变核心因果、冲突、反转和悬念。','仅根据当前 Snapshot 文本和三帧证据推断；不得声称图片中不存在的事实。',...bundle.instructions];
    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const result = await callStrictJson({
        instructions:[...baseInstructions,`本批必须且只能返回 ${expectedShotIds.length} 个镜头，shot_id 集合必须精确等于：${expectedShotIds.join(', ')}。`,attempt === 2 ? '上一次返回不完整或绑定错误；本次逐项核对上述 shot_id，任何一个都不得遗漏、重复或替换。' : ''].filter(Boolean).join('\n\n'),
        input,
        name:'step02_shot_batch_v1',
        schema:batchJsonSchema(expectedShotIds.length)
      });
      try { return {shots:validateGeneratedBatch(result,sourceShots),response:result,modelAttempts:attempt}; }
      catch (error) {
        lastError = error;
        if (attempt === 2 || !['STEP02_BATCH_INCOMPLETE','STEP02_SHOT_BINDING_INVALID','STEP02_SCHEMA_INVALID'].includes(error.code)) throw error;
      }
    }
    throw lastError;
  }

  async function runGenerationAt(directory,snapshot,locale,variantId) {
    verifySnapshot(snapshot);
    const statePath = path.join(directory,'state.json');
    let state = await readJson(statePath);
    if (['ready','confirmed','qa_failed'].includes(state.status)) return;
    state = {...state,status:'generating',error:null,updated_at:new Date().toISOString()};
    await atomicWriteJson(statePath,state);
    try {
      const bundle = await loadBundle();
      let context = state.global_context || null;
      if (!context) {
        context = await globalContext({...snapshot,locale},bundle);
        state = {...state,global_context:context,updated_at:new Date().toISOString()};
        await atomicWriteJson(statePath,state);
      }
      const completedShotIds = new Set();
      const completedBatchIndexes = new Set();
      let nextBatchIndex = 0;
      for (const batch of state.completed_batches || []) {
        if (!Number.isInteger(batch.index) || batch.index < 0 || completedBatchIndexes.has(batch.index) || !Array.isArray(batch.source_shot_ids) || !Array.isArray(batch.shots) || batch.source_shot_ids.length !== batch.shots.length) throw codedError('STEP02_VARIANT_STORE_CORRUPT',503,'Step02 已完成批次身份损坏');
        completedBatchIndexes.add(batch.index);
        nextBatchIndex = Math.max(nextBatchIndex,batch.index + 1);
        for (const [position,shotId] of batch.source_shot_ids.entries()) {
          if (!snapshot.shots.some(shot => shot.shot_id === shotId) || completedShotIds.has(shotId) || batch.shots[position]?.shot_id !== shotId) throw codedError('STEP02_VARIANT_STORE_CORRUPT',503,'Step02 已完成批次镜头绑定损坏');
          completedShotIds.add(shotId);
        }
      }
      const pendingShots = snapshot.shots.filter(shot => !completedShotIds.has(shot.shot_id));
      const size = generationBatchSize;
      for (let offset = 0; offset < pendingShots.length; offset += size) {
        const index = nextBatchIndex++;
        const sourceShots = pendingShots.slice(offset,offset + size);
        const generated = await generateShotBatch({snapshot,sourceShots,locale,context,bundle});
        const batch = {index,source_shot_ids:sourceShots.map(shot=>shot.shot_id),shots:generated.shots,response_sha256:sha256(canonical(generated.response)),model_attempts:generated.modelAttempts,completed_at:new Date().toISOString()};
        state.completed_batches = [...(state.completed_batches || []),batch].sort((a,b)=>a.index-b.index);
        state.updated_at = new Date().toISOString();
        await atomicWriteJson(statePath,state);
      }
      const shots = state.completed_batches.flatMap(batch=>batch.shots).sort((a,b)=>a.shot_id.localeCompare(b.shot_id));
      if (shots.length !== snapshot.shots.length || new Set(shots.map(shot=>shot.shot_id)).size !== snapshot.shots.length) throw codedError('STEP02_WHOLE_EPISODE_INCOMPLETE',502,'整集镜头映射不完整');
      const qaRaw = await callStrictJson({instructions:'你是念念AI独立整集 QA。只返回严格 JSON，不调用工具。检查全部原片镜头映射、人物连续性、剧情因果、目标语言自然度、中文回译一致性和原镜头时长适配。不得因生成成功而默认通过。',input:JSON.stringify({locale,global_context:context,source:snapshot.shots.map(shot=>({shot_id:shot.shot_id,start_sec:shot.start_sec,end_sec:shot.end_sec,dialogue:(shot.dialogue||[]).map(row=>row.text)})),adaptation:shots}),name:'step02_whole_episode_qa_v1',schema:qaJsonSchema()});
      const qa = validateQa(qaRaw);
      const descriptorPath = path.join(directory,'variant.json');
      const descriptor = await readJson(descriptorPath);
      const complete = {...descriptor,bundle_manifest_sha256:bundle.manifestSha256,global_context:context,shots,generation_sha256:sha256(canonical({snapshot_sha256:snapshot.snapshot_sha256,locale,shots})),generated_at:new Date().toISOString()};
      await atomicWriteJson(descriptorPath,complete);
      await atomicWriteJson(statePath,{schema_version:'niannian.step02_variant_state.v1',status:qa.passed?'ready':'qa_failed',completed_batches:state.completed_batches,global_context:context,qa,error:null,updated_at:new Date().toISOString()});
    } catch (error) {
      await atomicWriteJson(statePath,{...state,status:'failed',error:publicError(error),updated_at:new Date().toISOString()});
      throw error;
    }
  }

  async function recoverPendingGenerations() {
    const ownersRoot = path.join(root,'v1','owners');
    const ownerEntries = await fsp.readdir(ownersRoot,{withFileTypes:true}).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error));
    const pending = [];
    for (const ownerEntry of ownerEntries.filter(entry => entry.isDirectory() && /^[a-f0-9]{64}$/.test(entry.name))) {
      const projectRoot = path.join(ownersRoot,ownerEntry.name,'projects',expected.projectId);
      const variantsRoot = path.join(projectRoot,'step02-variants');
      const snapshotEntries = await fsp.readdir(variantsRoot,{withFileTypes:true}).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error));
      for (const snapshotEntry of snapshotEntries.filter(entry => entry.isDirectory() && /^S01-[a-f0-9]{24}$/.test(entry.name))) {
        const snapshotPath = path.join(projectRoot,'step01-snapshots',snapshotEntry.name + '.json');
        const snapshot = verifySnapshot(await readJson(snapshotPath));
        for (const locale of Object.keys(LOCALES)) {
          const directory = path.join(variantsRoot,snapshotEntry.name,locale);
          const descriptor = await readJson(path.join(directory,'variant.json')).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
          if (!descriptor) continue;
          const statePath = path.join(directory,'state.json');
          const state = await readJson(statePath).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
          if (!state || !['created','generating'].includes(state.status)) continue;
          if (descriptor.snapshot_id !== snapshot.snapshot_id || descriptor.snapshot_sha256 !== snapshot.snapshot_sha256 || descriptor.locale !== locale) throw codedError('STEP02_VARIANT_STORE_CORRUPT',503,'待恢复版本与 Snapshot 绑定不一致');
          pending.push(startGenerationAt(directory,snapshot,locale,descriptor.variant_id));
        }
      }
    }
    await Promise.all(pending);
    return {resumed:pending.length};
  }

  async function findVariant(ownerId, variantId) {
    safeSegment(variantId,/^S02-(es-MX|pt-BR|en-US)-[a-f0-9]{20}$/);
    const snapshot = await currentSnapshot(ownerId);
    const locale = variantId.split('-').slice(1,-1).join('-');
    const files = await readVariantFiles(ownerId,snapshot.snapshot_id,locale).catch(error => { if (error.code === 'ENOENT') throw codedError('STEP02_VARIANT_NOT_FOUND',404,'市场版本不存在'); throw error; });
    if (files.descriptor.variant_id !== variantId || files.descriptor.snapshot_sha256 !== snapshot.snapshot_sha256) throw codedError('STEP02_VARIANT_BINDING_MISMATCH',409,'市场版本与 Snapshot 不一致');
    return {...files,snapshot};
  }

  async function getVariant({ownerId,project,variantId}) {
    validateProject(project);
    const files = await findVariant(ownerId,variantId);
    return projectVariant(ownerId,files.descriptor,files.state,files.directory);
  }

  function validatePatch(patch, shotId) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw codedError('STEP02_REVISION_SCHEMA_INVALID',422,'修订内容无效');
    const keys = Object.keys(patch);
    if (!keys.length || keys.some(key => !EDITABLE_FIELDS.includes(key))) throw codedError('STEP02_REVISION_SCHEMA_INVALID',422,'修订字段无效');
    const output = {};
    for (const key of keys) {
      if (key === 'source_shot_ids') {
        const sourceIds = stringArray(patch[key],key,1,4);
        if (sourceIds.length !== 1 || sourceIds[0] !== shotId) throw codedError('STEP02_SHOT_BINDING_INVALID',422,shotId + ' 原片映射必须一一对应');
        output[key] = sourceIds;
      } else if (['cultural_replacements','continuity_requirements'].includes(key)) output[key] = stringArray(patch[key],key);
      else if (key === 'duration_fit') {
        if (!patch[key] || typeof patch[key].fits !== 'boolean' || !Number.isFinite(Number(patch[key].estimated_speech_seconds))) throw codedError('STEP02_REVISION_SCHEMA_INVALID',422,'duration_fit 无效');
        output[key] = {estimated_speech_seconds:Number(patch[key].estimated_speech_seconds),fits:patch[key].fits,note:stringField(patch[key].note || '','duration_fit.note',800)};
      } else if (key === 'structure_change') {
        if (!patch[key] || !['preserve','merge','split','add'].includes(patch[key].type)) throw codedError('STEP02_REVISION_SCHEMA_INVALID',422,'structure_change 无效');
        output[key] = {type:patch[key].type,reason:stringField(patch[key].reason || '','structure_change.reason',800)};
      } else if (key === 'review_status') {
        if (!['unreviewed','in_review','accepted','needs_revision'].includes(patch[key])) throw codedError('STEP02_REVISION_SCHEMA_INVALID',422,'review_status 无效');
        output[key] = patch[key];
      } else output[key] = stringField(patch[key],key,key === 'manual_notes' ? 4000 : 2400);
    }
    return output;
  }

  async function createRevisionUnlocked({ownerId,project,variantId,shotId,ifMatch,body,beforeCommit}) {
    validateProject(project);
    const files = await findVariant(ownerId,variantId);
    if (!['ready','qa_failed','confirmed'].includes(files.state.status)) throw codedError('STEP02_VARIANT_NOT_EDITABLE',409,'市场版本尚不可编辑');
    const projected = await projectVariant(ownerId,files.descriptor,files.state,files.directory);
    if (!ifMatch) throw codedError('STEP02_REVISION_CONFLICT',409,'市场版本已变化，请重新读取');
    const requestEtag = normalizeStep02IfMatch(ifMatch);
    if (requestEtag !== projected.etag && !/^"step02-[a-f0-9]{64}"$/.test(requestEtag)) throw codedError('STEP02_REVISION_CONFLICT',409,'市场版本已变化，请重新读取');
    const shot = projected.shots.find(item => item.shot_id === shotId);
    if (!shot) throw codedError('STEP02_SHOT_NOT_FOUND',404,'镜头不存在');
    const patch = validatePatch(body.patch,shotId);
    const revisionId = safeSegment(body.revision_id,/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/);
    const chain = await loadShotRevisions(files.directory,shotId);
    const requestSha = sha256(canonical({revision_id:revisionId,variant_id:variantId,shot_id:shotId,base_revision:body.base_revision || null,patch}));
    const existing = chain.commits.find(commit=>commit.revision.revision_id===revisionId);
    if (existing) {
      if (existing.request_sha256 !== requestSha) throw codedError('IDEMPOTENCY_PAYLOAD_MISMATCH',409,'相同 revision_id 对应不同内容');
      return {revision:existing.revision,idempotent:true,variant:projected};
    }
    const revision = {schema_version:'niannian.step02_shot_revision.v1',revision_id:revisionId,variant_id:variantId,shot_id:shotId,base_revision:body.base_revision || null,patch,actor_type:'human',actor_id:String(ownerId),created_at:new Date().toISOString()};
    const payloadSha = sha256(canonical(revision));
    if ((body.base_revision || null) !== chain.active) throw codedError('STEP02_REVISION_CONFLICT',409,'镜头基础版本已变化');
    const sequence = chain.commits.length + 1;
    const commit = {schema_version:'niannian.step02_shot_revision_commit.v1',sequence,request_sha256:requestSha,payload_sha256:payloadSha,committed_at:new Date().toISOString(),revision};
    if(typeof beforeCommit==='function')await beforeCommit({variant:projected,revision});
    await atomicWriteJson(path.join(chain.target,String(sequence).padStart(8,'0') + '-' + sha256(revisionId) + '.json'),commit,{exclusive:true});
    let nextState = files.state;
    if (files.state.status === 'confirmed') {
      nextState = {
        ...files.state,
        status:'ready',
        qa:null,
        confirmed_at:null,
        confirmed_sha256:null,
        updated_at:new Date().toISOString()
      };
      await atomicWriteJson(path.join(files.directory,'state.json'),nextState);
    }
    return {revision,idempotent:false,variant:await projectVariant(ownerId,files.descriptor,nextState,files.directory)};
  }

  async function createRevision(args) {
    return withWriteLock('variant-write:' + sha256(String(args.ownerId)) + ':' + String(args.variantId),() => createRevisionUnlocked(args));
  }

  async function createCandidateUnlocked({ownerId,project,variantId,shotId,ifMatch,body}) {
    validateProject(project);
    const files = await findVariant(ownerId,variantId);
    if (!['ready','qa_failed','confirmed'].includes(files.state.status)) throw codedError('STEP02_VARIANT_NOT_EDITABLE',409,'市场版本尚不可生成候选');
    const projected = await projectVariant(ownerId,files.descriptor,files.state,files.directory);
    if (!ifMatch || normalizeStep02IfMatch(ifMatch) !== projected.etag) throw codedError('STEP02_REVISION_CONFLICT',409,'市场版本已变化，请重新读取');
    const index = projected.shots.findIndex(item=>item.shot_id===shotId);
    if (index < 0) throw codedError('STEP02_SHOT_NOT_FOUND',404,'镜头不存在');
    const requestId = safeSegment(body.request_id,/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/);
    const request = {request_id:requestId,intent:stringField(body.intent || '保持原意换一种表达','intent',500,false),base_revision:projected.shots[index].active_revision || null,variant_etag:projected.etag};
    const candidateRoot = path.join(files.directory,'candidates',shotId);
    const candidatePath = path.join(candidateRoot,sha256(requestId) + '.json');
    const requestSha = sha256(canonical(request));
    const existing = await readJson(candidatePath).catch(error=>error.code==='ENOENT'?null:Promise.reject(error));
    if (existing) {
      verifyCandidate(existing,variantId,shotId);
      if (existing.request_sha256 !== requestSha) throw codedError('IDEMPOTENCY_PAYLOAD_MISMATCH',409,'相同 request_id 对应不同内容');
      return {candidate:existing,idempotent:true,variant_etag:projected.etag};
    }
    const sourceShot = files.snapshot.shots.find(item=>item.shot_id===shotId);
    const result = await callStrictJson({instructions:'你是念念AI单镜头改写器。仅生成候选，不覆盖用户内容。保持原意、人物连续性、时长和原片镜头功能；source_shot_ids 必须且只能包含当前 shot_id；只返回严格 JSON。',input:JSON.stringify({locale:files.descriptor.locale,intent:request.intent,previous:projected.shots[index-1]||null,current:projected.shots[index],next:projected.shots[index+1]||null,source:{shot_id:sourceShot.shot_id,dialogue:sourceShot.dialogue,ocr:sourceShot.ocr}}),name:'step02_shot_candidate_v1',schema:shotPlanJsonSchema()});
    const validated = validatePlanShot(result,sourceShot);
    const candidateFields = EDITABLE_FIELDS.filter(key=>!['manual_notes','review_status'].includes(key));
    const candidateCore = {schema_version:'niannian.step02_candidate.v1',candidate_id:'CAND-' + sha256(canonical({request,validated})).slice(0,24),variant_id:variantId,shot_id:shotId,base_revision:request.base_revision,request_id:requestId,request_sha256:requestSha,variant_etag:request.variant_etag,intent:request.intent,patch:Object.fromEntries(candidateFields.filter(key=>Object.prototype.hasOwnProperty.call(validated,key)).map(key=>[key,validated[key]])),requires_user_confirmation:true,created_at:new Date().toISOString()};
    const candidate = {...candidateCore,payload_sha256:sha256(canonical(candidateCore))};
    await atomicWriteJson(candidatePath,candidate,{exclusive:true});
    return {candidate,idempotent:false,variant_etag:projected.etag};
  }

  async function createCandidate(args) {
    const requestId = safeSegment(args.body?.request_id,/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/);
    return withWriteLock('candidate:' + sha256(String(args.ownerId)) + ':' + String(args.variantId) + ':' + String(args.shotId) + ':' + requestId,() => createCandidateUnlocked(args));
  }

  function verifyCandidate(candidate, variantId, shotId) {
    const unsigned = clone(candidate); delete unsigned.payload_sha256;
    const request = {request_id:candidate.request_id,intent:candidate.intent,base_revision:candidate.base_revision || null,variant_etag:candidate.variant_etag};
    if (candidate.schema_version !== 'niannian.step02_candidate.v1' || candidate.variant_id !== variantId || candidate.shot_id !== shotId || candidate.request_sha256 !== sha256(canonical(request)) || candidate.payload_sha256 !== sha256(canonical(unsigned)) || candidate.requires_user_confirmation !== true) throw codedError('STEP02_CANDIDATE_STORE_CORRUPT',503,'Step02 候选内容损坏');
    return candidate;
  }

  async function adoptCandidateUnlocked({ownerId,project,variantId,shotId,ifMatch,body,beforeCommit}) {
    const files = await findVariant(ownerId,variantId);
    const names = await fsp.readdir(path.join(files.directory,'candidates',shotId)).catch(error=>error.code==='ENOENT'?[]:Promise.reject(error));
    let candidate = null;
    for (const name of names.filter(name=>/^[a-f0-9]{64}\.json$/.test(name))) {
      const item = await readJson(path.join(files.directory,'candidates',shotId,name));
      if (item.candidate_id === body.candidate_id) { candidate = verifyCandidate(item,variantId,shotId); break; }
    }
    if (!candidate) throw codedError('STEP02_CANDIDATE_NOT_FOUND',404,'候选不存在');
    return createRevisionUnlocked({ownerId,project,variantId,shotId,ifMatch,body:{revision_id:body.revision_id,base_revision:candidate.base_revision,patch:candidate.patch},beforeCommit});
  }

  async function adoptCandidate(args) {
    return withWriteLock('variant-write:' + sha256(String(args.ownerId)) + ':' + String(args.variantId),() => adoptCandidateUnlocked(args));
  }

  async function confirmVariantUnlocked({ownerId,project,variantId,ifMatch}) {
    validateProject(project);
    const files = await findVariant(ownerId,variantId);
    const projected = await projectVariant(ownerId,files.descriptor,files.state,files.directory);
    if (!ifMatch || normalizeStep02IfMatch(ifMatch) !== projected.etag) throw codedError('STEP02_CONFIRM_CONFLICT',409,'确认前必须读回当前服务器版本');
    if (files.state.status === 'confirmed') return projected;
    if (!['ready','qa_failed'].includes(files.state.status) || projected.shots.length !== files.snapshot.shots.length || projected.shots.some(shot=>shot.source_shot_ids.length!==1||shot.source_shot_ids[0]!==shot.shot_id)) throw codedError('STEP02_CONFIRM_BLOCKED',409,'整集版本尚未满足一镜头一来源的确认条件');
    const qaRaw = await callStrictJson({instructions:'你是念念AI独立整集 QA。只返回严格 JSON，不调用工具。检查当前用户修订后的全部原片镜头映射、人物连续性、剧情因果、目标语言自然度、中文回译一致性和原镜头时长适配。人工锁定内容不可覆盖，只能给出 findings。',input:JSON.stringify({locale:files.descriptor.locale,global_context:files.descriptor.global_context,source:files.snapshot.shots.map(shot=>({shot_id:shot.shot_id,start_sec:shot.start_sec,end_sec:shot.end_sec,dialogue:(shot.dialogue||[]).map(row=>row.text)})),adaptation:projected.shots}),name:'step02_confirm_qa_v1',schema:qaJsonSchema()});
    const qa = validateQa(qaRaw);
    if (!qa.passed) {
      const rejected = {...files.state,status:'qa_failed',qa,error:null,updated_at:new Date().toISOString()};
      await atomicWriteJson(path.join(files.directory,'state.json'),rejected);
      throw codedError('STEP02_CONFIRM_QA_FAILED',409,'当前版本未通过整集 QA，请先核对建议');
    }
    const confirmed = {...files.state,status:'confirmed',qa,confirmed_at:new Date().toISOString(),confirmed_sha256:sha256(canonical({variant_id:variantId,snapshot_sha256:files.descriptor.snapshot_sha256,shots:projected.shots,qa})),updated_at:new Date().toISOString()};
    await atomicWriteJson(path.join(files.directory,'state.json'),confirmed);
    return projectVariant(ownerId,files.descriptor,confirmed,files.directory);
  }

  async function confirmVariant(args) {
    return withWriteLock('variant-write:' + sha256(String(args.ownerId)) + ':' + String(args.variantId),() => confirmVariantUnlocked(args));
  }

  async function probe({includeImage = false}) {
    const schema = {type:'object',additionalProperties:false,required:['ok','wire_api','image_input'],properties:{ok:{type:'boolean'},wire_api:{type:'string',enum:['responses']},image_input:{type:'boolean'}}};
    const content = [{type:'input_text',text:'Return ok=true, wire_api=responses, and image_input=' + String(includeImage)}];
    if (includeImage) content.push({type:'input_image',image_url:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='});
    const body = {model:process.env.NIANNIAN_GPT56_MODEL || 'gpt-5.6',store:false,instructions:'只输出严格 JSON。',input:[{role:'user',content}],text:{format:{type:'json_schema',name:'niannian_step02_capability_probe_v1',strict:true,schema}}};
    let raw = await responsesClient.call(body);
    let value;
    try { value = parseJsonObject(extractResponseText(raw)); }
    catch (error) {
      if (error.code !== 'MCGROX_JSON_INVALID') throw error;
      raw = await responsesClient.call({model:body.model,store:false,instructions:'修复下面内容为满足给定 schema 的严格 JSON。只输出 JSON，不添加解释。',input:String(error.raw || ''),text:{format:{type:'json_schema',name:'niannian_step02_capability_probe_v1_repair',strict:true,schema}}});
      value = parseJsonObject(extractResponseText(raw));
    }
    return {...value,response_model:typeof raw?.model === 'string' ? raw.model : null};
  }

  if (options.autoRecover !== false) setImmediate(() => { recoverPendingGenerations().catch(() => {}); });

  return {confirmStep01,getCurrentSnapshot,createVariant,listVariants,getVariant,createRevision,createCandidate,adoptCandidate,confirmVariant,probe,startGeneration,recoverPendingGenerations,constants:{SNAPSHOT_SCHEMA,VARIANT_SCHEMA,QA_SCHEMA,BUNDLE_VERSION,LOCALES,EDITABLE_FIELDS}};
}

module.exports = {createStep02Service,createResponsesClient,canonical,sha256,shotPlanJsonSchema,batchJsonSchema,qaJsonSchema,LOCALES,BUNDLE_VERSION,evidenceCounts};
