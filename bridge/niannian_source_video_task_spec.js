'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const step02 = require('./niannian_redraw_step02_vertical');

const SCHEMA = 'source_video_task_spec_v1';
const CHANNEL = 'mimo';
const ADAPTER_IDENTITY = 'mimo_source_nas_8001_v1';
const ENDPOINT_IDENTITY = 'http://nas.mimo.fashion:8001';
const AUTH_NAMESPACE = 'macos_keychain:ai.niannian.mimo.nas8001.bearer.v1/niannian-mimo-worker';
const PROFILES = Object.freeze(['prepare_only','synthetic_fake_transport']);
const EFFECTS = Object.freeze([
  'media_provider_network_requested','media_provider_upload_requested','media_provider_submit_requested',
  'spend_requested','package_send_requested','registry_promotion_requested','deployment_requested',
  'local_image_editing_requested','real_delivery'
]);

function codeError(code, detail) { const error = new Error(code + (detail ? ':' + detail : '')); error.code = code; return error; }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function stableJson(value) {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
function canonicalSha(value) { return sha256(Buffer.from(stableJson(value), 'utf8')); }
function falseEffects() { return Object.fromEntries(EFFECTS.map(key => [key, false])); }
function assertFalseEffects(value, code = 'SOURCE_VIDEO_EFFECT_AUTHORITY_INVALID') {
  for (const key of EFFECTS) if (value?.[key] !== false) throw codeError(code, key);
}
function safeId(value, code = 'SOURCE_VIDEO_ID_INVALID') {
  const normalized = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,119}$/.test(normalized)) throw codeError(code);
  return normalized;
}
function inside(root, candidate) { const base = path.resolve(root); const target = path.resolve(candidate), prefix=base.endsWith(path.sep)?base:base+path.sep; return target === base || target.startsWith(prefix); }

async function assertNoSymlinkPath(root, exactPath) {
  const base = path.resolve(root), target = path.resolve(exactPath);
  if (!inside(base, target)) throw codeError('SOURCE_VIDEO_ARTIFACT_ROOT_ESCAPE');
  const relative = path.relative(base, target);
  let current = base;
  const rootStats = await fsp.lstat(base).catch(() => null);
  if (!rootStats?.isDirectory() || rootStats.isSymbolicLink()) throw codeError('SOURCE_VIDEO_JOB_ROOT_INVALID');
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const stats = await fsp.lstat(current).catch(() => null);
    if (!stats) throw codeError('SOURCE_VIDEO_ARTIFACT_MISSING', path.relative(base, current));
    if (stats.isSymbolicLink()) throw codeError('SOURCE_VIDEO_ARTIFACT_SYMLINK_FORBIDDEN', path.relative(base, current));
  }
}

async function fileEvidence(exactPath, root) {
  const resolved = path.resolve(exactPath);
  if (String(resolved).split(path.sep).some(part => /^latest$/i.test(part))) throw codeError('SOURCE_VIDEO_LATEST_PATH_FORBIDDEN');
  await assertNoSymlinkPath(root, resolved);
  const stats = await fsp.lstat(resolved).catch(() => null);
  if (!stats?.isFile() || stats.isSymbolicLink()) throw codeError('SOURCE_VIDEO_ARTIFACT_REGULAR_FILE_REQUIRED');
  const real = await fsp.realpath(resolved);
  if (real !== resolved || !inside(root, real)) throw codeError('SOURCE_VIDEO_ARTIFACT_REALPATH_INVALID');
  const bytes = await fsp.readFile(real);
  return {exact_path:real,relative_path:path.relative(path.resolve(root),real).split(path.sep).join('/'),sha256:sha256(bytes),bytes:bytes.length,buffer:bytes};
}

async function jsonEvidence(exactPath, root) {
  const evidence = await fileEvidence(exactPath, root);
  try { return {...evidence,json:JSON.parse(evidence.buffer.toString('utf8'))}; }
  catch { throw codeError('SOURCE_VIDEO_JSON_PARSE_FAILED', evidence.relative_path); }
}

function assertPointer(pointer, evidence, code) {
  if (!pointer || path.resolve(String(pointer.exact_path || '')) !== evidence.exact_path || pointer.sha256 !== evidence.sha256 || Number(pointer.bytes) !== evidence.bytes) throw codeError(code);
}

function validateFreshAuthority(authority, channel, nowMs) {
  if (!authority || authority.schema_version !== 'source_video_provider_execution_authority_v1' || authority.status !== 'current') throw codeError('SOURCE_VIDEO_STALE_AUTHORITY');
  if (!Array.isArray(authority.allowed_channels) || !authority.allowed_channels.includes(channel) || authority.allowed_channels.some(value => /krill|codex/i.test(String(value)))) throw codeError('SOURCE_VIDEO_CHANNEL_AUTHORITY_INVALID');
  const checkedAt=Date.parse(authority.checked_at), expiresAt=Date.parse(authority.expires_at);
  if (!Number.isFinite(nowMs) || !Number.isFinite(checkedAt) || !Number.isFinite(expiresAt) || checkedAt > nowMs || expiresAt <= nowMs) throw codeError('SOURCE_VIDEO_STALE_AUTHORITY');
  const quota = authority.quota || {};
  if (quota.status !== 'sufficient' || quota.fresh !== true || !Number.isFinite(Number(quota.available_units)) || Number(quota.available_units) < 0) throw codeError('SOURCE_VIDEO_QUOTA_BLOCKED');
  const cost = authority.cost || {};
  if (cost.status !== 'authorized' || cost.fresh !== true || !Number.isFinite(Number(cost.estimated)) || !Number.isFinite(Number(cost.max_authorized)) || Number(cost.estimated) < 0 || Number(cost.max_authorized) < Number(cost.estimated) || Number(quota.available_units) < Number(cost.estimated) || Number(quota.available_units) < Number(cost.max_authorized)) throw codeError('SOURCE_VIDEO_COST_AUTHORIZATION_BLOCKED');
  const submit = authority.submit_authority || {};
  if (submit.granted !== false || submit.transaction_id !== null || submit.channel_id !== null) throw codeError('SOURCE_VIDEO_SUBMIT_AUTHORITY_MUST_REMAIN_FALSE');
  return authority;
}

async function readAcceptedInputs({project,jobRoot,groupId,nowMs = Date.now()}) {
  const step02Accepted = await step02.verifyAcceptedForProject({project,jobRoot});
  const step02Evidence = step02Accepted.evidence;
  const step04Evidence = await jsonEvidence(path.join(jobRoot, 'step04', 'step04_acceptance_manifest.json'), jobRoot);
  const step04 = step04Evidence.json;
  if (step04.schema_version !== 'source_step04_acceptance_manifest_v1' || step04.status !== 'accepted' || step04.downstream_consumable !== true || step04.test_only !== false || step04.fixture_evidence === true || step04.project_id !== project.id || step04.source_sha256 !== project.source.sha256 || step04.step02_acceptance_sha256 !== step02Evidence.sha256 || step04.step05_ready !== true) throw codeError('SOURCE_VIDEO_STEP04_ACCEPTANCE_INVALID');
  assertFalseEffects(step04, 'SOURCE_VIDEO_STEP04_EFFECT_INVALID');
  const step05Evidence = await jsonEvidence(path.join(jobRoot, 'step05', 'groups', groupId, 'step05_acceptance_manifest.json'), jobRoot);
  const step05 = step05Evidence.json;
  if (step05.schema_version !== 'source_step05_acceptance_manifest_v1' || step05.status !== 'accepted' || step05.downstream_consumable !== true || step05.test_only !== false || step05.fixture_evidence === true || step05.project_id !== project.id || step05.group_id !== groupId || step05.source_sha256 !== project.source.sha256 || step05.step02_acceptance_sha256 !== step02Evidence.sha256 || step05.step04_acceptance_sha256 !== step04Evidence.sha256 || step05.video_spec_ready !== true) throw codeError('SOURCE_VIDEO_STEP05_ACCEPTANCE_INVALID');
  assertFalseEffects(step05, 'SOURCE_VIDEO_STEP05_EFFECT_INVALID');
  const promptEvidence = await fileEvidence(String(step05.locked_prompt?.exact_path || ''), jobRoot);
  assertPointer(step05.locked_prompt, promptEvidence, 'SOURCE_VIDEO_PROMPT_POINTER_INVALID');
  const assets = Array.isArray(step05.confirmed_assets) ? step05.confirmed_assets : [];
  if (!assets.length || assets.length > 12) throw codeError('SOURCE_VIDEO_REFERENCE_COUNT_INVALID');
  const ids = new Set(), paths = new Set(), folds = new Set();
  const references = [];
  for (const asset of assets) {
    const assetId = safeId(asset.asset_id, 'SOURCE_VIDEO_REFERENCE_ID_INVALID');
    const evidence = await fileEvidence(String(asset.exact_path || ''), jobRoot);
    assertPointer(asset, evidence, 'SOURCE_VIDEO_REFERENCE_POINTER_INVALID');
    const fold = evidence.relative_path.toLocaleLowerCase('en-US');
    if (ids.has(assetId) || paths.has(evidence.relative_path) || folds.has(fold)) throw codeError('SOURCE_VIDEO_REFERENCE_DUPLICATE');
    ids.add(assetId); paths.add(evidence.relative_path); folds.add(fold);
    const materialType = String(asset.material_type || 'image');
    if (!['image','audio'].includes(materialType) || asset.group_id !== groupId || asset.confirmed_by_user !== true || asset.upload_eligible !== true || asset.local_image_editing_requested !== false || !String(asset.duty_zh || '').trim()) throw codeError('SOURCE_VIDEO_REFERENCE_AUTHORITY_INVALID');
    references.push({asset_id:assetId,group_id:groupId,material_type:materialType,exact_path:evidence.exact_path,relative_path:evidence.relative_path,sha256:evidence.sha256,bytes:evidence.bytes,duty_zh:String(asset.duty_zh).trim(),confirmed_by_user:true,upload_eligible:true,local_image_editing_requested:false});
  }
  if (references.filter(item => item.material_type === 'audio').length > 3) throw codeError('SOURCE_VIDEO_AUDIO_REFERENCE_COUNT_INVALID');
  const authorityEvidence = await jsonEvidence(path.join(jobRoot, 'provider_execution_authority.json'), jobRoot);
  validateFreshAuthority(authorityEvidence.json, CHANNEL, nowMs);
  if (authorityEvidence.json.project_id !== project.id || authorityEvidence.json.owner_id !== project.ownerId || authorityEvidence.json.source_sha256 !== project.source.sha256 || authorityEvidence.json.step02_acceptance_sha256 !== step02Evidence.sha256 || authorityEvidence.json.step04_acceptance_sha256 !== step04Evidence.sha256 || authorityEvidence.json.step05_acceptance_sha256 !== step05Evidence.sha256) throw codeError('SOURCE_VIDEO_AUTHORITY_BINDING_INVALID');
  return {step02:step02Evidence,step04:step04Evidence,step05:step05Evidence,prompt:promptEvidence,references,authority:authorityEvidence};
}

function validateSpec(spec, {jobRoot,allowTestOnly = true} = {}) {
  if (!spec || spec.schema_version !== SCHEMA || spec.task_kind !== 'source_video_redraw' || spec.provider !== CHANNEL || spec.adapter_identity !== ADAPTER_IDENTITY || spec.endpoint_identity !== ENDPOINT_IDENTITY || spec.auth_namespace !== AUTH_NAMESPACE) throw codeError('SOURCE_VIDEO_SPEC_IDENTITY_INVALID');
  for (const name of ['project_id','job_id','group_id','spec_id','transaction_id','idempotency_key']) safeId(spec[name], 'SOURCE_VIDEO_SPEC_ID_INVALID');
  if (spec.employee_model_channel !== null || /krill|codex/i.test(stableJson({provider:spec.provider,adapter_identity:spec.adapter_identity,allowed_channels:spec.allowed_channels}))) throw codeError('SOURCE_VIDEO_MODEL_CHANNEL_SEPARATION_INVALID');
  if (!PROFILES.includes(spec.execution_profile) || (spec.execution_profile==='synthetic_fake_transport')!==spec.test_only) throw codeError('SOURCE_VIDEO_SPEC_PROFILE_INVALID');
  if (spec.test_only !== false && !(allowTestOnly && spec.test_only === true)) throw codeError('SOURCE_VIDEO_SPEC_TEST_ONLY_INVALID');
  if (spec.execution_mode !== spec.execution_profile) throw codeError('SOURCE_VIDEO_SPEC_EXECUTION_MODE_INVALID');
  if (!Array.isArray(spec.allowed_channels) || spec.allowed_channels.length !== 1 || spec.allowed_channels[0] !== CHANNEL) throw codeError('SOURCE_VIDEO_SPEC_ALLOWED_CHANNEL_INVALID');
  if (!spec.authority || spec.authority.submit_authority_granted!==false || spec.authority.explicit_submit_transaction_id!==null || spec.authority.explicit_submit_channel_id!==null) throw codeError('SOURCE_VIDEO_SPEC_SUBMIT_AUTHORITY_INVALID');
  const acceptanceNames=['step02','step04','step05'];
  if (!spec.acceptance || !acceptanceNames.every(name => /^[a-f0-9]{64}$/.test(String(spec.acceptance[name + '_sha256'] || ''))) || !acceptanceNames.every(name=>path.isAbsolute(String(spec.acceptance[name+'_exact_path']||'')))) throw codeError('SOURCE_VIDEO_SPEC_ACCEPTANCE_INVALID');
  if (!spec.prompt || !/^[a-f0-9]{64}$/.test(String(spec.prompt.sha256 || ''))) throw codeError('SOURCE_VIDEO_SPEC_PROMPT_INVALID');
  if (!Array.isArray(spec.references) || !spec.references.length || spec.references.length > 12 || spec.references.filter(item => item.material_type === 'audio').length > 3 || spec.references.some(item => !['image','audio'].includes(item.material_type) || item.confirmed_by_user !== true || item.upload_eligible !== true || item.local_image_editing_requested !== false || !String(item.duty_zh || '').trim())) throw codeError('SOURCE_VIDEO_SPEC_REFERENCES_INVALID');
  if (!path.isAbsolute(String(spec.source?.trusted_root||'')) || !inside(spec.source.trusted_root,spec.source?.exact_path) || !/^[a-f0-9]{64}$/.test(String(spec.source.sha256||'')) || !spec.source.ffprobe_contract || !spec.media || !(Number(spec.media.source_duration_seconds) > 0) || Number(spec.media.duration_sec) !== Math.ceil(Number(spec.media.source_duration_seconds)) || Number(spec.media.duration_sec) < 2 || Number(spec.media.duration_sec) > 15 || !/^\d+:\d+$/.test(String(spec.media.aspect_ratio || '')) || !/^\d+x\d+$/.test(String(spec.media.resolution || '')) || !spec.media.audio_policy || !spec.media.model || !spec.qa_requirements) throw codeError('SOURCE_VIDEO_SPEC_MEDIA_INVALID');
  if (!spec.output_roots || !path.isAbsolute(spec.output_roots.transaction_root) || !path.isAbsolute(spec.output_roots.media_root) || (jobRoot && (!inside(jobRoot,spec.output_roots.transaction_root) || !inside(jobRoot,spec.output_roots.media_root)))) throw codeError('SOURCE_VIDEO_SPEC_OUTPUT_ROOT_INVALID');
  assertFalseEffects(spec);
  return spec;
}

async function revalidateSpecFiles(spec,{jobRoot,nowMs=Date.now()}={}){
  validateSpec(spec,{jobRoot,allowTestOnly:true});
  const source=await fileEvidence(spec.source.exact_path,spec.source.trusted_root);
  if(source.sha256!==spec.source.sha256||source.bytes!==Number(spec.source.bytes))throw codeError('SOURCE_VIDEO_SOURCE_TAMPER');
  const probe=spec.source.ffprobe_contract||{};
  if(!Number.isFinite(Number(probe.duration_seconds))||Number(probe.duration_seconds)<=0||!Number.isFinite(Number(probe.width))||Number(probe.width)<=0||!Number.isFinite(Number(probe.height))||Number(probe.height)<=0||!Number.isFinite(Number(probe.fps))||Number(probe.fps)<=0||!Number.isInteger(Number(probe.audio_stream_count))||Number(probe.audio_stream_count)<0||!Array.isArray(probe.audio_sample_rates)||probe.audio_sample_rates.some(value=>!Number.isFinite(Number(value))||Number(value)<=0))throw codeError('SOURCE_VIDEO_SOURCE_FFPROBE_CONTRACT_INVALID');
  for(const name of ['step02','step04','step05']){
    const current=await fileEvidence(spec.acceptance[name+'_exact_path'],jobRoot);
    if(current.sha256!==spec.acceptance[name+'_sha256']||current.bytes!==Number(spec.acceptance[name+'_bytes']))throw codeError('SOURCE_VIDEO_ACCEPTANCE_TAMPER',name);
  }
  const prompt=await fileEvidence(spec.prompt.exact_path,jobRoot);
  if(prompt.sha256!==spec.prompt.sha256||prompt.bytes!==Number(spec.prompt.bytes))throw codeError('SOURCE_VIDEO_PROMPT_TAMPER');
  for(const reference of spec.references){const current=await fileEvidence(reference.exact_path,jobRoot);if(current.sha256!==reference.sha256||current.bytes!==Number(reference.bytes)||reference.group_id!==spec.group_id)throw codeError('SOURCE_VIDEO_REFERENCE_TAMPER',reference.asset_id);}
  const authority=await jsonEvidence(spec.authority.exact_path,jobRoot);
  if(authority.sha256!==spec.authority.sha256||authority.bytes!==Number(spec.authority.bytes))throw codeError('SOURCE_VIDEO_AUTHORITY_TAMPER');
  validateFreshAuthority(authority.json,CHANNEL,nowMs);
  if(authority.json.project_id!==spec.project_id||authority.json.source_sha256!==spec.source.sha256||authority.json.step02_acceptance_sha256!==spec.acceptance.step02_sha256||authority.json.step04_acceptance_sha256!==spec.acceptance.step04_sha256||authority.json.step05_acceptance_sha256!==spec.acceptance.step05_sha256)throw codeError('SOURCE_VIDEO_AUTHORITY_BINDING_INVALID');
  return{source,prompt,authority,acceptance_verified:true,references_verified:spec.references.length,checked_at:new Date(nowMs).toISOString()};
}

async function buildExecutionAuthority({specPath,jobRoot,ownerActionPath,workerCapabilityPath,featureFlag='off',nowMs=Date.now()}){
  if(featureFlag!=='on')throw codeError('SOURCE_VIDEO_REAL_PROVIDER_FEATURE_DISABLED');
  const specEvidence=await jsonEvidence(specPath,jobRoot),spec=validateSpec(specEvidence.json,{jobRoot,allowTestOnly:false});
  if(spec.test_only!==false||spec.execution_profile!=='prepare_only')throw codeError('SOURCE_VIDEO_PRODUCTION_SPEC_REQUIRED');
  await revalidateSpecFiles(spec,{jobRoot,nowMs});
  const actionEvidence=await jsonEvidence(ownerActionPath,jobRoot),action=actionEvidence.json,capabilityEvidence=await jsonEvidence(workerCapabilityPath,jobRoot),capability=capabilityEvidence.json;
  const expectedTransaction='submit-'+canonicalSha({spec_sha256:specEvidence.sha256,idempotency_key:spec.idempotency_key,owner_action_event_id:action.event_id,channel:CHANNEL}).slice(0,32);
  if(action.schema_version!=='source_video_owner_submit_action_v1'||action.status!=='confirmed'||action.consumed!==false||action.project_id!==spec.project_id||action.group_id!==spec.group_id||action.channel_id!==CHANNEL||action.transaction_id!==expectedTransaction||!Number.isFinite(Date.parse(action.confirmed_at))||Number(action.spend_cap)!==Number(spec.authority.cost.max_authorized))throw codeError('SOURCE_VIDEO_OWNER_SUBMIT_ACTION_INVALID');
  if(capability.schema_version!=='source_video_mac_worker_capability_v1'||capability.status!=='ready'||capability.channel_id!==CHANNEL||capability.adapter_identity!==ADAPTER_IDENTITY||!Number.isFinite(Date.parse(capability.checked_at))||!Number.isFinite(Date.parse(capability.expires_at))||Date.parse(capability.expires_at)<=nowMs)throw codeError('SOURCE_VIDEO_MAC_WORKER_CAPABILITY_INVALID');
  return{schema_version:'source_video_execution_authority_v1',status:'authorized_unused',one_time:true,project_id:spec.project_id,job_id:spec.job_id,group_id:spec.group_id,transaction_id:expectedTransaction,idempotency_key:spec.idempotency_key,channel_id:CHANNEL,adapter_identity:ADAPTER_IDENTITY,spec:{exact_path:specEvidence.exact_path,sha256:specEvidence.sha256,bytes:specEvidence.bytes},owner_action:{exact_path:actionEvidence.exact_path,sha256:actionEvidence.sha256,bytes:actionEvidence.bytes,event_id:action.event_id},quota:spec.authority.quota,cost:spec.authority.cost,spend_cap:Number(action.spend_cap),mac_worker_capability:{exact_path:capabilityEvidence.exact_path,sha256:capabilityEvidence.sha256,bytes:capabilityEvidence.bytes},authorized_at:new Date(nowMs).toISOString(),expires_at:capability.expires_at,...falseEffects()};
}
async function consumeExecutionAuthority({authorityPath,jobRoot,specPath,featureFlag='off',nowMs=Date.now()}){
  if(featureFlag!=='on')throw codeError('SOURCE_VIDEO_REAL_PROVIDER_FEATURE_DISABLED');
  const authorityEvidence=await jsonEvidence(authorityPath,jobRoot),authority=authorityEvidence.json,specEvidence=await jsonEvidence(specPath,jobRoot);
  if(authority.schema_version!=='source_video_execution_authority_v1'||authority.status!=='authorized_unused'||authority.one_time!==true||authority.spec?.exact_path!==specEvidence.exact_path||authority.spec?.sha256!==specEvidence.sha256||authority.spec?.bytes!==specEvidence.bytes||authority.idempotency_key!==specEvidence.json.idempotency_key||authority.project_id!==specEvidence.json.project_id||authority.group_id!==specEvidence.json.group_id||authority.channel_id!==CHANNEL)throw codeError('SOURCE_VIDEO_EXECUTION_AUTHORITY_INVALID');
  await revalidateSpecFiles(specEvidence.json,{jobRoot,nowMs});
  const owner=await jsonEvidence(authority.owner_action?.exact_path,jobRoot),capability=await jsonEvidence(authority.mac_worker_capability?.exact_path,jobRoot),expectedTransaction='submit-'+canonicalSha({spec_sha256:specEvidence.sha256,idempotency_key:specEvidence.json.idempotency_key,owner_action_event_id:authority.owner_action.event_id,channel:CHANNEL}).slice(0,32);
  if(owner.sha256!==authority.owner_action.sha256||owner.bytes!==Number(authority.owner_action.bytes)||owner.json.schema_version!=='source_video_owner_submit_action_v1'||owner.json.status!=='confirmed'||owner.json.consumed!==false||owner.json.event_id!==authority.owner_action.event_id||owner.json.project_id!==authority.project_id||owner.json.group_id!==authority.group_id||owner.json.channel_id!==CHANNEL||owner.json.transaction_id!==expectedTransaction||!Number.isFinite(Date.parse(owner.json.confirmed_at))||Number(owner.json.spend_cap)!==Number(authority.spend_cap)||capability.sha256!==authority.mac_worker_capability.sha256||capability.bytes!==Number(authority.mac_worker_capability.bytes)||capability.json.status!=='ready'||!Number.isFinite(Date.parse(capability.json.checked_at))||!Number.isFinite(Date.parse(capability.json.expires_at))||Date.parse(capability.json.expires_at)<=nowMs||!Number.isFinite(Date.parse(authority.expires_at))||Date.parse(authority.expires_at)<=nowMs||authority.transaction_id!==expectedTransaction)throw codeError('SOURCE_VIDEO_EXECUTION_AUTHORITY_INVALID');
  const marker=authorityPath+'.consumed.json';try{await fsp.writeFile(marker,JSON.stringify({schema_version:'source_video_execution_authority_consumption_v1',authority_sha256:authorityEvidence.sha256,transaction_id:authority.transaction_id,consumed_at:new Date().toISOString()})+'\n',{flag:'wx'});}catch(error){if(error.code==='EEXIST')throw codeError('SOURCE_VIDEO_EXECUTION_AUTHORITY_ALREADY_CONSUMED');throw error;}
  return{authority,evidence:authorityEvidence,consumption_marker:marker};
}

async function buildSpec({project,jobRoot,groupId = 'V001',testOnly = false,profile=null,trustedSourceRoot=null,now = new Date().toISOString(),nowMs = Date.parse(now)}) {
  if (!project?.id || !project?.ownerId || !project?.source?.sha256 || !project?.source?.bytes) throw codeError('SOURCE_VIDEO_PROJECT_INVALID');
  const group = safeId(groupId, 'SOURCE_VIDEO_GROUP_ID_INVALID').toUpperCase();
  const executionProfile=profile|| (testOnly?'synthetic_fake_transport':'prepare_only');
  if(!PROFILES.includes(executionProfile))throw codeError('SOURCE_VIDEO_SPEC_PROFILE_INVALID');
  const accepted = await readAcceptedInputs({project,jobRoot,groupId:group,nowMs});
  const createdAt = String(accepted.step05.json.accepted_at || now);
  const acceptance = {step02_exact_path:accepted.step02.exact_path,step02_sha256:accepted.step02.sha256,step02_bytes:accepted.step02.bytes,step04_exact_path:accepted.step04.exact_path,step04_sha256:accepted.step04.sha256,step04_bytes:accepted.step04.bytes,step05_exact_path:accepted.step05.exact_path,step05_sha256:accepted.step05.sha256,step05_bytes:accepted.step05.bytes};
  const identityMaterial = {project_id:project.id,job_id:accepted.step02.json.job_id,group_id:group,source_sha256:project.source.sha256,acceptance,prompt_sha256:accepted.prompt.sha256,references:accepted.references.map(item => ({asset_id:item.asset_id,sha256:item.sha256,duty_zh:item.duty_zh})),channel:CHANNEL,test_only:testOnly===true,execution_profile:executionProfile};
  const digest = canonicalSha(identityMaterial);
  const specId = 'spec-' + digest.slice(0,32);
  const transactionId = 'txn-' + digest.slice(0,32);
  const transactionRoot = path.join(path.resolve(jobRoot), 'provider-executions', transactionId);
  const media = accepted.step05.json.media_contract || {};
  const sourceDurationSeconds = Number(media.source_duration_seconds || media.duration_sec);
  const durationSec = Math.ceil(sourceDurationSeconds);
  const audioCount = accepted.references.filter(item => item.material_type === 'audio').length;
  const sourceRoot=path.resolve(trustedSourceRoot||project.source.trustedRoot||'');if(!sourceRoot||!inside(sourceRoot,project.source.storedPath))throw codeError('SOURCE_VIDEO_TRUSTED_SOURCE_ROOT_INVALID');await assertNoSymlinkPath(sourceRoot,project.source.storedPath);
  const ffprobeContract={duration_seconds:Number(project.preflight?.durationSeconds),width:Number(project.preflight?.video?.width),height:Number(project.preflight?.video?.height),fps:Number(project.preflight?.video?.fps),audio_stream_count:Number(project.preflight?.audio?.streamCount),audio_sample_rates:Array.isArray(project.preflight?.audio?.sampleRates)?project.preflight.audio.sampleRates.map(Number):[]};
  if(!Number.isFinite(ffprobeContract.duration_seconds)||ffprobeContract.duration_seconds<=0||!Number.isFinite(ffprobeContract.width)||!Number.isFinite(ffprobeContract.height)||!Number.isFinite(ffprobeContract.fps)||ffprobeContract.audio_stream_count<0)throw codeError('SOURCE_VIDEO_SOURCE_FFPROBE_CONTRACT_INVALID');
  const spec = {
    schema_version:SCHEMA,task_kind:'source_video_redraw',status:'immutable_prepared',test_only:testOnly === true,execution_profile:executionProfile,execution_mode:executionProfile,
    project_id:project.id,job_id:accepted.step02.json.job_id,group_id:group,spec_id:specId,transaction_id:transactionId,idempotency_key:'idem-' + digest,
    source:{trusted_root:sourceRoot,exact_path:path.resolve(project.source.storedPath),sha256:project.source.sha256,bytes:Number(project.source.bytes),ffprobe_contract:ffprobeContract},acceptance,
    prompt:{exact_path:accepted.prompt.exact_path,relative_path:accepted.prompt.relative_path,sha256:accepted.prompt.sha256,bytes:accepted.prompt.bytes},
    references:accepted.references,
    media:{source_duration_seconds:sourceDurationSeconds,duration_sec:durationSec,aspect_ratio:String(media.aspect_ratio || project.aspectRatio || ''),resolution:String(media.resolution || project.quality || ''),audio_policy:String(media.audio_policy || ''),model:String(media.model || ''),audio_count:audioCount,audio_payload_shape:'audioVid',voice_timbre_status:audioCount>0?'locked_pending_provider_readback':'voice_timbre_unlocked'},
    provider:CHANNEL,adapter_identity:ADAPTER_IDENTITY,endpoint_identity:ENDPOINT_IDENTITY,auth_namespace:AUTH_NAMESPACE,allowed_channels:[CHANNEL],employee_model_channel:null,
    authority:{exact_path:accepted.authority.exact_path,sha256:accepted.authority.sha256,bytes:accepted.authority.bytes,checked_at:accepted.authority.json.checked_at,expires_at:accepted.authority.json.expires_at,quota:accepted.authority.json.quota,cost:accepted.authority.json.cost,submit_authority_granted:false,explicit_submit_transaction_id:null,explicit_submit_channel_id:null},
    output_roots:{transaction_root:transactionRoot,media_root:path.join(transactionRoot,'media')},
    retry_policy:{provider_task_id_exists:'poll_download_probe_visualQa_only',submit_unknown:'reconcile_before_any_submit',blind_resubmit_forbidden:true},
    qa_requirements:{duration_tolerance_seconds:1.5,aspect_ratio:'9:16',resolution_policy:String(media.resolution||project.quality||''),audio_required:audioCount>0,media_probe_receipt_required:true,visual_qa_receipt_required:true,local_image_remediation_allowed:false},
    ...falseEffects(),created_at:createdAt
  };
  return validateSpec(spec,{jobRoot,allowTestOnly:true});
}

module.exports = {ADAPTER_IDENTITY,AUTH_NAMESPACE,CHANNEL,EFFECTS,ENDPOINT_IDENTITY,PROFILES,SCHEMA,assertFalseEffects,buildExecutionAuthority,buildSpec,canonicalSha,codeError,consumeExecutionAuthority,falseEffects,fileEvidence,jsonEvidence,readAcceptedInputs,revalidateSpecFiles,sha256,stableJson,validateFreshAuthority,validateSpec};
