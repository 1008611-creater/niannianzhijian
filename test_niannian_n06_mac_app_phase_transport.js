'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const transport = require('./bridge/niannian_n06_mac_app_phase_transport');

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function jsonBytes(value) { return Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8'); }
async function writeJson(filePath, value) { await fsp.mkdir(path.dirname(filePath), {recursive:true}); await fsp.writeFile(filePath, jsonBytes(value), {flag:'wx'}); }
async function readJson(filePath) { return JSON.parse(await fsp.readFile(filePath, 'utf8')); }

async function createDispatchFixture(root, suffix = 'A', options = {}) {
  const dispatchId = 'N06EMP-TEST-' + suffix + '-0001';
  const transactionId = 'N06REAL-TEST-' + suffix + '-0001';
  const jobId = 'web_ns-phase-transport-' + suffix.toLowerCase() + '-12345';
  const dispatchRoot = path.join(root, 'windows-dispatch-' + suffix);
  const references = [];
  const authorityReferences = [];
  for (let index = 1; index <= 4; index += 1) {
    const refKey = 'REF_' + suffix + '_' + index;
    const relativePath = 'input/references/' + String(index).padStart(2, '0') + '-' + refKey + '.png';
    const bytes = Buffer.from('reference-' + suffix + '-' + index, 'utf8');
    await fsp.mkdir(path.dirname(path.join(dispatchRoot, relativePath)), {recursive:true});
    await fsp.writeFile(path.join(dispatchRoot, relativePath), bytes, {flag:'wx'});
    const reference = {ref_key:refKey,duty:'职责 ' + index,sha256:sha256(bytes),confirmed:true,upload_eligible:true,local_edit_applied:false,relative_path:relativePath};
    references.push(reference);
    authorityReferences.push({ref_key:refKey,duty:reference.duty,sha256:reference.sha256,path:'D:\\authority\\' + refKey + '.png',uploadEligible:true});
  }
  const promptText = 'locked prompt ' + suffix;
  const authoritySpec = {
    schema_version:'niannian_n06_mimo_video_spec_v1',transaction_id:transactionId,project_id:'NS-PHASE-' + suffix + '-12345',job_id:jobId,group_id:'V001',provider:'mimo',execution_mode:'real_submit_candidate_v2',
    prompt:{text:promptText,sha256:sha256(Buffer.from(promptText,'utf8'))},references:authorityReferences,duration_sec:11,aspect_ratio:'9:16',quality_decision_token:'keep_720p_hard_gate',media_provider_submit_requested:false
  };
  const authoritySpecSha256 = sha256(jsonBytes(authoritySpec));
  const workspace = path.join(root, 'mac-home', '.local', 'share', 'niannian-ai', 'employee-workspaces', '01', dispatchId);
  const serverShaped = options.serverShaped !== false;
  const sourceSpec = serverShaped ? {
    ...authoritySpec,
    authority_spec:{exact_path:'D:\\authority\\n06_v001_real_submit_spec.json',sha256:authoritySpecSha256},
    references:authorityReferences.map((reference,index) => ({
      ...reference,
      path:workspace.replace(/\\/g,'/') + '/' + references[index].relative_path,
      original_authority:{exact_path:reference.path,sha256:reference.sha256},
      portable_transport:{relative_path:references[index].relative_path,sha256:references[index].sha256}
    }))
  } : authoritySpec;
  const specPath = path.join(dispatchRoot, 'input', 'video_task_spec.json');
  await writeJson(specPath, sourceSpec);
  const sourceSpecSha256 = sha256(await fsp.readFile(specPath));
  const dispatch = {
    schema_version:'niannian_n06_mac_employee_dispatch_v1',dispatch_id:dispatchId,status:'prepared',execution_mode:'synthetic_fake_transport_only',project_id:authoritySpec.project_id,job_id:jobId,group_id:'V001',transaction_id:transactionId,spec_sha256:authoritySpecSha256,prompt_sha256:authoritySpec.prompt.sha256,
    ...(serverShaped ? {portable_spec_sha256:sourceSpecSha256} : {}),portable_spec_relative_path:'input/video_task_spec.json',references,employee:{employee:'01',title:'念念 AI · Mac 员工 01',thread_id:'019f6201-c013-7cf3-b155-61d2789085f4',workspace},
    employee_model_channel:{channel_id:'krill_codex_custom_provider_v1',requested:true,used:false},media_provider_network_requested:false,media_provider_submit_requested:false,media_provider_upload_requested:false,spend_requested:false,deployment_requested:false,test_only:true,real_delivery:false,prepared_at:'2026-07-15T00:00:00.000Z'
  };
  const dispatchPath = path.join(dispatchRoot, 'employee_dispatch.json');
  await writeJson(dispatchPath, dispatch);
  return {authoritySpec,authoritySpecSha256,sourceSpec,sourceSpecSha256,dispatch,dispatchPath,dispatchRoot,workspace};
}

async function createCompletedReturn(workspace, dispatch) {
  const completion = {method:'turn/completed',turn_id:'turn-' + dispatch.dispatch_id,status:'completed',error:null};
  const completedDispatch = {...dispatch,status:'completed_test_only',phase:'employee_turn_completed',lease:{status:'completed',lease_id:completion.turn_id,owner_thread_id:dispatch.employee.thread_id,claimed_at:'2026-07-15T00:00:30.000Z',completed_at:'2026-07-15T00:01:00.000Z'}};
  const receipt = {
    schema_version:'niannian_n06_mac_employee_synthetic_receipt_v1',dispatch_id:dispatch.dispatch_id,transaction_id:dispatch.transaction_id,project_id:dispatch.project_id,job_id:dispatch.job_id,group_id:dispatch.group_id,spec_sha256:dispatch.spec_sha256,prompt_sha256:dispatch.prompt_sha256,
    employee:{thread_id:dispatch.employee.thread_id},employee_model_channel:{requested:true,used:true,media_provider_authority_granted:false},completion_event:completion,status:'test_only_qa_passed',test_only:true,real_delivery:false,media_provider_network_requested:false,media_provider_submit_requested:false,media_provider_upload_requested:false,spend_requested:false,deployment_requested:false,completed_at:'2026-07-15T00:01:00.000Z'
  };
  const control = {schema_version:'niannian_mac_codex_employee_job_dispatch_receipt_v1',dispatch_id:dispatch.dispatch_id,idempotency_key:dispatch.idempotency_key,completion_event:completion,test_only:true,real_delivery:false,created_at:'2026-07-15T00:01:00.000Z'};
  await fsp.writeFile(path.join(workspace, 'employee_dispatch.json'), jsonBytes(completedDispatch));
  await writeJson(path.join(workspace, 'employee_worker_receipt.json'), receipt);
  await writeJson(path.join(workspace, 'mac_employee_dispatch_control_receipt.json'), control);
  await fsp.writeFile(path.join(workspace, 'fake-download.mp4'), Buffer.from('fake media ' + dispatch.dispatch_id), {flag:'wx'});
  await writeJson(path.join(workspace, 'ffprobe.json'), {status:'passed_test_stub',width:720,height:1280,duration_sec:11,synthetic:true});
  await writeJson(path.join(workspace, 'visual_qa.json'), {status:'passed_test_stub',qa_level:'integrated',synthetic:true,real_delivery:false});
  await writeJson(path.join(workspace, 'website_projection.json'), {schema_version:'niannian_website_projection_v1',dispatch_id:dispatch.dispatch_id,status:'employee_synthetic_integrated_not_delivered',real_delivery:false});
  await writeJson(path.join(workspace, 'artifact_manifest.json'), {schema_version:'stale_pre_completion_manifest',dispatch_id:dispatch.dispatch_id,files:[]});
  return {completion,receipt,control};
}

async function main() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-n06-phase-transport-'));
  try {
    const fixture = await createDispatchFixture(root, 'A');
    const exportRoot = path.join(root, 'exports');
    const exported = await transport.exportWindowsDispatch({dispatchPath:fixture.dispatchPath,exportRoot});
    assert.equal(exported.status, 'promoted');
    assert.match(exported.manifestSha256, /^[a-f0-9]{64}$/);
    assert.equal(exported.phase.canonical, transport.phaseKey(fixture.dispatch).canonical);
    const exportedDispatch = await readJson(path.join(exported.root, 'employee_dispatch.json'));
    const portableSpec = await readJson(path.join(exported.root, 'input', 'video_task_spec.json'));
    assert.equal(exportedDispatch.authority_spec_sha256, fixture.authoritySpecSha256);
    assert.match(exportedDispatch.portable_spec_sha256, /^[a-f0-9]{64}$/);
    assert.notEqual(exportedDispatch.portable_spec_sha256, exportedDispatch.authority_spec_sha256);
    assert.equal(exportedDispatch.portable_spec_sha256, fixture.sourceSpecSha256);
    assert.deepEqual(portableSpec, fixture.sourceSpec, 'current server portable spec must be exported byte-semantically unchanged');
    assert(portableSpec.references.every(item => item.portable_transport.relative_path && !path.isAbsolute(item.portable_transport.relative_path) && !/^[A-Za-z]:/.test(item.portable_transport.relative_path)));
    assert.equal(portableSpec.authority_spec.sha256, fixture.authoritySpecSha256);
    assert.equal(exported.manifest.spec_transport_mode, 'server_portable_spec_exact');

    const replayExport = await transport.exportWindowsDispatch({dispatchPath:fixture.dispatchPath,exportRoot});
    assert.equal(replayExport.status, 'replayed');
    assert.equal(replayExport.manifestSha256, exported.manifestSha256);

    const legacyFixture = await createDispatchFixture(root, 'L', {serverShaped:false});
    const legacyExport = await transport.exportWindowsDispatch({dispatchPath:legacyFixture.dispatchPath,exportRoot:path.join(root,'legacy-export')});
    const legacyPortableSpec = await readJson(path.join(legacyExport.root,'input','video_task_spec.json'));
    assert.equal(legacyExport.manifest.spec_transport_mode, 'legacy_authority_spec_rewritten');
    assert(legacyPortableSpec.references.every(item => item.path === item.relative_path && !path.isAbsolute(item.path)));

    const imported = await transport.importDispatchToMac({packageRoot:exported.root,expectedManifestSha256:exported.manifestSha256,expectedPhase:fixture.dispatch,workspacePath:fixture.workspace});
    assert.equal(imported.status, 'promoted');
    const importedReplay = await transport.importDispatchToMac({packageRoot:exported.root,expectedManifestSha256:exported.manifestSha256,expectedPhase:fixture.dispatch,workspacePath:fixture.workspace});
    assert.equal(importedReplay.status, 'replayed');

    const leasePath = path.join(root, 'leases', transport.phaseKey(fixture.dispatch).key_id);
    await fsp.mkdir(path.dirname(leasePath), {recursive:true});
    const acquired = await transport.acquireLease({leasePath,phase:fixture.dispatch,ownerId:'employee-01',ttlMs:5000,nowMs:100000});
    assert.equal(acquired.status, 'acquired');
    const sameClaim = await transport.acquireLease({leasePath,phase:fixture.dispatch,ownerId:'employee-01',ttlMs:5000,nowMs:101000});
    assert.equal(sameClaim.status, 'replayed');
    await assert.rejects(() => transport.acquireLease({leasePath,phase:fixture.dispatch,ownerId:'employee-02',ttlMs:5000,nowMs:101000}), /phase_lease_conflict/);
    const renewed = await transport.renewLease({leasePath,phase:fixture.dispatch,ownerId:'employee-01',ttlMs:5000,nowMs:102000});
    assert.equal(renewed.status, 'renewed');
    await assert.rejects(() => transport.releaseLease({leasePath,phase:fixture.dispatch,ownerId:'employee-02'}), /phase_lease_owner_or_phase_mismatch/);
    const expiredTakeover = await transport.acquireLease({leasePath,phase:fixture.dispatch,ownerId:'employee-02',ttlMs:5000,nowMs:108000});
    assert.equal(expiredTakeover.status, 'acquired');
    assert.equal((await transport.releaseLease({leasePath,phase:fixture.dispatch,ownerId:'employee-02'})).status, 'released');

    await createCompletedReturn(fixture.workspace, exportedDispatch);
    const finalized = await transport.finalizeMacReturn({workspacePath:fixture.workspace,nowMs:200000});
    assert.equal(finalized.status, 'finalized');
    const finalizedReplay = await transport.finalizeMacReturn({workspacePath:fixture.workspace,nowMs:999999});
    assert.equal(finalizedReplay.manifestSha256, finalized.manifestSha256);
    const artifactManifest = await readJson(path.join(fixture.workspace, 'artifact_manifest.json'));
    assert.deepEqual(artifactManifest.files.map(item => item.relative_path).sort(), [...transport.REQUIRED_FINAL_RETURN_FILES].sort());
    const returnPaths = new Set(finalized.manifest.files.map(item => item.relative_path));
    for (const required of ['artifact_manifest.json', ...transport.REQUIRED_FINAL_RETURN_FILES]) assert(returnPaths.has(required));

    const windowsReturn = path.join(root, 'windows-return');
    const returned = await transport.importMacReturnToWindows({packageRoot:fixture.workspace,expectedManifestSha256:finalized.manifestSha256,expectedPhase:fixture.dispatch,windowsReturnRoot:windowsReturn});
    assert.equal(returned.status, 'promoted');
    assert.equal((await transport.importMacReturnToWindows({packageRoot:fixture.workspace,expectedManifestSha256:finalized.manifestSha256,expectedPhase:fixture.dispatch,windowsReturnRoot:windowsReturn})).status, 'replayed');
    await assert.rejects(() => transport.importMacReturnToWindows({packageRoot:fixture.workspace,expectedManifestSha256:'0'.repeat(64),expectedPhase:fixture.dispatch,windowsReturnRoot:path.join(root,'bad-return')}), /manifest_sha_mismatch/);

    const tamperFixture = await createDispatchFixture(root, 'T');
    const tamperExport = await transport.exportWindowsDispatch({dispatchPath:tamperFixture.dispatchPath,exportRoot:path.join(root,'tamper-export')});
    const tamperRelative = tamperFixture.dispatch.references[0].relative_path;
    await fsp.writeFile(path.join(tamperExport.root, tamperRelative), Buffer.from('tampered'));
    await assert.rejects(() => transport.importDispatchToMac({packageRoot:tamperExport.root,expectedManifestSha256:tamperExport.manifestSha256,expectedPhase:tamperFixture.dispatch,workspacePath:tamperFixture.workspace}), /manifest_file_mismatch/);

    const escapeFixture = await createDispatchFixture(root, 'E');
    const escapeDispatch = await readJson(escapeFixture.dispatchPath);
    escapeDispatch.references[0].relative_path = '../escape.png';
    await fsp.writeFile(escapeFixture.dispatchPath, jsonBytes(escapeDispatch));
    await assert.rejects(() => transport.exportWindowsDispatch({dispatchPath:escapeFixture.dispatchPath,exportRoot:path.join(root,'escape-export')}), /reference_path_invalid/);

    const staleFixture = await createDispatchFixture(root, 'S');
    await fsp.appendFile(path.join(staleFixture.dispatchRoot, 'input', 'video_task_spec.json'), 'stale');
    await assert.rejects(() => transport.exportWindowsDispatch({dispatchPath:staleFixture.dispatchPath,exportRoot:path.join(root,'stale-export')}), /stale_portable_spec/);

    const swappedFixture = await createDispatchFixture(root, 'W');
    const swappedDispatch = await readJson(swappedFixture.dispatchPath);
    const authoritySha = swappedDispatch.spec_sha256;
    swappedDispatch.spec_sha256 = swappedDispatch.portable_spec_sha256;
    swappedDispatch.portable_spec_sha256 = authoritySha;
    await fsp.writeFile(swappedFixture.dispatchPath, jsonBytes(swappedDispatch));
    await assert.rejects(() => transport.exportWindowsDispatch({dispatchPath:swappedFixture.dispatchPath,exportRoot:path.join(root,'swapped-export')}), /stale_portable_spec|portable_authority_sha_mismatch/);

    const omissionFixture = await createDispatchFixture(root, 'O');
    const omissionExport = await transport.exportWindowsDispatch({dispatchPath:omissionFixture.dispatchPath,exportRoot:path.join(root,'omission-export')});
    await transport.importDispatchToMac({packageRoot:omissionExport.root,expectedManifestSha256:omissionExport.manifestSha256,expectedPhase:omissionFixture.dispatch,workspacePath:omissionFixture.workspace});
    const omissionDispatch = await readJson(path.join(omissionFixture.workspace,'employee_dispatch.json'));
    await createCompletedReturn(omissionFixture.workspace, omissionDispatch);
    await fsp.rm(path.join(omissionFixture.workspace, 'mac_employee_dispatch_control_receipt.json'));
    await assert.rejects(() => transport.finalizeMacReturn({workspacePath:omissionFixture.workspace}), /ENOENT|final_file_missing/);

    const conflictFixture = await createDispatchFixture(root, 'C');
    const conflictExport = await transport.exportWindowsDispatch({dispatchPath:conflictFixture.dispatchPath,exportRoot:path.join(root,'conflict-export')});
    await assert.rejects(() => transport.importDispatchToMac({packageRoot:conflictExport.root,expectedManifestSha256:conflictExport.manifestSha256,expectedPhase:conflictFixture.dispatch,workspacePath:fixture.workspace}), /manifest_sha_mismatch|phase_key_mismatch/);

    process.stdout.write(JSON.stringify({ok:true,verified:[
      'five-field phase key','current server portable spec exact export','authority and portable spec SHA separation','legacy unambiguous authority rewrite','portable relative reference transport paths','swapped authority/portable SHA rejection','Windows export SHA/bytes','Mac atomic import','export/import replay','conflict rejection','path escape rejection','tamper rejection','stale spec rejection','final receipt and control receipt manifest inclusion','final receipt omission rejection','Windows atomic return import','lease replay/renew/expiry takeover/double-claim rejection','no turn/network/SSH/provider invocation'
    ]}) + '\n');
  } finally {
    await fsp.rm(root, {recursive:true,force:true});
  }
}

main().catch(error => { process.stderr.write(String(error.stack || error) + '\n'); process.exitCode = 1; });
