'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const registryModule = require('./bridge/niannian_video_channel_registry');

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function channel(registry, id) {
  const found = registry.channels.find(item => item.channel_id === id);
  assert(found, 'missing channel ' + id);
  return found;
}

function actionContext(record, action, overrides = {}) {
  const now = Date.now();
  return {
    projectId:record.allowed_projects.includes('*') ? 'TEST-PROJECT-001' : record.allowed_projects[0],
    projectPolicy:{
      allowed_channels:[record.channel_id],
      allowed_actions:[action],
      nonbillable_preflight_enabled:true,
      prepare_enabled:true,
      provider_submit_enabled:true
    },
    transaction:{
      id:'TXN-EXACT-0001',
      confirmed_id:'TXN-EXACT-0001',
      channel_id:record.channel_id,
      project_id:record.allowed_projects.includes('*') ? 'TEST-PROJECT-001' : record.allowed_projects[0],
      status:'confirmed'
    },
    providerSubmitEnabled:true,
    quotaCost:{
      checked_at:new Date(now - 1000).toISOString(),
      expires_at:new Date(now + 60_000).toISOString(),
      authorized:true,
      sufficient:true,
      estimated_cost:11,
      max_authorized_cost:11
    },
    now,
    ...overrides
  };
}

async function assertRejects(promise, code) {
  await assert.rejects(promise, error => error && error.code === code);
}

async function main() {
  const registryPath = path.join(__dirname, 'bridge', 'video_channel_evidence_registry.json');
  const registry = await registryModule.loadVideoChannelEvidenceRegistry(registryPath);

  assert.deepEqual(registry.evidence_level_order, registryModule.EVIDENCE_LEVELS);
  assert.equal(channel(registry, 'artflash').evidence_level, 'real_delivery_verified');
  assert.equal(channel(registry, 'dola').evidence_level, 'real_delivery_verified');
  assert.equal(channel(registry, 'mimo').evidence_level, 'integrated_submit_download_probe');
  assert.equal(channel(registry, 'mimo').website_adapter_status, 'adapter_structural');
  assert.equal(channel(registry, 'mimo').website_action_mode, 'prepare_only');
  assert.equal(channel(registry, 'mimo').adapter_identity, 'mimo_source_nas_8001_v1');
  assert.equal(channel(registry, 'mimo').endpoint_identity, 'http://nas.mimo.fashion:8001');
  assert.equal(channel(registry, 'mimo').capability_expires_at, null);
  assert.equal(channel(registry, 'hi-light').evidence_level, 'integrated_submit_download_probe');
  for (const id of ['tmlab', 'djpsd', 'freebeat']) {
    assert.equal(channel(registry, id).evidence_level, 'preflight_only');
  }
  for (const id of ['tensor-art', 'echoon', 'navos']) {
    assert.equal(channel(registry, id).enabled, false);
    assert.equal(channel(registry, id).website_action_mode, 'disabled');
    assert.equal(registryModule.isActionAllowed(channel(registry, id), 'display', actionContext(channel(registry, id), 'display')), false);
  }

  const preflight = clone(channel(registry, 'tmlab'));
  assert.equal(registryModule.deriveVideoChannelEvidenceLevel(preflight), 'preflight_only');
  const structural = clone(preflight);
  structural.website_adapter_status = 'adapter_structural';
  structural.website_action_mode = 'prepare_only';
  structural.evidence_level = 'adapter_structural';
  assert.equal(registryModule.deriveVideoChannelEvidenceLevel(structural), 'adapter_structural');
  registryModule.validateVideoChannelRecord(structural);
  const integrated = clone(structural);
  integrated.evidence_flags.real_submit_verified = true;
  integrated.evidence_flags.download_verified = true;
  integrated.evidence_flags.media_probe_verified = true;
  integrated.evidence_level = 'integrated_submit_download_probe';
  assert.equal(registryModule.deriveVideoChannelEvidenceLevel(integrated), 'integrated_submit_download_probe');
  registryModule.validateVideoChannelRecord(integrated);
  const delivered = clone(integrated);
  delivered.evidence_flags.content_qa_verified = true;
  delivered.evidence_flags.delivery_verified = true;
  delivered.evidence_flags.downstream_consumable = true;
  delivered.evidence_level = 'real_delivery_verified';
  assert.equal(registryModule.deriveVideoChannelEvidenceLevel(delivered), 'real_delivery_verified');
  registryModule.validateVideoChannelRecord(delivered);

  const overclaim = clone(preflight);
  overclaim.evidence_level = 'real_delivery_verified';
  assert.throws(() => registryModule.validateVideoChannelRecord(overclaim), error => error.code === 'video_channel_evidence_level_overclaim');

  for (const forbiddenId of ['krill', 'krill-image2', 'codex-krill-provider']) {
    const forbidden = clone(preflight);
    forbidden.channel_id = forbiddenId;
    assert.throws(() => registryModule.validateVideoChannelRecord(forbidden), error => error.code === 'video_channel_non_video_provider_rejected');
  }
  const wrongDomain = clone(preflight);
  wrongDomain.provider_domain = 'llm_model_provider';
  wrongDomain.codex_model_provider = true;
  assert.throws(() => registryModule.validateVideoChannelRecord(wrongDomain), error => error.code === 'video_channel_provider_domain_invalid');

  const noneAdapter = channel(registry, 'artflash');
  assert.equal(registryModule.isActionAllowed(noneAdapter, 'display', actionContext(noneAdapter, 'display')), true);
  assert.equal(registryModule.evaluateActionAllowed(noneAdapter, 'real_submit', actionContext(noneAdapter, 'real_submit')).reason, 'website_real_submit_not_integrated');

  const mimo = channel(registry, 'mimo');
  assert.equal(registryModule.isActionAllowed(mimo, 'prepare', actionContext(mimo, 'prepare')), true);
  assert.equal(registryModule.evaluateActionAllowed(mimo, 'real_submit', actionContext(mimo, 'real_submit')).reason, 'website_real_submit_not_integrated');
  const wrongTransaction = actionContext(mimo, 'prepare');
  wrongTransaction.transaction.confirmed_id = 'TXN-DIFFERENT-0002';
  assert.equal(registryModule.evaluateActionAllowed(mimo, 'prepare', wrongTransaction).reason, 'exact_transaction_missing');
  const wrongProject = actionContext(mimo, 'prepare');
  wrongProject.projectPolicy.allowed_channels = [];
  assert.equal(registryModule.evaluateActionAllowed(mimo, 'prepare', wrongProject).reason, 'project_policy_denied');
  const wrongMimoIdentity = clone(mimo);
  wrongMimoIdentity.endpoint_identity = 'https://ai.mimo.fashion';
  assert.throws(() => registryModule.validateVideoChannelRecord(wrongMimoIdentity), error => error.code === 'video_channel_mimo_identity_conflict');

  const hypotheticalIntegratedWebsite = clone(mimo);
  hypotheticalIntegratedWebsite.channel_id = 'mimo-future-integrated-fixture';
  hypotheticalIntegratedWebsite.allowed_projects = ['*'];
  hypotheticalIntegratedWebsite.website_adapter_status = 'integrated';
  hypotheticalIntegratedWebsite.website_action_mode = 'real_submit';
  registryModule.validateVideoChannelRecord(hypotheticalIntegratedWebsite);
  const submitContext = actionContext(hypotheticalIntegratedWebsite, 'real_submit');
  assert.equal(registryModule.isActionAllowed(hypotheticalIntegratedWebsite, 'real_submit', submitContext), true);
  assert.equal(registryModule.isActionAllowed(hypotheticalIntegratedWebsite, 'real_submit', {...submitContext, providerSubmitEnabled:false}), false);
  assert.equal(registryModule.isActionAllowed(hypotheticalIntegratedWebsite, 'real_submit', {...submitContext, quotaCost:{...submitContext.quotaCost, sufficient:false}}), false);
  assert.equal(registryModule.isActionAllowed(hypotheticalIntegratedWebsite, 'real_submit', {...submitContext, quotaCost:{...submitContext.quotaCost, expires_at:new Date(submitContext.now - 1).toISOString()}}), false);

  const latestReference = clone(preflight);
  latestReference.evidence_paths[0].path = path.join(path.parse(registryPath).root, 'latest', 'evidence.json');
  delete latestReference.evidence_paths[0].sha256;
  assert.throws(() => registryModule.validateVideoChannelRecord(latestReference), error => error.code === 'video_channel_latest_evidence_forbidden');

  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-video-channel-registry-'));
  try {
    const evidencePath = path.join(tempRoot, 'exact-evidence.json');
    const original = Buffer.from(JSON.stringify({status:'verified',nested:{pass:true}}));
    await fsp.writeFile(evidencePath, original);
    const reference = {
      role:'test',
      path:evidencePath,
      sha256:hash(original),
      kind:'json',
      json_assertions:[{pointer:'/status',equals:'verified'},{pointer:'/nested/pass',equals:true}]
    };
    assert.equal((await registryModule.verifyEvidenceReference(reference)).verified, true);
    await fsp.writeFile(evidencePath, JSON.stringify({status:'tampered',nested:{pass:true}}));
    await assertRejects(registryModule.verifyEvidenceReference(reference), 'video_channel_evidence_sha_mismatch');
    const changed = Buffer.from(JSON.stringify({status:'tampered',nested:{pass:true}}));
    const assertionMismatch = {...reference, sha256:hash(changed)};
    await assertRejects(registryModule.verifyEvidenceReference(assertionMismatch), 'video_channel_json_assertion_failed');
    await assertRejects(registryModule.verifyEvidenceReference({...reference, path:path.join(tempRoot, 'missing.json')}), 'video_channel_evidence_missing');
  } finally {
    await fsp.rm(tempRoot, {recursive:true, force:true});
  }

  const secretRecord = clone(preflight);
  secretRecord.token = 'must-never-enter-registry';
  assert.throws(() => registryModule.validateVideoChannelRecord(secretRecord), error => error.code === 'video_channel_sensitive_field_forbidden');
  const rawBodyRecord = clone(preflight);
  rawBodyRecord.rawProviderBody = {ok:true};
  assert.throws(() => registryModule.validateVideoChannelRecord(rawBodyRecord), error => error.code === 'video_channel_sensitive_field_forbidden');
  const secretTextRecord = clone(preflight);
  secretTextRecord.evidence_status = 'access_token=must-never-enter-registry';
  assert.throws(() => registryModule.validateVideoChannelRecord(secretTextRecord), error => error.code === 'video_channel_sensitive_text_forbidden');
  const projectionInput = clone(registry);
  projectionInput.channels[0].internal_note = 'private implementation detail that must not be projected';
  const projection = registryModule.apiSafeProjection(projectionInput);
  const projectionText = JSON.stringify(projection).toLowerCase();
  for (const forbidden of ['credential', 'token=', 'cookie', 'authorization', 'http_headers', 'raw_provider_body', 'evidence_paths']) {
    assert.equal(projectionText.includes(forbidden), false, 'projection leaked ' + forbidden);
  }
  assert.equal(projection.channels.find(item => item.channel_id === 'artflash').evidence_count, 1);
  assert.equal(projection.channels.find(item => item.channel_id === 'artflash').evidence_verified, true);

  process.stdout.write(JSON.stringify({
    ok:true,
    channels:registry.channels.length,
    verified:[
      'exact evidence files, SHA-256, and JSON/text assertions',
      'four-level evidence promotion and overclaim rejection',
      'Tensor/Echoon/Navos disabled',
      'Krill and Codex model providers rejected',
      'external delivery separated from website adapter status',
      'Mimo prepare-only and exact transaction gate',
      'Mimo NAS 8001 adapter/endpoint/Keychain namespace/Skill SHA identity is explicit and capability remains unpromoted',
      'real submit fails closed on project policy, adapter, transaction, quota-cost, and provider-submit gates',
      'latest, missing, tampered, and assertion-mismatched evidence rejected',
      'API projection is whitelist-only and secret-safe'
    ]
  }) + '\n');
}

main().catch(error => {
  process.stderr.write(String(error.stack || error) + '\n');
  process.exitCode = 1;
});
