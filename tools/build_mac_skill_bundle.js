'use strict';

const crypto=require('crypto');
const fs=require('fs');
const fsp=fs.promises;
const path=require('path');
const JSZip=require('jszip');

const DEFAULT_SKILL_ROOT='C:\\Users\\lsb\\.codex\\skills';
const SKILLS=Object.freeze(['ai-video-production-router','ai-video-fundamentals-skill','prompt-skill-router','mx-shortdrama-00-router','mx-shortdrama-01-frame-extract','mx-shortdrama-02-source-timeline','mx-shortdrama-03-mexico-localize','mx-shortdrama-04-asset-prompts','mx-shortdrama-05-asset-images','ai-video-firstframe-workflow','mx-shortdrama-script-only-production','ai-video-channel-router','mimo-8001-video-channel']);
const FORBIDDEN_PARTS=new Set(['.git','node_modules','__pycache__','.DS_Store']);
const FORBIDDEN_PATH=/(?:reset_password|credential|cookie|token|secret)/i;
const ZIP_DATE=new Date('1980-01-01T00:00:00.000Z');
const SENSITIVE=Object.freeze([
  {id:'private_key',pattern:/-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/i},
  {id:'assigned_secret',pattern:/(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{16,}/i},
  {id:'bearer_header',pattern:/authorization\s*:\s*bearer\s+[A-Za-z0-9_./+=-]{12,}/i}
]);
const SUPERSEDES=Object.freeze({schema_version:'niannian_mac_skill_bundle_install_receipt_v2',bundle_id:'niannian-mac-production-skills-v2',bundle_version:'2.0.2',archive_sha256:'439fa6b56341a8ca26a5e1d7d3c3b1e68132773fc69e55ff3ee99e057d6bfa56',manifest_sha256:'9ac3f78b571e3732de0422af0d3d7d3c4ccd1dd6f45a67aeb442426aa56bf08a',mac_install_receipt_sha256:'1e8daa058126852ec07b99c325a14fc94a89798209f0c95906c9245359448f68',reason:'Step01 full001 repair: consume manifest-declared subtitle_change frames so hard-subtitle OCR coverage cannot be suppressed by high-confidence ASR rows'});
const EXPECTED_SKILL_FILE_COUNT=127;
const EXPECTED_SOURCE_SNAPSHOT_SHA256='2e9c27f3c783f72f7d36dc846dcd15fd4572fa35ee9b96bc424824ea9a8b309c';
const REQUIRED_NEW_FILES=Object.freeze({
  'skills/mx-shortdrama-01-frame-extract/post_coding_review_step01_hq_evidence_contract_20260715.md':'b426ab4c36965898c56acff16c8395d00dff27dd75b5cfe8ab4b70c1aee0064c',
  'skills/mx-shortdrama-01-frame-extract/scripts/finalize_step01_evidence.py':'18d0e3ea98774fc70232fabf9eb8a57faee3dbe9970e388a0009124281212feb',
  'skills/mx-shortdrama-01-frame-extract/scripts/qwen3_forced_aligner_worker.py':'70315afbb36b3103e4ddc32386a59c976d0ceeea1211c6596b4bb4ee616ab30d',
  'skills/mx-shortdrama-01-frame-extract/tests/test_step01_hq_contracts.py':'1c1022db7475bcb8815e313deebca5b255c8a440e21dc2425031c51a9140ea55'
});
const REQUIRED_REVIEW=Object.freeze({project_relative_path:'post_coding_review_d017_step01_hq_point_timestamp_bundle_20260715.md'});

function hash(value){return crypto.createHash('sha256').update(value).digest('hex');}
function option(args,name){const index=args.indexOf(name);return index>=0?args[index+1]:null;}
function isInside(root,target){const relative=path.relative(path.resolve(root),path.resolve(target));return Boolean(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);}
function jsonBytes(value){return Buffer.from(JSON.stringify(value,null,2)+'\n','utf8');}
function sensitiveMatch(bytes){const text=bytes.toString('utf8');return SENSITIVE.find(item=>item.pattern.test(text))?.id||null;}
function snapshotHash(rows){return hash(Buffer.from(rows.map(item=>[item.path,item.bytes,item.sha256].join('|')).sort().join('\n')+'\n','utf8'));}

async function inventory(root,relative='',excluded=[],scope=''){
  const output=[];const directory=path.join(root,...relative.split('/').filter(Boolean));
  for(const entry of (await fsp.readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
    const child=relative?path.posix.join(relative,entry.name):entry.name;const display=scope?scope+'/'+child:child;
    if(FORBIDDEN_PARTS.has(entry.name)){excluded.push({path:display,reason:'forbidden_part:'+entry.name,type:entry.isDirectory()?'directory':'file'});continue;}
    if(FORBIDDEN_PATH.test(child)){excluded.push({path:display,reason:'forbidden_sensitive_path_name',type:entry.isDirectory()?'directory':'file'});continue;}
    if(entry.isDirectory())output.push(...await inventory(root,child,excluded,scope));
    else if(entry.isFile())output.push(child);
    else throw new Error('skill_bundle_special_file_rejected:'+display);
  }
  return output;
}

async function buildBundle(options={}){
  const projectRoot=path.resolve(options.projectRoot||path.resolve(__dirname,'..'));
  const sourceRoot=path.resolve(options.sourceRoot||process.env.NIANNIAN_SKILL_SOURCE_ROOT||DEFAULT_SKILL_ROOT);
  const bundleRoot=path.resolve(options.bundleRoot||process.env.NIANNIAN_MAC_SKILL_BUNDLE_ROOT||path.join(projectRoot,'bridge','mac-skill-bundles'));
  const version=String(options.version||process.env.NIANNIAN_MAC_SKILL_BUNDLE_VERSION||'v2');if(version!=='v2')throw new Error('skill_bundle_v2_only_builder');
  const bundleId='niannian-mac-production-skills-v2';const releaseRoot=path.join(bundleRoot,bundleId);const archiveName=bundleId+'.zip';const manifestName=bundleId+'.manifest.json';const scanName=bundleId+'.sensitive-scan.json';const archivePath=path.join(releaseRoot,archiveName);const manifestPath=path.join(releaseRoot,manifestName);const scanPath=path.join(releaseRoot,scanName);
  const zip=new JSZip();const rows=[];const excluded=[];
  for(const skill of SKILLS){const skillRoot=path.resolve(sourceRoot,skill);if(!isInside(sourceRoot,skillRoot))throw new Error('skill_bundle_path_invalid:'+skill);await fsp.access(path.join(skillRoot,'SKILL.md'));for(const relative of await inventory(skillRoot,'',excluded,'skills/'+skill)){const source=path.resolve(skillRoot,...relative.split('/'));if(!isInside(skillRoot,source))throw new Error('skill_bundle_file_escape:'+skill+'/'+relative);const bytes=await fsp.readFile(source);const match=sensitiveMatch(bytes);if(match)throw new Error('skill_bundle_sensitive_text_rejected:'+match+':'+skill+'/'+relative);const bundlePath='skills/'+skill+'/'+relative;zip.file(bundlePath,bytes,{binary:true,date:ZIP_DATE,createFolders:false});rows.push({skill,path:bundlePath,bytes:bytes.length,sha256:hash(bytes)});}}
  const guiRoot=path.join(projectRoot,'bridge','mac-gui-bridge-bootstrap');for(const relative of await inventory(guiRoot,'',excluded,'mac-gui-bridge-bootstrap')){const source=path.resolve(guiRoot,...relative.split('/'));if(!isInside(guiRoot,source))throw new Error('skill_bundle_gui_bridge_escape:'+relative);const bytes=await fsp.readFile(source);const match=sensitiveMatch(bytes);if(match)throw new Error('skill_bundle_sensitive_text_rejected:'+match+':mac_gui_bridge/'+relative);const bundlePath='mac-gui-bridge-bootstrap/'+relative;zip.file(bundlePath,bytes,{binary:true,date:ZIP_DATE,createFolders:false});rows.push({skill:'mac_gui_bridge_bootstrap',path:bundlePath,bytes:bytes.length,sha256:hash(bytes)});}
  rows.sort((a,b)=>a.path.localeCompare(b.path));excluded.sort((a,b)=>a.path.localeCompare(b.path));const sourceSnapshotSha256=snapshotHash(rows);const skillFileCount=rows.filter(item=>item.path.startsWith('skills/')).length;if(skillFileCount!==EXPECTED_SKILL_FILE_COUNT||sourceSnapshotSha256!==EXPECTED_SOURCE_SNAPSHOT_SHA256)throw new Error('skill_bundle_source_inventory_drift:files='+skillFileCount+':snapshot='+sourceSnapshotSha256);const byPath=new Map(rows.map(item=>[item.path,item]));for(const [requiredPath,requiredSha] of Object.entries(REQUIRED_NEW_FILES))if(byPath.get(requiredPath)?.sha256!==requiredSha)throw new Error('skill_bundle_required_repair_file_drift:'+requiredPath);
  const builderPath=path.resolve(__filename);const builderBytes=await fsp.readFile(builderPath);const reviewPath=path.join(projectRoot,REQUIRED_REVIEW.project_relative_path);const reviewStats=await fsp.lstat(reviewPath);if(!reviewStats.isFile()||reviewStats.isSymbolicLink())throw new Error('skill_bundle_required_post_review_invalid');const reviewBytes=await fsp.readFile(reviewPath);const reviewBinding={...REQUIRED_REVIEW,sha256:hash(reviewBytes)};const artifactSetId='macskillset-'+hash(Buffer.from([bundleId,sourceSnapshotSha256,hash(builderBytes),reviewBinding.sha256].join('|'),'utf8'));
  const governanceBindings={artifact_set_id:artifactSetId,builder:{project_relative_path:path.posix.join('tools','build_mac_skill_bundle.js'),sha256:hash(builderBytes)},post_coding_review:reviewBinding,expected_skill_file_count:EXPECTED_SKILL_FILE_COUNT,expected_source_snapshot_sha256:EXPECTED_SOURCE_SNAPSHOT_SHA256,required_new_files:Object.entries(REQUIRED_NEW_FILES).map(([filePath,sha256])=>({path:filePath,sha256}))};
  const scanReceipt={schema_version:'niannian_mac_skill_bundle_sensitive_scan_v2',bundle_id:bundleId,artifact_set_id:artifactSetId,status:'passed',source_snapshot_sha256:sourceSnapshotSha256,scanned_file_count:rows.length,sensitive_match_count:0,patterns:SENSITIVE.map(item=>item.id),excluded_files:[...excluded],governance_bindings:governanceBindings,evidence_level:'structural',real_delivery:false,provider_network_requested:false,secrets_collected:false};const scanBytes=jsonBytes(scanReceipt);const scanBundlePath='governance/sensitive_scan_receipt.json';zip.file(scanBundlePath,scanBytes,{binary:true,date:ZIP_DATE,createFolders:false});rows.push({skill:'bundle_governance',path:scanBundlePath,bytes:scanBytes.length,sha256:hash(scanBytes)});rows.sort((a,b)=>a.path.localeCompare(b.path));
  const manifest={schema_version:'niannian_mac_skill_bundle_v2',bundle_id:bundleId,bundle_version:'2.0.3',artifact_set_id:artifactSetId,route_release_version:'v1.4.3',profile:'mac-step01-hq-full-evidence-v2',skills:[...SKILLS],files:rows,skill_file_count:skillFileCount,source_snapshot_sha256:sourceSnapshotSha256,governance_bindings:governanceBindings,sensitive_scan:{path:scanBundlePath,external_release_file:scanName,sha256:hash(scanBytes),status:'passed'},excluded_files:excluded,supersedes:{...SUPERSEDES},release_files:{archive:archiveName,manifest:manifestName,sensitive_scan:scanName},forbidden_content:['credentials','cookies','tokens','browser_data','node_modules','.git','__pycache__'],evidence_level:'structural',real_delivery:false,reproducible:true,provider_network_requested:false,provider_submit_requested:false};const manifestBytes=jsonBytes(manifest);zip.file('manifest.json',manifestBytes,{binary:true,date:ZIP_DATE,createFolders:false});const archive=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:9},platform:'UNIX'});const archiveSha=hash(archive),manifestSha=hash(manifestBytes),scanSha=hash(scanBytes);
  await fsp.mkdir(bundleRoot,{recursive:true});const staging=path.join(bundleRoot,'.'+bundleId+'.incoming-'+process.pid+'-'+crypto.randomBytes(4).toString('hex'));await fsp.mkdir(staging,{recursive:false});try{await fsp.writeFile(path.join(staging,archiveName),archive,{flag:'wx'});await fsp.writeFile(path.join(staging,manifestName),manifestBytes,{flag:'wx'});await fsp.writeFile(path.join(staging,scanName),scanBytes,{flag:'wx'});const [archiveRead,manifestRead,scanRead]=await Promise.all([fsp.readFile(path.join(staging,archiveName)),fsp.readFile(path.join(staging,manifestName)),fsp.readFile(path.join(staging,scanName))]);if(hash(archiveRead)!==archiveSha||hash(manifestRead)!==manifestSha||hash(scanRead)!==scanSha||!manifestRead.equals(manifestBytes)||!scanRead.equals(scanBytes))throw new Error('skill_bundle_release_staging_readback_mismatch');const verifyZip=await JSZip.loadAsync(archiveRead,{checkCRC32:true});if(!(await verifyZip.file('manifest.json').async('nodebuffer')).equals(manifestRead)||!(await verifyZip.file(scanBundlePath).async('nodebuffer')).equals(scanRead))throw new Error('skill_bundle_release_cross_reference_mismatch');const existing=await fsp.lstat(releaseRoot).catch(()=>null);if(existing){if(!existing.isDirectory()||existing.isSymbolicLink())throw new Error('skill_bundle_release_root_invalid');const existingRows=await Promise.all([archiveName,manifestName,scanName].map(async name=>hash(await fsp.readFile(path.join(releaseRoot,name)))));if(existingRows.join('|')!==[archiveSha,manifestSha,scanSha].join('|'))throw new Error('skill_bundle_release_exists_with_different_content');await fsp.rm(staging,{recursive:true,force:true});}else await fsp.rename(staging,releaseRoot);}catch(error){await fsp.rm(staging,{recursive:true,force:true});throw error;}
  return {ok:true,bundle:archivePath,manifest:manifestPath,sensitive_scan:scanPath,release_root:releaseRoot,artifact_set_id:artifactSetId,archive_sha256:archiveSha,manifest_sha256:manifestSha,sensitive_scan_sha256:scanSha,source_snapshot_sha256:sourceSnapshotSha256,files:rows.length,skill_files:skillFileCount,skills:SKILLS.length,bundle_id:bundleId,real_delivery:false};
}

async function main(){const args=process.argv.slice(2);const result=await buildBundle({sourceRoot:option(args,'--source-root'),bundleRoot:option(args,'--bundle-root'),version:option(args,'--version')||'v2'});process.stdout.write(JSON.stringify(result)+'\n');}
if(require.main===module)main().catch(error=>{process.stderr.write(String(error.message||error)+'\n');process.exitCode=1;});
module.exports={EXPECTED_SKILL_FILE_COUNT,EXPECTED_SOURCE_SNAPSHOT_SHA256,REQUIRED_NEW_FILES,REQUIRED_REVIEW,SKILLS,SUPERSEDES,buildBundle,hash,inventory,snapshotHash};
