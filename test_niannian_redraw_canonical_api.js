'use strict';
const assert=require('assert');
const fs=require('fs/promises');
const os=require('os');
const path=require('path');
const crypto=require('crypto');
const {spawn}=require('child_process');
const dag=require('./bridge/niannian_redraw_canonical_dag');

async function waitForServer(child){
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('server timeout')),15000);child.stdout.on('data',chunk=>{if(String(chunk).includes('listening')){clearTimeout(timer);resolve();}});child.once('exit',code=>{clearTimeout(timer);reject(new Error('server exited '+code));});});
}
const BRIDGE_TOKEN='canonical-controller-test-token';
async function start(dataDir,port){const child=spawn(process.execPath,['server.js'],{cwd:__dirname,env:{...process.env,DATA_DIR:dataDir,PORT:String(port),NIANNIAN_MEDIA_PREFLIGHT:'off',BRIDGE_TOKEN_HASH:crypto.createHash('sha256').update(BRIDGE_TOKEN).digest('hex')},stdio:['ignore','pipe','pipe']});await waitForServer(child);return child;}
async function stop(child){if(!child||child.exitCode!==null)return;child.kill();await new Promise(resolve=>child.once('exit',resolve));}

(async()=>{
  const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'niannian-canonical-api-'));
  const port=19000+Math.floor(Math.random()*1000),base='http://127.0.0.1:'+port;
  let child;
  try{
    child=await start(dataDir,port);
    const register=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'canonical@example.com',password:'test-password-123'})});
    assert.strictEqual(register.status,200);
    const user=(await register.json()).user,cookie=register.headers.get('set-cookie').split(';')[0];
    const canonical=dag.resolveCanonicalState({legacy:{step:'Step02'},authority_revision:'revision-a',current_authority_revision:'revision-a',input_contract:{S01_EVIDENCE:true},output_contract:{accepted:true,artifact_ledger_verified:true}});
    await fs.writeFile(path.join(dataDir,'projects.json'),JSON.stringify([{id:'NN-CANONICAL-001',ownerId:user.id,name:'兼容项目',status:'running',productionStatus:'step02_accepted',createdAt:new Date().toISOString(),source:{originalName:'source.mp4',mimeType:'video/mp4',bytes:12,sha256:'a'.repeat(64),storedPath:'C:/internal/source.mp4'},analysis:{status:'completed',runId:'revision-a'},runtime:{productionStatus:'step02_accepted',currentNode:'Step04',earliestIncompleteNode:'Step04',nextAction:'provider receipt at C:/internal/file',controllerId:'secret-controller',leaseId:'secret-lease'},dispatch:{controllerId:'secret-controller',leaseId:'secret-lease'},canonical}],null,2)+'\n');
    const first=await fetch(base+'/api/projects',{headers:{Cookie:cookie}});assert.strictEqual(first.status,200);const payload=await first.json();const project=payload.projects.find(row=>row.id==='NN-CANONICAL-001');
    assert(project);assert.strictEqual(project.publicStage.stage_label,'地区改编');assert.strictEqual(project.publicStage.stage_count,7);assert.strictEqual(project.runtime.nextAction,'当前阶段正在核验，完成后会自动更新进度。');
    const serialized=JSON.stringify(project);for(const forbidden of ['C:/internal','secret-controller','secret-lease','provider receipt','a'.repeat(64),'S02_SOURCE_TIMELINE'])assert(!serialized.includes(forbidden),forbidden);
    assert(!Object.hasOwn(project.source,'sha256'));assert(!Object.hasOwn(project,'canonical'));assert(!Object.hasOwn(project,'dispatch'));
    await stop(child);child=await start(dataDir,port);
    const after=await fetch(base+'/api/projects',{headers:{Cookie:cookie}});assert.strictEqual(after.status,200);const restored=(await after.json()).projects.find(row=>row.id==='NN-CANONICAL-001');
    assert.deepStrictEqual(restored.publicStage,project.publicStage);
    const projectsPath=path.join(dataDir,'projects.json');
    let persisted=JSON.parse(await fs.readFile(projectsPath,'utf8'))[0];
    persisted.dispatch={...(persisted.dispatch||{}),status:'claimed',controllerId:'canonical-controller',leaseId:'canonical-lease',leaseUntil:new Date(Date.now()+60000).toISOString()};
    persisted.canonical=dag.resolveCanonicalState({legacy:{step:'Step02'},authority_revision:'revision-a',current_authority_revision:'revision-a',input_contract:{S01_EVIDENCE:true},output_contract:{accepted:false,artifact_ledger_verified:false}});
    await fs.writeFile(projectsPath,JSON.stringify([persisted],null,2)+'\n');
    const controllerHeaders={'Content-Type':'application/json',Authorization:'Bearer '+BRIDGE_TOKEN,'X-NianNian-Controller-Id':'canonical-controller','X-NianNian-Lease-Id':'canonical-lease'};
    const beforeForged=await fs.readFile(projectsPath,'utf8');
    const forged=await fetch(base+'/api/controller/jobs/NN-CANONICAL-001/status',{method:'POST',headers:controllerHeaders,body:JSON.stringify({productionStatus:'running_step02',controllerId:'canonical-controller',leaseId:'canonical-lease',canonical:dag.resolveCanonicalState({legacy:{step:'Step01'},authority_revision:'revision-a',current_authority_revision:'revision-a',input_contract:{source_authority_bound:true},output_contract:{node_contract_complete:true,artifact_ledger_verified:true}})})});
    assert.strictEqual(forged.status,409);assert.match((await forged.json()).code,/^CANONICAL_/);assert.strictEqual(await fs.readFile(projectsPath,'utf8'),beforeForged,'forged payload must not mutate durable project state');
    const legacySafe=await fetch(base+'/api/controller/jobs/NN-CANONICAL-001/status',{method:'POST',headers:controllerHeaders,body:JSON.stringify({productionStatus:'prepared',controllerId:'canonical-controller',leaseId:'canonical-lease',currentNode:'Step01'})});
    assert.strictEqual(legacySafe.status,200,'legacy controller payload without canonical fields stays compatible for non-downstream status');
    persisted=JSON.parse(await fs.readFile(projectsPath,'utf8'))[0];
    persisted.canonical=dag.resolveCanonicalState({legacy:{step:'Step01'},authority_revision:'revision-a',current_authority_revision:'revision-a',input_contract:{source_authority_bound:true},output_contract:{node_contract_complete:true,artifact_ledger_verified:true}});
    persisted.analysis={...(persisted.analysis||{}),runId:'revision-a'};
    persisted.dispatch={...(persisted.dispatch||{}),status:'claimed',controllerId:'canonical-controller',leaseId:'canonical-lease',leaseUntil:new Date(Date.now()+60000).toISOString()};
    await fs.writeFile(projectsPath,JSON.stringify([persisted],null,2)+'\n');
    const acceptedPersisted=await fetch(base+'/api/controller/jobs/NN-CANONICAL-001/status',{method:'POST',headers:controllerHeaders,body:JSON.stringify({productionStatus:'running_step02',controllerId:'canonical-controller',leaseId:'canonical-lease',currentNode:'Step02'})});
    assert.strictEqual(acceptedPersisted.status,200,'only persisted matching canonical authority unlocks downstream status');
    console.log('PASS canonical public API and restart recovery');
  }finally{await stop(child);await fs.rm(dataDir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
