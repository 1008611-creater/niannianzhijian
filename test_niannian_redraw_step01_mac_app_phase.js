'use strict';

const assert=require('assert');
const crypto=require('crypto');
const fsp=require('fs').promises;
const os=require('os');
const path=require('path');
const phase=require('./bridge/niannian_redraw_step01_mac_app_phase');
const {THREADS}=require('./bridge/mac_codex_app_employee_bootstrap');

function sha256(value){return crypto.createHash('sha256').update(value).digest('hex');}
async function writeJson(filePath,value){await fsp.mkdir(path.dirname(filePath),{recursive:true});await fsp.writeFile(filePath,JSON.stringify(value,null,2)+'\n','utf8');}
async function readJson(filePath){return JSON.parse(await fsp.readFile(filePath,'utf8'));}
function readyGate(settingsVersion=2,checkedAt='2026-07-15T00:29:00.000Z'){
  const capability_audits={};for(const key of phase.REQUIRED_CAPABILITY_KEYS)capability_audits[key]={capability:key,ready:true,status:'ready',checked_at:checkedAt,expires_at:null,evidence:{method:'synthetic_focused_contract',sha256:'b'.repeat(64)}};
  return {schema_version:'niannian_step01_hq_full_gate_receipt_v2',status:'ready',ready:true,host:{platform:'darwin',project_root:phase.MAC_PROJECT},settings_binding:{profile:'mac-step01-hq-full-evidence-v2',version:settingsVersion},capability_audits,bindings:{toolchain_candidate_sha256:'a'.repeat(64)},composite:{ok:true,reason:null},provider_upload_requested:false,provider_submit_requested:false,spend_requested:false,real_project_media_processed:false,real_delivery:false,checked_at:checkedAt,expires_at:'2026-07-15T00:44:00.000Z'};
}
async function readyPrerequisites(root,hqGatePath){
  const toolchainPath=path.join(root,'step01-hq-toolchain.json');
  const runtimeImportReceiptPath=path.join(root,'step01-python-import.json');
  const hqEvidence=await phase.fileEvidence(hqGatePath);
  await writeJson(toolchainPath,{schema_version:phase.TOOLCHAIN_SCHEMA,status:'accepted',execution_authority_granted:true,profile:'hq_full',profile_release:'mac-step01-hq-full-evidence-v2',settings_binding:{version:2,profile:'mac-step01-hq-full-evidence-v2'},stable_batch_fallback_allowed:false,acceptance_gates:{fresh_hq_full_gate_receipt:{exact_path:phase.MAC_HQ_GATE_PATH,sha256:hqEvidence.sha256,bytes:hqEvidence.bytes,status:'verified',required:true,ready:true}},real_delivery:false});
  await writeJson(runtimeImportReceiptPath,{schema_version:phase.RUNTIME_IMPORT_SCHEMA,status:'ready',host:{platform:'darwin',project_root:phase.MAC_PROJECT},runtime:{python_root:'/Users/lsb/AI-Brain/runtime/step01-python312'},imports:{Pillow:{ready:true},requests:{ready:true},'silero-vad':{ready:true}},checked_at:'2026-07-15T00:00:00.000Z'});
  return {toolchainContractPath:toolchainPath,runtimeImportReceiptPath,testMode:true,toolchainValidator:async contract=>contract};
}

async function fixture(root,suffix='A'){
  const jobRoot=path.join(root,'web_nn-step01-fixture-'+suffix.toLowerCase()+'-0001');
  const sourcePath=path.join(jobRoot,'source','source.mp4');
  const bytes=Buffer.from('exact-step01-source-'+suffix);
  await fsp.mkdir(path.dirname(sourcePath),{recursive:true});
  await fsp.writeFile(sourcePath,bytes);
  const sourceSha=sha256(bytes);
  const remote='NN-STEP01-FIXTURE-'+suffix+'-0001';
  const local='web_nn-step01-fixture-'+suffix.toLowerCase()+'-0001';
  const event='step01-'+sha256('auth-'+suffix).slice(0,24);
  const rightsEvent='rights-'+sha256('rights-'+suffix).slice(0,24);
  const rightsPath=path.join(jobRoot,'rights_authority.json');
  const rights={schema_version:'niannian_source_rights_authority_v1',event_id:rightsEvent,status:'confirmed',confirmed_by_user_id:'user-fixture',source_sha256:sourceSha,source_bytes:bytes.length,scope:'source_video_redraw_full_chain_under_explicit_provider_and_delivery_gates',declaration:'user_confirmed_rights_to_use_and_adapt_uploaded_source',confirmed_at:'2026-07-15T00:00:00.000Z',revoked:false};
  await writeJson(rightsPath,rights);const rightsEvidence=await phase.fileEvidence(rightsPath);
  const analysisNetwork={schema_version:phase.ANALYSIS_AUTHORITY_SCHEMA,status:'authorized',authorization_event_id:event,source_sha256:sourceSha,settings_version:2,allowed_services:[{service_id:'mimo_asr'},{service_id:'paddle_ocr'}],media_provider_authority_granted:false,media_provider_submit_requested:false,media_provider_upload_requested:false,spend_requested:false,expires_at:'2026-07-15T02:00:00.000Z'};
  const rightsPointer={event_id:rightsEvent,sha256:rightsEvidence.sha256};
  const authorization={schema_version:'niannian_step01_authorization_v1',event_id:event,job_id:remote,source_sha256:sourceSha,settings_version:2,rights_authority:rightsPointer,allowed_scope:'step01_evidence_only',allowed_skill_routes:['mx-shortdrama-00-router','mx-shortdrama-01-frame-extract'],analysis_service_network_authority:analysisNetwork,provider_submission_requested:false,package_send_requested:false,approval_mode:'policy_auto',approval_policy_id:'niannian_low_risk_analysis_v1',risk_class:'low',auto_approved:true};
  const task={schema_version:'niannian_web_redraw_job_v1',job_id:local,remote_job_id:remote,required_router:'mx-shortdrama-00-router',runtime_profile:'mac-step01-strict-evidence-v1',allowed_skill_routes:['mx-shortdrama-00-router','mx-shortdrama-01-frame-extract'],authority_bindings:{remote_project_id:remote,source_sha256:sourceSha,source_bytes:bytes.length,rights_authority_event_id:rightsEvent,rights_authority_sha256:rightsEvidence.sha256,rights_authority_bytes:rightsEvidence.bytes,rights_authority_scope:rights.scope,step01_authorization_event_id:event,settings_version:2,analysis_network_event_id:'fixture',media_contract:{width:1080,height:1920,duration_seconds:96.64,fps:25,audio_stream_count:1,audio_sample_rate:48000},media_provider_authority_granted:false},rights_authority:{event_id:rightsEvent,exact_path:rightsPath,sha256:rightsEvidence.sha256,bytes:rightsEvidence.bytes,status:'confirmed',source_sha256:sourceSha,source_bytes:bytes.length,scope:rights.scope,confirmed_at:rights.confirmed_at,revoked:false},source_video:{exact_path:sourcePath,bytes:bytes.length,sha256:sourceSha,verification_status:'verified',media_contract:{width:1080,height:1920,duration_seconds:96.64,fps:25,audio_stream_count:1,audio_sample_rate:48000}},analysis_authorization:{event_id:event,source_sha256:sourceSha,settings_version:2,rights_authority:rightsPointer,allowed_scope:'step01_evidence_only',approval_mode:'policy_auto'},analysis_service_network_authority:analysisNetwork,constraints:{provider_submit_requires_authorization:true,package_send_requires_authorization:true,local_image_editing:false}};
  task.analysis_run={schema_version:'niannian_step01_source_analysis_run_v1',id:'analysis-1-'+sha256('run-'+suffix).slice(0,24),source_revision:1,source_sha256:sourceSha,source_bytes:bytes.length};
  task.request={name:'fixture',analysis_scope:'source_evidence_only',required_evidence:['media_probe','native_frames','shots','asr','audio_alignment','ocr']};
  const route={schema_version:'niannian_route_request_v1',job_id:local,mode:'production',advisory_only:true,authority_class:'advisory_request',required_router:'mx-shortdrama-00-router',allowed_skill_routes:task.allowed_skill_routes,earliest_incomplete_node:'Step01',selected_skill:null,source_sha256:sourceSha,rights_authority_event_id:rightsEvent,rights_authority_sha256:rightsEvidence.sha256,authorization_event_id:event,provider_submit:'blocked_cost_authorization',package_send:'blocked_controller_authorization'};
  await Promise.all([writeJson(path.join(jobRoot,'task.json'),task),writeJson(path.join(jobRoot,'step01_authorization.json'),authorization),writeJson(path.join(jobRoot,'route_decision.json'),route)]);
  return {authorization,jobRoot,local,remote,rights,rightsEvidence,route,sourcePath,sourceSha,task};
}

async function main(){
  const root=await fsp.mkdtemp(path.join(os.tmpdir(),'niannian-step01-app-phase-'));
  process.env.NIANNIAN_STEP01_PHASE_TEST_MODE='1';
  try{
    const current=await fixture(root,'A');
    const dispatchId='STEP01EMP-TEST-A-0001';
    const blockedGatePath=path.join(root,'blocked-hq-gate.json');const blockedGate=readyGate();blockedGate.status='blocked';blockedGate.ready=false;blockedGate.composite.ok=false;await writeJson(blockedGatePath,blockedGate);
    const blocked=await phase.prepareStep01Phase({jobRoot:current.jobRoot,dispatchId,hqGatePath:blockedGatePath,nowMs:Date.parse('2026-07-15T00:30:00.000Z')});
    assert.equal(blocked.status,'blocked_resource');
    assert.equal(blocked.dispatch,null);
    assert.equal(blocked.root,null);
    assert(blocked.hq_evaluation.issues.some(item=>item==='hq_gate_not_ready'));
    const staleCredentialGate=readyGate();
    staleCredentialGate.capability_audits['credential:mimo_asr'].checked_at='2026-07-14T00:00:00.000Z';
    staleCredentialGate.capability_audits['credential:mimo_asr'].expires_at='2026-07-14T00:01:00.000Z';
    const staleCredentialEvaluation=phase.evaluateHqGate(staleCredentialGate,{settingsVersion:2,settingsProfile:'mac-step01-hq-full-evidence-v2',nowMs:Date.parse('2026-07-15T00:30:00.000Z')});
    assert.equal(staleCredentialEvaluation.ready,true);
    assert.equal(staleCredentialEvaluation.issues.some(item=>/fresh|stale|expired/.test(item)),false);
    await assert.rejects(fsp.access(path.join(current.jobRoot,'step01_app_phase_exports')));
    const blockedCheckpoint=await readJson(path.join(current.jobRoot,'checkpoint.json'));assert.equal(blockedCheckpoint.status,'blocked_resource');
    const readyGatePath=path.join(root,'ready-hq-gate.json');await writeJson(readyGatePath,readyGate());
    const prerequisites=await readyPrerequisites(root,readyGatePath);
    const prepared=await phase.prepareStep01Phase({jobRoot:current.jobRoot,dispatchId,hqGatePath:readyGatePath,...prerequisites,nowMs:Date.parse('2026-07-15T00:30:00.000Z')});
    assert.equal(prepared.status,'promoted');
    assert.match(prepared.manifest_sha256,/^[a-f0-9]{64}$/);
    assert.equal(prepared.phase.remote_project_id,current.remote);
    assert.equal(prepared.phase.local_job_id,current.local);
    assert.equal(prepared.phase.source_sha256,current.sourceSha);
    assert.equal(prepared.phase.rights_authority_event_id,current.rights.event_id);
    assert.equal(prepared.phase.rights_authority_sha256,current.rightsEvidence.sha256);
    assert.equal(prepared.phase.authorization_event_id,current.authorization.event_id);
    assert.equal(prepared.phase.settings_version,2);
    assert.equal(prepared.dispatch.employee.employee,'01');
    assert.equal(prepared.dispatch.employee.thread_id,THREADS.find(item=>item.employee==='01').thread_id);
    assert.equal(prepared.dispatch.employee.project_root,phase.MAC_PROJECT);
    assert.equal(prepared.dispatch.required_router,'mx-shortdrama-00-router');
    assert.deepEqual(prepared.dispatch.required_capabilities,[...phase.REQUIRED_CAPABILITIES]);
    assert.equal(prepared.dispatch.strict_capability_gate,'hq_full_must_fail_closed');
    assert.equal(prepared.dispatch.status,'prepared');
    assert.equal(prepared.dispatch.capability_readback.ready,true);
    assert.match(prepared.dispatch.capability_readback.sha256,/^[a-f0-9]{64}$/);
    assert.match(prepared.dispatch.authority.route_matrix.sha256,/^[a-f0-9]{64}$/);
    assert(prepared.dispatch.expected_outputs.includes('checkpoint.json'));
    assert(prepared.dispatch.expected_outputs.includes('gate_dashboard.json'));
    assert(prepared.dispatch.expected_outputs.includes('artifact_ledger.json'));
    assert(prepared.dispatch.expected_outputs.includes('result_manifest.json'));
    phase.assertSideEffects(prepared.dispatch);
    assert.equal(prepared.dispatch.test_only,false);
    assert.equal(prepared.dispatch.execution_mode,'step01_hq_full_authorized_analysis_only');
    assert.equal(prepared.dispatch.analysis_service_network.requested,true);
    assert.equal(prepared.dispatch.real_delivery,false);
    const manifest=await readJson(path.join(prepared.root,'step01_phase_manifest.json'));
    assert.equal(manifest.files.length,11);
    assert(manifest.files.some(item=>item.relative_path==='input/authority/rights_authority.json'&&item.sha256===current.rightsEvidence.sha256));
    assert(manifest.files.some(item=>item.relative_path==='input/source/source.mp4'&&item.sha256===current.sourceSha));
    assert(manifest.files.some(item=>item.relative_path==='input/authority/route_matrix.json'&&item.sha256===prepared.dispatch.authority.route_matrix.sha256));
    assert(manifest.files.some(item=>item.relative_path==='input/authority/mac-step01-hq-full-gate-receipt.json'&&item.sha256===prepared.dispatch.capability_readback.sha256));
    assert(manifest.files.some(item=>item.relative_path==='input/analysis_service_network_authority.json'));
    assert(manifest.files.some(item=>item.relative_path==='input/authority/step01_hq_full_toolchain_contract.json'));
    assert(manifest.files.some(item=>item.relative_path==='input/authority/mac-step01-python-import-receipt.json'));
    const portableTask=await readJson(path.join(prepared.root,'input','task.json'));
    assert.equal(portableTask.source_video.exact_path,prepared.dispatch.employee.workspace+'/input/source/source.mp4');
    assert.equal(portableTask.source_video.original_authority.exact_path,current.sourcePath);
    assert.equal(portableTask.source_video.original_authority.sha256,current.sourceSha);
    assert.equal(portableTask.source_video.portable_transport.sha256,current.sourceSha);
    const portableRouteRequest=await readJson(path.join(prepared.root,'input','route_request.json'));
    assert.equal(portableRouteRequest.authority_class,'advisory_request');
    assert.equal(portableRouteRequest.required_router,'mx-shortdrama-00-router');
    assert.equal(portableRouteRequest.selected_skill,null);
    const replay=await phase.prepareStep01Phase({jobRoot:current.jobRoot,dispatchId,hqGatePath:readyGatePath,...prerequisites,nowMs:Date.parse('2026-07-15T00:30:00.000Z')});
    assert.equal(replay.status,'replayed');
    assert.equal(replay.manifest_sha256,prepared.manifest_sha256);
    const fixedReadbackJob=await fixture(root,'FIXED');
    const fixedGate=await readJson(readyGatePath);const fixedGateBytes=Buffer.from(JSON.stringify(fixedGate,null,2)+'\n');
    const fixedPromotion=await readJson(prerequisites.toolchainContractPath);const fixedPromotionBytes=Buffer.from(JSON.stringify(fixedPromotion,null,2)+'\n');
    const fixedReadback={schema_version:'niannian_mac_hq_fixed_readback_v1',read_only:true,fixed_whitelist:true,project_root_binding:phase.MAC_PROJECT,shell_command_requested:false,media_provider_network_requested:false,media_provider_submit_requested:false,media_provider_upload_requested:false,spend_requested:false,project_media_processed:false,receipts:[{receipt_id:'hq_gate',status:'present',sha256:sha256(fixedGateBytes),bytes:fixedGateBytes.length,receipt:fixedGate},{receipt_id:'hq_promotion',status:'present',sha256:sha256(fixedPromotionBytes),bytes:fixedPromotionBytes.length,receipt:fixedPromotion}]};
    const fixedPrepared=await phase.prepareStep01Phase({jobRoot:fixedReadbackJob.jobRoot,dispatchId:'STEP01EMP-TEST-FIXED-0001',fixedHqReadback:fixedReadback,testMode:true,nowMs:Date.parse('2026-07-15T00:30:00.000Z')});
    assert.equal(fixedPrepared.status,'promoted');
    assert.equal(fixedPrepared.dispatch.capability_readback.proof,'fixed_hq_readback_pointer');
    assert.equal(fixedPrepared.dispatch.capability_readback.sha256,sha256(fixedGateBytes));
    const automaticDispatchJob=await fixture(root,'AUTO');
    const automaticFirst=await phase.prepareStep01Phase({jobRoot:automaticDispatchJob.jobRoot,fixedHqReadback:fixedReadback,testMode:true,nowMs:Date.parse('2026-07-15T00:30:00.000Z')});
    const automaticReplay=await phase.prepareStep01Phase({jobRoot:automaticDispatchJob.jobRoot,fixedHqReadback:fixedReadback,testMode:true,nowMs:Date.parse('2026-07-15T00:30:00.000Z')});
    assert.equal(automaticFirst.status,'promoted');
    assert.equal(automaticReplay.status,'replayed');
    assert.equal(automaticReplay.phase.key_id,automaticFirst.phase.key_id);
    assert.equal(automaticFirst.dispatch.dispatch_id,phase.deterministicDispatchId(automaticDispatchJob.task,automaticDispatchJob.authorization,{sha256:sha256(fixedGateBytes)}));

    const badSource=await fixture(root,'S');
    await fsp.appendFile(badSource.sourcePath,'tamper');
    await assert.rejects(()=>phase.prepareStep01Phase({jobRoot:badSource.jobRoot,dispatchId:'STEP01EMP-TEST-S-0001',hqGatePath:readyGatePath,...prerequisites,nowMs:Date.parse('2026-07-15T00:30:00.000Z')}),/source_evidence_mismatch/);
    const badRights=await fixture(root,'Q');await fsp.appendFile(path.join(badRights.jobRoot,'rights_authority.json'),' ');await assert.rejects(()=>phase.prepareStep01Phase({jobRoot:badRights.jobRoot,dispatchId:'STEP01EMP-TEST-Q-0001',hqGatePath:readyGatePath,...prerequisites,nowMs:Date.parse('2026-07-15T00:30:00.000Z')}),/rights_evidence_mismatch/);
    const badAuth=await fixture(root,'B');
    badAuth.authorization.settings_version=3;
    await writeJson(path.join(badAuth.jobRoot,'step01_authorization.json'),badAuth.authorization);
    await assert.rejects(()=>phase.prepareStep01Phase({jobRoot:badAuth.jobRoot,dispatchId:'STEP01EMP-TEST-B-0001',hqGatePath:readyGatePath,...prerequisites,nowMs:Date.parse('2026-07-15T00:30:00.000Z')}),/authority_binding_invalid/);
    const badRoute=await fixture(root,'R');
    badRoute.route.selected_skill='mx-shortdrama-02-source-timeline';
    await writeJson(path.join(badRoute.jobRoot,'route_decision.json'),badRoute.route);
    await assert.rejects(()=>phase.prepareStep01Phase({jobRoot:badRoute.jobRoot,dispatchId:'STEP01EMP-TEST-R-0001',hqGatePath:readyGatePath,...prerequisites,nowMs:Date.parse('2026-07-15T00:30:00.000Z')}),/route_binding_invalid/);
    const staleTask=await fixture(root,'LEGACY');delete staleTask.task.analysis_run;staleTask.task.request={name:'fixture',target_language:'es-MX'};await writeJson(path.join(staleTask.jobRoot,'task.json'),staleTask.task);await assert.rejects(()=>phase.prepareStep01Phase({jobRoot:staleTask.jobRoot,dispatchId:'STEP01EMP-TEST-LEGACY-0001',hqGatePath:readyGatePath,...prerequisites,testMode:false,nowMs:Date.parse('2026-07-15T00:30:00.000Z')}),/source_facts_run_invalid/);
    const staleGate=readyGate();staleGate.checked_at='2026-07-01T00:00:00.000Z';staleGate.expires_at='2026-07-01T00:01:00.000Z';staleGate.capability_audits['runtime:transnetv2'].checked_at='2026-07-10T00:00:00.000Z';staleGate.capability_audits['runtime:transnetv2'].expires_at='2026-07-10T00:01:00.000Z';assert.equal(phase.evaluateHqGate(staleGate,{settingsVersion:2,nowMs:Date.parse('2026-07-15T00:30:00.000Z')}).ready,true);
    const expiredAuthority=await fixture(root,'EXPIRED');expiredAuthority.authorization.analysis_service_network_authority.expires_at='2026-07-01T00:00:00.000Z';expiredAuthority.task.analysis_service_network_authority.expires_at='2026-07-01T00:00:00.000Z';await Promise.all([writeJson(path.join(expiredAuthority.jobRoot,'step01_authorization.json'),expiredAuthority.authorization),writeJson(path.join(expiredAuthority.jobRoot,'task.json'),expiredAuthority.task)]);assert.equal(phase.evaluateAnalysisServiceAuthority(expiredAuthority.authorization.analysis_service_network_authority,expiredAuthority.task,expiredAuthority.authorization,{nowMs:Date.parse('2026-07-15T00:30:00.000Z')}).ready,true);
    const missingGate=readyGate();delete missingGate.capability_audits['runtime:hq'];assert(phase.evaluateHqGate(missingGate,{settingsVersion:2,nowMs:Date.parse('2026-07-15T00:30:00.000Z')}).issues.includes('capability_missing:runtime:hq'));
    const wrongHost=readyGate();wrongHost.host.platform='win32';assert(phase.evaluateHqGate(wrongHost,{settingsVersion:2,nowMs:Date.parse('2026-07-15T00:30:00.000Z')}).issues.includes('hq_gate_host_binding_invalid'));
    const wrongSettings=readyGate(3);assert(phase.evaluateHqGate(wrongSettings,{settingsVersion:2,nowMs:Date.parse('2026-07-15T00:30:00.000Z')}).issues.includes('hq_gate_settings_binding_invalid'));
    const noNetwork=await fixture(root,'N');delete noNetwork.authorization.analysis_service_network_authority;delete noNetwork.task.analysis_service_network_authority;await Promise.all([writeJson(path.join(noNetwork.jobRoot,'step01_authorization.json'),noNetwork.authorization),writeJson(path.join(noNetwork.jobRoot,'task.json'),noNetwork.task)]);const networkBlocked=await phase.prepareStep01Phase({jobRoot:noNetwork.jobRoot,dispatchId:'STEP01EMP-TEST-N-0001',hqGatePath:readyGatePath,...prerequisites,nowMs:Date.parse('2026-07-15T00:30:00.000Z')});assert.equal(networkBlocked.status,'blocked_authorization');assert.equal(networkBlocked.root,null);
    const missingMedia=await fixture(root,'M');delete missingMedia.task.source_video.media_contract;await writeJson(path.join(missingMedia.jobRoot,'task.json'),missingMedia.task);const mediaBlocked=await phase.prepareStep01Phase({jobRoot:missingMedia.jobRoot,dispatchId:'STEP01EMP-TEST-M-0001',hqGatePath:readyGatePath,...prerequisites,nowMs:Date.parse('2026-07-15T00:30:00.000Z')});assert.equal(mediaBlocked.status,'blocked_contract');assert.equal(mediaBlocked.root,null);
    const noAudio=await fixture(root,'W');noAudio.task.source_video.media_contract.audio_stream_count=0;noAudio.task.source_video.media_contract.audio_sample_rate=0;await writeJson(path.join(noAudio.jobRoot,'task.json'),noAudio.task);const audioBlocked=await phase.prepareStep01Phase({jobRoot:noAudio.jobRoot,dispatchId:'STEP01EMP-TEST-W-0001',hqGatePath:readyGatePath,...prerequisites,nowMs:Date.parse('2026-07-15T00:30:00.000Z')});assert.equal(audioBlocked.status,'blocked_contract');assert.equal(audioBlocked.root,null);assert(audioBlocked.blocker.issues.includes('source_ffprobe_or_audio_contract_missing'));
    const badRuntimePath=path.join(root,'bad-runtime-import.json');await writeJson(badRuntimePath,{schema_version:phase.RUNTIME_IMPORT_SCHEMA,status:'ready',host:{platform:'darwin',project_root:phase.MAC_PROJECT},runtime:{python_root:'/Users/lsb/AI-Brain/runtime/step01-python312'},imports:{Pillow:{ready:true},requests:{ready:false},'silero-vad':{ready:true}}});const runtimeJob=await fixture(root,'P');const runtimeBlocked=await phase.prepareStep01Phase({jobRoot:runtimeJob.jobRoot,dispatchId:'STEP01EMP-TEST-P-0001',hqGatePath:readyGatePath,toolchainContractPath:prerequisites.toolchainContractPath,runtimeImportReceiptPath:badRuntimePath,nowMs:Date.parse('2026-07-15T00:30:00.000Z')});assert.equal(runtimeBlocked.status,'blocked_contract');assert.equal(runtimeBlocked.root,null);
    const staleToolchainPath=path.join(root,'stale-toolchain.json');await writeJson(staleToolchainPath,{schema_version:phase.TOOLCHAIN_SCHEMA,status:'accepted',execution_authority_granted:false,profile:'hq_full',profile_release:'mac-step01-hq-full-evidence-v2',settings_binding:{version:2,profile:'mac-step01-hq-full-evidence-v2'},stable_batch_fallback_allowed:false,acceptance_gates:{fresh_hq_full_gate_receipt:{exact_path:phase.MAC_HQ_GATE_PATH,sha256:(await phase.fileEvidence(readyGatePath)).sha256,bytes:(await phase.fileEvidence(readyGatePath)).bytes,status:'verified',required:true,ready:true}},real_delivery:false});const staleToolJob=await fixture(root,'T');const staleToolBlocked=await phase.prepareStep01Phase({jobRoot:staleToolJob.jobRoot,dispatchId:'STEP01EMP-TEST-T-0001',hqGatePath:readyGatePath,toolchainContractPath:staleToolchainPath,runtimeImportReceiptPath:prerequisites.runtimeImportReceiptPath,testMode:true,toolchainValidator:async contract=>contract,nowMs:Date.parse('2026-07-15T00:30:00.000Z')});assert.equal(staleToolBlocked.status,'blocked_contract');assert(staleToolBlocked.blocker.issues.includes('toolchain_contract_not_accepted'));assert.equal(staleToolBlocked.root,null);
    const wrongEmployee={...prepared.dispatch.employee,thread_id:'019f0000-0000-0000-0000-000000000000'};
    assert(!THREADS.some(item=>item.thread_id===wrongEmployee.thread_id));
    const orchestratorSource=await fsp.readFile(path.join(__dirname,'bridge','niannian_step01_orchestrator.js'),'utf8');
    assert(!/Invoke-AiBrainMacRelay|codex\s+exec\s+--ephemeral|-Action['"\s,]+ExecuteOnce/.test(orchestratorSource),'Step01 orchestrator must not retain CLI/relay execution fallback');
    process.stdout.write(JSON.stringify({ok:true,verified:['NN remote id plus web_nn local id phase binding','exact source and rights SHA/bytes/media/audio contract','authorization event and settings version','explicit Mimo/Paddle analysis-service network authority','deterministic fixed five-employee selection','portable Mac path plus original authority lineage','blocked hq_full/authority/runtime/source/audio contract creates typed blocker and no package','ready branch requires five exact fresh capability audits plus Mac host/settings binding','Pillow/requests/silero-vad import receipt required','stale/missing/blocked/host/settings rejection','manifest SHA and idempotent replay','stale source/rights/auth/route rejection','all media provider/upload/spend/deploy/local-edit fields false','no CLI/relay/codex-exec fallback']})+'\n');
  }finally{delete process.env.NIANNIAN_STEP01_PHASE_TEST_MODE;await fsp.rm(root,{recursive:true,force:true});}
}

main().catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
