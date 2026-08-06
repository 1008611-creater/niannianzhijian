'use strict';

const fsp=require('fs').promises;
const path=require('path');
const {fileEvidence,phaseKey}=require('./niannian_n06_mac_app_phase_transport');

const INBOX='/Users/lsb/.local/share/niannian-ai/phase-inbox';
const ARCHIVE='/Users/lsb/.local/share/niannian-ai/phase-inbox-completed';
async function readJson(filePath){return JSON.parse(await fsp.readFile(filePath,'utf8'));}
function exactInboxPackage(value,inboxRoot=INBOX){const resolved=path.resolve(String(value||''));const relative=path.relative(path.resolve(inboxRoot),resolved);if(!/^n06phase-[a-f0-9]{64}$/.test(relative)||relative.includes(path.sep))throw new Error('phase_cleanup_package_path_invalid');return resolved;}
async function archiveCompletedPackage(options={}){
  const inboxRoot=path.resolve(String(options.inboxRoot||INBOX));const archiveBase=path.resolve(String(options.archiveRoot||ARCHIVE));const packageRoot=exactInboxPackage(options.packageRoot,inboxRoot);const expectedManifestSha256=String(options.expectedManifestSha256||'').toLowerCase();const expectedPhaseKey=String(options.expectedPhaseKey||'');if(!/^[a-f0-9]{64}$/.test(expectedManifestSha256)||!/^n06phase-[a-f0-9]{64}$/.test(expectedPhaseKey))throw new Error('phase_cleanup_expected_binding_invalid');
  const manifestPath=path.join(packageRoot,'transport_manifest.json');const evidence=await fileEvidence(manifestPath);if(evidence.sha256!==expectedManifestSha256)throw new Error('phase_cleanup_manifest_sha_mismatch');const manifest=await readJson(manifestPath);if(phaseKey(manifest.phase_key||{}).key_id!==expectedPhaseKey||path.basename(packageRoot)!==expectedPhaseKey)throw new Error('phase_cleanup_phase_mismatch');
  await fsp.mkdir(archiveBase,{recursive:true});const archiveRoot=path.join(archiveBase,expectedPhaseKey+'-'+expectedManifestSha256.slice(0,16));const existing=await fsp.stat(archiveRoot).then(stats=>stats.isDirectory(),()=>false);
  if(existing){const archived=await fileEvidence(path.join(archiveRoot,'transport_manifest.json'));if(archived.sha256!==expectedManifestSha256)throw new Error('phase_cleanup_archive_conflict');await fsp.rm(packageRoot,{recursive:true,force:true});return {ok:true,status:'replayed_inbox_removed',archive_root:archiveRoot,phase_key:expectedPhaseKey,manifest_sha256:expectedManifestSha256};}
  await fsp.rename(packageRoot,archiveRoot);return {ok:true,status:'archived_for_recovery',archive_root:archiveRoot,phase_key:expectedPhaseKey,manifest_sha256:expectedManifestSha256};
}
function option(args,name){const index=args.indexOf(name);return index>=0?args[index+1]:null;}
if(require.main===module)archiveCompletedPackage({packageRoot:option(process.argv.slice(2),'--package'),expectedManifestSha256:option(process.argv.slice(2),'--manifest-sha'),expectedPhaseKey:option(process.argv.slice(2),'--phase-key')}).then(result=>process.stdout.write(JSON.stringify(result)+'\n')).catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
module.exports={ARCHIVE,INBOX,archiveCompletedPackage,exactInboxPackage};
