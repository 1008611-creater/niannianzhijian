const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const {canonical,sha256,resolveTaskArtifact} = require('../bridge/niannian_step03_runtime');

const DEFAULT_PROJECT='NN-20260715083045-8120F5';
const DEFAULT_PLAN='S03-es-MX-480c4b0debb4f59f35e8';
function arg(name,fallback=null){const index=process.argv.indexOf(name);return index>=0&&process.argv[index+1]?process.argv[index+1]:fallback;}
function stamp(){return new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14);}
async function readJson(file){return JSON.parse(await fsp.readFile(file,'utf8'));}
async function atomicJson(file,value){await fsp.mkdir(path.dirname(file),{recursive:true});const temp=file+'.tmp-'+process.pid+'-'+crypto.randomBytes(5).toString('hex');await fsp.writeFile(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx'});await fsp.rename(temp,file);}
async function replayState(directory){const state=await readJson(path.join(directory,'state.json')),eventsRoot=path.join(directory,'task-events'),names=(await fsp.readdir(eventsRoot).catch(error=>error.code==='ENOENT'?[]:Promise.reject(error))).filter(name=>/^\d{13}-[a-f0-9]{16}\.json$/.test(name)).sort();for(const name of names){const event=await readJson(path.join(eventsRoot,name)),core={task_id:event.task_id,patch:event.patch,created_at:event.created_at};if(event.schema_version!=='niannian.step03_task_event.v1'||event.event_sha256!==sha256(canonical(core)))throw Object.assign(new Error('task event corrupt'),{code:'STEP03_TASK_EVENT_CORRUPT'});const task=state.tasks.find(row=>row.task_id===event.task_id);if(!task)throw Object.assign(new Error('task event target missing'),{code:'STEP03_TASK_EVENT_CORRUPT'});Object.assign(task,event.patch);}return state;}
function sourceKey(project){const name=path.basename(String(project.source?.storedPath||project.source?.originalName||''));if(!name||name==='.'||name==='..'||name.includes('/')||name.includes('\\'))throw Object.assign(new Error('source key unavailable'),{code:'PROJECT_SOURCE_KEY_UNAVAILABLE'});return'uploads/'+name;}
async function sourceEvidence(dataRoot,project,key){const target=path.resolve(dataRoot,...key.split('/')),uploads=path.resolve(dataRoot,'uploads');if(!target.startsWith(uploads+path.sep))throw Object.assign(new Error('source key invalid'),{code:'PROJECT_SOURCE_KEY_INVALID'});const bytes=await fsp.readFile(target),digest=sha256(bytes);if(bytes.length!==Number(project.source?.bytes)||digest!==project.source?.sha256)throw Object.assign(new Error('source integrity mismatch'),{code:'PROJECT_SOURCE_INTEGRITY_FAILED'});return{bytes:bytes.length,sha256:digest};}
async function appendArtifactKeyEvent(directory,task,key,sequence){const createdAt=new Date(Date.now()+sequence).toISOString(),core={task_id:task.task_id,patch:{artifact_key:key,updated_at:createdAt},created_at:createdAt},event={schema_version:'niannian.step03_task_event.v1',...core,event_sha256:sha256(canonical(core))},name=String(Date.now()+sequence).padStart(13,'0')+'-'+sha256(task.task_id+':'+key).slice(0,16)+'.json',target=path.join(directory,'task-events',name);await atomicJson(target,event);return target;}

async function main(){
  const apply=process.argv.includes('--apply'),dataRoot=path.resolve(arg('--data-root',process.env.DATA_DIR||path.join(__dirname,'..','data'))),step03Root=path.resolve(arg('--step03-root',process.env.NIANNIAN_STEP03_RUNTIME_ROOT||path.join(dataRoot,'step03-runtime'))),projectId=arg('--project',DEFAULT_PROJECT),planId=arg('--plan',DEFAULT_PLAN),projectsPath=path.join(dataRoot,'projects.json'),projects=await readJson(projectsPath),project=projects.find(row=>row.id===projectId);
  if(!project)throw Object.assign(new Error('project not found'),{code:'PROJECT_NOT_FOUND'});
  const ownerHash=sha256(String(project.ownerId)),directory=path.join(step03Root,'v1','owners',ownerHash,'projects',projectId,'plans',planId),plan=await readJson(path.join(directory,'plan.json'));
  if(plan.project_id!==projectId||plan.plan_id!==planId||plan.source_sha256!==project.source?.sha256)throw Object.assign(new Error('plan binding mismatch'),{code:'STEP03_PLAN_BINDING_MISMATCH'});
  const key=project.source?.storage_key||sourceKey(project),source=await sourceEvidence(dataRoot,project,key),state=await replayState(directory),artifactRows=[];
  for(const task of state.tasks.filter(row=>row.artifact_id&&row.artifact_sha256)){
    const resolved=await resolveTaskArtifact({directory,task,verify:true});
    artifactRows.push({task_id:task.task_id,artifact_id:task.artifact_id,artifact_key:resolved.key,artifact_sha256:resolved.sha256,artifact_bytes:resolved.bytes,needs_event:task.artifact_key!==resolved.key});
  }
  if(!artifactRows.length)throw Object.assign(new Error('no artifacts found'),{code:'STEP03_ARTIFACTS_EMPTY'});
  const pendingBefore=Object.fromEntries((state.characters||[]).filter(row=>['C001','C005'].includes(row.character_id)).map(row=>[row.character_id,row.status]));
  const summary={schema_version:'niannian.step03_media_key_migration_receipt.v1',mode:apply?'apply':'dry-run',project_id:projectId,plan_id:planId,source:{storage_key:key,bytes:source.bytes,sha256:source.sha256},artifacts:{count:artifactRows.length,total_bytes:artifactRows.reduce((sum,row)=>sum+row.artifact_bytes,0),aggregate_sha256:sha256(canonical(artifactRows.map(({artifact_id,artifact_sha256,artifact_bytes})=>({artifact_id,artifact_sha256,artifact_bytes})).sort((a,b)=>a.artifact_id.localeCompare(b.artifact_id)))),events_required:artifactRows.filter(row=>row.needs_event).length},protected_character_statuses:pendingBefore,provider_requests:0,generated_at:new Date().toISOString()};
  if(!apply){process.stdout.write(JSON.stringify({ok:true,...summary})+'\n');return;}
  const backupId='step03-media-'+stamp()+'-'+crypto.randomBytes(3).toString('hex'),backupRoot=path.join(dataRoot,'migration-backups',backupId);await fsp.mkdir(backupRoot,{recursive:true});await fsp.copyFile(projectsPath,path.join(backupRoot,'projects.json'));await fsp.cp(directory,path.join(backupRoot,'plan'),{recursive:true,errorOnExist:true});
  let sequence=0;for(const row of artifactRows.filter(item=>item.needs_event))await appendArtifactKeyEvent(directory,state.tasks.find(task=>task.task_id===row.task_id),row.artifact_key,sequence++);
  project.source.storage_key=key;await atomicJson(projectsPath,projects);
  const replayed=await replayState(directory),pendingAfter=Object.fromEntries((replayed.characters||[]).filter(row=>['C001','C005'].includes(row.character_id)).map(row=>[row.character_id,row.status]));if(canonical(pendingAfter)!==canonical(pendingBefore))throw Object.assign(new Error('protected character status changed'),{code:'STEP03_MIGRATION_STATUS_DRIFT'});
  summary.backup_id=backupId;summary.protected_character_statuses=pendingAfter;summary.applied_at=new Date().toISOString();const receiptId='step03-media-keys-'+stamp()+'-'+sha256(summary.artifacts.aggregate_sha256).slice(0,8)+'.json';await atomicJson(path.join(dataRoot,'migration-receipts',receiptId),summary);process.stdout.write(JSON.stringify({ok:true,...summary,receipt_id:receiptId})+'\n');
}
main().catch(error=>{process.stderr.write(JSON.stringify({ok:false,code:error.code||'STEP03_MEDIA_MIGRATION_FAILED',message:String(error.message||error).slice(0,240)})+'\n');process.exitCode=1;});
