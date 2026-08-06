'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const carrier = require('./bridge/niannian_n06_windows_mac_phase_carrier');
const transport = require('./bridge/niannian_n06_mac_app_phase_transport');
const worker = require('./bridge/niannian_n06_mac_app_phase_worker');
const launcher = require('./bridge/niannian_n06_mac_app_phase_worker_launcher');

function sha256(value){return crypto.createHash('sha256').update(value).digest('hex');}
function jsonBytes(value){return Buffer.from(JSON.stringify(value,null,2)+'\n','utf8');}
async function writeJson(filePath,value){await fsp.mkdir(path.dirname(filePath),{recursive:true});await fsp.writeFile(filePath,jsonBytes(value));}
async function readJson(filePath){return JSON.parse(await fsp.readFile(filePath,'utf8'));}

async function buildExport(root,suffix='PASS'){
  const dispatchRoot=path.join(root,'dispatch-'+suffix);
  const dispatchId='N06EMP-CARRIER-'+suffix+'-0001';
  const transactionId='N06REAL-CARRIER-'+suffix+'-0001';
  const workspace='/Users/lsb/.local/share/niannian-ai/employee-workspaces/01/'+dispatchId;
  const referenceRelative='input/references/01-FF_V001_S001.png';
  const referenceBytes=Buffer.from('carrier-reference-'+suffix);
  await fsp.mkdir(path.join(dispatchRoot,'input','references'),{recursive:true});
  await fsp.writeFile(path.join(dispatchRoot,...referenceRelative.split('/')),referenceBytes);
  const authoritySpec={schema_version:'niannian_n06_mimo_video_spec_v1',transaction_id:transactionId,project_id:'NS-CARRIER-'+suffix,job_id:'web_ns-carrier-'+suffix.toLowerCase()+'-12345',group_id:'V001',provider:'mimo',execution_mode:'real_submit_candidate_v2',prompt:{text:'locked '+suffix,sha256:sha256('locked '+suffix)},references:[{ref_key:'FF_V001_S001',duty:'开场机位与构图',sha256:sha256(referenceBytes),path:'D:/authority/FF_V001_S001.png',uploadEligible:true}],duration_sec:11,aspect_ratio:'9:16',quality_decision_token:'keep_720p_hard_gate',media_provider_submit_requested:false};
  const authoritySpecSha=sha256(jsonBytes(authoritySpec));
  const portableSpec={...authoritySpec,authority_spec:{exact_path:'D:/authority/n06_v001_real_submit_spec.json',sha256:authoritySpecSha},references:authoritySpec.references.map(item=>({...item,path:workspace+'/'+referenceRelative,original_authority:{exact_path:item.path,sha256:item.sha256},portable_transport:{relative_path:referenceRelative,sha256:item.sha256}}))};
  const portableSpecPath=path.join(dispatchRoot,'input','video_task_spec.json');
  await writeJson(portableSpecPath,portableSpec);
  const dispatch={schema_version:'niannian_n06_mac_employee_dispatch_v1',dispatch_id:dispatchId,status:'prepared',phase:'prepared_for_transport',execution_mode:'synthetic_fake_transport_only',idempotency_key:sha256('idempotency-'+suffix),project_id:authoritySpec.project_id,job_id:authoritySpec.job_id,group_id:'V001',transaction_id:transactionId,spec_sha256:authoritySpecSha,portable_spec_sha256:sha256(await fsp.readFile(portableSpecPath)),prompt_sha256:authoritySpec.prompt.sha256,portable_spec_relative_path:'input/video_task_spec.json',references:[{ref_key:'FF_V001_S001',duty:'开场机位与构图',sha256:sha256(referenceBytes),confirmed:true,upload_eligible:true,local_edit_applied:false,relative_path:referenceRelative}],employee:{employee:'01',title:'念念 AI · Mac 员工 01',thread_id:'019f6201-c013-7cf3-b155-61d2789085f4',project_root:carrier.MAC_PROJECT,workspace},employee_model_channel:{channel_id:'krill_codex_custom_provider_v1',requested:true,used:false},lease:{status:'unclaimed',owner_thread_id:'019f6201-c013-7cf3-b155-61d2789085f4'},media_provider_network_requested:false,media_provider_submit_requested:false,media_provider_upload_requested:false,spend_requested:false,deployment_requested:false,production_data_write_requested:false,test_only:true,real_delivery:false,prepared_at:'2026-07-15T00:00:00.000Z'};
  const dispatchPath=path.join(dispatchRoot,'employee_dispatch.json');
  await writeJson(dispatchPath,dispatch);
  const exported=await transport.exportWindowsDispatch({dispatchPath,exportRoot:path.join(root,'exports-'+suffix)});
  return {dispatch,dispatchPath,exported,workspace};
}

async function completeWorkspace(workspace,dispatch){
  const completion={method:'turn/completed',turn_id:'turn-'+dispatch.dispatch_id,status:'completed',error:null};
  dispatch.phase='employee_turn_completed';
  dispatch.status='completed_test_only';
  dispatch.lease={status:'completed',lease_id:completion.turn_id,owner_thread_id:dispatch.employee.thread_id,claimed_at:'2026-07-15T00:00:30.000Z',completed_at:'2026-07-15T00:01:00.000Z'};
  await writeJson(path.join(workspace,'employee_dispatch.json'),dispatch);
  await writeJson(path.join(workspace,'employee_worker_receipt.json'),{schema_version:'niannian_n06_mac_employee_synthetic_receipt_v1',dispatch_id:dispatch.dispatch_id,transaction_id:dispatch.transaction_id,project_id:dispatch.project_id,job_id:dispatch.job_id,group_id:dispatch.group_id,spec_sha256:dispatch.spec_sha256,authority_spec_sha256:dispatch.spec_sha256,portable_spec_sha256:dispatch.portable_spec_sha256,prompt_sha256:dispatch.prompt_sha256,employee:{thread_id:dispatch.employee.thread_id},employee_model_channel:{requested:true,used:true,media_provider_authority_granted:false},completion_event:completion,status:'test_only_qa_passed',test_only:true,real_delivery:false,media_provider_network_requested:false,media_provider_submit_requested:false,media_provider_upload_requested:false,spend_requested:false,deployment_requested:false,completed_at:'2026-07-15T00:01:00.000Z'});
  await writeJson(path.join(workspace,'mac_employee_dispatch_control_receipt.json'),{schema_version:'niannian_mac_codex_employee_job_dispatch_receipt_v1',dispatch_id:dispatch.dispatch_id,idempotency_key:dispatch.idempotency_key,completion_event:completion,test_only:true,real_delivery:false,created_at:'2026-07-15T00:01:00.000Z'});
  await fsp.writeFile(path.join(workspace,'fake-download.mp4'),Buffer.from('synthetic-only'));
  await writeJson(path.join(workspace,'ffprobe.json'),{status:'passed_test_stub',width:720,height:1280,duration_sec:11,synthetic:true});
  await writeJson(path.join(workspace,'visual_qa.json'),{status:'passed_test_stub',qa_level:'integrated',synthetic:true,real_delivery:false});
  await writeJson(path.join(workspace,'website_projection.json'),{schema_version:'niannian_website_projection_v1',dispatch_id:dispatch.dispatch_id,status:'employee_synthetic_integrated_not_delivered',real_delivery:false});
}

function fakeRunner(root,options={}){
  const remoteRoot=path.join(root,'fake-mac');
  const remoteMap=new Map();
  const calls=[];
  let cleanupCount=0;
  function mapRemote(remote){
    if(remoteMap.has(remote))return remoteMap.get(remote);
    const local=path.join(remoteRoot,...String(remote).replace(/^\//,'').split('/'));
    remoteMap.set(remote,local);
    return local;
  }
  const run=async(command,args)=>{
    calls.push({command,args:[...args]});
    if(command==='scp'){
      if(String(args[0]).startsWith(carrier.MAC_ALIAS+':')){
        const remote=String(args[0]).slice(carrier.MAC_ALIAS.length+1);
        await fsp.mkdir(path.dirname(args[1]),{recursive:true});
        await fsp.copyFile(mapRemote(remote),args[1]);
      }else{
        const remote=String(args[1]).slice(carrier.MAC_ALIAS.length+1);
        await fsp.mkdir(path.dirname(mapRemote(remote)),{recursive:true});
        await fsp.copyFile(args[0],mapRemote(remote));
      }
      return {stdout:'',stderr:''};
    }
    if(command==='ssh'&&args[1]==='mkdir'){
      await fsp.mkdir(mapRemote(args[3]),{recursive:true});
      return {stdout:'',stderr:''};
    }
    if(command==='ssh'&&args[2]===carrier.MAC_PROJECT+'/bridge/niannian_n06_mac_app_phase_worker_launcher.js'){
      const packageRemote=args[4];
      const manifestSha=args[6];
      const packageLocal=mapRemote(packageRemote);
      const exportedDispatch=await readJson(path.join(packageLocal,'employee_dispatch.json'));
      const workspaceLocal=mapRemote(exportedDispatch.employee.workspace);
      const completed=await fsp.stat(path.join(workspaceLocal,'return_transport_manifest.json')).then(()=>true,()=>false);
      if(!completed){
        await transport.importDispatchToMac({packageRoot:packageLocal,expectedManifestSha256:manifestSha,expectedPhase:exportedDispatch,workspacePath:workspaceLocal});
        const importedDispatch=await readJson(path.join(workspaceLocal,'employee_dispatch.json'));
        await completeWorkspace(workspaceLocal,importedDispatch);
        await transport.finalizeMacReturn({workspacePath:workspaceLocal});
      }else await transport.finalizeMacReturn({workspacePath:workspaceLocal});
      const evidence=await transport.fileEvidence(path.join(workspaceLocal,'return_transport_manifest.json'));
      const result={ok:true,status:'mac_app_employee_phase_completed',phase_key:transport.phaseKey(exportedDispatch.phase_key).key_id,dispatch_id:exportedDispatch.dispatch_id,employee_thread_id:exportedDispatch.employee.thread_id,completion_event:{method:'turn/completed',turn_id:'turn-'+exportedDispatch.dispatch_id,status:'completed',error:null},workspace:options.wrongWorkspace?exportedDispatch.employee.workspace+'-other':exportedDispatch.employee.workspace,return_manifest_sha256:options.badReturnSha?'0'.repeat(64):evidence.sha256,media_provider_network_requested:false,media_provider_submit_requested:false,media_provider_upload_requested:false,spend_requested:options.spend===true,deployment_requested:false,production_data_write_requested:false,real_delivery:false};
      return {stdout:JSON.stringify(result)+'\n',stderr:''};
    }
    if(command==='ssh'&&args[2]===carrier.MAC_PROJECT+'/bridge/niannian_n06_mac_app_phase_cleanup.js'){
      cleanupCount+=1;const result={ok:true,status:cleanupCount===1?'archived_for_recovery':'replayed_inbox_removed',phase_key:args[8],manifest_sha256:args[6],archive_root:'/Users/lsb/.local/share/niannian-ai/phase-inbox-completed/'+args[8]+'-'+String(args[6]).slice(0,16)};return {stdout:JSON.stringify(result)+'\n',stderr:''};
    }
    throw new Error('unexpected_fake_process:'+command+':'+args.join('|'));
  };
  return {calls,run};
}

async function rewriteExportDispatch(exported,mutate){
  const dispatchPath=path.join(exported.root,'employee_dispatch.json');
  const manifestPath=path.join(exported.root,'transport_manifest.json');
  const dispatch=await readJson(dispatchPath);
  mutate(dispatch);
  await writeJson(dispatchPath,dispatch);
  const manifest=await readJson(manifestPath);
  const item=manifest.files.find(row=>row.relative_path==='employee_dispatch.json');
  const evidence=await transport.fileEvidence(dispatchPath);
  item.sha256=evidence.sha256; item.bytes=evidence.bytes;
  await writeJson(manifestPath,manifest);
  return (await transport.fileEvidence(manifestPath)).sha256;
}

async function main(){
  const root=await fsp.mkdtemp(path.join(os.tmpdir(),'niannian-n06-carrier-'));
  try{
    const fixture=await buildExport(root,'PASS');
    const fake=fakeRunner(root);
    const returnRoot=path.join(root,'windows-return');
    const result=await carrier.runCarrier({packageRoot:fixture.exported.root,expectedManifestSha256:fixture.exported.manifestSha256,windowsReturnRoot:returnRoot,runProcess:fake.run});
    assert.equal(result.status,'cross_device_return_imported');
    assert.equal(result.import_status,'promoted');
    assert.equal(result.employee_thread_id,fixture.dispatch.employee.thread_id);
    assert.equal(result.media_provider_network_requested,false);
    assert.equal(result.media_provider_submit_requested,false);
    assert.equal(result.real_delivery,false);
    assert.equal(result.remote_inbox_cleanup_status,'archived_for_recovery');
    assert(await fsp.stat(path.join(returnRoot,'employee_worker_receipt.json')).then(()=>true,()=>false));
    const replay=await carrier.runCarrier({packageRoot:fixture.exported.root,expectedManifestSha256:fixture.exported.manifestSha256,windowsReturnRoot:returnRoot,runProcess:fake.run});
    assert.equal(replay.import_status,'replayed');
    assert.equal(replay.remote_inbox_cleanup_status,'replayed_inbox_removed');

    await assert.rejects(()=>carrier.runCarrier({packageRoot:fixture.exported.root,expectedManifestSha256:'0'.repeat(64),windowsReturnRoot:path.join(root,'wrong-sha'),runProcess:fake.run}),/manifest_sha_mismatch/);
    assert.throws(()=>carrier.safeRemotePath('/Users/lsb/../escape'),/remote_path_invalid/);
    const badThread=await buildExport(root,'THREAD');
    const badThreadSha=await rewriteExportDispatch(badThread.exported,dispatch=>{dispatch.employee.thread_id='019f0000-0000-0000-0000-000000000000';});
    await assert.rejects(()=>carrier.runCarrier({packageRoot:badThread.exported.root,expectedManifestSha256:badThreadSha,windowsReturnRoot:path.join(root,'bad-thread'),runProcess:fake.run}),/employee_identity_invalid/);
    const sideEffect=await buildExport(root,'SIDE');
    const sideEffectSha=await rewriteExportDispatch(sideEffect.exported,dispatch=>{dispatch.media_provider_submit_requested=true;});
    await assert.rejects(()=>carrier.runCarrier({packageRoot:sideEffect.exported.root,expectedManifestSha256:sideEffectSha,windowsReturnRoot:path.join(root,'bad-side'),runProcess:fake.run}),/side_effect_contract_invalid/);
    const wrongWorkspace=await buildExport(root,'WORKSPACE');
    await assert.rejects(()=>carrier.runCarrier({packageRoot:wrongWorkspace.exported.root,expectedManifestSha256:wrongWorkspace.exported.manifestSha256,windowsReturnRoot:path.join(root,'wrong-workspace'),runProcess:fakeRunner(root,{wrongWorkspace:true}).run}),/remote_workspace_mismatch/);
    const remoteSpend=await buildExport(root,'SPEND');
    await assert.rejects(()=>carrier.runCarrier({packageRoot:remoteSpend.exported.root,expectedManifestSha256:remoteSpend.exported.manifestSha256,windowsReturnRoot:path.join(root,'remote-spend'),runProcess:fakeRunner(root,{spend:true}).run}),/remote_side_effect_contract_invalid/);
    const badReturn=await buildExport(root,'RETURN');
    await assert.rejects(()=>carrier.runCarrier({packageRoot:badReturn.exported.root,expectedManifestSha256:badReturn.exported.manifestSha256,windowsReturnRoot:path.join(root,'bad-return'),runProcess:fakeRunner(root,{badReturnSha:true}).run}),/return_manifest_sha_mismatch|ENOENT/);

    const workerDispatch={...fixture.dispatch,phase_key:{...transport.phaseKey(fixture.dispatch)}};
    assert.equal(worker.validateWorkerEnvelope(workerDispatch).employee.thread_id,fixture.dispatch.employee.thread_id);
    assert.throws(()=>worker.validateWorkerEnvelope({...workerDispatch,media_provider_network_requested:true}),/side_effect_contract_invalid/);
    assert.throws(()=>worker.validateWorkerEnvelope({...workerDispatch,employee:{...workerDispatch.employee,thread_id:'bad'}}),/employee_identity_invalid/);
    assert.throws(()=>launcher.keyFromLaunchd(()=>({status:0,stdout:''})),/employee_model_key_missing/);
    assert.throws(()=>launcher.keyFromLaunchd(()=>({status:1,stdout:'',stderr:'denied'})),/launchctl_key_check_failed/);
    assert.equal(launcher.keyFromLaunchd(()=>({status:0,stdout:'synthetic-test-secret\n'})),'synthetic-test-secret');
    assert(!launcher.workerArgs(['--package','/tmp/package','--manifest-sha','a'.repeat(64)]).join(' ').includes('synthetic-test-secret'));
    assert.throws(()=>launcher.workerArgs(['--package','/tmp/package','--manifest-sha','a'.repeat(64),launcher.KEY_NAME+'=forbidden']),/secret_in_argv_rejected/);
    const launcherSource=await fsp.readFile(path.join(__dirname,'bridge','niannian_n06_mac_app_phase_worker_launcher.js'),'utf8');
    assert(!/console\.(?:log|error)\s*\([^)]*employeeModelKey|process\.(?:stdout|stderr)\.write\s*\([^)]*employeeModelKey/.test(launcherSource));
    process.stdout.write(JSON.stringify({ok:true,verified:['exact export manifest SHA','allowlisted fixed thread/title/project root','exact remote workspace equality','remote path escape rejection','all media provider/spend/deploy/production-write fields false','fake SSH/SCP Mac import and finalized return','Windows atomic return import','completed inbox atomically archived for recovery and replay inbox removed','idempotent replay without duplicate phase','return manifest SHA mismatch rejection','worker envelope fail closed','launchctl key presence-only gate','secret absent from argv/log/receipt contract']})+'\n');
  }finally{await fsp.rm(root,{recursive:true,force:true});}
}

main().catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
