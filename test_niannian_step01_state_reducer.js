'use strict';

const assert = require('assert');
const reducer = require('./bridge/niannian_step01_state_reducer');

const blocked = reducer.reduceStep01State({
  status:{status:'blocked_resource',blocker:{class:'resource',retryable:true},next_action:'restore runtime',updated_at:'2026-07-12T13:06:16Z'},
  receipt:{dispatch_id:'cw-test',production_status:'blocked_resource',worker_status:'blocked',written_at:'2026-07-12T13:06:16Z'},
  dispatch:{dispatch_id:'cw-test',status:'running',worker_status:'starting',process_id:1799},
  ledger:{artifacts:[
    {artifact_id:'source_video',status:'verified'},
    {artifact_id:'step01_ep001_partial_evidence_manifest',status:'diagnostic'},
    {artifact_id:'step01_ep001_validation_report',status:'diagnostic'},
    {artifact_id:'step01_ep001_audio_status',status:'diagnostic'}
  ]},
  events:[{type:'worker_receipt_observed'}]
});
assert.equal(blocked.worker.status, 'blocked');
assert.equal(blocked.tiers.basic.status, 'completed');
assert.equal(blocked.tiers.enhanced.status, 'partial');
assert.equal(blocked.tiers.strict.status, 'blocked');
assert.equal(blocked.step02_unlocked, false);

const passed = reducer.reduceStep01State({
  status:{status:'step01_verified'},
  receipt:{dispatch_id:'cw-pass',production_status:'step01_verified',worker_status:'active'},
  ledger:{artifacts:[
    {artifact_id:'source_video',status:'verified'},
    {artifact_id:'step01_evidence_manifest',status:'verified'},
    {artifact_id:'step01_validation_report',status:'verified'},
    {artifact_id:'asr_timeline',status:'verified'},
    {artifact_id:'ocr_evidence',status:'verified'},
    {artifact_id:'transnet_shot_boundary_evidence',status:'verified'}
  ]},
  events:[{type:'worker_receipt_observed'},{type:'artifact_paths_verified'}]
});
assert.equal(passed.strict_pass_reproducible, true);
assert.equal(passed.tiers.strict.status, 'completed');
assert.equal(passed.step02_unlocked, true);

const noEvents = reducer.reduceStep01State({...passed,events:undefined});
assert.equal(noEvents.strict_pass_reproducible, false);
assert.equal(noEvents.step02_unlocked, false);

const hydratedButUnverified = reducer.reduceStep01State({...passed,events:[
  {type:'worker_receipt_observed'},
  {type:'step01_evidence_bundle_hydrated'}
]});
assert.equal(hydratedButUnverified.strict_pass_reproducible, false);
assert.equal(hydratedButUnverified.step02_unlocked, false);

const recoveryReady = {receipt:{production_status:'blocked_resource'},blocker:{retryable:true,resume_event:'strict_runtime_ready'},preflight:{ready:true,runtime_profile:'mac-step01-strict-evidence-v1'},prior_attempts:0,active_worker:false,source_sha_match:true,policy_approved:true};
assert.equal(reducer.evaluateAutoRecovery(recoveryReady).allowed, true);
assert.equal(reducer.evaluateAutoRecovery({...recoveryReady,prior_attempts:1}).allowed, false);
assert.equal(reducer.evaluateAutoRecovery({...recoveryReady,preflight:{ready:false,runtime_profile:'mac-step01-strict-evidence-v1'}}).allowed, false);

process.stdout.write(JSON.stringify({ok:true,verified:['receipt overrides stale running dispatch','basic/enhanced/strict tiers','strict PASS requires event replay','hydration requires Windows artifact path verification','Step02 unlock contract','single automatic recovery limit','runtime-ready recovery gate']}) + '\n');
