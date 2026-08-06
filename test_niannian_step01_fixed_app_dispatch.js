'use strict';

const assert=require('assert');
const crypto=require('crypto');
const {EventEmitter}=require('events');
const fsp=require('fs').promises;
const os=require('os');
const path=require('path');
const dispatch=require('./bridge/niannian_step01_fixed_app_dispatch');

function sha(value){return crypto.createHash('sha256').update(value).digest('hex');}
async function readJson(filePath){return JSON.parse(await fsp.readFile(filePath,'utf8'));}
function current(root,suffix='a'){
  const phaseKey='step01phase-'+sha('phase-'+suffix);
  return {
    canonicalJobRoot:path.join(root,'canonical-'+suffix),
    directJobRoot:path.join(root,'direct-'+suffix),
    run:{analysis_run_id:'analysis-1-'+sha('run-'+suffix).slice(0,24),source_sha256:sha('source-'+suffix),source_revision:1},
    phaseKey,
    manifestSha256:sha('manifest-'+suffix),
    manifest:{phase:{key_id:phaseKey,source_sha256:sha('source-'+suffix)}},
    dispatch:{local_job_id:'web_nn-20260715083045-8120f5',employee_thread_id:dispatch.EMPLOYEE_01}
  };
}
function receipt(currentValue, overrides={}){
  return {
    ok:true,
    job_id:currentValue.dispatch.local_job_id,
    phase_key:currentValue.phaseKey,
    manifest_sha256:currentValue.manifestSha256,
    employee_thread_id:dispatch.EMPLOYEE_01,
    completion_event:{method:'turn/completed',status:'completed',error:null,turn_id:'turn-fixed-dispatch-test'},
    return_manifest_sha256:sha('return-'+currentValue.phaseKey),
    windows_return_root:path.join(currentValue.directJobRoot,'step01_app_phase_returns',currentValue.phaseKey),
    analysis_service_network_used:true,
    media_provider_network_requested:false,
    media_provider_submit_requested:false,
    spend_requested:false,
    real_delivery:false,
    ...overrides
  };
}
async function main(){
  const root=await fsp.mkdtemp(path.join(os.tmpdir(),'niannian-fixed-app-dispatch-'));
  try {
    const verified=current(root,'verified');
    const gatewayCurrent=verified;
    const gatewayResult=await dispatch.invokeGateway({requestId:'gateway-async-0001',jobId:gatewayCurrent.dispatch.local_job_id,phaseKey:gatewayCurrent.phaseKey,manifestSha256:gatewayCurrent.manifestSha256,brokerEnvelope:{test_only:true}},(binary,args,options)=>{
      assert.equal(binary,'powershell.exe');assert.equal(options.shell,false);assert(args.includes('Step01PhaseExecute'));assert(args.includes('-ArtifactBrokerEnvelopeFile'));
      const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdout.setEncoding=()=>{};child.stderr.setEncoding=()=>{};
      process.nextTick(()=>{child.stdout.emit('data',JSON.stringify(receipt(gatewayCurrent))+'\n');child.emit('close',0);});return child;
    });
    assert.equal(gatewayResult.phase_key,gatewayCurrent.phaseKey);
    const prepared=await dispatch.prepareDispatch({loadCurrent:async()=>verified,requestId:'dispatch-verified-0001',startedAt:'2026-07-18T14:00:00.000Z'});
    const started=await readJson(path.join(verified.canonicalJobRoot,'step01_orchestrator_result.json'));
    assert.equal(started.status,'fixed_app_dispatch_started');
    assert.equal(started.request_id,'dispatch-verified-0001');
    assert.equal(started.phase_key,verified.phaseKey);
    const completed=await dispatch.executePrepared(prepared,{invokeGateway:async()=>receipt(verified),reconcile:async input=>{assert.equal(input.expectedPhase,verified.manifest.phase);return {step01_verified:true,status:'step01_evidence_ready_reconciled'};}});
    assert.equal(completed.status,'fixed_app_step01_verified');
    assert.equal((await readJson(path.join(verified.canonicalJobRoot,'step01_orchestrator_result.json'))).return_manifest_sha256,sha('return-'+verified.phaseKey));

    const blocked=current(root,'blocked');
    const blockedPrepared=await dispatch.prepareDispatch({loadCurrent:async()=>blocked,requestId:'dispatch-blocked-0001'});
    const blockedResult=await dispatch.executePrepared(blockedPrepared,{invokeGateway:async()=>receipt(blocked),reconcile:async()=>({step01_verified:false,status:'step01_blocked_reconciled'})});
    assert.equal(blockedResult.status,'fixed_app_step01_blocked');
    assert.equal((await readJson(path.join(blocked.canonicalJobRoot,'step01_orchestrator_result.json'))).production_status,'blocked_contract');

    const mismatch=current(root,'mismatch');
    const mismatchPrepared=await dispatch.prepareDispatch({loadCurrent:async()=>mismatch,requestId:'dispatch-mismatch-0001'});
    await assert.rejects(()=>dispatch.executePrepared(mismatchPrepared,{invokeGateway:async()=>receipt(mismatch,{phase_key:'step01phase-'+sha('obsolete-phase')})}),/remote_receipt_invalid/);
    const mismatchResult=await readJson(path.join(mismatch.canonicalJobRoot,'step01_orchestrator_result.json'));
    assert.equal(mismatchResult.status,'fixed_app_step01_blocked');
    assert.equal(mismatchResult.blocker.code,'ARTIFACT_RETURN_EVIDENCE_INVALID');

    const escaped=current(root,'escaped');
    const escapedPrepared=await dispatch.prepareDispatch({loadCurrent:async()=>escaped,requestId:'dispatch-escaped-0001'});
    await assert.rejects(()=>dispatch.executePrepared(escapedPrepared,{invokeGateway:async()=>receipt(escaped,{windows_return_root:path.join(root,'outside-return')})}),/return_root_invalid/);
    assert.equal((await readJson(path.join(escaped.canonicalJobRoot,'step01_orchestrator_result.json'))).blocker.code,'ARTIFACT_RETURN_EVIDENCE_INVALID');

    const untouched=current(root,'untouched');
    await fsp.mkdir(untouched.canonicalJobRoot,{recursive:true});
    await fsp.writeFile(path.join(untouched.canonicalJobRoot,'step01_orchestrator_result.json'),'{"status":"fixed_app_dispatch_prepared"}\n');
    let gatewayCalled=false;
    await assert.rejects(()=>dispatch.prepareDispatch({loadCurrent:async()=>{throw new Error('step01_fixed_dispatch_current_state_invalid');},invokeGateway:async()=>{gatewayCalled=true;}}),/current_state_invalid/);
    assert.equal(gatewayCalled,false);
    assert.deepEqual(await readJson(path.join(untouched.canonicalJobRoot,'step01_orchestrator_result.json')),{status:'fixed_app_dispatch_prepared'});

    const brokerBlocked=current(root,'broker-blocked');
    await assert.rejects(
      () => dispatch.prepareDispatch({loadCurrent:async()=>brokerBlocked,requireArtifactBroker:true,brokerState:{ready:false,code:'ARTIFACT_BROKER_NOT_CONFIGURED'}}),
      error => error.code === 'ARTIFACT_BROKER_NOT_CONFIGURED'
    );
    assert.equal(await fsp.stat(path.join(brokerBlocked.canonicalJobRoot,'step01_orchestrator_result.json')).then(()=>true,()=>false),false);

    const brokerReady=current(root,'broker-ready');
    const brokerPrepared=await dispatch.prepareDispatch({loadCurrent:async()=>brokerReady,requestId:'dispatch-broker-ready-0001',requireArtifactBroker:true,brokerState:{ready:true,transport:'cos',provider:'tencent-cos',credentials_present:true},buildBrokerSession:async()=>({published:{objects:[{object_key:'phase-packages/test'}]},envelope:{test_only:true}})});
    assert.equal(brokerPrepared.start.artifact_transport.mode,'cos');
    assert.equal(brokerPrepared.start.artifact_transport.legacy_scp_fallback_allowed,false);
    assert.equal(JSON.stringify(brokerPrepared.start).includes('secret'),false);

    const transportFailure=current(root,'transport-failure');
    const transportPrepared=await dispatch.prepareDispatch({loadCurrent:async()=>transportFailure,requestId:'dispatch-transport-failure-0001'});
    await assert.rejects(()=>dispatch.executePrepared(transportPrepared,{invokeGateway:async()=>{throw new Error('mac_worker_relay_process_failed:ssh:1 Authorization: Bearer never-store');}}),/mac_worker_relay_process_failed/);
    const transportResult=await readJson(path.join(transportFailure.canonicalJobRoot,'step01_orchestrator_result.json'));
    assert.equal(transportResult.blocker.code,'ARTIFACT_PACKAGE_DOWNLOAD_FAILED');
    assert.equal(transportResult.blocker.diagnostic.secret_redacted,true);
    assert.equal(JSON.stringify(transportResult).includes('never-store'),false);

    const brokerReturn=current(root,'broker-return');
    const brokerReturnPrepared=await dispatch.prepareDispatch({loadCurrent:async()=>brokerReturn,requestId:'dispatch-broker-return-0001'});
    let brokerImporterCalled=false;
    const brokerReturnResult=await dispatch.executePrepared(brokerReturnPrepared,{invokeGateway:async()=>receipt(brokerReturn,{artifact_transport:{mode:'cos',return_manifest_bytes:128}}),importBrokerReturn:async currentValue=>{brokerImporterCalled=true;return {windows_return_root:path.join(currentValue.directJobRoot,'step01_app_phase_returns',currentValue.phaseKey)};},reconcile:async input=>({step01_verified:false,status:'step01_blocked_reconciled',returnRoot:input.returnRoot})});
    assert.equal(brokerImporterCalled,true);
    assert.equal(brokerReturnResult.status,'fixed_app_step01_blocked');

    const old=current(root,'old');
    const oldPrepared=await dispatch.prepareDispatch({loadCurrent:async()=>old,requestId:'dispatch-old-0001'});
    await assert.rejects(()=>dispatch.executePrepared(oldPrepared,{invokeGateway:async()=>receipt(old,{manifest_sha256:sha('old-manifest')})}),/remote_receipt_invalid/);
    assert.equal((await readJson(path.join(old.canonicalJobRoot,'step01_orchestrator_result.json'))).status,'fixed_app_step01_blocked');
  } finally { await fsp.rm(root,{recursive:true,force:true}); }
  process.stdout.write(JSON.stringify({ok:true,verified:['nonblocking forced gateway process invocation','atomic dispatch-start receipt before gateway','exact job phase manifest and Employee 01 receipt binding','verified and blocked reducer projections','mismatched old receipt rejected','return-root escape rejected','preflight rejection makes no gateway call or canonical mutation']})+'\n');
}

main().catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
