'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const {fileEvidence,finalizeMacReturn,importDispatchToMac,phaseKey} = require('./niannian_n06_mac_app_phase_transport');
const {run} = require('./mac_codex_app_synthetic_job_dispatch');
const {THREADS} = require('./mac_codex_app_employee_bootstrap');

const MAC_PROJECT='/Users/lsb/AI-Brain/niannian-ai-canonical-local';
const WORKSPACE_ROOT='/Users/lsb/.local/share/niannian-ai/employee-workspaces';

async function readJson(filePath){return JSON.parse(await fsp.readFile(filePath,'utf8'));}
function option(args,name){const index=args.indexOf(name);return index>=0?args[index+1]:null;}
function validateWorkerEnvelope(dispatch){
  const phase=phaseKey(dispatch.phase_key||dispatch);
  const employee=THREADS.find(item=>item.thread_id===dispatch.employee?.thread_id&&item.employee===dispatch.employee?.employee&&item.title===dispatch.employee?.title);
  if(!employee||dispatch.employee?.project_root!==MAC_PROJECT)throw new Error('mac_phase_worker_employee_identity_invalid');
  if(dispatch.schema_version!=='niannian_n06_mac_employee_dispatch_v1'||dispatch.execution_mode!=='synthetic_fake_transport_only'||dispatch.test_only!==true||dispatch.real_delivery!==false)throw new Error('mac_phase_worker_dispatch_contract_invalid');
  if(dispatch.phase_key?.key_id!==phase.key_id)throw new Error('mac_phase_worker_phase_binding_invalid');
  if(dispatch.media_provider_network_requested!==false||dispatch.media_provider_submit_requested!==false||dispatch.media_provider_upload_requested!==false||dispatch.spend_requested!==false||dispatch.deployment_requested!==false||dispatch.production_data_write_requested!==false)throw new Error('mac_phase_worker_side_effect_contract_invalid');
  const workspace=path.resolve(String(dispatch.employee?.workspace||''));
  if(!workspace.startsWith(path.resolve(WORKSPACE_ROOT)+path.sep))throw new Error('mac_phase_worker_workspace_invalid');
  return {phase,workspace,employee};
}

async function executeImportedPhase(options={}){
  const packageRoot=path.resolve(String(options.packageRoot||''));
  const expectedManifestSha256=String(options.expectedManifestSha256||'').toLowerCase();
  if(!/^[a-f0-9]{64}$/.test(expectedManifestSha256))throw new Error('mac_phase_worker_manifest_sha_invalid');
  const exportedDispatch=await readJson(path.join(packageRoot,'employee_dispatch.json'));
  const {phase,workspace}=validateWorkerEnvelope(exportedDispatch);
  const completedReturnPath=path.join(workspace,'return_transport_manifest.json');
  const completed=await fsp.stat(completedReturnPath).then(stats=>stats.isFile(),()=>false);
  let imported;
  let control;
  if(completed){
    await finalizeMacReturn({workspacePath:workspace});
    imported={status:'replayed_completed'};
    control=await readJson(path.join(workspace,'mac_employee_dispatch_control_receipt.json'));
  }else{
    imported=await importDispatchToMac({packageRoot,expectedManifestSha256,expectedPhase:phase,workspacePath:workspace});
    control=await run({dispatchPath:path.join(workspace,'employee_dispatch.json')});
  }
  const returnManifestPath=path.join(workspace,'return_transport_manifest.json');
  const returnManifest=await fileEvidence(returnManifestPath);
  return {ok:true,status:'mac_app_employee_phase_completed',phase_key:phase.key_id,dispatch_id:phase.dispatch_id,employee_thread_id:exportedDispatch.employee.thread_id,import_status:imported.status,completion_event:control.completion_event,workspace,return_manifest_path:returnManifestPath,return_manifest_sha256:returnManifest.sha256,media_provider_network_requested:false,media_provider_submit_requested:false,media_provider_upload_requested:false,spend_requested:false,deployment_requested:false,production_data_write_requested:false,real_delivery:false};
}

async function main(){const args=process.argv.slice(2);const packageRoot=option(args,'--package');const manifestSha=option(args,'--manifest-sha');if(!packageRoot||!manifestSha)throw new Error('usage: --package <path> --manifest-sha <sha256>');process.stdout.write(JSON.stringify(await executeImportedPhase({packageRoot,expectedManifestSha256:manifestSha}))+'\n');}
if(require.main===module)main().catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
module.exports={MAC_PROJECT,WORKSPACE_ROOT,executeImportedPhase,validateWorkerEnvelope};
