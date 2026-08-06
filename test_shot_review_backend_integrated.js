'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const {spawn} = require('child_process');

const PROJECT_ID = 'NN-20260715083045-8120F5';
const RUN_ID = 'analysis-1-0dc5c5d751592e9fd0656a81';
const SOURCE_SHA = 'a46f74392e2b3f7ec813b4eba5a0cd9756a7c30225e0033fd671d2cab21cd30c';
const SOURCE_BYTES = 145897161;
const CONTRACT_SHA = '9887052943ef52a0721fb93ccc08acfcad8792de2f1e734bea7dc12387398a25';
const OWNER = 'USR-SHOT-REVIEW-OWNER';
const INTRUDER = 'USR-SHOT-REVIEW-INTRUDER';

function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function delay(ms) { return new Promise(resolve => setTimeout(resolve,ms)); }
async function writeJson(file,value) { await fsp.mkdir(path.dirname(file),{recursive:true}); await fsp.writeFile(file,JSON.stringify(value,null,2)+'\n'); }
async function treeDigest(root) {
  const files = [];
  async function visit(directory) {
    for (const entry of await fsp.readdir(directory,{withFileTypes:true})) {
      const full = path.join(directory,entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) files.push(full);
    }
  }
  await visit(root);
  files.sort();
  const ledger = [];
  for (const file of files) { const bytes=await fsp.readFile(file); ledger.push(path.relative(root,file).replace(/\\/g,'/')+':'+bytes.length+':'+hash(bytes)); }
  return hash(Buffer.from(ledger.join('\n')));
}
async function request(base,pathName,options={}) {
  const response = await fetch(base+pathName,options);
  const payload = await response.json().catch(()=>({}));
  return {response,payload,status:response.status};
}
async function waitHealth(base) {
  for(let i=0;i<100;i+=1){try{if((await request(base,'/api/health')).status===200)return;}catch{} await delay(60);}
  throw new Error('shot_review_server_health_timeout');
}
function commitFiles(root) {
  if (!fs.existsSync(root)) return [];
  const result=[];
  const visit=directory=>{for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const full=path.join(directory,entry.name);if(entry.isDirectory())visit(full);else if(/^\d{8}-[a-f0-9]{64}\.json$/.test(entry.name))result.push(full);}};
  visit(root); return result.sort();
}
function revisionFor(shot,revisionId,baseRevision,patch,changedFields=Object.keys(patch)) {
  return {
    schema_version:'niannian.shot_revision_overlay.v1',project_id:PROJECT_ID,analysis_run_id:RUN_ID,shot_id:shot.shot_id,
    base_revision:baseRevision,revision_id:revisionId,actor_type:'human',actor_id:'focused-http-test',changed_fields:changedFields,patch,
    source_evidence_binding:{source_sha256:SOURCE_SHA,analysis_run_id:RUN_ID,shot_id:shot.shot_id,start_sec:shot.start_sec,end_sec:shot.end_sec,frame_sha256:['start','mid','end'].map(point=>shot.frames[point].sha256)},
    candidate_request_id:null,created_at:'2026-07-22T03:30:00.000Z'
  };
}

async function main(){
  const root=await fsp.mkdtemp(path.join(os.tmpdir(),'niannian-shot-review-http-'));
  const dataRoot=path.join(root,'data'), overlayRoot=path.join(root,'overlays'), evidenceRoot=path.join(root,'evidence');
  const sourceEvidence=path.join(__dirname,'data-local','step01-evidence',PROJECT_ID,'EP001');
  const sourceDigestBefore=await treeDigest(sourceEvidence);
  await fsp.cp(sourceEvidence,evidenceRoot,{recursive:true});
  const copiedDigestBefore=await treeDigest(evidenceRoot);
  const ownerToken=crypto.randomBytes(32).toString('hex'), intruderToken=crypto.randomBytes(32).toString('hex');
  const project={id:PROJECT_ID,ownerId:OWNER,name:'Shot review focused test',source:{sha256:SOURCE_SHA,bytes:SOURCE_BYTES},analysis:{runId:RUN_ID,sourceSha256:SOURCE_SHA},runtime:{referenceEvidenceId:PROJECT_ID+'-EP001'}};
  const projectsBytes=Buffer.from(JSON.stringify([project],null,2)+'\n');
  await fsp.mkdir(dataRoot,{recursive:true});
  await fsp.writeFile(path.join(dataRoot,'projects.json'),projectsBytes);
  await writeJson(path.join(dataRoot,'users.json'),[{id:OWNER,email:'owner@example.test',status:'active'},{id:INTRUDER,email:'intruder@example.test',status:'active'}]);
  await writeJson(path.join(dataRoot,'sessions.json'),[
    {id:'session-owner',userId:OWNER,tokenHash:hash(ownerToken),createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()},
    {id:'session-intruder',userId:INTRUDER,tokenHash:hash(intruderToken),createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()}
  ]);
  const ownerHeaders={Cookie:'niannian_session='+ownerToken}, intruderHeaders={Cookie:'niannian_session='+intruderToken};
  let child, port=26000+crypto.randomInt(1000), base='http://127.0.0.1:'+port, stdout='',stderr='';
  async function start(){
    child=spawn(process.execPath,[path.join(__dirname,'server.js')],{cwd:__dirname,env:{...process.env,PORT:String(port),DATA_DIR:dataRoot,NIANNIAN_EXACT_STEP01_EVIDENCE_ROOT:evidenceRoot,NIANNIAN_SHOT_REVIEW_OVERLAY_ROOT:overlayRoot,NIANNIAN_MEDIA_PREFLIGHT:'off',NIANNIAN_STEP01_AUTO_EXECUTE:'off'},stdio:['ignore','pipe','pipe']});
    child.stdout.on('data',chunk=>stdout+=chunk); child.stderr.on('data',chunk=>stderr+=chunk); await waitHealth(base);
  }
  async function stop(){if(!child)return;child.kill();await delay(100);if(child.exitCode===null)child.kill('SIGKILL');child=null;}
  try{
    await start();
    const basePath='/api/projects/'+PROJECT_ID+'/shot-review';
    assert.equal((await request(base,basePath+'?analysis_run_id='+RUN_ID)).status,401,'session required');
    const full=await request(base,basePath+'?analysis_run_id='+RUN_ID,{headers:ownerHeaders});
    assert.equal(full.status,200);assert.equal(full.payload.schema_version,'niannian.shot_review_model.v1');assert.equal(full.payload.shots.length,37);
    assert.equal(full.payload.shots.reduce((n,shot)=>n+Object.keys(shot.frames).length,0),111);
    assert.equal(new Set(full.payload.shots.flatMap(shot=>shot.dialogue.map(row=>row.event_id))).size,13);
    assert.equal(full.payload.shots.reduce((n,shot)=>n+shot.dialogue.length,0),38);assert.equal(full.payload.shots.reduce((n,shot)=>n+shot.ocr.length,0),34);
    assert.equal(full.response.headers.get('x-shot-review-contract'),CONTRACT_SHA);assert.ok(full.response.headers.get('etag'));assert.equal(full.response.headers.get('x-shot-review-revision'),full.response.headers.get('etag'));
    const serialized=JSON.stringify(full.payload);assert.equal(/[A-Z]:\\|\/home\/|Authorization|Bearer |signed_url/i.test(serialized),false);
    assert.equal((await request(base,basePath+'?analysis_run_id='+RUN_ID,{headers:intruderHeaders})).status,404,'owner isolation');
    const runMismatch=await request(base,basePath+'?analysis_run_id=wrong-run',{headers:ownerHeaders});assert.equal(runMismatch.status,409);assert.equal(runMismatch.payload.code,'EVIDENCE_BINDING_MISMATCH');
    const tamperedProject=JSON.parse(projectsBytes);tamperedProject[0].source.sha256='0'.repeat(64);await writeJson(path.join(dataRoot,'projects.json'),tamperedProject);
    const sourceMismatch=await request(base,basePath+'?analysis_run_id='+RUN_ID,{headers:ownerHeaders});assert.equal(sourceMismatch.status,409);assert.equal(sourceMismatch.payload.code,'EVIDENCE_BINDING_MISMATCH');
    await fsp.writeFile(path.join(dataRoot,'projects.json'),projectsBytes);

    const shot1Read=await request(base,basePath+'/shots/S001?analysis_run_id='+RUN_ID,{headers:ownerHeaders});assert.equal(shot1Read.status,200);assert.equal(shot1Read.payload.shot.shot_id,'S001');assert.equal(shot1Read.payload.revision_history.length,0);
    const evidenceEtag1=shot1Read.response.headers.get('etag'), revision1=revisionFor(shot1Read.payload.shot,'rev-S001-http-0001',null,{speaker:['speaker_01'],review_status:'accepted'});
    const beforeFailure=commitFiles(overlayRoot).length;
    const noPrecondition=await request(base,basePath+'/shots/S001/revisions',{method:'POST',headers:{...ownerHeaders,'Content-Type':'application/json'},body:JSON.stringify(revision1)});assert.equal(noPrecondition.status,428);assert.equal(commitFiles(overlayRoot).length,beforeFailure);
    const created=await request(base,basePath+'/shots/S001/revisions',{method:'POST',headers:{...ownerHeaders,'Content-Type':'application/json','If-Match':evidenceEtag1},body:JSON.stringify(revision1)});assert.equal(created.status,201);assert.equal(created.payload.code,'SHOT_REVISION_CREATED');assert.equal(created.payload.idempotent,false);
    const refreshed=await request(base,basePath+'/shots/S001?analysis_run_id='+RUN_ID,{headers:ownerHeaders});assert.equal(refreshed.status,200);assert.equal(refreshed.payload.shot.active_revision,revision1.revision_id);assert.deepEqual(refreshed.payload.shot.speaker,['speaker_01']);assert.equal(refreshed.payload.shot.review_status,'accepted');assert.equal(refreshed.payload.revision_history.length,1);
    const commitsAfterCreate=commitFiles(overlayRoot).length;
    const replay=await request(base,basePath+'/shots/S001/revisions',{method:'POST',headers:{...ownerHeaders,'Content-Type':'application/json','If-Match':evidenceEtag1},body:JSON.stringify(revision1)});assert.equal(replay.status,201);assert.equal(replay.payload.code,'SHOT_REVISION_REPLAYED');assert.equal(replay.payload.idempotent,true);assert.equal(commitFiles(overlayRoot).length,commitsAfterCreate);
    const changedReplay=JSON.parse(JSON.stringify(revision1));changedReplay.patch.speaker=['different'];
    const payloadMismatch=await request(base,basePath+'/shots/S001/revisions',{method:'POST',headers:{...ownerHeaders,'Content-Type':'application/json','If-Match':evidenceEtag1},body:JSON.stringify(changedReplay)});assert.equal(payloadMismatch.status,409);assert.equal(payloadMismatch.payload.code,'IDEMPOTENCY_PAYLOAD_MISMATCH');assert.equal(commitFiles(overlayRoot).length,commitsAfterCreate);
    const stale=revisionFor(shot1Read.payload.shot,'rev-S001-stale-0002',null,{review_status:'needs_revision'});
    const staleResponse=await request(base,basePath+'/shots/S001/revisions',{method:'POST',headers:{...ownerHeaders,'Content-Type':'application/json','If-Match':evidenceEtag1},body:JSON.stringify(stale)});assert.equal(staleResponse.status,409);assert.equal(staleResponse.payload.code,'REVISION_CONFLICT');assert.equal(commitFiles(overlayRoot).length,commitsAfterCreate);

    const shot2Read=await request(base,basePath+'/shots/S002?analysis_run_id='+RUN_ID,{headers:ownerHeaders});const etag2=shot2Read.response.headers.get('etag');
    const concurrentBodies=[revisionFor(shot2Read.payload.shot,'rev-S002-concurrent-a',null,{review_status:'accepted'}),revisionFor(shot2Read.payload.shot,'rev-S002-concurrent-b',null,{review_status:'needs_revision'})];
    const concurrent=await Promise.all(concurrentBodies.map(body=>request(base,basePath+'/shots/S002/revisions',{method:'POST',headers:{...ownerHeaders,'Content-Type':'application/json','If-Match':etag2},body:JSON.stringify(body)})));
    assert.deepEqual(concurrent.map(item=>item.status).sort(),[201,409]);assert.equal(concurrent.filter(item=>item.status===409)[0].payload.code,'REVISION_CONFLICT');
    const shot2After=await request(base,basePath+'/shots/S002?analysis_run_id='+RUN_ID,{headers:ownerHeaders});assert.equal(shot2After.payload.revision_history.length,1);

    const beforeAi=commitFiles(overlayRoot).length;
    const ai=await request(base,basePath+'/shots/S001/reanalysis',{method:'POST',headers:{...ownerHeaders,'Content-Type':'application/json'},body:JSON.stringify({schema_version:'niannian.single_shot_reanalysis_input.v1',analysis_run_id:RUN_ID,shot_id:'S001'})});
    assert.equal(ai.status,503);assert.equal(ai.payload.code,'SHOT_REANALYSIS_EXECUTOR_UNAVAILABLE');assert.deepEqual({available:ai.payload.available,model_requested:ai.payload.model_requested,provider_requested:ai.payload.provider_requested,candidate_created:ai.payload.candidate_created,step02_started:ai.payload.step02_started},{available:false,model_requested:false,provider_requested:false,candidate_created:false,step02_started:false});assert.equal(commitFiles(overlayRoot).length,beforeAi);

    const frameRelative=path.join('artifacts','shotlevel_start_mid_end_frames','EP001_transnet_shot_0001_mid_00-00-01.160.png'), copiedFrame=path.join(evidenceRoot,frameRelative), sourceFrame=path.join(sourceEvidence,frameRelative);
    const frameBytes=await fsp.readFile(copiedFrame);frameBytes[frameBytes.length-1]^=1;await fsp.writeFile(copiedFrame,frameBytes);
    const evidenceTamper=await request(base,basePath+'?analysis_run_id='+RUN_ID,{headers:ownerHeaders});assert.equal(evidenceTamper.status,409);assert.equal(evidenceTamper.payload.code,'SHOT_REVIEW_EVIDENCE_TAMPERED');
    await fsp.copyFile(sourceFrame,copiedFrame);assert.equal((await request(base,basePath+'?analysis_run_id='+RUN_ID,{headers:ownerHeaders})).status,200);

    await stop();
    const ownerHash=hash(Buffer.from(OWNER)), runHash=hash(Buffer.from(RUN_ID));
    const shot1Dir=path.join(overlayRoot,'v1','owners',ownerHash,'projects',PROJECT_ID,'runs',runHash,'shots','S001');await fsp.writeFile(path.join(shot1Dir,'.tmp-orphan-crash'),'{incomplete');
    port+=1;base='http://127.0.0.1:'+port;await start();
    const afterRestart=await request(base,basePath+'/shots/S001?analysis_run_id='+RUN_ID,{headers:ownerHeaders});assert.equal(afterRestart.status,200);assert.equal(afterRestart.payload.shot.active_revision,revision1.revision_id);assert.equal(afterRestart.payload.revision_history.length,1);
    const shot3=await request(base,basePath+'/shots/S003?analysis_run_id='+RUN_ID,{headers:ownerHeaders}), shot3Dir=path.join(overlayRoot,'v1','owners',ownerHash,'projects',PROJECT_ID,'runs',runHash,'shots','S003');await fsp.mkdir(shot3Dir,{recursive:true});const staleLock=path.join(shot3Dir,'.write.lock');await fsp.writeFile(staleLock,'{}');const old=new Date(Date.now()-60000);await fsp.utimes(staleLock,old,old);
    const revision3=revisionFor(shot3.payload.shot,'rev-S003-after-crash',null,{review_status:'in_review'});const afterCrashWrite=await request(base,basePath+'/shots/S003/revisions',{method:'POST',headers:{...ownerHeaders,'Content-Type':'application/json','If-Match':shot3.response.headers.get('etag')},body:JSON.stringify(revision3)});assert.equal(afterCrashWrite.status,201);

    assert.equal(await treeDigest(sourceEvidence),sourceDigestBefore,'authoritative evidence bytes/SHA unchanged');assert.equal(await treeDigest(evidenceRoot),copiedDigestBefore,'copied evidence restored exactly');assert.deepEqual(await fsp.readFile(path.join(dataRoot,'projects.json')),projectsBytes,'projects facts unchanged after mismatch test restore');
    const overlayText=(await Promise.all(commitFiles(overlayRoot).map(file=>fsp.readFile(file,'utf8')))).join('\n');assert.equal(overlayText.includes(OWNER),false);assert.equal(/[A-Z]:\\|Authorization|Cookie|Bearer |signed_url/i.test(overlayText),false);
    assert.equal(/provider|model request|candidate created/i.test(stdout+stderr),false);
    console.log(JSON.stringify({status:'PASS',level:'integrated_backend',http:{full_get:200,single_get:200,revision_create:201,replay:201,payload_mismatch:409,stale:409,concurrent:[201,409],evidence_tamper:409,reanalysis:503,restart_read:200},counts:{shots:37,frames:111,dialogue_rows:13,dialogue_associations:38,ocr_rows:34},commits:commitFiles(overlayRoot).length,store_shape:'v1/owners/<owner_sha256>/projects/<project_id>/runs/<run_sha256>/shots/<shot_id>/<sequence>-<revision_id_sha256>.json'}));
  } finally {await stop();await fsp.rm(root,{recursive:true,force:true});}
}

main().catch(error=>{console.error(error.stack);process.exitCode=1;});
