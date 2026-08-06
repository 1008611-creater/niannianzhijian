'use strict';

// One-time, source-bound recovery for a legacy Step01 run. It never executes
// media analysis itself; the direct Haika executor remains the only runner.
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const events = require('./niannian_step01_evidence_events');
const {PROFILE, ROUTES} = require('./niannian_step01_server_executor');

function fail(code, message) { const error = new Error(message || code); error.code = code; throw error; }
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function safeProjectId(value) { const id=String(value || ''); if (!/^NN-[A-Z0-9-]{10,80}$/.test(id)) fail('STEP01_LEGACY_RECOVERY_PROJECT_INVALID'); return id; }
async function atomicJson(file, value) { const temporary=file + '.tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex'); await fsp.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', {flag:'wx'}); await fsp.rename(temporary,file); }

async function recover(options = {}) {
  const projectId=safeProjectId(options.projectId || process.argv[2]);
  const dataRoot=path.resolve(options.dataRoot || process.env.NIANNIAN_DATA_DIR || path.join(__dirname,'..','data'));
  const projectsPath=path.join(dataRoot,'projects.json'), jobRoot=path.join(dataRoot,'jobs',projectId);
  const projects=JSON.parse(await fsp.readFile(projectsPath,'utf8'));
  const index=projects.findIndex(item => item.id === projectId);
  if (index < 0) fail('STEP01_LEGACY_RECOVERY_PROJECT_NOT_FOUND');
  const project=projects[index], oldProfile=String(project.analysis?.runtimeProfile || '');
  if (!/^mac-/.test(oldProfile) && project.runtime?.worker?.mode !== 'fixed_mac_app_phase') fail('STEP01_LEGACY_RECOVERY_NOT_LEGACY');
  const sourcePath=path.resolve(dataRoot,String(project.source?.storage_key || ''));
  const uploadsRoot=path.resolve(dataRoot,'uploads') + path.sep;
  if (!sourcePath.startsWith(uploadsRoot)) fail('STEP01_LEGACY_RECOVERY_SOURCE_PATH_INVALID');
  const source=await fsp.readFile(sourcePath);
  if (sha256(source) !== project.source?.sha256 || source.length !== Number(project.source?.bytes)) fail('STEP01_LEGACY_RECOVERY_SOURCE_MISMATCH');
  const rights=JSON.parse(await fsp.readFile(path.join(jobRoot,'rights_authority.json'),'utf8'));
  if (rights.status !== 'confirmed' || rights.revoked !== false || rights.source_sha256 !== project.source.sha256 || Number(rights.source_bytes) !== Number(project.source.bytes) || rights.confirmed_by_user_id !== project.ownerId) fail('STEP01_LEGACY_RECOVERY_RIGHTS_INVALID');
  const ledger=JSON.parse(await fsp.readFile(path.join(jobRoot,'artifact_ledger.json'),'utf8'));
  const rightsArtifact=(ledger.artifacts || []).find(item => item.artifact_id === 'source_rights_authority');
  const rightsBytes=await fsp.readFile(path.join(jobRoot,'rights_authority.json'));
  if (!rightsArtifact || rightsArtifact.status !== 'verified' || rightsArtifact.sha256 !== sha256(rightsBytes) || Number(rightsArtifact.bytes) !== rightsBytes.length) fail('STEP01_LEGACY_RECOVERY_RIGHTS_LEDGER_INVALID');
  if ((ledger.artifacts || []).some(item => item.artifact_id === 'step01_evidence_manifest' && ['verified','accepted','completed','delivered'].includes(String(item.status)))) fail('STEP01_LEGACY_RECOVERY_EVIDENCE_ALREADY_VERIFIED');
  const requestedAt=new Date().toISOString(), oldRunId=String(project.analysis?.runId || '');
  const runId='analysis-' + Number(project.sourceRevision || 1) + '-' + crypto.randomBytes(12).toString('hex');
  const idempotencyKey=sha256([project.id,project.sourceRevision,project.source.sha256,PROFILE].join('|'));
  const archiveRoot=path.join(jobRoot,'legacy_server_recovery',requestedAt.replace(/[:.]/g,'-'));
  await fsp.mkdir(archiveRoot,{recursive:true});
  for (const name of ['task.json','current_run.json','status.json','checkpoint.json','gate_dashboard.json','step01_orchestrator_result.json']) await fsp.copyFile(path.join(jobRoot,name),path.join(archiveRoot,name)).catch(error => { if (error.code !== 'ENOENT') throw error; });
  const run={schema_version:'niannian_step01_source_analysis_run_v1',id:runId,source_revision:Number(project.sourceRevision),source_sha256:project.source.sha256,source_bytes:Number(project.source.bytes),rights_authority:{event_id:rights.event_id,sha256:sha256(rightsBytes),bytes:rightsBytes.length},analysis_scope:'source_evidence_only',required_router:ROUTES[0],required_evidence:['media_probe','native_frames','shots','audio','ocr'],quality_profile:PROFILE,idempotency_key:idempotencyKey,created_at:requestedAt,recovered_from_run_id:oldRunId,recovered_from_status:String(project.analysis?.status || '')};
  const authorization={event_id:'step01-'+crypto.randomBytes(12).toString('hex'),allowed_scope:'step01_evidence_only',allowed_skill_routes:ROUTES,source_sha256:project.source.sha256,source_bytes:Number(project.source.bytes),provider_submission_requested:false,package_send_requested:false,local_image_editing_requested:false,approval_mode:'policy_auto',approval_policy_id:'niannian_low_risk_analysis_v1',risk_class:'low',auto_approved:true,created_at:requestedAt};
  const task={schema_version:'niannian_web_redraw_job_v1',job_id:project.id,entrypoint:'haika_step01_legacy_source_bound_recovery',runtime_profile:PROFILE,requested_by:{user_id:project.ownerId},source_video:{originalName:project.source.originalName,bytes:project.source.bytes,sha256:project.source.sha256},analysis_run:run,rights_authority:{event_id:rights.event_id,sha256:sha256(rightsBytes),bytes:rightsBytes.length,status:'confirmed'},analysis_authorization:authorization,constraints:{server_execution_only:true,local_image_editing:false,provider_submit_requires_authorization:true,package_send_requires_authorization:true,cli_fallback_allowed:false,relay_fallback_allowed:false}};
  await fsp.mkdir(path.join(jobRoot,'analysis_runs',runId),{recursive:true});
  await Promise.all([
    atomicJson(path.join(jobRoot,'analysis_runs',runId,'analysis_run.json'),run), atomicJson(path.join(jobRoot,'analysis_runs',runId,'recovery_state.json'),{schema_version:'niannian_step01_analysis_run_recovery_state_v1',status:'legacy_runtime_replaced',project_id:project.id,analysis_run_id:runId,recovered_from_run_id:oldRunId,source_sha256:project.source.sha256,recorded_at:requestedAt}),
    atomicJson(path.join(jobRoot,'task.json'),task), atomicJson(path.join(jobRoot,'current_run.json'),{schema_version:'niannian_step01_current_run_v1',project_id:project.id,analysis_run_id:runId,source_sha256:project.source.sha256,source_bytes:Number(project.source.bytes),source_revision:Number(project.sourceRevision),updated_at:requestedAt}),
    atomicJson(path.join(jobRoot,'step01_authorization.json'),authorization), atomicJson(path.join(jobRoot,'status.json'),{job_id:project.id,status:'queued',current_node:'Step01',next_skill:ROUTES[1],updated_at:requestedAt}),
    events.appendEvidenceEvent(path.join(jobRoot,'evidence_events.jsonl'),{type:'analysis_run_created',project_id:project.id,analysis_run_id:runId,source_revision:Number(project.sourceRevision),source_sha256:project.source.sha256,status:'queued',evidence_sha256:idempotencyKey})
  ]);
  project.status='queued'; project.productionStatus='queued'; project.analysis={status:'queued',runId,sourceRevision:Number(project.sourceRevision),sourceSha256:project.source.sha256,requestedAt,updatedAt:requestedAt,recoveryFromRunId:oldRunId,recoveryFromStatus:String(project.analysis?.status || ''),runtimeProfile:PROFILE,authorizationEventId:authorization.event_id}; project.runtime={...(project.runtime || {}),productionStatus:'queued',currentNode:'Step01',earliestIncompleteNode:'Step01',nextSkill:ROUTES[1],blocker:null,nextAction:'原片分析服务正在准备证据。',gateState:'step01_server_preparing',worker:{status:'preparing',router:ROUTES[0],mode:'haika_server_responses',cliFallbackAllowed:false,relayFallbackAllowed:false,updatedAt:requestedAt}}; project.dispatch={status:'queued',controllerId:null,leaseId:null,leaseUntil:null,blocker:null}; projects[index]=project;
  await atomicJson(projectsPath,projects);
  return {projectId,analysisRunId:runId,sourceSha256:project.source.sha256,runtimeProfile:PROFILE};
}
if (require.main === module) recover().then(result => process.stdout.write(JSON.stringify(result)+'\n')).catch(error => { process.stderr.write(String(error.code || error.message || error)+'\n'); process.exitCode=1; });
module.exports={recover};
