const assert=require('assert/strict');
const crypto=require('crypto');
const fsp=require('fs').promises;
const os=require('os');
const path=require('path');
const {spawnSync}=require('child_process');
const {resolveTaskArtifact,validateArtifactKey,sha256}=require('./bridge/niannian_step03_runtime');

const projectId='NN-20260715083045-8120F5',planId='S03-es-MX-480c4b0debb4f59f35e8',ownerId='USR-MIGRATION-OWNER';
async function exists(file){return Boolean(await fsp.stat(file).catch(()=>null));}
async function fixture(root,{badSource=false}={}){
  const dataRoot=path.join(root,'data'),step03Root=path.join(dataRoot,'step03-runtime'),sourceBytes=Buffer.from('portable-source-video'),sourceSha=sha256(sourceBytes),sourceName=projectId+'-001.mp4',sourcePath=path.join(dataRoot,'uploads',sourceName),ownerHash=sha256(ownerId),planRoot=path.join(step03Root,'v1','owners',ownerHash,'projects',projectId,'plans',planId),artifactBytes=Buffer.from('portable-character-board'),artifactSha=sha256(artifactBytes),artifactId='ART-'+artifactSha.slice(0,24),artifactPath=path.join(planRoot,'artifacts',artifactId+'.png');
  await fsp.mkdir(path.dirname(sourcePath),{recursive:true});await fsp.mkdir(path.dirname(artifactPath),{recursive:true});await fsp.mkdir(path.join(planRoot,'task-events'),{recursive:true});await fsp.writeFile(sourcePath,sourceBytes);await fsp.writeFile(artifactPath,artifactBytes);
  const projects=[{id:projectId,ownerId,analysis:{runId:'analysis-1-0dc5c5d751592e9fd0656a81'},source:{originalName:'001.mp4',storedPath:'/var/lib/niannian-ai/uploads/'+sourceName,bytes:sourceBytes.length,sha256:badSource?'0'.repeat(64):sourceSha,mimeType:'video/mp4'}}];
  const task={task_id:'T03-'+artifactSha.slice(0,24),type:'character',item_id:'C002-candidate-1',status:'accepted',artifact_id:artifactId,artifact_path:'/var/lib/niannian-ai/step03-runtime/old/artifacts/'+artifactId+'.png',artifact_sha256:artifactSha,artifact_bytes:artifactBytes.length,artifact_mime:'image/png'};
  await fsp.writeFile(path.join(dataRoot,'projects.json'),JSON.stringify(projects,null,2));await fsp.writeFile(path.join(planRoot,'plan.json'),JSON.stringify({plan_id:planId,project_id:projectId,source_sha256:badSource?'0'.repeat(64):sourceSha}));await fsp.writeFile(path.join(planRoot,'state.json'),JSON.stringify({characters:[{character_id:'C001',status:'awaiting_confirmation'},{character_id:'C005',status:'awaiting_confirmation'}],tasks:[task]}));
  return{dataRoot,step03Root,planRoot,sourceSha,artifactSha,artifactId,artifactPath,task};
}
function runMigration(fix,apply=false){const args=['scripts/migrate_step03_media_keys.js','--data-root',fix.dataRoot,'--step03-root',fix.step03Root,'--project',projectId,'--plan',planId];if(apply)args.push('--apply');return spawnSync(process.execPath,args,{cwd:__dirname,encoding:'utf8',windowsHide:true});}

(async()=>{
  const root=await fsp.mkdtemp(path.join(os.tmpdir(),'step03-media-migration-')),fix=await fixture(root),legacy=await resolveTaskArtifact({directory:fix.planRoot,task:fix.task,verify:true});assert.equal(legacy.path,fix.artifactPath);assert.equal(legacy.sha256,fix.artifactSha);
  for(const invalid of ['../x.png','artifacts/../x.png','/artifacts/x.png','artifacts\\x.png','artifacts/ART-aaaaaaaaaaaaaaaaaaaaaaaa.png/extra'])assert.throws(()=>validateArtifactKey(invalid),error=>error.code==='STEP03_ARTIFACT_KEY_INVALID');
  const dry=runMigration(fix,false);assert.equal(dry.status,0,dry.stderr);const dryReceipt=JSON.parse(dry.stdout);assert.equal(dryReceipt.mode,'dry-run');assert.equal(dryReceipt.artifacts.count,1);assert.equal(dryReceipt.provider_requests,0);assert.equal(await exists(path.join(fix.dataRoot,'migration-backups')),false,'dry-run must not write backups');assert.equal(JSON.parse(await fsp.readFile(path.join(fix.dataRoot,'projects.json')))[0].source.storage_key,undefined);
  const applied=runMigration(fix,true);assert.equal(applied.status,0,applied.stderr);const appliedReceipt=JSON.parse(applied.stdout),projects=JSON.parse(await fsp.readFile(path.join(fix.dataRoot,'projects.json'))),events=await fsp.readdir(path.join(fix.planRoot,'task-events'));assert.equal(projects[0].source.storage_key,'uploads/'+projectId+'-001.mp4');assert.equal(events.length,1);assert.equal(appliedReceipt.protected_character_statuses.C001,'awaiting_confirmation');assert.equal(appliedReceipt.protected_character_statuses.C005,'awaiting_confirmation');assert.equal(appliedReceipt.provider_requests,0);assert.equal(await exists(path.join(fix.dataRoot,'migration-backups',appliedReceipt.backup_id,'projects.json')),true);
  const replay=runMigration(fix,true);assert.equal(replay.status,0,replay.stderr);assert.equal(JSON.parse(replay.stdout).artifacts.events_required,0);assert.equal((await fsp.readdir(path.join(fix.planRoot,'task-events'))).length,1,'idempotent replay must not append duplicate key events');
  const badRoot=await fsp.mkdtemp(path.join(os.tmpdir(),'step03-media-migration-bad-')),bad=await fixture(badRoot,{badSource:true}),before=await fsp.readFile(path.join(bad.dataRoot,'projects.json'));const failed=runMigration(bad,true);assert.notEqual(failed.status,0);assert.deepEqual(await fsp.readFile(path.join(bad.dataRoot,'projects.json')),before);assert.equal(await exists(path.join(bad.dataRoot,'migration-backups')),false,'validation failure must produce zero writes');
  await fsp.rm(root,{recursive:true,force:true});await fsp.rm(badRoot,{recursive:true,force:true});process.stdout.write(JSON.stringify({ok:true,legacy_current_root_resolution:true,traversal_rejected:true,dry_run_zero_write:true,apply_idempotent:true,protected_statuses:true,provider_requests:0})+'\n');
})().catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
