'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const brokerContract = require('./niannian_step01_artifact_broker');
const phaseTransport = require('./niannian_redraw_step01_mac_app_phase_transport');

function codeError(code, message = code) { const error = new Error(message); error.code = code; return error; }
function inside(parent, candidate) { const relative=path.relative(path.resolve(parent),path.resolve(candidate)); return Boolean(relative) && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative); }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function safeRelative(value) { return phaseTransport.safeRelative(value); }
function artifactRoleForRelative(relative, kind = 'artifact') { return kind + '-' + sha256(Buffer.from(safeRelative(relative), 'utf8')).slice(0,24); }
function packageKeyForRelative(binding, relative, sha, kind = 'artifact') { return brokerContract.packageObjectKey(binding,artifactRoleForRelative(relative,kind),sha); }
function returnKeyForRelative(binding, relative, sha, kind = 'artifact') { return brokerContract.returnObjectKey(binding,artifactRoleForRelative(relative,kind),sha); }

function assertBroker(broker) {
  if (!broker || typeof broker.get !== 'function' || typeof broker.put !== 'function') throw codeError('ARTIFACT_BROKER_NOT_CONFIGURED');
}

function assertGrant(grant, operation, binding, expectedKey, expectedSha, expectedBytes) {
  if (!grant || grant.operation !== operation || grant.object_key !== expectedKey || grant.sha256 !== expectedSha || Number(grant.bytes) !== Number(expectedBytes) || !grant.url) throw codeError(operation === 'GET' ? 'ARTIFACT_PACKAGE_GRANT_FAILED' : 'ARTIFACT_RETURN_UPLOAD_FAILED', 'grant_binding_invalid');
  const grantBinding = grant.binding || {};
  for (const key of ['project_id','analysis_run_id','phase_key','package_manifest_sha256']) if (grantBinding[key] !== binding[key]) throw codeError(operation === 'GET' ? 'ARTIFACT_PACKAGE_GRANT_FAILED' : 'ARTIFACT_RETURN_UPLOAD_FAILED', 'grant_phase_binding_invalid');
  if (binding.request_id && grantBinding.request_id !== binding.request_id) throw codeError('ARTIFACT_RETURN_UPLOAD_FAILED', 'grant_request_binding_invalid');
}

async function writeExact(root, relative, body, expectedSha, expectedBytes) {
  const bytes = Buffer.from(body);
  if (bytes.length !== Number(expectedBytes) || sha256(bytes) !== expectedSha) throw codeError('ARTIFACT_PACKAGE_SHA_MISMATCH');
  const target = path.resolve(root, ...safeRelative(relative).split('/'));
  if (!inside(root, target)) throw codeError('ARTIFACT_PACKAGE_SHA_MISMATCH');
  await fsp.mkdir(path.dirname(target), {recursive:true});
  await fsp.writeFile(target, bytes, {flag:'wx'});
}

async function downloadPackageToStaging(options = {}) {
  assertBroker(options.broker);
  const binding = brokerContract.phaseBinding(options.binding);
  const stagingRoot = path.resolve(String(options.staging_root || ''));
  if (!stagingRoot) throw codeError('ARTIFACT_PACKAGE_DOWNLOAD_FAILED', 'staging_root_missing');
  const manifestGrant = options.manifest_grant;
  const manifestKey = packageKeyForRelative(binding, 'step01_phase_manifest.json', binding.package_manifest_sha256, 'phase-manifest');
  if (!manifestGrant || manifestGrant.object_key !== manifestKey || manifestGrant.operation !== 'GET' || manifestGrant.sha256 !== binding.package_manifest_sha256 || !Number.isSafeInteger(Number(manifestGrant.bytes))) throw codeError('ARTIFACT_PACKAGE_GRANT_FAILED', 'manifest_grant_invalid');
  assertGrant(manifestGrant, 'GET', binding, manifestKey, binding.package_manifest_sha256, Number(manifestGrant.bytes));
  await fsp.mkdir(stagingRoot, {recursive:false,mode:0o700});
  try {
    const manifestBytes = await brokerContract.transferWithRetries('package_manifest_download',{attempts:3,execute:() => options.broker.get(manifestGrant.url)});
    await writeExact(stagingRoot, 'step01_phase_manifest.json', manifestBytes, manifestGrant.sha256, manifestGrant.bytes);
    const manifest = JSON.parse(Buffer.from(manifestBytes).toString('utf8'));
    const phase = phaseTransport.phaseKey(manifest.phase_key || {});
    if (phase.key_id !== binding.phase_key || phase.remote_project_id !== binding.project_id || !Array.isArray(manifest.files)) throw codeError('ARTIFACT_PACKAGE_SHA_MISMATCH', 'manifest_phase_invalid');
    const grants = new Map((options.file_grants || []).map(grant => [grant.relative_path, grant]));
    if (grants.size !== manifest.files.length) throw codeError('ARTIFACT_PACKAGE_GRANT_FAILED', 'file_grant_count_invalid');
    for (const item of manifest.files) {
      const relative = safeRelative(item.relative_path);
      const grant = grants.get(relative);
      const objectKey = packageKeyForRelative(binding, relative, item.sha256);
      assertGrant(grant, 'GET', binding, objectKey, item.sha256, item.bytes);
      const body = await brokerContract.transferWithRetries('package_download',{attempts:3,execute:() => options.broker.get(grant.url)});
      await writeExact(stagingRoot, relative, body, item.sha256, item.bytes);
    }
    await phaseTransport.verifyManifest(stagingRoot, 'step01_phase_manifest.json', phaseTransport.EXPORT_MANIFEST_SCHEMA, binding.package_manifest_sha256, phase);
    return {staging_root:stagingRoot,phase,manifest};
  } catch (error) {
    await fsp.rm(stagingRoot,{recursive:true,force:true}).catch(()=>{});
    if (error.code) throw error;
    throw codeError('ARTIFACT_PACKAGE_DOWNLOAD_FAILED');
  }
}

async function importPackageFromBroker(options = {}) {
  const inboxRoot = path.resolve(String(options.inbox_root || ''));
  if (!inboxRoot) throw codeError('ARTIFACT_PACKAGE_DOWNLOAD_FAILED', 'inbox_root_missing');
  const binding = brokerContract.phaseBinding(options.binding);
  const staging = path.join(inboxRoot, '.' + binding.phase_key + '.broker-' + process.pid + '-' + crypto.randomBytes(4).toString('hex'));
  const downloaded = await downloadPackageToStaging({...options,binding,staging_root:staging});
  try {
    const imported = await phaseTransport.importDispatchToMac({packageRoot:downloaded.staging_root,expectedManifestSha256:binding.package_manifest_sha256,expectedPhase:downloaded.phase,workspacePath:options.workspace_path});
    await fsp.rm(downloaded.staging_root,{recursive:true,force:true});
    return {status:'broker_downloaded',phase:downloaded.phase,workspace:imported.root};
  } catch (error) {
    await fsp.rm(downloaded.staging_root,{recursive:true,force:true}).catch(()=>{});
    if (error.code) throw error;
    throw codeError('ARTIFACT_PACKAGE_DOWNLOAD_FAILED');
  }
}

async function pullPackageToInbox(options = {}) {
  const binding=brokerContract.phaseBinding(options.binding);
  const inboxRoot=path.resolve(String(options.inbox_root||''));
  if(!inboxRoot)throw codeError('ARTIFACT_PACKAGE_DOWNLOAD_FAILED','inbox_root_missing');
  const finalRoot=path.join(inboxRoot,binding.phase_key);
  if(!inside(inboxRoot,finalRoot))throw codeError('ARTIFACT_PACKAGE_DOWNLOAD_FAILED','inbox_path_invalid');
  const existing=await fsp.lstat(finalRoot).catch(()=>null);
  if(existing){
    if(!existing.isDirectory()||existing.isSymbolicLink())throw codeError('ARTIFACT_PACKAGE_DOWNLOAD_FAILED','inbox_existing_invalid');
    const verified=await phaseTransport.verifyManifest(finalRoot,'step01_phase_manifest.json',phaseTransport.EXPORT_MANIFEST_SCHEMA,binding.package_manifest_sha256).catch(()=>{throw codeError('ARTIFACT_PACKAGE_SHA_MISMATCH');});
    if(verified.phase.key_id!==binding.phase_key||verified.phase.remote_project_id!==binding.project_id)throw codeError('ARTIFACT_PACKAGE_SHA_MISMATCH');
    return {status:'replayed',package_root:finalRoot,verified};
  }
  await fsp.mkdir(inboxRoot,{recursive:true,mode:0o700});
  const staging=path.join(inboxRoot,'.'+binding.phase_key+'.broker-'+process.pid+'-'+crypto.randomBytes(4).toString('hex'));
  const downloaded=await downloadPackageToStaging({...options,binding,staging_root:staging});
  try{
    await fsp.rename(downloaded.staging_root,finalRoot);
    return {status:'broker_pulled',package_root:finalRoot,verified:{phase:downloaded.phase,manifest:downloaded.manifest}};
  }catch(error){
    await fsp.rm(downloaded.staging_root,{recursive:true,force:true}).catch(()=>{});
    if(error.code)throw error;
    throw codeError('ARTIFACT_PACKAGE_DOWNLOAD_FAILED');
  }
}

async function publishPackageToBroker(options = {}) {
  assertBroker(options.broker);
  if (typeof options.issue_package_grant !== 'function') throw codeError('ARTIFACT_PACKAGE_GRANT_FAILED', 'package_grant_protocol_missing');
  const binding = brokerContract.phaseBinding(options.binding);
  const packageRoot = path.resolve(String(options.package_root || ''));
  const manifestPath = path.join(packageRoot, 'step01_phase_manifest.json');
  const manifestEvidence = await phaseTransport.fileEvidence(manifestPath).catch(() => { throw codeError('ARTIFACT_PACKAGE_GRANT_FAILED', 'package_manifest_missing'); });
  if (manifestEvidence.sha256 !== binding.package_manifest_sha256) throw codeError('ARTIFACT_PACKAGE_SHA_MISMATCH');
  const manifest = await phaseTransport.verifyManifest(packageRoot,'step01_phase_manifest.json',phaseTransport.EXPORT_MANIFEST_SCHEMA,binding.package_manifest_sha256).catch(() => { throw codeError('ARTIFACT_PACKAGE_SHA_MISMATCH'); });
  if (manifest.phase.key_id !== binding.phase_key || manifest.phase.remote_project_id !== binding.project_id) throw codeError('ARTIFACT_PACKAGE_SHA_MISMATCH');
  const rows=[{relative_path:'step01_phase_manifest.json',sha256:manifestEvidence.sha256,bytes:manifestEvidence.bytes},...manifest.manifest.files];
  const receipts=[];
  for (const item of rows) {
    const relative=safeRelative(item.relative_path);
    const source=path.resolve(packageRoot,...relative.split('/'));
    if (!inside(packageRoot,source)) throw codeError('ARTIFACT_PACKAGE_SHA_MISMATCH');
    const evidence=await phaseTransport.fileEvidence(source).catch(()=>{throw codeError('ARTIFACT_PACKAGE_SHA_MISMATCH');});
    if(evidence.sha256!==item.sha256||Number(evidence.bytes)!==Number(item.bytes))throw codeError('ARTIFACT_PACKAGE_SHA_MISMATCH');
    const objectKey=packageKeyForRelative(binding,relative,evidence.sha256,relative==='step01_phase_manifest.json'?'phase-manifest':'artifact');
    const grant=await options.issue_package_grant({binding,relative_path:relative,object_key:objectKey,sha256:evidence.sha256,bytes:evidence.bytes});
    assertGrant(grant,'PUT',binding,objectKey,evidence.sha256,evidence.bytes);
    await brokerContract.transferWithRetries('package_upload',{attempts:3,execute:async()=>options.broker.put(grant.url,await fsp.readFile(source))});
    receipts.push(brokerContract.redactedGrant(grant));
  }
  return {schema_version:'niannian_step01_artifact_package_publish_v1',status:'published',project_id:binding.project_id,analysis_run_id:binding.analysis_run_id,phase_key:binding.phase_key,package_manifest_sha256:binding.package_manifest_sha256,objects:receipts};
}

async function uploadReturnToBroker(options = {}) {
  assertBroker(options.broker);
  if (typeof options.issue_return_grant !== 'function') throw codeError('ARTIFACT_RETURN_UPLOAD_FAILED', 'return_grant_protocol_missing');
  const binding = brokerContract.returnBinding(options.binding);
  const workspace = path.resolve(String(options.workspace_path || ''));
  const manifestPath = path.join(workspace, 'step01_return_transport_manifest.json');
  const manifestEvidence = await phaseTransport.fileEvidence(manifestPath).catch(() => { throw codeError('ARTIFACT_RETURN_MANIFEST_INVALID'); });
  const expectedPhase = options.expected_phase ? phaseTransport.phaseKey(options.expected_phase) : null;
  if (!expectedPhase || expectedPhase.key_id !== binding.phase_key || expectedPhase.remote_project_id !== binding.project_id) throw codeError('ARTIFACT_RETURN_MANIFEST_INVALID', 'expected_phase_missing');
  const manifest = await phaseTransport.verifyManifest(workspace, 'step01_return_transport_manifest.json', phaseTransport.RETURN_MANIFEST_SCHEMA, manifestEvidence.sha256, expectedPhase).catch(() => { throw codeError('ARTIFACT_RETURN_MANIFEST_INVALID'); });
  const rows = [{relative_path:'step01_return_transport_manifest.json',sha256:manifestEvidence.sha256,bytes:manifestEvidence.bytes}, ...manifest.manifest.files];
  const seen = new Set();
  const receipts = [];
  for (const item of rows) {
    const relative = safeRelative(item.relative_path);
    if (seen.has(relative)) throw codeError('ARTIFACT_RETURN_MANIFEST_INVALID', 'duplicate_return_path');
    seen.add(relative);
    const source = path.resolve(workspace, ...relative.split('/'));
    if (!inside(workspace, source)) throw codeError('ARTIFACT_RETURN_MANIFEST_INVALID');
    const evidence = await phaseTransport.fileEvidence(source).catch(() => { throw codeError('ARTIFACT_RETURN_EVIDENCE_INVALID'); });
    if (evidence.sha256 !== item.sha256 || Number(evidence.bytes) !== Number(item.bytes)) throw codeError('ARTIFACT_RETURN_EVIDENCE_INVALID');
    const objectKey = returnKeyForRelative(binding, relative, evidence.sha256, relative==='step01_return_transport_manifest.json'?'return-manifest':'artifact');
    const grant = await options.issue_return_grant({binding,return_manifest_sha256:manifestEvidence.sha256,return_manifest_bytes:manifestEvidence.bytes,relative_path:relative,object_key:objectKey,sha256:evidence.sha256,bytes:evidence.bytes});
    assertGrant(grant, 'PUT', binding, objectKey, evidence.sha256, evidence.bytes);
    await brokerContract.transferWithRetries('return_upload',{attempts:3,execute:async() => options.broker.put(grant.url,await fsp.readFile(source))});
    receipts.push(brokerContract.redactedGrant(grant));
  }
  return {schema_version:'niannian_step01_artifact_return_upload_v1',status:'uploaded',return_manifest_sha256:manifestEvidence.sha256,return_manifest_bytes:manifestEvidence.bytes,project_id:binding.project_id,analysis_run_id:binding.analysis_run_id,phase_key:binding.phase_key,request_id:binding.request_id,objects:receipts};
}

async function importReturnFromBroker(options = {}) {
  assertBroker(options.broker);
  const binding=brokerContract.returnBinding(options.binding);
  const expectedPhase=phaseTransport.phaseKey(options.expected_phase || {});
  if(expectedPhase.key_id!==binding.phase_key||expectedPhase.remote_project_id!==binding.project_id)throw codeError('ARTIFACT_RETURN_MANIFEST_INVALID');
  const manifestGrant=options.manifest_grant;
  const manifestKey=returnKeyForRelative(binding,'step01_return_transport_manifest.json',manifestGrant.sha256,'return-manifest');
  if(!manifestGrant||manifestGrant.object_key!==manifestKey||manifestGrant.operation!=='GET'||!manifestGrant.url)throw codeError('ARTIFACT_RETURN_MANIFEST_INVALID');
  const staging=path.resolve(String(options.staging_root||''));
  const finalRoot=path.resolve(String(options.windows_return_root||''));
  if(!staging||!finalRoot)throw codeError('ARTIFACT_RETURN_EVIDENCE_INVALID');
  await fsp.mkdir(staging,{recursive:false,mode:0o700});
  try{
    const manifestBytes=await brokerContract.transferWithRetries('return_manifest_download',{attempts:3,execute:()=>options.broker.get(manifestGrant.url)});
    await writeExact(staging,'step01_return_transport_manifest.json',manifestBytes,manifestGrant.sha256,manifestGrant.bytes);
    let manifest;
    try { manifest=JSON.parse(Buffer.from(manifestBytes).toString('utf8')); } catch { throw codeError('ARTIFACT_RETURN_MANIFEST_INVALID'); }
    if(manifest?.schema_version!==phaseTransport.RETURN_MANIFEST_SCHEMA||phaseTransport.phaseKey(manifest.phase_key||{}).canonical!==expectedPhase.canonical||!Array.isArray(manifest.files))throw codeError('ARTIFACT_RETURN_MANIFEST_INVALID');
    for(const item of manifest.files){
      const relative=safeRelative(item.relative_path);
      const objectKey=returnKeyForRelative(binding,relative,item.sha256);
      const grant=await options.issue_get_grant({binding,relative_path:relative,object_key:objectKey,sha256:item.sha256,bytes:item.bytes});
      assertGrant(grant,'GET',binding,objectKey,item.sha256,item.bytes);
      const bytes=await brokerContract.transferWithRetries('return_download',{attempts:3,execute:()=>options.broker.get(grant.url)});
      await writeExact(staging,relative,bytes,item.sha256,item.bytes);
    }
    await phaseTransport.verifyManifest(staging,'step01_return_transport_manifest.json',phaseTransport.RETURN_MANIFEST_SCHEMA,manifestGrant.sha256,expectedPhase).catch(()=>{throw codeError('ARTIFACT_RETURN_EVIDENCE_INVALID');});
    const importReturn=options.import_return||phaseTransport.importMacReturnToWindows;
    const imported=await importReturn({packageRoot:staging,expectedManifestSha256:manifestGrant.sha256,expectedPhase,windowsReturnRoot:finalRoot});
    await fsp.rm(staging,{recursive:true,force:true});
    return {status:'imported',return_manifest_sha256:manifestGrant.sha256,windows_return_root:imported.root};
  }catch(error){
    await fsp.rm(staging,{recursive:true,force:true}).catch(()=>{});
    if(error.code)throw error;
    throw codeError('ARTIFACT_RETURN_EVIDENCE_INVALID');
  }
}

module.exports = {artifactRoleForRelative,assertGrant,downloadPackageToStaging,importPackageFromBroker,importReturnFromBroker,packageKeyForRelative,publishPackageToBroker,pullPackageToInbox,returnKeyForRelative,uploadReturnToBroker};
