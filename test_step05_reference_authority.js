'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawnSync} = require('child_process');
const {Step05ReferenceAuthority, exactIdentity} = require('./bridge/niannian_step05_reference_authority');

function expectCode(fn, code) {
  let caught;
  try { fn(); } catch (error) { caught = error; }
  assert(caught, 'expected error ' + code);
  assert.equal(caught.code, code);
}

function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'step05-reference-authority-'));
  const stateFile = path.join(root, 'authority.json');
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'docs/agent-team/step05-reference-dual-track-20260727/fixtures/reference-authority.seed.json'), 'utf8'));
  fixture.references[0].actual_video_input = true;
  let tick = 0;
  const now = () => '2026-07-27T00:00:' + String(tick++).padStart(2, '0') + '.000Z';
  try {
    const store = new Step05ReferenceAuthority({stateFile, now});
    store.initialize(fixture);
    assert.equal(store.snapshot().state.project.delivery_target, 'FIRST_REAL_VIDEO_PLAYABLE');
    assert.deepEqual(store.snapshot().state.project.execution_scope, {mode:'minimal_first_video',video_group_ids:['V01']});
    const python = process.env.STEP05_SCHEMA_PYTHON || (fs.existsSync('C:\\Users\\lsb\\anaconda3\\python.exe') ? 'C:\\Users\\lsb\\anaconda3\\python.exe' : 'python3');
    const schemaResult = spawnSync(python, [path.join(__dirname, 'test_step05_reference_schema.py'), path.join(__dirname, 'docs/agent-team/step05-reference-dual-track-20260727/schemas/step05-reference-authority.schema.json'), stateFile], {encoding:'utf8'});
    assert.equal(schemaResult.status, 0, schemaResult.stderr || schemaResult.stdout);
    assert.equal(JSON.parse(schemaResult.stdout).validator, 'Draft202012Validator');

    const outOfScope = new Step05ReferenceAuthority({stateFile:path.join(root, 'out-of-scope.json'), now});
    const outOfScopeFixture = JSON.parse(JSON.stringify(fixture));
    outOfScopeFixture.references.find(ref => ref.ref_key === 'FIRST-V01').video_group = 'V99';
    expectCode(() => outOfScope.initialize(outOfScopeFixture), 'VIDEO_REFERENCE_OUT_OF_SCOPE');

    let etag = store.etag();
    store.recordSupportQa({ifMatch:etag, ref_key:'SUPPORT-HERO', status:'pass', confidence:0.99});
    let snap = store.snapshot();
    const support = snap.state.refs.find(ref => ref.ref_key === 'SUPPORT-HERO');
    assert.equal(support.actual_video_input, false, 'QA pass must not promote support to video input');
    assert.equal(support.confirmation, null, 'automatic QA must not create confirmation');
    assert(!store.userProjection().video_reference_cards.some(card => card.ref_key === 'SUPPORT-HERO'));
    expectCode(() => store.recordSupportQa({ifMatch:store.etag(), ref_key:'SUPPORT-HERO', status:'failed'}), 'QA_ACTION_REQUIRED');
    assert.equal(store.snapshot().state.refs.find(ref => ref.ref_key === 'SUPPORT-HERO').qa.status, 'pass');
    expectCode(() => store.assertDownstreamAllowed('provider_preflight'), 'VIDEO_REFERENCES_NOT_CONFIRMED');

    etag = store.etag();
    expectCode(() => store.registerStep04Authority({ifMatch:etag, reference:{...support, canonical_type:'video_upload_non_first_ref', authority_revision:'AUTH-3', authority_event_id:'AE-UPGRADE-BAD', authority_source:'payload_override'}}), 'STEP04_REGISTRATION_REQUIRED');
    assert.equal(store.etag(), etag);

    const items = snap.state.refs.filter(ref => ref.required && ref.actual_video_input).map(exactIdentity);
    expectCode(() => store.batchConfirm({idempotency_key:'batch-no-etag', confirmed_at:'2026-07-27T01:00:00.000Z', items}), 'IF_MATCH_REQUIRED');
    expectCode(() => store.batchConfirm({ifMatch:store.etag(), idempotency_key:'batch-missing', confirmed_at:'2026-07-27T01:00:00.000Z', items:items.slice(0,1)}), 'BATCH_CONFIRM_INCOMPLETE');
    assert.equal(store.gateStatus().confirmed_count, 0, 'partial invalid batch must be atomic');
    expectCode(() => store.batchConfirm({ifMatch:'"stale"', idempotency_key:'batch-stale-etag', confirmed_at:'2026-07-27T01:00:00.000Z', items}), 'ETAG_MISMATCH');
    assert.equal(store.gateStatus().confirmed_count, 0);

    const firstResult = store.batchConfirm({ifMatch:store.etag(), idempotency_key:'batch-1', confirmed_at:'2026-07-27T01:00:00.000Z', items});
    assert.equal(firstResult.confirmed_count, 2);
    assert.equal(store.assertDownstreamAllowed('video_task_spec').video_task_spec_locked, true);
    assert.equal(store.assertDownstreamAllowed('provider_preflight').video_task_spec_locked, true);
    assert.equal(store.assertDownstreamAllowed('provider_upload').video_task_spec_locked, true);
    assert.equal(store.assertDownstreamAllowed('provider_submit').video_task_spec_locked, true);
    const eventCount = store.snapshot().state.events.length;
    const replay = store.batchConfirm({ifMatch:etag, idempotency_key:'batch-1', confirmed_at:'2026-07-27T01:00:00.000Z', items});
    assert.equal(replay.batch_id, firstResult.batch_id);
    assert.equal(replay.idempotent, true);
    assert.equal(store.snapshot().state.events.length, eventCount, 'idempotent replay must not append events');

    const beforeReroll = store.snapshot().state.refs.find(ref => ref.ref_key === 'IDENTITY-HERO').confirmation;
    store.reroll({ifMatch:store.etag(), ref_key:'FIRST-V01', candidate_revision:'C-2', content_sha:'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd', authority_event_id:'AE-FIRST-2', public_candidate_url:'/media/first-v01-r2'});
    assert.equal(store.snapshot().state.refs.filter(ref => ref.ref_key === 'FIRST-V01' && ref.current).length, 1, 'one ref_key must have one current authority');
    assert.equal(store.gateStatus().confirmed_count, 1, 'reroll must preserve unrelated exact confirmation');
    assert.deepEqual(store.snapshot().state.refs.find(ref => ref.ref_key === 'IDENTITY-HERO').confirmation, beforeReroll);
    expectCode(() => store.assertDownstreamAllowed('provider_submit'), 'VIDEO_REFERENCES_NOT_CONFIRMED');

    const currentFirst = store.snapshot().state.refs.find(ref => ref.ref_key === 'FIRST-V01');
    const staleFirst = {...exactIdentity(currentFirst), content_sha:'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'};
    const currentIdentity = exactIdentity(store.snapshot().state.refs.find(ref => ref.ref_key === 'IDENTITY-HERO'));
    expectCode(() => store.batchConfirm({ifMatch:store.etag(), idempotency_key:'batch-old-sha', confirmed_at:'2026-07-27T02:00:00.000Z', items:[staleFirst]}), 'BATCH_CONFIRM_STALE_OR_INVALID');
    assert.equal(store.gateStatus().confirmed_count, 1);

    store.reject({ifMatch:store.etag(), ref_key:'FIRST-V01', issue_category:'构图不一致', note:'主体位置偏移'});
    const rejected = store.snapshot().state.refs.find(ref => ref.ref_key === 'FIRST-V01');
    expectCode(() => store.batchConfirm({ifMatch:store.etag(), idempotency_key:'batch-rejected', confirmed_at:'2026-07-27T02:01:00.000Z', items:[exactIdentity(rejected)]}), 'BATCH_CONFIRM_STALE_OR_INVALID');

    const restarted = new Step05ReferenceAuthority({stateFile, now});
    assert.equal(restarted.gateStatus().confirmed_count, 1, 'restart must recover exact confirmations');
    assert.equal(restarted.userProjection().counts.video_reference_pending, 1);
    assert.equal(restarted.userProjection().video_reference_cards.find(card => card.ref_key === 'FIRST-V01').decision, '不通过');

    const projectionText = JSON.stringify(restarted.userProjection());
    for (const forbidden of ['content_sha','authority_revision','localization_revision','authority_event_id','locked_prompt','provider','receipt','internal_path']) assert(!projectionText.includes(forbidden), 'safe projection leaked ' + forbidden);

    const hostileFixture = JSON.parse(JSON.stringify(fixture));
    hostileFixture.references.find(ref => ref.ref_key === 'FIRST-V01').source_fact_projection = {label:'C:\\private\\source.png', internal_path:'C:\\private', content_sha:'a'.repeat(64), url:'/signed/source?token=secret'};
    hostileFixture.references.find(ref => ref.ref_key === 'FIRST-V01').candidate.public_candidate_url = '/signed/candidate?signature=secret';
    const hostileStore = new Step05ReferenceAuthority({stateFile:path.join(root, 'hostile.json'), now});
    hostileStore.initialize(hostileFixture);
    const hostileProjection = hostileStore.userProjection();
    const hostileText = JSON.stringify(hostileProjection);
    assert.equal(hostileProjection.video_reference_cards.find(card => card.ref_key === 'FIRST-V01').source_fact.label, '原片来源事实已记录');
    for (const forbidden of ['private', 'content_sha', 'token', 'signature', 'secret', 'signed']) assert(!hostileText.toLowerCase().includes(forbidden), 'hostile projection leaked ' + forbidden);

    restarted.reroll({ifMatch:restarted.etag(), ref_key:'FIRST-V01', candidate_revision:'C-3', content_sha:'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', authority_event_id:'AE-FIRST-3', public_candidate_url:'/media/first-v01-r3'});
    const finalItems = [exactIdentity(restarted.snapshot().state.refs.find(ref => ref.ref_key === 'FIRST-V01'))];
    restarted.batchConfirm({ifMatch:restarted.etag(), idempotency_key:'batch-final', confirmed_at:'2026-07-27T03:00:00.000Z', items:finalItems});
    assert.equal(restarted.userProjection().status, '视频参考图已确认');
    assert.deepEqual(restarted.snapshot().state.refs.find(ref => ref.ref_key === 'IDENTITY-HERO').confirmation, beforeReroll, 'exact reroll reconfirm must not replace unaffected confirmation');

    const upgradeRoot = path.join(root, 'upgrade.json');
    const upgradeStore = new Step05ReferenceAuthority({stateFile:upgradeRoot, now});
    upgradeStore.initialize({...fixture, references:[fixture.references[0]]});
    const oldSupport = upgradeStore.snapshot().state.refs[0];
    upgradeStore.registerStep04Authority({ifMatch:upgradeStore.etag(), reference:{...oldSupport, canonical_type:'video_upload_non_first_ref', required:true, video_group:'V01', authority_revision:'AUTH-3', localization_revision:'LOC-7', authority_event_id:'AE-UPGRADE-1', authority_source:'step04_explicit_registration', candidate:{candidate_revision:'C-2',content_sha:'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',public_candidate_url:'/media/upgraded'}}});
    assert.equal(upgradeStore.snapshot().state.refs[0].actual_video_input, true);
    assert.equal(upgradeStore.gateStatus().video_task_spec_locked, false, 're-registration still requires user confirmation');

    const oldAuthority = exactIdentity(upgradeStore.snapshot().state.refs[0]);
    oldAuthority.authority_revision = 'AUTH-2';
    expectCode(() => upgradeStore.batchConfirm({ifMatch:upgradeStore.etag(), idempotency_key:'old-authority', confirmed_at:'2026-07-27T03:30:00.000Z', items:[oldAuthority]}), 'BATCH_CONFIRM_STALE_OR_INVALID');

    const oldLocalization = exactIdentity(upgradeStore.snapshot().state.refs[0]);
    oldLocalization.localization_revision = 'LOC-6';
    expectCode(() => upgradeStore.batchConfirm({ifMatch:upgradeStore.etag(), idempotency_key:'old-localization', confirmed_at:'2026-07-27T04:00:00.000Z', items:[oldLocalization]}), 'BATCH_CONFIRM_STALE_OR_INVALID');

    process.stdout.write(JSON.stringify({ok:true, verified:[
      'minimal FIRST_REAL_VIDEO_PLAYABLE scope', 'support QA remains non-video', 'explicit Step04 re-registration only', 'strong ETag and atomic batch',
      'idempotent replay', 'reroll local invalidation', 'stale/rejected exact identities blocked',
      'provider gates blocked until complete', 'restart recovery', 'safe Chinese projection', 'Draft 2020-12 schema validation'
    ]}) + '\n');
  } finally {
    fs.rmSync(root, {recursive:true, force:true});
  }
}

main();
