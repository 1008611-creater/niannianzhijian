'use strict';

const assert=require('assert');
const crypto=require('crypto');
const fsp=require('fs').promises;
const os=require('os');
const path=require('path');
const {spawn}=require('child_process');
const {seed}=require('./test_niannian_source_video_execution');

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitForHealth(base){for(let i=0;i<80;i+=1){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await delay(100);}throw new Error('health_timeout');}
async function call(url,options={}){const response=await fetch(url,options);return{response,payload:await response.json().catch(()=>({}))};}
async function register(base,email){const result=await call(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'correct-horse-battery-staple'})});assert.equal(result.response.status,200,JSON.stringify(result.payload));return{user:result.payload.user,cookie:String(result.response.headers.get('set-cookie')||'').split(';')[0]};}

async function main(){
  const root=await fsp.mkdtemp(path.join(os.tmpdir(),'niannian-source-video-flow-')),dataRoot=path.join(root,'data'),port=24000+crypto.randomInt(800),base='http://127.0.0.1:'+port;
  const server=spawn(process.execPath,[path.join(__dirname,'server.js')],{cwd:__dirname,env:{...process.env,PORT:String(port),DATA_DIR:dataRoot,NIANNIAN_MEDIA_PREFLIGHT:'off',NIANNIAN_SOURCE_VIDEO_FAKE_TRANSPORT:'on'},stdio:['ignore','pipe','pipe']});let stderr='';server.stderr.on('data',chunk=>{stderr+=chunk;});
  try{
    await waitForHealth(base);const owner=await register(base,'source-provider-owner-'+Date.now()+'@example.com'),foreign=await register(base,'source-provider-foreign-'+Date.now()+'@example.com');const finalSeed=await seed(dataRoot,'HTTP',owner.user.id);
    const projectsPath=path.join(dataRoot,'projects.json');await fsp.writeFile(projectsPath,JSON.stringify([finalSeed.project],null,2)+'\n');
    const endpoint=base+'/api/projects/'+finalSeed.project.id+'/source-video-execution/V001/';
    let result=await call(endpoint+'prepare',{method:'POST',headers:{Cookie:owner.cookie,'Content-Type':'application/json'},body:'{}'});assert.equal(result.response.status,409,JSON.stringify(result.payload));assert.match(result.payload.error,/尚未全部确认|版本已更新/);assert.equal(Object.prototype.hasOwnProperty.call(result.payload,'code'),false,'Step05 user-facing gate must not expose an internal code');
    result=await call(endpoint+'prepare-fake',{method:'POST',headers:{Cookie:owner.cookie,'Content-Type':'application/json'},body:'{}'});assert.equal(result.response.status,200,JSON.stringify(result.payload));assert.equal(result.payload.code,'SOURCE_VIDEO_EXECUTION_FAKE_PREPARED');assert.equal(result.payload.realSubmitEnabled,false);assert.equal(result.payload.mediaProviderSubmitted,false);
    result=await call(endpoint+'resume-fake',{method:'POST',headers:{Cookie:owner.cookie,'Content-Type':'application/json'},body:'{}'});assert.equal(result.response.status,200,JSON.stringify(result.payload));assert.equal(result.payload.code,'SOURCE_VIDEO_EXECUTION_FAKE_PROJECTED_NON_PROMOTABLE');assert.equal(result.payload.review.state,'projected');assert.equal(result.payload.review.projection.test_only,true);assert.equal(result.payload.review.projection.downstream_consumable,false);assert.equal(result.payload.mediaProviderSubmitted,false);assert.equal(result.payload.spendRequested,false);assert.equal(result.payload.localImageEditingRequested,false);assert.deepEqual(result.payload.transportCalls.filter(name=>name==='submit'),['submit']);
    const replay=await call(endpoint+'resume-fake',{method:'POST',headers:{Cookie:owner.cookie,'Content-Type':'application/json'},body:'{}'});assert.equal(replay.response.status,200);assert.equal(replay.payload.transportCalls.length,0,'HTTP replay must start no fake provider operations');
    const status=await call(endpoint+'status?mode=fake',{headers:{Cookie:owner.cookie}});assert.equal(status.response.status,200);assert.equal(status.payload.review.state,'projected');assert.equal(status.payload.realSubmitEnabled,false);
    const noCsrf=await call(endpoint+'submit-real',{method:'POST',headers:{Cookie:owner.cookie,'Content-Type':'application/json'},body:'{}'});assert.equal(noCsrf.response.status,403);assert.equal(noCsrf.payload.code,'SOURCE_VIDEO_CSRF_ORIGIN_REQUIRED');
    const crossOrigin=await call(endpoint+'submit-real',{method:'POST',headers:{Cookie:owner.cookie,'Content-Type':'application/json',Origin:'https://evil.example','Sec-Fetch-Site':'same-origin'},body:'{}'});assert.equal(crossOrigin.response.status,403);assert.equal(crossOrigin.payload.code,'SOURCE_VIDEO_CSRF_ORIGIN_MISMATCH');
    const guardedOff=await call(endpoint+'submit-real',{method:'POST',headers:{Cookie:owner.cookie,'Content-Type':'application/json',Origin:base,'Sec-Fetch-Site':'same-origin'},body:'{}'});assert.equal(guardedOff.response.status,409);assert.match(guardedOff.payload.error,/尚未全部确认|版本已更新/);assert.equal(Object.prototype.hasOwnProperty.call(guardedOff.payload,'code'),false);
    const invisible=await call(endpoint+'media',{headers:{Cookie:owner.cookie}});assert.equal(invisible.response.status,404);const publicProject=await call(base+'/api/projects/'+finalSeed.project.id,{headers:{Cookie:owner.cookie}});assert.equal(publicProject.response.status,200);assert.equal(publicProject.payload.project.videoExecution?.media,undefined);assert.equal(JSON.stringify(publicProject.payload.project).includes('synthetic-v001.mp4'),false);
    const denied=await call(endpoint+'status?mode=fake',{headers:{Cookie:foreign.cookie}});assert.equal(denied.response.status,404);
    const channels=await call(base+'/api/video-channels',{headers:{Cookie:owner.cookie}});assert.equal(channels.response.status,200);assert.equal(channels.payload.registry.channels.some(item=>item.website_action_mode==='real_submit'),false);
    process.stdout.write(JSON.stringify({ok:true,verified:['owner-scoped source video execution status/fake-resume API','real prepare and paid submit blocked by Step05 exact-reference confirmation before mutation','server-owned durable mutation and test-only website projection','replay starts zero duplicate fake submit or transport calls','foreign owner receives no project evidence','paid submit endpoint rejects missing/cross-origin requests before Step05 gate','fake media has no website media/download route and no public exact path','video channel registry still exposes zero website real-submit actions','real provider/upload/submit/spend/local edit all false']})+'\n');
  }finally{server.kill();await delay(100);if(server.exitCode===null)server.kill('SIGKILL');await fsp.rm(root,{recursive:true,force:true});if(stderr)process.stderr.write(stderr);}
}
main().catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
