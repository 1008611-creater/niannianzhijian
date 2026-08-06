'use strict';

const crypto=require('crypto');
const fs=require('fs');
const fsp=fs.promises;
const path=require('path');
const {THREADS}=require('./mac_codex_app_employee_bootstrap');
const {validateToolchainContract}=require('./mac-employee-training/execute_redraw_step01_hq_full');

const SCHEMA='niannian_redraw_step01_mac_employee_dispatch_v1';
const MANIFEST_SCHEMA='niannian_redraw_step01_mac_phase_export_v1';
const MAC_PROJECT='/Users/lsb/AI-Brain/niannian-ai-canonical-local';
const ANALYSIS_AUTHORITY_SCHEMA='niannian_step01_analysis_service_network_authority_v1';
const TOOLCHAIN_SCHEMA='niannian_step01_hq_full_toolchain_contract_v1';
const RUNTIME_IMPORT_SCHEMA='niannian_mac_step01_python_import_receipt_v1';
const REQUIRED_CAPABILITIES=Object.freeze(['mimo_asr','paddle_ocr','transnetv2','hq_audio','forced_aligner']);
const REQUIRED_CAPABILITY_KEYS=Object.freeze(['credential:mimo_asr','credential:paddle_ocr','runtime:transnetv2','runtime:hq','runtime:forced_aligner']);
const MAC_HQ_GATE_PATH=MAC_PROJECT+'/output/mac-employee-training/mac-step01-hq-full-gate-receipt.json';

function sha256(value){return crypto.createHash('sha256').update(value).digest('hex');}
function jsonBytes(value){return Buffer.from(JSON.stringify(value,null,2)+'\n','utf8');}
function assertSha(value,code){const v=String(value||'').toLowerCase();if(!/^[a-f0-9]{64}$/.test(v))throw new Error(code);return v;}
function assertToken(value,pattern,code){const v=String(value||'');if(!pattern.test(v))throw new Error(code);return v;}
function isInside(parent,candidate){const relative=path.relative(path.resolve(parent),path.resolve(candidate));return Boolean(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);}
async function readJson(filePath){return JSON.parse(await fsp.readFile(filePath,'utf8'));}
async function fileEvidence(filePath){const stats=await fsp.lstat(filePath);if(!stats.isFile()||stats.isSymbolicLink())throw new Error('step01_phase_file_invalid');const bytes=await fsp.readFile(filePath);return {sha256:sha256(bytes),bytes:bytes.length};}
async function writeJson(filePath,value){await fsp.mkdir(path.dirname(filePath),{recursive:true});await fsp.writeFile(filePath,jsonBytes(value),{flag:'wx'});}
async function atomicJson(filePath,value){await fsp.mkdir(path.dirname(filePath),{recursive:true});const temp=filePath+'.tmp-'+process.pid+'-'+crypto.randomBytes(3).toString('hex');await fsp.writeFile(temp,jsonBytes(value),{flag:'wx'});await fsp.rename(temp,filePath);}
function phaseKey(value){
  const phase={remote_project_id:assertToken(value.remote_project_id,/^NN-[A-Z0-9-]{10,80}$/,'step01_phase_remote_id_invalid'),local_job_id:assertToken(value.local_job_id,/^web_nn-[a-z0-9-]{10,100}$/,'step01_phase_local_id_invalid'),source_sha256:assertSha(value.source_sha256,'step01_phase_source_sha_invalid'),rights_authority_event_id:assertToken(value.rights_authority_event_id,/^rights-[a-f0-9]{24}$/,'step01_phase_rights_event_invalid'),rights_authority_sha256:assertSha(value.rights_authority_sha256,'step01_phase_rights_sha_invalid'),authorization_event_id:assertToken(value.authorization_event_id,/^step01-[a-f0-9]{24}$/,'step01_phase_authorization_invalid'),settings_version:Number(value.settings_version),dispatch_id:assertToken(value.dispatch_id,/^STEP01EMP-[A-Z0-9-]{10,120}$/,'step01_phase_dispatch_id_invalid')};
  if(!Number.isSafeInteger(phase.settings_version)||phase.settings_version<1)throw new Error('step01_phase_settings_version_invalid');
  phase.canonical=[phase.remote_project_id,phase.local_job_id,phase.source_sha256,phase.rights_authority_event_id,phase.rights_authority_sha256,phase.authorization_event_id,String(phase.settings_version),phase.dispatch_id].join('|');
  phase.key_id='step01phase-'+sha256(phase.canonical);
  if(value.key_id!==undefined&&value.key_id!==phase.key_id)throw new Error('step01_phase_key_mismatch');
  return phase;
}
function selectEmployee(){
  const owner=THREADS.find(item=>item.employee==='01');
  if(!owner)throw new Error('step01_phase_employee_01_missing');
  return owner;
}
function deterministicDispatchId(task,authorization,hqGateEvidence){
  const seed=[task.remote_job_id,task.job_id,task.analysis_run?.id,task.source_video?.sha256,authorization.event_id,String(authorization.settings_version),hqGateEvidence.sha256].join('|');
  const digest=sha256(seed).toUpperCase();
  return 'STEP01EMP-'+digest.slice(0,12)+'-'+digest.slice(12,20);
}
function assertSideEffects(value){for(const key of ['cli_fallback_allowed','codex_exec_allowed','ephemeral_thread_allowed','relay_fallback_allowed','media_provider_network_requested','media_provider_submit_requested','media_provider_upload_requested','spend_requested','package_requested','send_requested','package_send_requested','registry_promotion_requested','deployment_requested','production_data_write_requested','local_image_editing_requested'])if(value[key]!==false)throw new Error('step01_phase_side_effect_contract_invalid:'+key);}
function evaluateAnalysisServiceAuthority(value,task,authorization,options={}){
  const issues=[];const nowMs=Number(options.nowMs||Date.now());
  if(value?.schema_version!==ANALYSIS_AUTHORITY_SCHEMA||value?.status!=='authorized')issues.push('analysis_service_authority_invalid');
  if(value?.source_sha256!==task.source_video?.sha256||value?.authorization_event_id!==authorization.event_id||value?.settings_version!==authorization.settings_version)issues.push('analysis_service_authority_binding_invalid');
  const services=new Set((value?.allowed_services||[]).map(item=>String(item.service_id||item)));if(!services.has('mimo_asr')||!services.has('paddle_ocr'))issues.push('analysis_service_scope_incomplete');
  if(value?.media_provider_authority_granted!==false||value?.media_provider_submit_requested!==false||value?.media_provider_upload_requested!==false||value?.spend_requested!==false)issues.push('analysis_service_media_scope_invalid');
  // D-022 is a source-bound policy fact. expires_at is retained only as
  // observability metadata; task reconciliation, not wall-clock age, decides
  // whether an analysis-service request can be resumed or submitted.
  return {ready:issues.length===0,issues:[...new Set(issues)],checked_at:new Date(nowMs).toISOString(),time_telemetry:{expires_at:value?.expires_at||null}};
}
function evaluateHqGate(hq,options={}){
  const nowMs=Number(options.nowMs||Date.now());const settingsVersion=Number(options.settingsVersion);const settingsProfile=String(options.settingsProfile||'mac-step01-hq-full-evidence-v2');const issues=[];
  if(hq?.schema_version!=='niannian_step01_hq_full_gate_receipt_v2')issues.push('hq_gate_schema_invalid');
  if(hq?.ready!==true||hq?.status!=='ready'||hq?.composite?.ok!==true)issues.push('hq_gate_not_ready');
  if(hq?.host?.platform!=='darwin'||hq?.host?.project_root!==MAC_PROJECT)issues.push('hq_gate_host_binding_invalid');
  if(hq?.settings_binding?.profile!==settingsProfile||hq?.settings_binding?.version!==settingsVersion)issues.push('hq_gate_settings_binding_invalid');
  for(const key of ['provider_upload_requested','provider_submit_requested','spend_requested','real_project_media_processed','real_delivery'])if(hq?.[key]!==false)issues.push('hq_gate_side_effect_invalid:'+key);
  const audits=hq?.capability_audits||{};
  for(const key of REQUIRED_CAPABILITY_KEYS){const audit=audits[key];if(!audit){issues.push('capability_missing:'+key);continue;}if(audit.ready!==true||audit.status!=='ready')issues.push('capability_not_ready:'+key);if(!audit.evidence||typeof audit.evidence!=='object')issues.push('capability_evidence_missing:'+key);}
  return {ready:issues.length===0,issues:[...new Set(issues)],required_capabilities:[...REQUIRED_CAPABILITY_KEYS],checked_at:new Date(nowMs).toISOString(),time_telemetry:{gate_checked_at:hq?.checked_at||null,gate_expires_at:hq?.expires_at||null}};
}
function validateFixedHqReadbackMirror(options,hqGate,hqGateEvidence,toolchain){
  const fixed=options.fixedHqReadback;if(!fixed||fixed.schema_version!=='niannian_mac_hq_fixed_readback_v1'||fixed.read_only!==true||fixed.fixed_whitelist!==true||fixed.project_root_binding!==MAC_PROJECT)throw new Error('step01_phase_fixed_hq_readback_invalid');
  for(const key of ['shell_command_requested','media_provider_network_requested','media_provider_submit_requested','media_provider_upload_requested','spend_requested','project_media_processed'])if(fixed[key]!==false)throw new Error('step01_phase_fixed_hq_readback_side_effect_invalid');
  const gate=(fixed.receipts||[]).find(item=>item?.receipt_id==='hq_gate');const promotion=(fixed.receipts||[]).find(item=>item?.receipt_id==='hq_promotion');
  if(!gate||gate.status!=='present'||!promotion||promotion.status!=='present'||!/^[a-f0-9]{64}$/.test(String(gate.sha256||''))||!Number.isSafeInteger(gate.bytes)||gate.receipt?.schema_version!=='niannian_step01_hq_full_gate_receipt_v2')throw new Error('step01_phase_fixed_hq_readback_receipt_invalid');
  if(JSON.stringify(hqGate)!==JSON.stringify(gate.receipt)||toolchain?.schema_version!==TOOLCHAIN_SCHEMA||toolchain.status!=='accepted'||toolchain.execution_authority_granted!==true)throw new Error('step01_phase_fixed_hq_readback_mirror_invalid');
  const pointer=toolchain.acceptance_gates?.fresh_hq_full_gate_receipt;if(pointer?.sha256!==gate.sha256||Number(pointer?.bytes)!==Number(gate.bytes)||pointer?.exact_path!==MAC_HQ_GATE_PATH||pointer?.status!=='verified'||pointer?.ready!==true)throw new Error('step01_phase_fixed_hq_readback_pointer_binding_invalid');
  return {raw_gate:{sha256:gate.sha256,bytes:gate.bytes},safe_gate:{sha256:hqGateEvidence.sha256,bytes:hqGateEvidence.bytes},promotion:{sha256:promotion.sha256,bytes:promotion.bytes}};
}
async function writeBlockedProjection(jobRoot,task,authorization,source,hqEvidence,evaluation){
  const now=new Date().toISOString();const blocker={schema_version:'niannian_step01_fixed_app_blocker_v1',status:'blocked_resource',blocker_class:'resource',blocker_signature:'step01_hq_full_capability_gate_not_ready',remote_project_id:task.remote_job_id,local_job_id:task.job_id,source_sha256:source.sha256,authorization_event_id:authorization.event_id,settings_version:authorization.settings_version,hq_gate_receipt_sha256:hqEvidence.sha256,issues:evaluation.issues,retry_policy:'Refresh a Mac-host/settings-bound hq_full receipt with five fresh ready capability audits. Never downgrade to stable_batch.',resume_event:'hq_full exact gate evaluates ready=true',media_provider_network_requested:false,media_provider_submit_requested:false,spend_requested:false,real_delivery:false,created_at:now};
  const checkpoint=await readJson(path.join(jobRoot,'checkpoint.json')).catch(()=>({schema_version:1,job_id:task.job_id,completed:[]}));checkpoint.status='blocked_resource';checkpoint.current_step='Step01';checkpoint.blockers=[blocker];checkpoint.next_skill='mx-shortdrama-01-frame-extract';checkpoint.next_action='补齐并刷新 Mac hq_full 五能力、主机与 settings 绑定；不生成可派发 package，不得降级 stable_batch。';checkpoint.updated_at=now;
  const dashboard=await readJson(path.join(jobRoot,'gate_dashboard.json')).catch(()=>({schema_version:'niannian_step01_gate_v1',job_id:task.job_id,gates:{}}));dashboard.current_node='Step01';dashboard.overall_status='blocked_resource_hq_full';dashboard.gates={...(dashboard.gates||{}),Step01:{status:'blocked_resource',blocker_signature:blocker.blocker_signature},Step02:{status:'blocked_upstream'},provider_submit:{status:'blocked_no_authority'},package_send:{status:'blocked'}};dashboard.blocker=blocker;dashboard.next_action=checkpoint.next_action;dashboard.updated_at=now;
  await Promise.all([atomicJson(path.join(jobRoot,'step01_fixed_app_blocker.json'),blocker),atomicJson(path.join(jobRoot,'checkpoint.json'),checkpoint),atomicJson(path.join(jobRoot,'gate_dashboard.json'),dashboard)]);
  return blocker;
}
async function writePrerequisiteBlockedProjection(jobRoot,task,authorization,source,kind,issues,evidence={}){
  const now=new Date().toISOString();const blockerClass=kind==='analysis_service_network_authority'?'authorization':'contract';const blocker={schema_version:'niannian_step01_fixed_app_blocker_v1',status:'blocked_'+blockerClass,blocker_class:blockerClass,blocker_signature:'step01_'+kind+'_not_ready',remote_project_id:task.remote_job_id,local_job_id:task.job_id,source_sha256:source.sha256,authorization_event_id:authorization.event_id,settings_version:authorization.settings_version,issues:[...new Set(issues)],evidence,retry_policy:'Repair the exact prerequisite and create a fresh source/auth/settings-bound dispatch. Never downgrade to stable_batch.',resume_event:kind+' exact gate evaluates ready=true',analysis_service_network_requested:kind==='analysis_service_network_authority',media_provider_network_requested:false,media_provider_submit_requested:false,spend_requested:false,real_delivery:false,created_at:now};
  const checkpoint=await readJson(path.join(jobRoot,'checkpoint.json')).catch(()=>({schema_version:1,job_id:task.job_id,completed:[]}));checkpoint.status=blocker.status;checkpoint.current_step='Step01';checkpoint.blockers=[blocker];checkpoint.next_skill='mx-shortdrama-01-frame-extract';checkpoint.next_action='补齐 exact '+kind+' 证据；不生成可派发 package，不得降级 stable_batch。';checkpoint.updated_at=now;
  const dashboard=await readJson(path.join(jobRoot,'gate_dashboard.json')).catch(()=>({schema_version:'niannian_step01_gate_v1',job_id:task.job_id,gates:{}}));dashboard.current_node='Step01';dashboard.overall_status=blocker.status;dashboard.gates={...(dashboard.gates||{}),Step01:{status:blocker.status,blocker_signature:blocker.blocker_signature},Step02:{status:'blocked_upstream'},provider_submit:{status:'blocked_no_authority'},package_send:{status:'blocked'}};dashboard.blocker=blocker;dashboard.next_action=checkpoint.next_action;dashboard.updated_at=now;
  await Promise.all([atomicJson(path.join(jobRoot,'step01_fixed_app_blocker.json'),blocker),atomicJson(path.join(jobRoot,'checkpoint.json'),checkpoint),atomicJson(path.join(jobRoot,'gate_dashboard.json'),dashboard)]);return blocker;
}
async function verifySource(jobRoot,task){
  const source=task.source_video||{};
  const exact=path.resolve(String(source.exact_path||''));
  if(!isInside(jobRoot,exact))throw new Error('step01_phase_source_path_invalid');
  const evidence=await fileEvidence(exact);
  if(evidence.sha256!==assertSha(source.sha256,'step01_phase_source_sha_invalid')||evidence.bytes!==Number(source.bytes))throw new Error('step01_phase_source_evidence_mismatch');
  return {exact,...evidence};
}
function assertSourceFactsTask(task,authorization,allowTestFixture=false){
  const run=task&&task.analysis_run;
  if(!run&&allowTestFixture===true&&process.env.NIANNIAN_STEP01_PHASE_TEST_MODE==='1')return null;
  if(!run||run.schema_version!=='niannian_step01_source_analysis_run_v1'||!/^analysis-[a-zA-Z0-9-]{8,100}$/.test(String(run.id||''))||!Number.isInteger(Number(run.source_revision))||Number(run.source_revision)<1||assertSha(run.source_sha256,'step01_phase_analysis_run_source_sha_invalid')!==task.source_video?.sha256||Number(run.source_bytes)!==Number(task.source_video?.bytes)||run.source_sha256!==authorization.source_sha256)throw new Error('step01_phase_source_facts_run_invalid');
  const request=task.request||{};
  const required=['media_probe','native_frames','shots','asr','audio_alignment','ocr'];
  if(request.analysis_scope!=='source_evidence_only'||!Array.isArray(request.required_evidence)||request.required_evidence.length!==required.length||required.some((item,index)=>request.required_evidence[index]!==item))throw new Error('step01_phase_source_facts_scope_invalid');
  const creativeKeys=['target_language','visual_style','aspect_ratio','quality','replacement_brief','notes'];
  if(creativeKeys.some(key=>Object.prototype.hasOwnProperty.call(request,key))||Object.prototype.hasOwnProperty.call(task,'production_settings'))throw new Error('step01_phase_source_facts_creative_input_forbidden');
  return run;
}
async function verifyRights(jobRoot,task,authorization,route){
  const pointer=task.rights_authority||{};const exact=path.resolve(String(pointer.exact_path||''));if(!isInside(jobRoot,exact))throw new Error('step01_phase_rights_path_invalid');
  const evidence=await fileEvidence(exact);if(evidence.sha256!==assertSha(pointer.sha256,'step01_phase_rights_sha_invalid')||evidence.bytes!==Number(pointer.bytes))throw new Error('step01_phase_rights_evidence_mismatch');
  const rights=await readJson(exact);if(rights.schema_version!=='niannian_source_rights_authority_v1'||rights.status!=='confirmed'||rights.revoked!==false||rights.event_id!==pointer.event_id||rights.source_sha256!==task.source_video?.sha256||Number(rights.source_bytes)!==Number(task.source_video?.bytes)||rights.scope!=='source_video_redraw_full_chain_under_explicit_provider_and_delivery_gates')throw new Error('step01_phase_rights_contract_invalid');
  if(authorization.rights_authority?.event_id!==rights.event_id||authorization.rights_authority?.sha256!==evidence.sha256||task.analysis_authorization?.rights_authority?.event_id!==rights.event_id||task.analysis_authorization?.rights_authority?.sha256!==evidence.sha256)throw new Error('step01_phase_rights_authorization_binding_invalid');
  if(route.rights_authority_event_id!==rights.event_id||route.rights_authority_sha256!==evidence.sha256)throw new Error('step01_phase_rights_route_binding_invalid');
  const identity=task.authority_bindings||{};if(identity.rights_authority_event_id!==rights.event_id||identity.rights_authority_sha256!==evidence.sha256||identity.source_sha256!==task.source_video.sha256||Number(identity.source_bytes)!==Number(task.source_video.bytes)||identity.step01_authorization_event_id!==authorization.event_id||Number(identity.settings_version)!==Number(authorization.settings_version))throw new Error('step01_phase_authority_identity_invalid');
  return {exact,rights,...evidence};
}
async function verifyExisting(root,manifestSha,phase){
  const manifestPath=path.join(root,'step01_phase_manifest.json');
  const evidence=await fileEvidence(manifestPath).catch(()=>null);
  if(!evidence||evidence.sha256!==manifestSha)throw new Error('step01_phase_existing_manifest_conflict');
  const manifest=await readJson(manifestPath);
  if(manifest.schema_version!==MANIFEST_SCHEMA||phaseKey(manifest.phase_key).canonical!==phase.canonical)throw new Error('step01_phase_existing_binding_conflict');
  for(const item of manifest.files||[]){const actual=await fileEvidence(path.join(root,...String(item.relative_path).split('/')));if(actual.sha256!==item.sha256||actual.bytes!==item.bytes)throw new Error('step01_phase_existing_file_conflict');}
  return {status:'replayed',root,manifest,manifest_sha256:evidence.sha256,phase};
}
async function validateWindowsMirror(toolchain,toolchainPath,hqGatePath,hqGateEvidence){
  const root=path.resolve(__dirname,'..'),candidatePath=path.join(__dirname,'mac-employee-training','step01_hq_full_toolchain_contract.json');
  const mirrors={
    candidate_contract:candidatePath,
    mac_v2_install_receipt:path.join(root,'output','mac-employee-training','mac-skill-bundle-v2-install-receipt.json'),
    mac_v2_exact_parity_receipt:path.join(root,'output','mac-employee-training','mac-skill-bundle-v2-parity-receipt.json'),
    fixed_employee_v2_adoption:path.join(root,'output','mac-employee-training','v2.0.3-adoption-r2','adoption-manifest.json'),
    fresh_hq_full_gate_receipt:hqGatePath
  };
  const candidateEvidence=await fileEvidence(candidatePath),candidate=await readJson(candidatePath);if(toolchain.candidate_contract?.sha256!==candidateEvidence.sha256||toolchain.candidate_contract?.bytes!==candidateEvidence.bytes||candidate.status!=='blocked_install_pending'||candidate.execution_authority_granted!==false)throw new Error('step01_phase_mirror_candidate_invalid');
  if(JSON.stringify(toolchain.entrypoint)!==JSON.stringify(candidate.entrypoint)||JSON.stringify(toolchain.skill_files)!==JSON.stringify(candidate.skill_files)||toolchain.bundle_v2?.manifest_sha256!==candidate.bundle_v2?.manifest?.sha256||toolchain.bundle_v2?.archive_sha256!==candidate.bundle_v2?.archive?.sha256||toolchain.bundle_v2?.sensitive_scan_sha256!==candidate.bundle_v2?.sensitive_scan?.sha256)throw new Error('step01_phase_mirror_candidate_binding_invalid');
  for(const [key,mirrorPath] of Object.entries(mirrors)){const pointer=key==='candidate_contract'?toolchain.candidate_contract:toolchain.acceptance_gates?.[key],actual=await fileEvidence(mirrorPath);if(pointer?.sha256!==actual.sha256||pointer?.bytes!==actual.bytes)throw new Error('step01_phase_mirror_receipt_invalid:'+key);}
  const hqPointer=toolchain.acceptance_gates?.fresh_hq_full_gate_receipt;if(hqPointer.exact_path!==MAC_HQ_GATE_PATH||hqPointer.sha256!==hqGateEvidence.sha256||hqPointer.bytes!==hqGateEvidence.bytes)throw new Error('step01_phase_mirror_hq_binding_invalid');
  const bundleFiles=[['archive',candidate.bundle_v2.archive],['manifest',candidate.bundle_v2.manifest],['sensitive_scan',candidate.bundle_v2.sensitive_scan]];for(const [key,item] of bundleFiles){const local=path.resolve(root,item.project_relative_path),actual=await fileEvidence(local);if(toolchain.bundle_v2?.[key]?.sha256!==actual.sha256||toolchain.bundle_v2?.[key]?.bytes!==actual.bytes||actual.sha256!==item.sha256)throw new Error('step01_phase_mirror_bundle_invalid:'+key);}
  const install=await readJson(mirrors.mac_v2_install_receipt),parity=await readJson(mirrors.mac_v2_exact_parity_receipt),adoption=await readJson(mirrors.fixed_employee_v2_adoption),hq=await readJson(hqGatePath);if(install.status!=='installed_verified'||parity.status!=='exact_parity_verified'||adoption.status!=='verified'||adoption.completed!==5||hq.status!=='ready'||hq.ready!==true||install.manifest_sha256!==toolchain.bundle_v2.manifest_sha256||parity.manifest_sha256!==toolchain.bundle_v2.manifest_sha256||adoption.bindings?.bundle_manifest_sha256!==toolchain.bundle_v2.manifest_sha256||adoption.bindings?.install_receipt_sha256!==toolchain.acceptance_gates.mac_v2_install_receipt.sha256||adoption.bindings?.parity_receipt_sha256!==toolchain.acceptance_gates.mac_v2_exact_parity_receipt.sha256||hq.bindings?.adoption_manifest_sha256!==toolchain.acceptance_gates.fixed_employee_v2_adoption.sha256)throw new Error('step01_phase_mirror_cross_binding_invalid');
  return toolchain;
}
async function prepareStep01Phase(options={}){
  const jobRoot=path.resolve(String(options.jobRoot||''));
  const task=await readJson(path.join(jobRoot,'task.json'));
  const authorization=await readJson(path.join(jobRoot,'step01_authorization.json')).catch(()=>task.analysis_authorization);
  const route=await readJson(path.join(jobRoot,'route_decision.json'));
  if(task.schema_version!=='niannian_web_redraw_job_v1'||task.required_router!=='mx-shortdrama-00-router'||!task.allowed_skill_routes?.includes('mx-shortdrama-01-frame-extract'))throw new Error('step01_phase_route_contract_invalid');
  if(task.runtime_profile!=='mac-step01-strict-evidence-v1')throw new Error('step01_phase_runtime_profile_invalid');
  if(!authorization||authorization.event_id!==task.analysis_authorization?.event_id||authorization.source_sha256!==task.source_video?.sha256||authorization.settings_version!==task.analysis_authorization?.settings_version||authorization.allowed_scope!=='step01_evidence_only')throw new Error('step01_phase_authority_binding_invalid');
  const analysisRun=assertSourceFactsTask(task,authorization,options.testMode===true)||{id:'analysis-test-fixture',source_revision:1};
  if(authorization.provider_submission_requested!==false||authorization.package_send_requested!==false)throw new Error('step01_phase_authorization_side_effect_invalid');
  const legacyTestRoute=options.testMode===true&&process.env.NIANNIAN_STEP01_PHASE_TEST_MODE==='1'&&route.selected_skill==='mx-shortdrama-01-frame-extract';
  if(route.source_sha256!==task.source_video.sha256||route.authorization_event_id!==authorization.event_id||(!legacyTestRoute&&(route.required_router!=='mx-shortdrama-00-router'||route.selected_skill!==null||route.authority_class!=='advisory_request')))throw new Error('step01_phase_route_binding_invalid');
  const source=await verifySource(jobRoot,task);
  const rights=await verifyRights(jobRoot,task,authorization,route);
  const routeMatrixPath=path.resolve(String(options.routeMatrixPath||path.resolve(__dirname,'mac-employee-training','route_matrix.json')));
  const hqGatePath=path.resolve(String(options.hqGatePath||path.resolve(__dirname,'..','output','mac-employee-training','mac-step01-hq-full-gate-receipt.json')));
  const [routeEvidence,routeMatrixEvidence]=await Promise.all([fileEvidence(path.join(jobRoot,'route_decision.json')),fileEvidence(routeMatrixPath)]);
  const fixedGate=options.fixedHqReadback?(options.fixedHqReadback.receipts||[]).find(item=>item?.receipt_id==='hq_gate'):null;
  if(options.fixedHqReadback&&(!fixedGate||fixedGate.status!=='present'||!/^[a-f0-9]{64}$/.test(String(fixedGate.sha256||''))||!Number.isSafeInteger(fixedGate.bytes)||!fixedGate.receipt))throw new Error('step01_phase_fixed_hq_gate_receipt_missing');
  const [hqGateEvidence,hqGate]=options.fixedHqReadback?[{sha256:fixedGate.sha256,bytes:fixedGate.bytes},fixedGate.receipt]:await Promise.all([fileEvidence(hqGatePath),readJson(hqGatePath)]);
  const step01Route=(await readJson(routeMatrixPath)).rows?.find(row=>row.route_id==='redraw_step01_hq_full');
  if(!step01Route||step01Route.ordered_skill_chain?.join('|')!=='mx-shortdrama-00-router|mx-shortdrama-01-frame-extract'||!REQUIRED_CAPABILITY_KEYS.every((item,index)=>step01Route.required_capabilities[index]===item))throw new Error('step01_phase_route_matrix_contract_invalid');
  const hqEvaluation=evaluateHqGate(hqGate,{settingsVersion:authorization.settings_version,settingsProfile:'mac-step01-hq-full-evidence-v2',nowMs:options.nowMs,maxAgeMs:options.capabilityMaxAgeMs});
  if(!hqEvaluation.ready){const blocker=await writeBlockedProjection(jobRoot,task,authorization,source,hqGateEvidence,hqEvaluation);return {status:'blocked_resource',blocked:true,dispatch:null,phase:null,root:null,manifest:null,manifest_sha256:null,blocker,hq_evaluation:hqEvaluation};}
  const analysisAuthority=authorization.analysis_service_network_authority||task.analysis_service_network_authority;
  const analysisEvaluation=evaluateAnalysisServiceAuthority(analysisAuthority,task,authorization,{nowMs:options.nowMs});
  if(!analysisEvaluation.ready){const blocker=await writePrerequisiteBlockedProjection(jobRoot,task,authorization,source,'analysis_service_network_authority',analysisEvaluation.issues);return {status:'blocked_authorization',blocked:true,dispatch:null,phase:null,root:null,manifest:null,manifest_sha256:null,blocker,analysis_authority_evaluation:analysisEvaluation};}
  const toolchainPath=path.resolve(String(options.toolchainContractPath||path.resolve(__dirname,'..','output','mac-employee-training','step01-hq-full-toolchain-accepted.json')));
  const runtimeImportPath=path.resolve(String(options.runtimeImportReceiptPath||path.resolve(__dirname,'..','output','mac-employee-training','mac-step01-python-import-receipt.json')));
  let toolchain,runtimeImport,toolchainEvidence,runtimeImportEvidence;
  const fixedPromotion=options.fixedHqReadback?(options.fixedHqReadback.receipts||[]).find(item=>item?.receipt_id==='hq_promotion'):null;
  try{
    if(options.fixedHqReadback){
      if(!fixedPromotion||fixedPromotion.status!=='present'||!/^[a-f0-9]{64}$/.test(String(fixedPromotion.sha256||''))||!Number.isSafeInteger(fixedPromotion.bytes)||!fixedPromotion.receipt)throw new Error('fixed_hq_promotion_receipt_missing');
      toolchain=fixedPromotion.receipt;toolchainEvidence=await fileEvidence(toolchainPath);runtimeImport={checked_at:options.fixedHqReadback.read_at};runtimeImportEvidence={sha256:fixedPromotion.sha256,bytes:fixedPromotion.bytes};
    }else [toolchain,runtimeImport,toolchainEvidence,runtimeImportEvidence]=await Promise.all([readJson(toolchainPath),readJson(runtimeImportPath),fileEvidence(toolchainPath),fileEvidence(runtimeImportPath)]);
  }catch(error){const blocker=await writePrerequisiteBlockedProjection(jobRoot,task,authorization,source,'toolchain_or_runtime_import',['required_contract_file_missing']);return {status:'blocked_contract',blocked:true,dispatch:null,phase:null,root:null,manifest:null,manifest_sha256:null,blocker};}
  const prerequisiteIssues=[];
  if(toolchain.schema_version!==TOOLCHAIN_SCHEMA||toolchain.status!=='accepted'||toolchain.execution_authority_granted!==true||toolchain.profile!=='hq_full'||toolchain.profile_release!=='mac-step01-hq-full-evidence-v2'||toolchain.stable_batch_fallback_allowed!==false||toolchain.settings_binding?.version!==authorization.settings_version||toolchain.settings_binding?.profile!=='mac-step01-hq-full-evidence-v2')prerequisiteIssues.push('toolchain_contract_not_accepted');
  const hqPointer=toolchain.acceptance_gates?.fresh_hq_full_gate_receipt;if((!options.fixedHqReadback&&(String(hqPointer?.exact_path||'')!==MAC_HQ_GATE_PATH||hqPointer?.sha256!==hqGateEvidence.sha256||hqPointer?.bytes!==hqGateEvidence.bytes))||hqPointer?.status!=='verified'||hqPointer?.required!==true||hqPointer?.ready!==true)prerequisiteIssues.push('toolchain_hq_gate_binding_invalid');
  try{
    const testInjection=options.toolchainValidator||options.toolchainValidationOptions||options.allowedSkillRoots;
    if(testInjection&&!(options.testMode===true&&process.env.NIANNIAN_STEP01_PHASE_TEST_MODE==='1'))throw new Error('step01_phase_toolchain_test_override_forbidden');
    if(options.toolchainValidator)await options.toolchainValidator(toolchain,toolchainPath,options.allowedSkillRoots,options.toolchainValidationOptions||{nowMs:Number(options.nowMs||Date.now())});else if(options.fixedHqReadback)validateFixedHqReadbackMirror(options,hqGate,hqGateEvidence,toolchain);else if(process.platform==='darwin')await validateToolchainContract(toolchain,toolchainPath,undefined,{nowMs:Number(options.nowMs||Date.now())});else await validateWindowsMirror(toolchain,toolchainPath,hqGatePath,hqGateEvidence);
  }catch(error){prerequisiteIssues.push('toolchain_contract_receipt_validation_failed:'+String(error.message||error).split(':')[0]);}
  if(!options.fixedHqReadback&&(runtimeImport.schema_version!==RUNTIME_IMPORT_SCHEMA||runtimeImport.status!=='ready'||runtimeImport.host?.platform!=='darwin'||runtimeImport.host?.project_root!==MAC_PROJECT||runtimeImport.runtime?.python_root!=='/Users/lsb/AI-Brain/runtime/step01-python312'||!['Pillow','requests','silero-vad'].every(name=>runtimeImport.imports?.[name]?.ready===true)))prerequisiteIssues.push('runtime_import_receipt_not_ready');
  if(prerequisiteIssues.length){const blocker=await writePrerequisiteBlockedProjection(jobRoot,task,authorization,source,'toolchain_or_runtime_import',prerequisiteIssues,{toolchain_sha256:toolchainEvidence.sha256,runtime_import_sha256:runtimeImportEvidence.sha256});return {status:'blocked_contract',blocked:true,dispatch:null,phase:null,root:null,manifest:null,manifest_sha256:null,blocker};}
  const sourceMedia=task.source_video?.media_contract||task.source_media_contract;
  if(!sourceMedia||!Number.isInteger(sourceMedia.width)||!Number.isInteger(sourceMedia.height)||!Number.isFinite(Number(sourceMedia.duration_seconds))||sourceMedia.width<1||sourceMedia.height<1||Number(sourceMedia.duration_seconds)<=0||Number(sourceMedia.audio_stream_count)<1||!Number.isFinite(Number(sourceMedia.audio_sample_rate))||Number(sourceMedia.audio_sample_rate)<=0){const blocker=await writePrerequisiteBlockedProjection(jobRoot,task,authorization,source,'source_media_contract',['source_ffprobe_or_audio_contract_missing']);return {status:'blocked_contract',blocked:true,dispatch:null,phase:null,root:null,manifest:null,manifest_sha256:null,blocker};}
  const dispatchId=String(options.dispatchId||deterministicDispatchId(task,authorization,hqGateEvidence));
  const phase=phaseKey({remote_project_id:task.remote_job_id,local_job_id:task.job_id,source_sha256:source.sha256,rights_authority_event_id:rights.rights.event_id,rights_authority_sha256:rights.sha256,authorization_event_id:authorization.event_id,settings_version:authorization.settings_version,dispatch_id:dispatchId});
  const employee=selectEmployee(phase);
  const workspace='/Users/lsb/.local/share/niannian-ai/employee-workspaces/'+employee.employee+'/'+dispatchId;
  const dispatch={schema_version:SCHEMA,phase_key:{...phase},dispatch_id:dispatchId,status:'prepared',phase:'prepared_for_transport',execution_surface:'mac_codex_desktop_app_existing_thread',execution_mode:'step01_hq_full_authorized_analysis_only',idempotency_key:sha256(phase.canonical),remote_project_id:task.remote_job_id,local_job_id:task.job_id,analysis_run_id:analysisRun.id,source_revision:Number(analysisRun.source_revision),source_sha256:source.sha256,source_bytes:source.bytes,rights_authority:{event_id:rights.rights.event_id,sha256:rights.sha256,bytes:rights.bytes,scope:rights.rights.scope,status:'confirmed',revoked:false},source_media_contract:{width:sourceMedia.width,height:sourceMedia.height,duration_seconds:Number(sourceMedia.duration_seconds),fps:Number(sourceMedia.fps||sourceMedia.frame_rate||0),audio_stream_count:Number(sourceMedia.audio_stream_count),audio_sample_rate:Number(sourceMedia.audio_sample_rate||0)},authorization_event_id:authorization.event_id,settings_version:authorization.settings_version,required_router:'mx-shortdrama-00-router',runtime_profile:'mac-step01-strict-evidence-v1',strict_capability_gate:'hq_full_must_fail_closed',required_capabilities:[...REQUIRED_CAPABILITIES],capability_readback:{exact_project_relative_path:'output/mac-employee-training/mac-step01-hq-full-gate-receipt.json',sha256:fixedGate?.sha256||hqGateEvidence.sha256,bytes:fixedGate?.bytes||hqGateEvidence.bytes,status:hqGate.status,ready:true,evaluation:hqEvaluation,proof:fixedGate?'fixed_hq_readback_pointer':'windows_mirror'},analysis_service_network_authority:{...analysisAuthority},analysis_service_network:{requested:true,used:false,allowed_services:['mimo_asr','paddle_ocr'],media_provider_authority_granted:false},authority:{route_request:{sha256:routeEvidence.sha256},route_matrix:{exact_project_relative_path:'bridge/mac-employee-training/route_matrix.json',sha256:routeMatrixEvidence.sha256},toolchain_contract:{exact_project_relative_path:'output/mac-employee-training/step01-hq-full-toolchain-accepted.json',sha256:toolchainEvidence.sha256},runtime_import_receipt:{exact_project_relative_path:'output/mac-employee-training/mac-step01-python-import-receipt.json',sha256:runtimeImportEvidence.sha256}},employee:{...employee,project_root:MAC_PROJECT,workspace},portable:{task:'input/task.json',rights_authority:'input/authority/rights_authority.json',authorization:'input/step01_authorization.json',analysis_service_network_authority:'input/analysis_service_network_authority.json',route_request:'input/route_request.json',route_matrix:'input/authority/route_matrix.json',hq_gate_receipt:'input/authority/mac-step01-hq-full-gate-receipt.json',toolchain_contract:'input/authority/step01_hq_full_toolchain_contract.json',runtime_import_receipt:'input/authority/mac-step01-python-import-receipt.json',source_video:'input/source/source.mp4'},expected_outputs:['route_decision.json','skill_execution_receipt.json','step01_employee_worker_receipt.json','step01_employee_control_receipt.json','step01_evidence_manifest.json','checkpoint.json','gate_dashboard.json','artifact_ledger.json','result_manifest.json','worker_report.md','validation receipts','audio manifests','accepted TransNet shot manifest','native frame manifests'],employee_model_channel:{channel_id:'codex_native_account_v1',launch_mode:'native_account',provider_config_id:'openai',credential_source:'codex_home_account_session',raw_auth_read:false,raw_auth_recorded:false,requested:true,used:false,media_provider_authority_granted:false},test_only:false,real_delivery:false,cli_fallback_allowed:false,codex_exec_allowed:false,ephemeral_thread_allowed:false,relay_fallback_allowed:false,media_provider_network_requested:false,media_provider_submit_requested:false,media_provider_upload_requested:false,spend_requested:false,package_requested:false,send_requested:false,package_send_requested:false,registry_promotion_requested:false,deployment_requested:false,production_data_write_requested:false,local_image_editing_requested:false,prepared_at:new Date().toISOString()};
  dispatch.analysis_service_idempotency=['mimo_asr|chinese_transcript','paddle_ocr|subtitle_text_qa'].map(value=>{const [service_id,purpose]=value.split('|');return {service_id,purpose,key:sha256([analysisRun.id,source.sha256,service_id,purpose].join('|'))};});
  assertSideEffects(dispatch);
  const exportRoot=path.resolve(String(options.exportRoot||path.join(jobRoot,'step01_app_phase_exports')));
  const finalRoot=path.join(exportRoot,phase.key_id);
  const existingManifest=await fileEvidence(path.join(finalRoot,'step01_phase_manifest.json')).catch(()=>null);
  if(existingManifest)return verifyExisting(finalRoot,existingManifest.sha256,phase);
  const staging=path.join(exportRoot,'.'+phase.key_id+'.incoming-'+process.pid+'-'+crypto.randomBytes(3).toString('hex'));
  await fsp.mkdir(path.join(staging,'input','source'),{recursive:true});
  await fsp.mkdir(path.join(staging,'input','authority'),{recursive:true});
  try{
    const portableTask={...task,rights_authority:{...task.rights_authority,exact_path:workspace+'/input/authority/rights_authority.json',original_authority:{exact_path:rights.exact,sha256:rights.sha256,bytes:rights.bytes}},source_video:{...task.source_video,exact_path:workspace+'/input/source/source.mp4',original_authority:{exact_path:source.exact,sha256:source.sha256,bytes:source.bytes},portable_transport:{relative_path:'input/source/source.mp4',sha256:source.sha256,bytes:source.bytes}}};
    await writeJson(path.join(staging,'step01_employee_dispatch.json'),dispatch);
    await writeJson(path.join(staging,'input','task.json'),portableTask);
    await writeJson(path.join(staging,'input','step01_authorization.json'),authorization);
    await writeJson(path.join(staging,'input','analysis_service_network_authority.json'),analysisAuthority);
    await writeJson(path.join(staging,'input','route_request.json'),route);
    await fsp.copyFile(rights.exact,path.join(staging,'input','authority','rights_authority.json'),fs.constants.COPYFILE_EXCL);
    await fsp.copyFile(routeMatrixPath,path.join(staging,'input','authority','route_matrix.json'),fs.constants.COPYFILE_EXCL);
    await fsp.copyFile(hqGatePath,path.join(staging,'input','authority','mac-step01-hq-full-gate-receipt.json'),fs.constants.COPYFILE_EXCL);
    await fsp.copyFile(toolchainPath,path.join(staging,'input','authority','step01_hq_full_toolchain_contract.json'),fs.constants.COPYFILE_EXCL);
    await fsp.copyFile(runtimeImportPath,path.join(staging,'input','authority','mac-step01-python-import-receipt.json'),fs.constants.COPYFILE_EXCL);
    await fsp.copyFile(source.exact,path.join(staging,'input','source','source.mp4'),fs.constants.COPYFILE_EXCL);
    const relativePaths=['step01_employee_dispatch.json','input/task.json','input/step01_authorization.json','input/analysis_service_network_authority.json','input/route_request.json','input/authority/rights_authority.json','input/authority/route_matrix.json','input/authority/mac-step01-hq-full-gate-receipt.json','input/authority/step01_hq_full_toolchain_contract.json','input/authority/mac-step01-python-import-receipt.json','input/source/source.mp4'];
    const files=[];for(const relative of relativePaths){const evidence=await fileEvidence(path.join(staging,...relative.split('/')));files.push({relative_path:relative,...evidence});}
    const manifest={schema_version:MANIFEST_SCHEMA,phase_key:{...phase},files:files.sort((a,b)=>a.relative_path.localeCompare(b.relative_path)),source_authority:{exact_path:source.exact,sha256:source.sha256,bytes:source.bytes},rights_authority:{event_id:rights.rights.event_id,sha256:rights.sha256,bytes:rights.bytes,scope:rights.rights.scope,status:'confirmed',revoked:false},employee_thread_id:employee.thread_id,test_only:false,real_delivery:false,analysis_service_network_requested:true,media_provider_network_requested:false,media_provider_submit_requested:false,generated_at:dispatch.prepared_at};
    await writeJson(path.join(staging,'step01_phase_manifest.json'),manifest);
    const manifestEvidence=await fileEvidence(path.join(staging,'step01_phase_manifest.json'));
    await fsp.mkdir(exportRoot,{recursive:true});
    await fsp.rename(staging,finalRoot);
    return {status:'promoted',root:finalRoot,manifest,manifest_sha256:manifestEvidence.sha256,phase,dispatch};
  }catch(error){await fsp.rm(staging,{recursive:true,force:true});throw error;}
}

module.exports={ANALYSIS_AUTHORITY_SCHEMA,MAC_HQ_GATE_PATH,MAC_PROJECT,MANIFEST_SCHEMA,REQUIRED_CAPABILITIES,REQUIRED_CAPABILITY_KEYS,RUNTIME_IMPORT_SCHEMA,SCHEMA,TOOLCHAIN_SCHEMA,assertSideEffects,assertSourceFactsTask,deterministicDispatchId,evaluateAnalysisServiceAuthority,evaluateHqGate,fileEvidence,phaseKey,prepareStep01Phase,selectEmployee,validateWindowsMirror,verifyRights,verifySource};
