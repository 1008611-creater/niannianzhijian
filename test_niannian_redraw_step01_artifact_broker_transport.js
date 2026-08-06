'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const brokerContract = require('./bridge/niannian_step01_artifact_broker');
const transport = require('./bridge/niannian_redraw_step01_artifact_broker_transport');
const phaseTransport = require('./bridge/niannian_redraw_step01_mac_app_phase_transport');

function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
async function evidence(filePath) { const bytes=await fsp.readFile(filePath); return {sha256:sha(bytes),bytes:bytes.length}; }

async function main() {
  const root=await fsp.mkdtemp(path.join(os.tmpdir(),'niannian-step01-broker-transport-'));
  try {
    const phase=phaseTransport.phaseKey({remote_project_id:'NN-20260715083045-8120F5',local_job_id:'web_nn-20260715083045-8120f5',source_sha256:sha('source'),rights_authority_event_id:'rights-0123456789abcdef01234567',rights_authority_sha256:sha('rights'),authorization_event_id:'step01-0123456789abcdef01234567',settings_version:1,dispatch_id:'STEP01EMP-0123456789-ABCDEF12'});
    const binding={project_id:'NN-20260715083045-8120F5',analysis_run_id:'analysis-1-0123456789abcdef',phase_key:phase.key_id,package_manifest_sha256:null};
    const packageRoot=path.join(root,'package');
    await fsp.mkdir(path.join(packageRoot,'input'),{recursive:true});
    await fsp.writeFile(path.join(packageRoot,'input','task.json'),'{}\n');
    const task=await evidence(path.join(packageRoot,'input','task.json'));
    const manifest={schema_version:phaseTransport.EXPORT_MANIFEST_SCHEMA,phase_key:phase,files:[{relative_path:'input/task.json',...task}]};
    await fsp.writeFile(path.join(packageRoot,'step01_phase_manifest.json'),JSON.stringify(manifest,null,2)+'\n');
    binding.package_manifest_sha256=(await evidence(path.join(packageRoot,'step01_phase_manifest.json'))).sha256;
    const memory=brokerContract.createMemoryBroker();
    const issuePackageGrant=async input=>memory.issue({operation:'PUT',...input});
    const published=await transport.publishPackageToBroker({broker:memory,binding,package_root:packageRoot,issue_package_grant:issuePackageGrant});
    assert.equal(published.status,'published');
    assert.equal(published.objects.length,2);
    assert.equal(JSON.stringify(published).includes('memory://'),false);
    const manifestBytes=await fsp.readFile(path.join(packageRoot,'step01_phase_manifest.json'));
    const taskBytes=await fsp.readFile(path.join(packageRoot,'input','task.json'));
    const manifestGrant={object_key:transport.packageKeyForRelative(binding,'step01_phase_manifest.json',sha(manifestBytes),'phase-manifest'),sha256:sha(manifestBytes),bytes:manifestBytes.length};
    const taskGrant={object_key:transport.packageKeyForRelative(binding,'input/task.json',sha(taskBytes)),sha256:sha(taskBytes),bytes:taskBytes.length};
    const getManifest=memory.issue({operation:'GET',object_key:manifestGrant.object_key,sha256:manifestGrant.sha256,bytes:manifestGrant.bytes,binding});
    const getTask=memory.issue({operation:'GET',object_key:taskGrant.object_key,sha256:taskGrant.sha256,bytes:taskGrant.bytes,binding});
    const staged=await transport.downloadPackageToStaging({broker:memory,binding,staging_root:path.join(root,'staging'),manifest_grant:getManifest,file_grants:[{...getTask,relative_path:'input/task.json'}]});
    assert.equal(staged.phase.key_id,binding.phase_key);
    assert.equal((await fsp.readFile(path.join(staged.staging_root,'input','task.json'),'utf8')).trim(),'{}');
    await assert.rejects(()=>transport.downloadPackageToStaging({broker:memory,binding,staging_root:path.join(root,'bad'),manifest_grant:getManifest,file_grants:[]}),error=>error.code==='ARTIFACT_PACKAGE_GRANT_FAILED');
    await fsp.rm(staged.staging_root,{recursive:true,force:true});

    const returnWorkspace=path.join(root,'return-workspace');
    await fsp.mkdir(path.join(returnWorkspace,'evidence'),{recursive:true});
    await fsp.writeFile(path.join(returnWorkspace,'evidence','validation.json'),'validated\n');
    const validation=await evidence(path.join(returnWorkspace,'evidence','validation.json'));
    const returnManifest={schema_version:phaseTransport.RETURN_MANIFEST_SCHEMA,phase_key:phase,files:[{relative_path:'evidence/validation.json',...validation}]};
    await fsp.writeFile(path.join(returnWorkspace,'step01_return_transport_manifest.json'),JSON.stringify(returnManifest,null,2)+'\n');
    const returnBinding={...binding,request_id:'return-00000001'};
    const issueReturnGrant=async input=>memory.issue({operation:'PUT',...input});
    const returnManifestEvidence=await evidence(path.join(returnWorkspace,'step01_return_transport_manifest.json'));
    const uploaded=await transport.uploadReturnToBroker({broker:memory,binding:returnBinding,expected_phase:phase,workspace_path:returnWorkspace,issue_return_grant:issueReturnGrant});
    assert.equal(uploaded.status,'uploaded');
    assert.equal(uploaded.objects.length,2);
    assert.equal(JSON.stringify(uploaded).includes('memory://'),false);
    assert.equal(memory.has(transport.returnKeyForRelative(returnBinding,'step01_return_transport_manifest.json',returnManifestEvidence.sha256,'return-manifest')),true);
    assert.equal(memory.has(transport.returnKeyForRelative(returnBinding,'evidence/validation.json',validation.sha256)),true);
    const returnManifestGrant=memory.issue({operation:'GET',object_key:transport.returnKeyForRelative(returnBinding,'step01_return_transport_manifest.json',returnManifestEvidence.sha256,'return-manifest'),sha256:returnManifestEvidence.sha256,bytes:returnManifestEvidence.bytes,binding:returnBinding});
    let importedValidation=false;
    const imported=await transport.importReturnFromBroker({broker:memory,binding:returnBinding,expected_phase:phase,manifest_grant:returnManifestGrant,issue_get_grant:async input=>memory.issue({operation:'GET',...input}),staging_root:path.join(root,'return-staging'),windows_return_root:path.join(root,'windows-return'),import_return:async input=>{importedValidation=await fsp.readFile(path.join(input.packageRoot,'evidence','validation.json'),'utf8').then(value=>value==='validated\n');return {root:input.windowsReturnRoot};}});
    assert.equal(imported.status,'imported');
    assert.equal(importedValidation,true);
    await assert.rejects(()=>transport.uploadReturnToBroker({broker:memory,binding:returnBinding,expected_phase:phase,workspace_path:returnWorkspace,issue_return_grant:issueReturnGrant}),error=>error.code==='ARTIFACT_RETURN_UPLOAD_FAILED');
    process.stdout.write(JSON.stringify({ok:true,verified:['broker package publication and download verify exact phase manifest and every object SHA/bytes','missing or extra grants are rejected before workspace import','return objects require a new request-scoped exact grant and cannot overwrite','Windows re-imports return only after manifest and every object SHA/bytes validate','grant receipts redact URLs','transport does not use SSH or SCP','broker test uses local memory fixture only']})+'\n');
  } finally { await fsp.rm(root,{recursive:true,force:true}); }
}
main().catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
