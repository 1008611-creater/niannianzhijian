'use strict';

const assert = require('assert');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const gate = require('./bridge/niannian_video_batch_gate');

const fixturePath = path.join(__dirname, 'docs', 'agent-team', 'video-batch-cost-gate', 'fixtures', 'happy-batch.json');
const fixedNow = Date.parse('2026-07-27T10:00:00.000Z');

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function fixture() { return JSON.parse(fs.readFileSync(fixturePath, 'utf8')); }
async function tempRoot(name) { return fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-video-batch-' + name + '-')); }
function confirmBody(result, max = null) {
  return {confirm_generate:true,quote_revision:result.state.quote.revision,confirmed_max_cost:max || result.state.quote.max_cost};
}
async function expectCode(promise, code) {
  await assert.rejects(promise, error => error && error.code === code, 'expected ' + code);
}

async function happyService(name, adapterOverrides = {}) {
  const adapter = gate.createFixtureAdapter(adapterOverrides);
  const root = await tempRoot(name);
  const service = gate.createService({root,adapter});
  const prepared = await service.lockAndPreflight({projectId:'project-001',ownerId:'owner-001',input:fixture(),now:fixedNow});
  return {adapter,root,service,prepared};
}

async function testLockedBatchAndPreflight() {
  const {adapter,root,service,prepared} = await happyService('locked');
  assert.equal(prepared.state.specs.length, 2);
  assert.equal(prepared.state.batch.task_count, 2);
  assert.equal(prepared.state.batch.total_duration_seconds, 18);
  assert.equal(prepared.state.batch.specs.length, 2);
  assert.equal(prepared.state.preflight.status, 'pass');
  assert.equal(prepared.state.preflight.submit_allowed, false);
  assert.equal(prepared.projection.submit_allowed, false);
  assert.equal(prepared.projection.state, '等待你确认');
  assert.equal(prepared.state.actions.filter(item => item.status === 'awaiting_user').length, 1);
  assert.equal(prepared.state.actions.at(-1).action_type, 'cost_authorization');
  assert.deepEqual(adapter.sideEffects, {network:0,login:0,secret_read:0,upload:0,submit:0,cost:0});
  assert.equal(typeof adapter.submit,'undefined');
  assert.equal(typeof service.submit,'undefined');
  const restarted = gate.createService({root,adapter});
  const readback = await restarted.getCurrent({projectId:'project-001',ownerId:'owner-001',now:fixedNow});
  assert.equal(readback.state.batch.batch_digest, prepared.state.batch.batch_digest);
  assert.equal(readback.etag, prepared.etag);
  assert.match(prepared.etag, /^"video-batch-[a-f0-9]{32}"$/);
  await expectCode(restarted.getCurrent({projectId:'project-001',ownerId:'other-owner',now:fixedNow}), 'VIDEO_BATCH_NOT_FOUND');
}

async function testReferenceRejections() {
  const mutations = [
    ['candidate', ref => { ref.authority_class='candidate'; }],
    ['support-only', ref => { ref.role='support_asset_ref'; ref.support_only=true; }],
    ['rejected', ref => { ref.rejected=true; }],
    ['stale', ref => { ref.stale=true; }],
    ['unconfirmed', ref => { ref.status='candidate'; }],
    ['revision', ref => { ref.confirmation_revision='step05-confirm-old'; }]
  ];
  for (const [name, mutate] of mutations) {
    const root = await tempRoot('ref-' + name);
    const service = gate.createService({root,adapter:gate.createFixtureAdapter()});
    const input=fixture(); mutate(input.groups[0].references[0]);
    await assert.rejects(service.lockAndPreflight({projectId:'project-001',ownerId:'owner-001',input,now:fixedNow}), error => /^VIDEO_BATCH_REFERENCE_/.test(error.code));
    const stored=await service.load('project-001');
    assert.equal(stored.batch, null);
    assert.notEqual(stored.authorization?.status, 'current');
  }
}

async function testPreflightBlockers() {
  const cases = [
    [{login_status:'missing'},'login'],
    [{secret_config_status:'missing'},'secret_config'],
    [{permission_status:'missing'},'permission'],
    [{supported_resolutions:['1080p']},'provider_policy'],
    [{output_contract_status:'missing'},'permission']
  ];
  for (const [overrides, actionType] of cases) {
    const {prepared,adapter,service} = await happyService('block-' + actionType + '-' + Math.random(), overrides);
    assert.equal(prepared.state.preflight.status, 'blocked');
    assert.equal(prepared.projection.submit_allowed, false);
    assert.equal(prepared.state.actions.at(-1).action_type, actionType);
    assert.deepEqual(adapter.sideEffects, {network:0,login:0,secret_read:0,upload:0,submit:0,cost:0});
    const readAgain=await service.lockAndPreflight({projectId:'project-001',ownerId:'owner-001',input:fixture(),now:fixedNow+100});
    assert.equal(readAgain.state.revision,prepared.state.revision);
    assert.equal(readAgain.state.actions.length,1);
  }
}

async function testConfirmationContract() {
  const {service,prepared} = await happyService('confirm');
  const body=confirmBody(prepared);
  const confirmed=await service.confirm({projectId:'project-001',ownerId:'owner-001',ifMatch:prepared.etag,idempotencyKey:'confirm-key-001',body,now:fixedNow+1000});
  assert.equal(confirmed.projection.submit_allowed,true);
  assert.equal(confirmed.projection.state,'等待提交/处理中');
  assert.equal(confirmed.state.authorization.task_count,2);
  assert.equal(confirmed.state.submission.status,'authorized_not_submitted');
  assert.equal(confirmed.state.submission.submit_invocation_count,0);
  const eventId=confirmed.state.authorization.event_id;
  const replay=await service.confirm({projectId:'project-001',ownerId:'owner-001',ifMatch:prepared.etag,idempotencyKey:'confirm-key-001',body,now:fixedNow+2000});
  assert.equal(replay.state.authorization.event_id,eventId);
  assert.equal(Object.keys(replay.state.idempotency).length,1);
  await expectCode(service.confirm({projectId:'project-001',ownerId:'owner-001',ifMatch:confirmed.etag,idempotencyKey:'confirm-key-001',body:{...body,confirmed_max_cost:{currency:'CNY',minor_units:body.confirmed_max_cost.minor_units-1}},now:fixedNow+3000}),'VIDEO_BATCH_IDEMPOTENCY_CONFLICT');

  for (const [name, ifMatch, key] of [['missing',null,'k-missing'],['weak','W/'+prepared.etag,'k-weak'],['stale','"video-batch-deadbeefdeadbeefdeadbeefdeadbeef"','k-stale']]) {
    const sample=await happyService('etag-'+name);
    await expectCode(sample.service.confirm({projectId:'project-001',ownerId:'owner-001',ifMatch,idempotencyKey:key,body:confirmBody(sample.prepared),now:fixedNow+1000}),'VIDEO_BATCH_IF_MATCH_FAILED');
  }
  const expired=await happyService('expired');
  await expectCode(expired.service.confirm({projectId:'project-001',ownerId:'owner-001',ifMatch:expired.prepared.etag,idempotencyKey:'expired-key',body:confirmBody(expired.prepared),now:fixedNow+31*60*1000}),'VIDEO_BATCH_QUOTE_EXPIRED');
}

async function testAuthorizationInvalidation() {
  const changes = [
    input => { input.groups[0].prompt.locked_digest='dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'; },
    input => { input.groups[0].references[0].confirmed_digest='eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'; },
    input => { input.groups.pop(); },
    input => { input.groups[0].duration_seconds=12; },
    input => { input.groups[0].aspect_ratio='16:9'; },
    input => { input.groups[0].resolution='1080p'; },
    input => { input.groups[0].audio_requirement='optional'; },
    input => { input.groups[0].allowed_channel_class='multimodal-video-premium'; },
    input => { input.authority.localization_revision='localization-r4'; }
  ];
  for (let index=0; index<changes.length; index+=1) {
    const adapterOverrides=index===7?{allowed_channel_classes:['multimodal-video-standard','multimodal-video-premium']}:{};
    const {service,prepared}=await happyService('invalidate-'+index,adapterOverrides);
    await service.confirm({projectId:'project-001',ownerId:'owner-001',ifMatch:prepared.etag,idempotencyKey:'confirm-'+index,body:confirmBody(prepared),now:fixedNow+1000});
    const changed=fixture(); changes[index](changed);
    const next=await service.lockAndPreflight({projectId:'project-001',ownerId:'owner-001',input:changed,now:fixedNow+2000});
    assert.equal(next.state.authorization.status,'stale_input');
    assert.equal(next.projection.submit_allowed,false);
    assert.equal(next.projection.state,'输入已变化需重确认');
    assert.notEqual(next.state.batch.batch_digest,prepared.state.batch.batch_digest);
  }
  const priced=await happyService('invalidate-cost');
  await priced.service.confirm({projectId:'project-001',ownerId:'owner-001',ifMatch:priced.prepared.etag,idempotencyKey:'confirm-cost',body:confirmBody(priced.prepared),now:fixedNow+1000});
  const repricedAdapter=gate.createFixtureAdapter({per_second_minor_units:25});
  const repricedService=gate.createService({root:priced.root,adapter:repricedAdapter});
  const repriced=await repricedService.lockAndPreflight({projectId:'project-001',ownerId:'owner-001',input:fixture(),now:fixedNow+2000});
  assert.equal(repriced.state.authorization.status,'stale_input');
  assert.equal(repriced.projection.submit_allowed,false);
  assert.ok(repriced.state.quote.estimated_cost.minor_units > priced.prepared.state.quote.estimated_cost.minor_units);
  assert.notEqual(repriced.state.quote.revision,priced.prepared.state.quote.revision);
}

async function testExpiredQuoteCanRefresh() {
  const root=await tempRoot('quote-refresh');
  const service=gate.createService({root,adapter:gate.createFixtureAdapter()});
  const first=await service.lockAndPreflight({projectId:'project-refresh',ownerId:'owner-001',input:fixture(),now:fixedNow,quoteTtlMs:1000});
  await service.confirm({projectId:'project-refresh',ownerId:'owner-001',ifMatch:first.etag,idempotencyKey:'refresh-confirm-1',body:confirmBody(first),now:fixedNow+100});
  const expired=await service.getCurrent({projectId:'project-refresh',ownerId:'owner-001',now:fixedNow+1100});
  assert.equal(expired.projection.state,'授权已过期');
  assert.equal(expired.projection.submit_allowed,false);

  const refreshed=await service.lockAndPreflight({projectId:'project-refresh',ownerId:'owner-001',input:fixture(),now:fixedNow+1200,quoteTtlMs:1000});
  assert.notEqual(refreshed.state.quote.revision,first.state.quote.revision);
  assert.notEqual(refreshed.etag,expired.etag);
  assert.equal(refreshed.state.authorization.status,'expired');
  assert.equal(refreshed.projection.state,'授权已过期');
  assert.equal(refreshed.projection.submit_allowed,false);
  assert.equal(refreshed.projection.action.type,'cost_authorization');

  const reconfirmed=await service.confirm({projectId:'project-refresh',ownerId:'owner-001',ifMatch:refreshed.etag,idempotencyKey:'refresh-confirm-2',body:confirmBody(refreshed),now:fixedNow+1300});
  assert.equal(reconfirmed.projection.submit_allowed,true);
}

async function testQuotaRebatch() {
  const {service,prepared}=await happyService('quota',{quota_minor_units:300});
  assert.equal(prepared.state.preflight.status,'blocked');
  assert.equal(prepared.state.batch.task_count,2);
  assert.equal(prepared.projection.submit_allowed,false);
  assert.equal(prepared.state.submission,null);
  const smaller=await service.rebatchForQuota({projectId:'project-001',ownerId:'owner-001',affordableSpecIds:[prepared.state.specs[0].spec_id],now:fixedNow+1000});
  assert.equal(smaller.state.batch.task_count,1);
  assert.equal(smaller.state.preflight.status,'pass');
  assert.notEqual(smaller.state.batch.batch_digest,prepared.state.batch.batch_digest);
  assert.equal(smaller.projection.submit_allowed,false);
  assert.equal(smaller.state.authorization?.status||'missing','missing');
}

async function testReconcileProtection() {
  for (const status of ['submitted','running','completed','unknown_after_network_error']) {
    const {service,prepared,root,adapter}=await happyService('reconcile-'+status);
    const confirmed=await service.confirm({projectId:'project-001',ownerId:'owner-001',ifMatch:prepared.etag,idempotencyKey:'key-'+status,body:confirmBody(prepared),now:fixedNow+1000});
    await service.recordSubmissionStatus({projectId:'project-001',ownerId:'owner-001',status,taskStates:[{spec_id:confirmed.state.specs[0].spec_id,status:status==='completed'?'completed':'running'}],now:fixedNow+2000});
    const restarted=gate.createService({root,adapter});
    const decision=await restarted.submissionDecision({projectId:'project-001',ownerId:'owner-001',now:fixedNow+3000});
    assert.equal(decision.reconcile_required,true);
    assert.equal(decision.resubmit_allowed,false);
    assert.equal(decision.submit_invocation_count,0);
    assert.equal(decision.submission_identity,confirmed.state.submission.identity);
  }
  const {service,prepared}=await happyService('closure');
  const confirmed=await service.confirm({projectId:'project-001',ownerId:'owner-001',ifMatch:prepared.etag,idempotencyKey:'closure-key',body:confirmBody(prepared),now:fixedNow+1000});
  await service.recordSubmissionStatus({projectId:'project-001',ownerId:'owner-001',status:'failed',taskStates:[{spec_id:confirmed.state.specs[0].spec_id,status:'failed'},{spec_id:confirmed.state.specs[1].spec_id,status:'completed'}],now:fixedNow+2000});
  const decision=await service.submissionDecision({projectId:'project-001',ownerId:'owner-001',now:fixedNow+3000});
  assert.deepEqual(decision.affected_dependency_closure,[confirmed.state.specs[0].spec_id]);
  const dependentInput=fixture();dependentInput.groups[1].dependency_group_ids=['V001'];
  const dependentRoot=await tempRoot('dependent-closure');const dependentService=gate.createService({root:dependentRoot,adapter:gate.createFixtureAdapter()});
  const dependentPrepared=await dependentService.lockAndPreflight({projectId:'project-001',ownerId:'owner-001',input:dependentInput,now:fixedNow});
  const dependentConfirmed=await dependentService.confirm({projectId:'project-001',ownerId:'owner-001',ifMatch:dependentPrepared.etag,idempotencyKey:'dependent-key',body:confirmBody(dependentPrepared),now:fixedNow+1000});
  await dependentService.recordSubmissionStatus({projectId:'project-001',ownerId:'owner-001',status:'failed',taskStates:[{spec_id:dependentConfirmed.state.specs[0].spec_id,status:'failed'},{spec_id:dependentConfirmed.state.specs[1].spec_id,status:'prepared'}],now:fixedNow+2000});
  const dependentDecision=await dependentService.submissionDecision({projectId:'project-001',ownerId:'owner-001',now:fixedNow+3000});
  assert.deepEqual(new Set(dependentDecision.affected_dependency_closure),new Set(dependentConfirmed.state.specs.map(item=>item.spec_id)));
}

async function testPublicProjectionSecretBoundary() {
  const {prepared}=await happyService('public');
  const raw=JSON.stringify(prepared.projection);
  for (const forbidden of ['spec_digest','batch_digest','confirmed_digest','provider_task_id','receipt','credential','cookie','token','secret','exact_path','sha256']) assert.equal(raw.includes(forbidden),false,forbidden);
  assert.equal(raw.includes('V001-firstframe'),false);
  assert.deepEqual(Object.keys(prepared.projection.plan).sort(),['aspect_ratio','batch_id','estimated_wait_seconds','resolution','task_count','total_duration_seconds'].sort());
}

async function testDurableHumanActionOutbox(){
  const root=await tempRoot('human-action-outbox');
  const service=gate.createService({root,adapter:gate.createFixtureAdapter()});
  const prepared=await service.lockAndPreflight({projectId:'project-001',ownerId:'owner-001',ownerRef:'codex-thread:video-batch-owner',input:fixture(),now:fixedNow});
  assert.equal(prepared.state.actions.length,1);
  assert.equal(prepared.state.actions[0].action_type,'cost_authorization');
  assert.equal(prepared.state.actions[0].safe_entry_id,'current_video_batch_plan');
  const restarted=gate.createService({root,adapter:gate.createFixtureAdapter()});
  const durable=await restarted.getCurrent({projectId:'project-001',ownerId:'owner-001',now:fixedNow+100});
  assert.equal(durable.state.actions.length,1);
  assert.equal(durable.projection.action.type,'cost_authorization');
  const confirmed=await restarted.confirm({projectId:'project-001',ownerId:'owner-001',ifMatch:durable.etag,idempotencyKey:'human-action-confirm',body:confirmBody(durable),now:fixedNow+1000});
  assert.equal(confirmed.projection.submit_allowed,true);
  assert.equal(confirmed.state.actions[0].status,'resumed');
}

async function main() {
  const tests=[testLockedBatchAndPreflight,testReferenceRejections,testPreflightBlockers,testConfirmationContract,testAuthorizationInvalidation,testExpiredQuoteCanRefresh,testQuotaRebatch,testReconcileProtection,testPublicProjectionSecretBoundary,testDurableHumanActionOutbox];
  for (const test of tests) { await test(); process.stdout.write('PASS ' + test.name + '\n'); }
  process.stdout.write('PASS video batch cost gate: fixture-only, no provider submit path\n');
}

main().catch(error => { console.error(error.stack || error); process.exitCode=1; });
