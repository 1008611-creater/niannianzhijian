'use strict';

const fsp=require('fs').promises;
const path=require('path');
const {fileEvidence,finalizeMacReturn,importDispatchToMac,phaseKey}=require('./niannian_redraw_step01_mac_app_phase_transport');
const {run}=require('./niannian_redraw_step01_mac_app_dispatcher');
const {safeErrorSummary,THREADS}=require('./mac_codex_app_employee_bootstrap');

const MAC_PROJECT='/Users/lsb/AI-Brain/niannian-ai-canonical-local';
const WORKSPACE_ROOT='/Users/lsb/.local/share/niannian-ai/employee-workspaces';

async function readJson(filePath){return JSON.parse(await fsp.readFile(filePath,'utf8'));}
function option(args,name){const index=args.indexOf(name);return index>=0?args[index+1]:null;}
function validateWorkerEnvelope(dispatch){
  const phase=phaseKey(dispatch.phase_key||dispatch);const employee=THREADS.find(item=>item.thread_id===dispatch.employee?.thread_id&&item.employee===dispatch.employee?.employee&&item.title===dispatch.employee?.title);
  if(!employee||dispatch.employee?.project_root!==MAC_PROJECT)throw new Error('step01_mac_worker_employee_identity_invalid');
  if(dispatch.schema_version!=='niannian_redraw_step01_mac_employee_dispatch_v1'||dispatch.execution_mode!=='step01_hq_full_authorized_analysis_only'||dispatch.test_only!==false||dispatch.real_delivery!==false)throw new Error('step01_mac_worker_dispatch_contract_invalid');
  if(dispatch.phase_key?.key_id!==phase.key_id)throw new Error('step01_mac_worker_phase_binding_invalid');
  for(const key of ['media_provider_network_requested','media_provider_submit_requested','media_provider_upload_requested','spend_requested','deployment_requested','local_image_editing_requested'])if(dispatch[key]!==false)throw new Error('step01_mac_worker_side_effect_invalid:'+key);
  if(dispatch.analysis_service_network_authority?.status!=='authorized'||dispatch.analysis_service_network_authority?.media_provider_authority_granted!==false)throw new Error('step01_mac_worker_analysis_authority_invalid');
  const workspace=path.resolve(String(dispatch.employee?.workspace||''));if(!workspace.startsWith(path.resolve(WORKSPACE_ROOT)+path.sep))throw new Error('step01_mac_worker_workspace_invalid');return {phase,workspace,employee};
}
async function executeImportedPhase(options={}){
  const packageRoot=path.resolve(String(options.packageRoot||''));const expectedManifestSha256=String(options.expectedManifestSha256||'').toLowerCase();if(!/^[a-f0-9]{64}$/.test(expectedManifestSha256))throw new Error('step01_mac_worker_manifest_sha_invalid');
  const exportedDispatch=await readJson(path.join(packageRoot,'step01_employee_dispatch.json'));const {phase,workspace}=validateWorkerEnvelope(exportedDispatch);
  try{
    const completed=await fsp.stat(path.join(workspace,'step01_return_transport_manifest.json')).then(stats=>stats.isFile(),()=>false);let imported;let control;
    if(completed){await finalizeMacReturn({workspacePath:workspace});imported={status:'replayed_completed'};control=await readJson(path.join(workspace,'step01_employee_control_receipt.json'));}
    else{imported=await importDispatchToMac({packageRoot,expectedManifestSha256,expectedPhase:phase,workspacePath:workspace});control=await (options.dispatcher||run)({dispatchPath:path.join(workspace,'step01_employee_dispatch.json'),...(options.client?{client:options.client}:{}),...(options.allowTestWorkspace?{allowTestWorkspace:true}:{}),...(options.testEmployeeLockRoot?{testEmployeeLockRoot:options.testEmployeeLockRoot}:{})});await finalizeMacReturn({workspacePath:workspace});}
    const manifest=await fileEvidence(path.join(workspace,'step01_return_transport_manifest.json'));return {ok:true,status:control.step01_verified===true?'mac_app_step01_verified':'mac_app_step01_blocked',phase_key:phase.key_id,dispatch_id:phase.dispatch_id,employee_thread_id:exportedDispatch.employee.thread_id,import_status:imported.status,completion_event:control.completion_event,workspace,return_manifest_sha256:manifest.sha256,analysis_service_network_requested:true,analysis_service_network_used:control.analysis_service_network?.used===true,media_provider_network_requested:false,media_provider_submit_requested:false,media_provider_upload_requested:false,spend_requested:false,deployment_requested:false,real_delivery:false,step01_verified:control.step01_verified===true};
  }catch(error){
    const diagnosticPath=path.join(workspace,'mac_turn_failure_diagnostic.json');const diagnostic=await fileEvidence(diagnosticPath).catch(()=>null);
    return {ok:false,status:'mac_app_step01_failed',phase_key:phase.key_id,dispatch_id:phase.dispatch_id,employee_thread_id:exportedDispatch.employee.thread_id,workspace,blocker:{code:'MAC_CODEX_APP_TURN_FAILED',diagnostic:diagnostic?{relative_path:'mac_turn_failure_diagnostic.json',sha256:diagnostic.sha256,bytes:diagnostic.bytes,secret_redacted:true}:null,error:safeErrorSummary(error)},media_provider_network_requested:false,media_provider_submit_requested:false,media_provider_upload_requested:false,spend_requested:false,deployment_requested:false,real_delivery:false,step01_verified:false};
  }
}

async function main(){const args=process.argv.slice(2);const packageRoot=option(args,'--package');const manifestSha=option(args,'--manifest-sha');if(!packageRoot||!manifestSha)throw new Error('usage: --package <path> --manifest-sha <sha256>');process.stdout.write(JSON.stringify(await executeImportedPhase({packageRoot,expectedManifestSha256:manifestSha}))+'\n');}
if(require.main===module)main().catch(error=>{process.stderr.write(String(error.message||error)+'\n');process.exitCode=1;});
module.exports={MAC_PROJECT,WORKSPACE_ROOT,executeImportedPhase,validateWorkerEnvelope};
