'use strict';

const assert=require('assert');
const fs=require('fs');
const fsp=fs.promises;
const http=require('http');
const os=require('os');
const path=require('path');
const gate=require('./bridge/niannian_video_batch_gate');
const {createHttpHandler}=require('./bridge/niannian_video_batch_http');

const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'docs','agent-team','video-batch-cost-gate','fixtures','happy-batch.json'),'utf8'));

async function main(){
  const root=await fsp.mkdtemp(path.join(os.tmpdir(),'niannian-video-batch-http-'));
  const adapter=gate.createFixtureAdapter();
  const service=gate.createService({root,adapter});
  const now=Date.parse('2026-07-27T10:00:00.000Z');
  await service.lockAndPreflight({projectId:'project-001',ownerId:'owner-001',input:fixture,now});
  const projects=new Map([['project-001',{id:'project-001',ownerId:'owner-001'}]]);
  const handler=createHttpHandler({service,now:()=>now,authenticate:async request=>({id:String(request.headers['x-test-owner']||'owner-001')}),resolveProject:async id=>projects.get(id)||null});
  const server=http.createServer(async(request,response)=>{const pathname=new URL(request.url,'http://127.0.0.1').pathname;if(await handler(request,response,pathname))return;response.writeHead(404);response.end();});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const base='http://127.0.0.1:'+server.address().port;
  try{
    const get=await fetch(base+'/api/projects/project-001/video-batches/current',{headers:{'X-Test-Owner':'owner-001'}});
    assert.equal(get.status,200);assert.match(get.headers.get('etag'),/^"video-batch-/);assert.match(get.headers.get('cache-control'),/no-store/);
    const plan=await get.json();assert.equal(plan.task_count,undefined);assert.equal(plan.plan.task_count,2);assert.equal(plan.submit_allowed,false);assert.equal(plan.action.type,'cost_authorization');
    const publicText=JSON.stringify(plan);for(const word of ['spec_digest','batch_digest','provider_task_id','receipt','credential','cookie','token','secret','exact_path','sha256'])assert.equal(publicText.includes(word),false,word);
    const denied=await fetch(base+'/api/projects/project-001/video-batches/current',{headers:{'X-Test-Owner':'owner-002'}});assert.equal(denied.status,404);
    const weak=await fetch(base+'/api/projects/project-001/video-batches/current/confirm',{method:'POST',headers:{'Content-Type':'application/json','X-Test-Owner':'owner-001','If-Match':'W/'+get.headers.get('etag'),'Idempotency-Key':'http-weak'},body:JSON.stringify({confirm_generate:true,quote_revision:plan.quote.revision,confirmed_max_cost:{currency:plan.quote.currency,minor_units:plan.quote.max_cost_minor_units}})});assert.equal(weak.status,412);
    const body={confirm_generate:true,quote_revision:plan.quote.revision,confirmed_max_cost:{currency:plan.quote.currency,minor_units:plan.quote.max_cost_minor_units}};
    const confirmed=await fetch(base+'/api/projects/project-001/video-batches/current/confirm',{method:'POST',headers:{'Content-Type':'application/json','X-Test-Owner':'owner-001','If-Match':get.headers.get('etag'),'Idempotency-Key':'http-confirm-001'},body:JSON.stringify(body)});
    assert.equal(confirmed.status,200);const confirmedBody=await confirmed.json();assert.equal(confirmedBody.submit_allowed,true);assert.equal(confirmedBody.state,'等待提交/处理中');
    const replay=await fetch(base+'/api/projects/project-001/video-batches/current/confirm',{method:'POST',headers:{'Content-Type':'application/json','X-Test-Owner':'owner-001','If-Match':get.headers.get('etag'),'Idempotency-Key':'http-confirm-001'},body:JSON.stringify(body)});assert.equal(replay.status,200);assert.equal((await replay.json()).submit_allowed,true);
    const stored=await service.load('project-001');assert.equal(Object.keys(stored.idempotency).length,1);assert.equal(stored.submission.submit_invocation_count,0);assert.deepEqual(adapter.sideEffects,{network:0,login:0,secret_read:0,upload:0,submit:0,cost:0});
    process.stdout.write('PASS video batch real HTTP GET/confirm/idempotency/owner/no-store\n');
  }finally{await new Promise(resolve=>server.close(resolve));}
}

main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
