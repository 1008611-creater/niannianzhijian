'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const {spawn} = require('child_process');
const {fileEvidence,importMacReturnToWindows,phaseKey,safeRelative} = require('./niannian_n06_mac_app_phase_transport');
const {THREADS} = require('./mac_codex_app_employee_bootstrap');

const MAC_ALIAS='niannian-mac';
const MAC_PROJECT='/Users/lsb/AI-Brain/niannian-ai-canonical-local';
const MAC_INBOX='/Users/lsb/.local/share/niannian-ai/phase-inbox';

async function readJson(filePath){return JSON.parse(await fsp.readFile(filePath,'utf8'));}
function option(args,name){const index=args.indexOf(name);return index>=0?args[index+1]:null;}
function safeRemotePath(value){const normalized=String(value||'');if(!/^\/Users\/lsb\/[A-Za-z0-9._\/-]+$/.test(normalized)||normalized.includes('..'))throw new Error('phase_carrier_remote_path_invalid');return normalized;}
function terminateProcessTree(child){
  if(!child||!child.pid)return;
  if(process.platform==='win32'){
    try{const killer=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.unref();}catch{try{child.kill();}catch{}}
  }else try{child.kill('SIGTERM');}catch{}
}
function runProcess(command,args,timeoutMs=20*60*1000){return new Promise((resolve,reject)=>{const child=spawn(command,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='';let stderr='';let settled=false;const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else resolve(result);};const timer=setTimeout(()=>{terminateProcessTree(child);finish(new Error('phase_carrier_timeout:'+command));},timeoutMs);child.stdout.on('data',chunk=>{stdout=(stdout+chunk.toString('utf8')).slice(-1024*1024);});child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString('utf8')).slice(-1024*1024);});child.on('error',error=>finish(error));child.on('close',code=>{if(code!==0)return finish(new Error('phase_carrier_process_failed:'+command+':'+code+':'+stderr.slice(-2000)));finish(null,{stdout,stderr});});});}
function parseJsonLine(value){for(const line of String(value||'').split(/\r?\n/).reverse()){try{const parsed=JSON.parse(line);if(parsed&&parsed.ok===true)return parsed;}catch{}}throw new Error('phase_carrier_result_missing');}
function validateDispatchEnvelope(dispatch,phase){
  if(!dispatch||dispatch.schema_version!=='niannian_n06_mac_employee_dispatch_v1'||dispatch.execution_mode!=='synthetic_fake_transport_only'||dispatch.test_only!==true||dispatch.real_delivery!==false)throw new Error('phase_carrier_dispatch_contract_invalid');
  if(dispatch.phase_key?.key_id!==phase.key_id)throw new Error('phase_carrier_dispatch_binding_invalid');
  const employee=THREADS.find(item=>item.thread_id===dispatch.employee?.thread_id&&item.employee===dispatch.employee?.employee&&item.title===dispatch.employee?.title);
  if(!employee||dispatch.employee?.project_root!==MAC_PROJECT)throw new Error('phase_carrier_employee_identity_invalid');
  if(dispatch.media_provider_network_requested!==false||dispatch.media_provider_submit_requested!==false||dispatch.media_provider_upload_requested!==false||dispatch.spend_requested!==false||dispatch.deployment_requested!==false||dispatch.production_data_write_requested!==false)throw new Error('phase_carrier_side_effect_contract_invalid');
  return employee;
}
function validateRemoteResult(result,phase,dispatch){
  if(!result||result.phase_key!==phase.key_id||result.dispatch_id!==phase.dispatch_id||result.employee_thread_id!==dispatch.employee.thread_id)throw new Error('phase_carrier_remote_result_invalid');
  if(String(result.workspace||'')!==String(dispatch.employee.workspace||''))throw new Error('phase_carrier_remote_workspace_mismatch');
  if(result.media_provider_network_requested!==false||result.media_provider_submit_requested!==false||result.media_provider_upload_requested!==false||result.spend_requested!==false||result.deployment_requested!==false||result.production_data_write_requested!==false||result.real_delivery!==false)throw new Error('phase_carrier_remote_side_effect_contract_invalid');
  return result;
}
async function copyFileToMac(localPath,remotePath,run=runProcess){safeRemotePath(remotePath);await run('ssh',[MAC_ALIAS,'mkdir','-p',path.posix.dirname(remotePath)]);await run('scp',[localPath,MAC_ALIAS+':'+remotePath]);}
async function copyFileFromMac(remotePath,localPath,run=runProcess){safeRemotePath(remotePath);await fsp.mkdir(path.dirname(localPath),{recursive:true});await run('scp',[MAC_ALIAS+':'+remotePath,localPath]);}

async function runCarrier(options={}){
  const packageRoot=path.resolve(String(options.packageRoot||''));
  const expectedManifestSha256=String(options.expectedManifestSha256||'').toLowerCase();
  const windowsReturnRoot=path.resolve(String(options.windowsReturnRoot||''));
  if(!/^[a-f0-9]{64}$/.test(expectedManifestSha256))throw new Error('phase_carrier_manifest_sha_invalid');
  const actualManifest=await fileEvidence(path.join(packageRoot,'transport_manifest.json'));
  if(actualManifest.sha256!==expectedManifestSha256)throw new Error('phase_carrier_manifest_sha_mismatch');
  const manifest=await readJson(path.join(packageRoot,'transport_manifest.json'));
  const phase=phaseKey(manifest.phase_key||{});
  const dispatch=await readJson(path.join(packageRoot,'employee_dispatch.json'));
  validateDispatchEnvelope(dispatch,phase);
  const remotePackage=safeRemotePath(MAC_INBOX+'/'+phase.key_id);
  const run=options.runProcess||runProcess;
  for(const item of [...manifest.files,{relative_path:'transport_manifest.json'}]){
    const relative=safeRelative(item.relative_path);
    await copyFileToMac(path.join(packageRoot,...relative.split('/')),remotePackage+'/'+relative,run);
  }
  const workerLauncherPath=MAC_PROJECT+'/bridge/niannian_n06_mac_app_phase_worker_launcher.js';
  const remoteResult=validateRemoteResult(parseJsonLine((await run('ssh',[MAC_ALIAS,'/Users/lsb/.local/bin/node',workerLauncherPath,'--package',remotePackage,'--manifest-sha',expectedManifestSha256],30*60*1000)).stdout),phase,dispatch);
  const remoteWorkspace=safeRemotePath(remoteResult.workspace);
  const staging=path.join(os.tmpdir(),'niannian-phase-return-'+phase.key_id+'-'+process.pid+'-'+crypto.randomBytes(3).toString('hex'));
  await fsp.mkdir(staging,{recursive:true});
  try{
    await copyFileFromMac(remoteWorkspace+'/return_transport_manifest.json',path.join(staging,'return_transport_manifest.json'),run);
    const returnManifestEvidence=await fileEvidence(path.join(staging,'return_transport_manifest.json'));
    if(returnManifestEvidence.sha256!==remoteResult.return_manifest_sha256)throw new Error('phase_carrier_return_manifest_sha_mismatch');
    const returnManifest=await readJson(path.join(staging,'return_transport_manifest.json'));
    for(const item of returnManifest.files||[]){const relative=safeRelative(item.relative_path);await copyFileFromMac(remoteWorkspace+'/'+relative,path.join(staging,...relative.split('/')),run);}
    const imported=await importMacReturnToWindows({packageRoot:staging,expectedManifestSha256:remoteResult.return_manifest_sha256,expectedPhase:phase,windowsReturnRoot});
    const cleanupPath=MAC_PROJECT+'/bridge/niannian_n06_mac_app_phase_cleanup.js';
    const cleanup=parseJsonLine((await run('ssh',[MAC_ALIAS,'/Users/lsb/.local/bin/node',cleanupPath,'--package',remotePackage,'--manifest-sha',expectedManifestSha256,'--phase-key',phase.key_id],2*60*1000)).stdout);
    if(cleanup.phase_key!==phase.key_id||cleanup.manifest_sha256!==expectedManifestSha256||!['archived_for_recovery','replayed_inbox_removed'].includes(cleanup.status))throw new Error('phase_carrier_cleanup_result_invalid');
    return {ok:true,status:'cross_device_return_imported',phase_key:phase.key_id,dispatch_id:phase.dispatch_id,employee_thread_id:dispatch.employee.thread_id,completion_event:remoteResult.completion_event,windows_return_root:windowsReturnRoot,return_manifest_sha256:remoteResult.return_manifest_sha256,import_status:imported.status,remote_inbox_cleanup_status:cleanup.status,remote_recovery_archive:cleanup.archive_root,media_provider_network_requested:false,media_provider_submit_requested:false,media_provider_upload_requested:false,spend_requested:false,deployment_requested:false,production_data_write_requested:false,real_delivery:false};
  }finally{await fsp.rm(staging,{recursive:true,force:true});}
}

async function main(){const args=process.argv.slice(2);const packageRoot=option(args,'--package');const manifestSha=option(args,'--manifest-sha');const returnRoot=option(args,'--windows-return');if(!packageRoot||!manifestSha||!returnRoot)throw new Error('usage: --package <path> --manifest-sha <sha256> --windows-return <path>');process.stdout.write(JSON.stringify(await runCarrier({packageRoot,expectedManifestSha256:manifestSha,windowsReturnRoot:returnRoot}))+'\n');}
if(require.main===module)main().catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
module.exports={MAC_ALIAS,MAC_INBOX,MAC_PROJECT,copyFileFromMac,copyFileToMac,parseJsonLine,runCarrier,runProcess,safeRemotePath,terminateProcessTree,validateDispatchEnvelope,validateRemoteResult};
