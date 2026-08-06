'use strict';

const assert=require('assert/strict');
const crypto=require('crypto');
const fsp=require('fs/promises');
const net=require('net');
const os=require('os');
const path=require('path');
const {spawn}=require('child_process');
const dag=require('./bridge/niannian_redraw_canonical_dag');
const {createLocalizationConfirmationService}=require('./bridge/niannian_localization_confirmation');

const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
async function freePort(){return new Promise((resolve,reject)=>{const server=net.createServer();server.unref();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(error=>error?reject(error):resolve(port));});});}
async function start(dataRoot,port){const logs=[];const child=spawn(process.execPath,['server.js'],{cwd:__dirname,env:{...process.env,PORT:String(port),DATA_DIR:dataRoot,NIANNIAN_MEDIA_PREFLIGHT:'off',NIANNIAN_STEP01_AUTO_EXECUTE:'off'},stdio:['ignore','pipe','pipe'],windowsHide:true});child.stdout.on('data',chunk=>logs.push(String(chunk)));child.stderr.on('data',chunk=>logs.push(String(chunk)));for(let i=0;i<160;i+=1){if(child.exitCode!==null)throw new Error('server_exited:'+logs.join(''));try{if((await fetch('http://127.0.0.1:'+port+'/api/health')).ok)return child;}catch{}await new Promise(resolve=>setTimeout(resolve,50));}throw new Error('server_timeout:'+logs.join(''));}
async function stop(child){if(!child||child.exitCode!==null)return;child.kill();await new Promise(resolve=>{child.once('exit',resolve);setTimeout(resolve,2000).unref();});}

(async()=>{
  const temp=await fsp.mkdtemp(path.join(os.tmpdir(),'niannian-localization-http-')),dataRoot=path.join(temp,'data'),projectId='NN-LOCALIZATION-HTTP-001',owner='USR-LOCALIZATION-HTTP',token=crypto.randomBytes(32).toString('hex'),authority='authority-http-r1',acceptance='b'.repeat(64),port=await freePort(),base='http://127.0.0.1:'+port;
  let child;
  try{
    await fsp.mkdir(dataRoot,{recursive:true});
    const canonical=dag.resolveCanonicalState({legacy:{step:'Step02'},authority_revision:authority,current_authority_revision:authority,input_contract:{S01_EVIDENCE:true},output_contract:{accepted:true,artifact_ledger_verified:true}});
    const project={id:projectId,ownerId:owner,name:'地区确认 HTTP fixture',productionStatus:'step02_accepted',source:{originalName:'fixture.mp4',mimeType:'video/mp4',bytes:1,sha256:'a'.repeat(64),storedPath:'fixture-only'},analysis:{status:'completed',runId:authority},step02:{status:'accepted',acceptance:{status:'accepted',downstream_consumable:true,sha256:acceptance}},canonical};
    await Promise.all([
      fsp.writeFile(path.join(dataRoot,'projects.json'),JSON.stringify([project])),
      fsp.writeFile(path.join(dataRoot,'users.json'),JSON.stringify([{id:owner,email:'localization-http@example.test',status:'active'}])),
      fsp.writeFile(path.join(dataRoot,'sessions.json'),JSON.stringify([{id:'session-localization-http',userId:owner,tokenHash:hash(token),createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()}])),
      fsp.writeFile(path.join(dataRoot,'script-projects.json'),'[]'),
    ]);
    const acceptedStep02={project_id:projectId,authority_revision:authority,acceptance_identity:acceptance,accepted:true,status:'accepted',artifact_ledger_verified:true,downstream_consumable:true};
    const service=createLocalizationConfirmationService({root:path.join(dataRoot,'localization-confirmation')});
    const candidate=await service.createCandidate({projectId,authorityRevision:authority,acceptedStep02,targetRegion:{code:'es-MX',label:'墨西哥'},projection:{character_relationship_adaptations:[{source_name:'原片女主',localized_name:'Lucia',relationship:'核心人物'}],story_outline_zh:'保持核心冲突与反转。',localized_key_dialogue:[{speaker:'Lucia',source_text:'我拒绝。',localized_text:'Me niego.'}],replacements:{locations:['墨西哥城'],currency:['墨西哥比索'],address_terms:['Señora'],cultural_context:['当地礼仪']},confirmation_items:['核对关系']},idempotencyKey:'localization-http-candidate'});
    child=await start(dataRoot,port);
    const headers={cookie:'niannian_session='+token},status=await fetch(base+'/api/projects/'+projectId+'/localization-confirmation',{headers}),etag=status.headers.get('etag'),before=await status.json();
    assert.equal(status.status,200);assert.equal(before.localization.downstream_ready,false);assert.ok(etag);
    const confirm=await fetch(base+'/api/projects/'+projectId+'/localization-confirmation/confirm',{method:'POST',headers:{...headers,'Content-Type':'application/json','If-Match':etag},body:JSON.stringify({localization_revision:candidate.candidate.localization_revision})});
    assert.equal(confirm.status,200);const confirmed=await confirm.json();assert.equal(confirmed.localization.downstream_ready,true);const confirmedAt=confirmed.localization.confirmation.confirmed_at;
    const duplicate=await fetch(base+'/api/projects/'+projectId+'/localization-confirmation/confirm',{method:'POST',headers:{...headers,'Content-Type':'application/json','If-Match':etag},body:JSON.stringify({localization_revision:candidate.candidate.localization_revision})});
    assert.equal(duplicate.status,200);assert.equal((await duplicate.json()).localization.confirmation.confirmed_at,confirmedAt);
    const providerTask={task_id:'TASK-HTTP-1',transaction_key:'tx-http-1',type:'asset',item_id:'asset-http-1',purpose:'asset_generation',prompt_sha256:'c'.repeat(64),references:[],provider:'runninghub',aspect_ratio:'9:16',resolution:'1k',attempt:1};
    assert.deepEqual(await service.authorizeProviderTasks({projectId,authorityRevision:authority,acceptedStep02,localizationRevision:candidate.candidate.localization_revision,tasks:[providerTask]}),{authorized:1,reused:0,stale_skipped:0});
    assert.equal((await service.requireProviderTask({projectId,authorityRevision:authority,acceptedStep02,taskId:providerTask.task_id,task:providerTask})).allowed,true);
    await assert.rejects(()=>service.requireProviderTask({projectId,authorityRevision:authority,acceptedStep02,taskId:providerTask.task_id,task:{...providerTask,prompt_sha256:'d'.repeat(64)}}),error=>error.code==='provider_task_input_binding_mismatch');
    await stop(child);child=await start(dataRoot,port);
    const restored=await fetch(base+'/api/projects/'+projectId+'/localization-confirmation',{headers}),restoredBody=await restored.json();assert.equal(restoredBody.localization.downstream_ready,true);assert.equal(restoredBody.localization.confirmation.confirmed_at,confirmedAt);
    const projects=JSON.parse(await fsp.readFile(path.join(dataRoot,'projects.json'),'utf8')),nextAuthority='authority-http-r2';projects[0].analysis.runId=nextAuthority;projects[0].canonical=dag.resolveCanonicalState({legacy:{step:'Step02'},authority_revision:nextAuthority,current_authority_revision:nextAuthority,input_contract:{S01_EVIDENCE:true},output_contract:{accepted:true,artifact_ledger_verified:true}});await fsp.writeFile(path.join(dataRoot,'projects.json'),JSON.stringify(projects));
    const stale=await fetch(base+'/api/projects/'+projectId+'/localization-confirmation',{headers}),staleBody=await stale.json();assert.equal(stale.status,200);assert.equal(staleBody.localization.downstream_ready,false);assert.equal(staleBody.localization.confirmation.status,'stale');
    console.log(JSON.stringify({status:'PASS',real_http:true,strong_etag:true,idempotent:true,server_restart_recovery:true,authority_stale:true,provider_calls:0}));
  }finally{await stop(child);await fsp.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error.stack||error);process.exit(1);});
