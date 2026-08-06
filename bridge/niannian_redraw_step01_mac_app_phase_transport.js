'use strict';

// Filesystem-only, phase-aware transport for the redraw Step01 fixed Mac App
// employee. This module never starts Codex, opens SSH, reads credentials, or
// calls an analysis/media provider. It only verifies and atomically promotes
// exact manifest-bound packages.

const crypto=require('crypto');
const fs=require('fs');
const fsp=fs.promises;
const path=require('path');

const DISPATCH_SCHEMA='niannian_redraw_step01_mac_employee_dispatch_v1';
const EXPORT_MANIFEST_SCHEMA='niannian_redraw_step01_mac_phase_export_v1';
const RETURN_MANIFEST_SCHEMA='niannian_redraw_step01_mac_phase_return_v1';
const ARTIFACT_MANIFEST_SCHEMA='niannian_redraw_step01_mac_artifact_manifest_v1';
const BASE_RETURN_FILES=Object.freeze([
  'step01_employee_dispatch.json',
  'route_decision.json',
  'skill_execution_receipt.json',
  'evidence/analysis_service_reconciliation.json',
  'step01_employee_worker_receipt.json',
  'step01_employee_control_receipt.json',
  'step01_dispatch_attempt_events.jsonl',
  'step01_evidence_manifest.json',
  'checkpoint.json',
  'gate_dashboard.json',
  'artifact_ledger.json',
  'result_manifest.json',
  'worker_report.md'
]);

function sha256(value){return crypto.createHash('sha256').update(value).digest('hex');}
function jsonBytes(value){return Buffer.from(JSON.stringify(value,null,2)+'\n','utf8');}
function nowIso(nowMs=Date.now()){return new Date(nowMs).toISOString();}
function assertSha(value,code){const normalized=String(value||'').toLowerCase();if(!/^[a-f0-9]{64}$/.test(normalized))throw new Error(code);return normalized;}
function assertToken(value,code,pattern=/^[A-Za-z0-9._-]{1,200}$/){const normalized=String(value||'').trim();if(!pattern.test(normalized))throw new Error(code);return normalized;}
function safeRelative(value,code='step01_transport_relative_path_invalid'){
  const normalized=String(value||'').replace(/\\/g,'/');
  const parts=normalized.split('/');
  if(!normalized||normalized.startsWith('/')||normalized.includes('\0')||/^[A-Za-z]:/.test(normalized)||parts.some(part=>!part||part==='.'||part==='..'))throw new Error(code);
  return parts.join('/');
}
function isInside(parent,candidate,allowRoot=false){const base=path.resolve(parent);const target=path.resolve(candidate);const relative=path.relative(base,target);if(!relative)return allowRoot;return relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);}
function phaseKey(value){
  const phase={
    remote_project_id:assertToken(value?.remote_project_id,'step01_transport_remote_id_invalid',/^NN-[A-Z0-9-]{10,80}$/),
    local_job_id:assertToken(value?.local_job_id,'step01_transport_local_id_invalid',/^web_nn-[a-z0-9-]{10,100}$/),
    source_sha256:assertSha(value?.source_sha256,'step01_transport_source_sha_invalid'),
    rights_authority_event_id:assertToken(value?.rights_authority_event_id,'step01_transport_rights_event_invalid',/^rights-[a-f0-9]{24}$/),
    rights_authority_sha256:assertSha(value?.rights_authority_sha256,'step01_transport_rights_sha_invalid'),
    authorization_event_id:assertToken(value?.authorization_event_id,'step01_transport_authorization_invalid',/^step01-[a-f0-9]{24}$/),
    settings_version:Number(value?.settings_version),
    dispatch_id:assertToken(value?.dispatch_id,'step01_transport_dispatch_id_invalid',/^STEP01EMP-[A-Z0-9-]{10,120}$/)
  };
  if(!Number.isSafeInteger(phase.settings_version)||phase.settings_version<1)throw new Error('step01_transport_settings_version_invalid');
  phase.canonical=[phase.remote_project_id,phase.local_job_id,phase.source_sha256,phase.rights_authority_event_id,phase.rights_authority_sha256,phase.authorization_event_id,String(phase.settings_version),phase.dispatch_id].join('|');
  phase.key_id='step01phase-'+sha256(Buffer.from(phase.canonical,'utf8'));
  if(value?.key_id!==undefined&&value.key_id!==phase.key_id)throw new Error('step01_transport_phase_key_mismatch');
  return phase;
}
function phaseFromDispatch(dispatch){
  if(!dispatch||dispatch.schema_version!==DISPATCH_SCHEMA||!['step01_hq_full_no_media_provider','step01_hq_full_authorized_analysis_only'].includes(dispatch.execution_mode)||dispatch.real_delivery!==false)throw new Error('step01_transport_dispatch_contract_invalid');
  const phase=phaseKey(dispatch.phase_key||dispatch);if(dispatch.rights_authority?.event_id!==phase.rights_authority_event_id||dispatch.rights_authority?.sha256!==phase.rights_authority_sha256||dispatch.rights_authority?.status!=='confirmed'||dispatch.rights_authority?.revoked!==false)throw new Error('step01_transport_rights_binding_invalid');return phase;
}
async function readJson(filePath){return JSON.parse(await fsp.readFile(filePath,'utf8'));}
async function readJsonIfExists(filePath){try{return await readJson(filePath);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function atomicJson(filePath,value){await fsp.mkdir(path.dirname(filePath),{recursive:true});const temp=filePath+'.tmp-'+process.pid+'-'+crypto.randomBytes(4).toString('hex');await fsp.writeFile(temp,jsonBytes(value),{flag:'wx'});await fsp.rename(temp,filePath);}
async function regularFile(filePath,code='step01_transport_file_missing'){const stats=await fsp.lstat(filePath).catch(()=>null);if(!stats||!stats.isFile()||stats.isSymbolicLink())throw new Error(code);return stats;}
async function assertNoSymlinkPath(rootPath,targetPath,code='step01_transport_symlink_path_rejected'){
  const root=path.resolve(rootPath);const target=path.resolve(targetPath);if(!isInside(root,target))throw new Error(code);
  const rootStats=await fsp.lstat(root).catch(()=>null);if(!rootStats||!rootStats.isDirectory()||rootStats.isSymbolicLink())throw new Error(code);
  let current=root;for(const part of path.relative(root,target).split(path.sep).filter(Boolean)){current=path.join(current,part);const stats=await fsp.lstat(current).catch(()=>null);if(!stats||stats.isSymbolicLink())throw new Error(code);}
}
async function fileEvidence(filePath){await regularFile(filePath);const bytes=await fsp.readFile(filePath);return {sha256:sha256(bytes),bytes:bytes.length};}
async function copyExact(source,destination){await regularFile(source);await fsp.mkdir(path.dirname(destination),{recursive:true});await fsp.copyFile(source,destination,fs.constants.COPYFILE_EXCL);}
async function evidenceRows(root,relativePaths){
  const rows=[];const seen=new Set();
  for(const item of relativePaths){const relative=safeRelative(item);if(seen.has(relative))throw new Error('step01_transport_manifest_duplicate_path');seen.add(relative);const absolute=path.resolve(root,relative);if(!isInside(root,absolute))throw new Error('step01_transport_manifest_path_escape');await assertNoSymlinkPath(root,absolute);rows.push({relative_path:relative,...await fileEvidence(absolute)});}
  return rows.sort((left,right)=>left.relative_path.localeCompare(right.relative_path));
}
async function verifyManifest(packageRoot,manifestName,expectedSchema,expectedManifestSha256,expectedPhase=null,requiredPaths=null){
  const root=path.resolve(packageRoot);const manifestPath=path.join(root,safeRelative(manifestName));const manifestEvidence=await fileEvidence(manifestPath);
  if(expectedManifestSha256&&manifestEvidence.sha256!==assertSha(expectedManifestSha256,'step01_transport_expected_manifest_sha_invalid'))throw new Error('step01_transport_manifest_sha_mismatch');
  const manifest=await readJson(manifestPath);if(manifest?.schema_version!==expectedSchema||!Array.isArray(manifest.files))throw new Error('step01_transport_manifest_contract_invalid');
  const actualPhase=phaseKey(manifest.phase_key||{});if(expectedPhase&&actualPhase.canonical!==phaseKey(expectedPhase).canonical)throw new Error('step01_transport_phase_key_mismatch');
  const seen=new Set();
  for(const item of manifest.files){const relative=safeRelative(item?.relative_path,'step01_transport_manifest_path_invalid');if(seen.has(relative))throw new Error('step01_transport_manifest_duplicate_path');seen.add(relative);if(!Number.isSafeInteger(item.bytes)||item.bytes<0)throw new Error('step01_transport_manifest_bytes_invalid');const absolute=path.resolve(root,relative);if(!isInside(root,absolute))throw new Error('step01_transport_manifest_path_escape');await assertNoSymlinkPath(root,absolute);const actual=await fileEvidence(absolute);if(actual.sha256!==assertSha(item.sha256,'step01_transport_manifest_file_sha_invalid')||actual.bytes!==item.bytes)throw new Error('step01_transport_manifest_file_mismatch:'+relative);}
  if(requiredPaths){const required=new Set(requiredPaths.map(item=>safeRelative(item)));if(seen.size!==required.size||[...required].some(item=>!seen.has(item)))throw new Error('step01_transport_manifest_file_set_invalid');}
  return {manifest,manifestPath,manifestSha256:manifestEvidence.sha256,phase:actualPhase};
}
async function promoteStaging(stagingRoot,finalRoot,manifestName,expectedSchema,expectedManifestSha256,expectedPhase){
  const final=path.resolve(finalRoot);const existing=await fsp.lstat(final).catch(()=>null);
  if(existing){if(!existing.isDirectory()||existing.isSymbolicLink())throw new Error('step01_transport_promote_target_invalid');const verified=await verifyManifest(final,manifestName,expectedSchema,expectedManifestSha256,expectedPhase);await fsp.rm(stagingRoot,{recursive:true,force:true});return {status:'replayed',root:final,...verified};}
  await fsp.mkdir(path.dirname(final),{recursive:true});try{await fsp.rename(stagingRoot,final);}catch(error){if(!['EEXIST','ENOTEMPTY'].includes(error.code))throw error;return promoteStaging(stagingRoot,final,manifestName,expectedSchema,expectedManifestSha256,expectedPhase);}
  return {status:'promoted',root:final,...await verifyManifest(final,manifestName,expectedSchema,expectedManifestSha256,expectedPhase)};
}
function validateSideEffects(value){
  for(const key of ['media_provider_network_requested','media_provider_submit_requested','media_provider_upload_requested','spend_requested','package_send_requested','registry_promotion_requested','deployment_requested','local_image_editing_requested'])if(value?.[key]!==false)throw new Error('step01_transport_side_effect_contract_invalid:'+key);
}
async function importDispatchToMac(options={}){
  const packageRoot=path.resolve(String(options.packageRoot||''));const verified=await verifyManifest(packageRoot,'step01_phase_manifest.json',EXPORT_MANIFEST_SCHEMA,options.expectedManifestSha256,options.expectedPhase);
  const dispatch=await readJson(path.join(packageRoot,'step01_employee_dispatch.json'));const phase=phaseFromDispatch(dispatch);if(phase.canonical!==verified.phase.canonical)throw new Error('step01_transport_dispatch_phase_mismatch');validateSideEffects(dispatch);
  const workspace=path.resolve(String(options.workspacePath||''));if(!workspace)throw new Error('step01_transport_workspace_required');const staging=workspace+'.incoming-'+process.pid+'-'+crypto.randomBytes(4).toString('hex');await fsp.mkdir(path.dirname(workspace),{recursive:true});await fsp.mkdir(staging,{recursive:false});
  try{for(const item of verified.manifest.files){const relative=safeRelative(item.relative_path);await copyExact(path.join(packageRoot,relative),path.join(staging,relative));}await copyExact(path.join(packageRoot,'step01_phase_manifest.json'),path.join(staging,'step01_phase_manifest.json'));return await promoteStaging(staging,workspace,'step01_phase_manifest.json',EXPORT_MANIFEST_SCHEMA,verified.manifestSha256,verified.phase);}catch(error){await fsp.rm(staging,{recursive:true,force:true});throw error;}
}
function evidenceArtifactPaths(manifest){
  if(!Array.isArray(manifest?.artifacts))throw new Error('step01_transport_evidence_artifacts_invalid');
  const rows=[];for(const artifact of manifest.artifacts){const relative=safeRelative(artifact?.relative_path,'step01_transport_evidence_artifact_path_invalid');if(!artifact.sha256||!Number.isSafeInteger(artifact.bytes)||artifact.bytes<0)throw new Error('step01_transport_evidence_artifact_contract_invalid');rows.push(relative);}return rows;
}
async function finalizeMacReturn(options={}){
  const workspace=path.resolve(String(options.workspacePath||''));const dispatch=await readJson(path.join(workspace,'step01_employee_dispatch.json'));const phase=phaseFromDispatch(dispatch);const receipt=await readJson(path.join(workspace,'step01_employee_worker_receipt.json'));const control=await readJson(path.join(workspace,'step01_employee_control_receipt.json'));const evidenceManifest=await readJson(path.join(workspace,'step01_evidence_manifest.json'));
  if(receipt.dispatch_id!==phase.dispatch_id||receipt.phase_key!==phase.key_id||receipt.source_sha256!==phase.source_sha256||receipt.rights_authority?.event_id!==phase.rights_authority_event_id||receipt.rights_authority?.sha256!==phase.rights_authority_sha256||receipt.authorization_event_id!==phase.authorization_event_id||receipt.settings_version!==phase.settings_version||control.dispatch_id!==phase.dispatch_id||control.phase_key!==phase.key_id||control.rights_authority?.event_id!==phase.rights_authority_event_id||control.rights_authority?.sha256!==phase.rights_authority_sha256||control.employee?.thread_id!==dispatch.employee?.thread_id)throw new Error('step01_transport_final_binding_mismatch');
  if(control.completion_event?.method!=='turn/completed'||control.completion_event?.status!=='completed'||control.completion_event?.error!==null||receipt.completion_event?.turn_id!==control.completion_event.turn_id)throw new Error('step01_transport_final_completion_missing');
  validateSideEffects(receipt);validateSideEffects(control);
  if(receipt.analysis_service_network?.media_provider_authority_granted!==false||control.analysis_service_network?.media_provider_authority_granted!==false)throw new Error('step01_transport_analysis_media_identity_mixed');
  const verified=receipt.status==='step01_verified'&&receipt.step01_verified===true&&evidenceManifest.status==='verified'&&evidenceManifest.downstream_consumable===true&&control.step01_verified===true;
  const blocked=String(receipt.status||'').startsWith('blocked_')&&receipt.step01_verified===false&&evidenceManifest.downstream_consumable===false&&control.step01_verified===false;
  if(!verified&&!blocked)throw new Error('step01_transport_final_state_invalid');
  const artifactPaths=evidenceArtifactPaths(evidenceManifest);const returnFiles=[...new Set([...BASE_RETURN_FILES,...artifactPaths])];
  for(const relative of returnFiles)await regularFile(path.join(workspace,relative),'step01_transport_final_file_missing:'+relative);
  const artifactRows=await evidenceRows(workspace,returnFiles);const finalizedAt=String(receipt.completed_at||control.created_at||nowIso(options.nowMs));
  const artifactManifest={schema_version:ARTIFACT_MANIFEST_SCHEMA,dispatch_id:phase.dispatch_id,phase_key:{...phase},completion_turn_id:receipt.completion_event.turn_id,step01_verified:verified,blocked,files:artifactRows,analysis_service_network:{requested:receipt.analysis_service_network?.requested===true,used:receipt.analysis_service_network?.used===true,media_provider_authority_granted:false},media_provider_network_requested:false,media_provider_submit_requested:false,real_delivery:false,finalized_at:finalizedAt};
  await atomicJson(path.join(workspace,'step01_artifact_manifest.json'),artifactManifest);
  const transportFiles=['step01_artifact_manifest.json',...returnFiles];const transportRows=await evidenceRows(workspace,transportFiles);const returnManifest={schema_version:RETURN_MANIFEST_SCHEMA,phase_key:{...phase},files:transportRows,artifact_manifest_sha256:(await fileEvidence(path.join(workspace,'step01_artifact_manifest.json'))).sha256,completion_turn_id:receipt.completion_event.turn_id,step01_verified:verified,blocked,analysis_service_network:artifactManifest.analysis_service_network,media_provider_network_requested:false,media_provider_submit_requested:false,real_delivery:false,finalized_at:finalizedAt};
  await atomicJson(path.join(workspace,'step01_return_transport_manifest.json'),returnManifest);return {status:'finalized',workspace,phase,manifest:returnManifest,manifestSha256:(await fileEvidence(path.join(workspace,'step01_return_transport_manifest.json'))).sha256};
}
async function importMacReturnToWindows(options={}){
  const packageRoot=path.resolve(String(options.packageRoot||''));const verified=await verifyManifest(packageRoot,'step01_return_transport_manifest.json',RETURN_MANIFEST_SCHEMA,options.expectedManifestSha256,options.expectedPhase);const artifact=await readJson(path.join(packageRoot,'step01_artifact_manifest.json'));
  if(artifact?.schema_version!==ARTIFACT_MANIFEST_SCHEMA||artifact.dispatch_id!==verified.phase.dispatch_id||!Array.isArray(artifact.files)||artifact.files.length<BASE_RETURN_FILES.length)throw new Error('step01_transport_artifact_manifest_invalid');
  for(const item of artifact.files){const relative=safeRelative(item.relative_path);const actual=await fileEvidence(path.join(packageRoot,relative));if(actual.sha256!==assertSha(item.sha256,'step01_transport_artifact_sha_invalid')||actual.bytes!==item.bytes)throw new Error('step01_transport_artifact_file_mismatch:'+relative);}
  const finalRoot=path.resolve(String(options.windowsReturnRoot||''));const staging=finalRoot+'.incoming-'+process.pid+'-'+crypto.randomBytes(4).toString('hex');await fsp.mkdir(path.dirname(finalRoot),{recursive:true});await fsp.mkdir(staging,{recursive:false});
  try{for(const item of verified.manifest.files){const relative=safeRelative(item.relative_path);await copyExact(path.join(packageRoot,relative),path.join(staging,relative));}await copyExact(path.join(packageRoot,'step01_return_transport_manifest.json'),path.join(staging,'step01_return_transport_manifest.json'));return await promoteStaging(staging,finalRoot,'step01_return_transport_manifest.json',RETURN_MANIFEST_SCHEMA,verified.manifestSha256,verified.phase);}catch(error){await fsp.rm(staging,{recursive:true,force:true});throw error;}
}
module.exports={ARTIFACT_MANIFEST_SCHEMA,BASE_RETURN_FILES,DISPATCH_SCHEMA,EXPORT_MANIFEST_SCHEMA,RETURN_MANIFEST_SCHEMA,evidenceRows,fileEvidence,finalizeMacReturn,importDispatchToMac,importMacReturnToWindows,isInside,phaseFromDispatch,phaseKey,safeRelative,verifyManifest};
