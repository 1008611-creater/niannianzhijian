'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const {createDolaSkillAdapter} = require('./bridge/niannian_dola_skill_adapter');
const videoChannelRegistry = require('./bridge/niannian_video_channel_registry');

function capability(overrides = {}) {
  return {
    schema_version:'dola2api_capabilities_v1',
    adapter_identity:'dola2api_local_bridge_v1',
    ready:true,
    proxy_configured:true,
    region_restricted:false,
    cdp_available:true,
    extension_count:2,
    login_state:'authenticated',
    allowed_actions:['preflight','prepare_route'],
    provider_submit_enabled:false,
    provider_upload_enabled:false,
    spend_enabled:false,
    ...overrides
  };
}

function policy(actions) {
  return {allowed_channels:['dola'],allowed_actions:actions,nonbillable_preflight_enabled:true,prepare_enabled:true,provider_submit_enabled:false};
}

async function main() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-dola-route-'));
  try {
    const calls = [];
    const adapter = createDolaSkillAdapter({
      verifyEvidence:false,
      requestJson:async (url, options) => { calls.push({url,method:options.method}); return capability(); }
    });
    const preflight = await adapter.route({action:'preflight',projectId:'PROJECT-DOLA-001',taskKind:'source_video',projectPolicy:policy(['display','preflight']),transaction:null});
    assert.equal(preflight.route_decision.status, 'preflight_passed');
    assert.deepEqual(preflight.route_decision.ordered_skill_chain, ['ai-video-production-router','mx-shortdrama-00-router','prompt-skill-router','ai-video-channel-router','dola-video-channel']);
    assert.equal(preflight.dispatch_envelope, null);
    assert.equal(preflight.route_decision.media_provider_submit_requested, false);
    assert.equal(calls.length, 1);

    const promptPath = path.join(root, 'prompt.txt');
    const promptBytes = Buffer.from('镜头缓慢向前穿行于清晨森林，真实自然，电影质感，画面稳定。');
    await fsp.writeFile(promptPath, promptBytes, {flag:'wx'});
    const spec = {schema_version:'video_task_spec_v1',status:'locked',prompt_path:promptPath,prompt_sha256:crypto.createHash('sha256').update(promptBytes).digest('hex'),submit_allowed:false,cost_gate:{authorized:false}};
    const specPath = path.join(root, 'video_task_spec.json');
    const bytes = Buffer.from(JSON.stringify(spec) + '\n');
    await fsp.writeFile(specPath, bytes, {flag:'wx'});
    const taskSpec = {exact_path:specPath,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};
    const transaction = {id:'dola-prepare-transaction-001',confirmed_id:'dola-prepare-transaction-001',channel_id:'dola',project_id:'PROJECT-DOLA-001',status:'confirmed'};
    const prepared = await adapter.route({action:'prepare',projectId:'PROJECT-DOLA-001',taskKind:'source_video',projectPolicy:policy(['display','preflight','prepare']),transaction,taskSpec,trustedRoot:root});
    assert.equal(prepared.route_decision.status, 'prepare_dispatch_ready');
    assert.equal(prepared.dispatch_envelope.dispatch_to, 'target_system_controller');
    assert.equal(prepared.dispatch_envelope.target_controller, 'niannian_video_controller');
    assert.equal(prepared.dispatch_envelope.constraints.submit_allowed, false);
    assert.equal(prepared.dispatch_envelope.task_spec.prompt.sha256, spec.prompt_sha256);
    assert.equal(prepared.dispatch_envelope.media_provider_upload_requested, false);
    assert.equal(prepared.dispatch_envelope.spend_requested, false);

    await assert.rejects(
      () => adapter.route({action:'prepare',projectId:'PROJECT-DOLA-001',taskKind:'source_video',projectPolicy:policy(['prepare']),transaction:{...transaction,confirmed_id:'different'},taskSpec,trustedRoot:root}),
      error => error.code === 'DOLA_ROUTE_GATE_BLOCKED' && /exact_transaction_missing/.test(error.message)
    );
    await assert.rejects(
      () => adapter.route({action:'real_submit',projectId:'PROJECT-DOLA-001',taskKind:'source_video',projectPolicy:policy(['real_submit']),transaction}),
      error => error.code === 'DOLA_ROUTE_GATE_BLOCKED' && /website_real_submit_not_integrated/.test(error.message)
    );

    const badPrompt = Buffer.from('第 1 秒到第 3 秒展示森林。');
    await fsp.writeFile(promptPath, badPrompt);
    const badSpecBytes = Buffer.from(JSON.stringify({...spec,prompt_sha256:crypto.createHash('sha256').update(badPrompt).digest('hex')}) + '\n');
    await fsp.writeFile(specPath, badSpecBytes);
    await assert.rejects(
      () => adapter.route({action:'prepare',projectId:'PROJECT-DOLA-001',taskKind:'source_video',projectPolicy:policy(['prepare']),transaction,taskSpec:{exact_path:specPath,sha256:crypto.createHash('sha256').update(badSpecBytes).digest('hex'),bytes:badSpecBytes.length},trustedRoot:root}),
      error => error.code === 'DOLA_ROUTE_PROMPT_SECONDS_FORBIDDEN'
    );

    const blocked = createDolaSkillAdapter({verifyEvidence:false,requestJson:async () => capability({ready:false,region_restricted:true})});
    await assert.rejects(
      () => blocked.route({action:'preflight',projectId:'PROJECT-DOLA-002',taskKind:'source_video',projectPolicy:policy(['preflight']),transaction:null}),
      error => error.code === 'DOLA_BRIDGE_PREFLIGHT_BLOCKED' && /region_restricted/.test(error.message)
    );
    const registry = await videoChannelRegistry.loadVideoChannelEvidenceRegistry(undefined, {verifyEvidence:false});
    const dola = registry.channels.find(item => item.channel_id === 'dola');
    assert.equal(videoChannelRegistry.validateVideoChannelRecord(dola).adapter_identity, 'dola2api_local_bridge_v1');
    assert.throws(() => videoChannelRegistry.validateVideoChannelRecord({...dola, endpoint_identity:'http://example.com'}), error => error.code === 'video_channel_dola_identity_conflict');
    const serverSource = await fsp.readFile(path.join(__dirname, 'server.js'), 'utf8');
    assert(serverSource.includes("'/api/video-channels/dola/preflight'"));
    assert(serverSource.includes("/video-channel-route\\/dola\\/prepare"));
    process.stdout.write(JSON.stringify({ok:true,verified:['exact Skill chain selection','live bridge capability contract','exact task spec SHA/bytes readback','target-controller-only prepare envelope','no upload, submit, spend, local edit, or delivery promotion','real submit and mismatched transaction fail closed']}) + '\n');
  } finally {
    await fsp.rm(root, {recursive:true,force:true});
  }
}

if (require.main === module) main().catch(error => { process.stderr.write(String(error.stack || error) + '\n'); process.exitCode = 1; });

module.exports = {capability,policy};
