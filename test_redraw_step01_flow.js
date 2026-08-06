'use strict';

const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const {spawn} = require('child_process');

const projectRoot = __dirname;
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function run(command, args) { return new Promise((resolve, reject) => { const child=spawn(command,args,{stdio:['ignore','pipe','pipe']});let stderr='';child.stderr.on('data',chunk=>{stderr+=chunk;});child.once('error',reject);child.once('close',code=>code===0?resolve():reject(new Error(stderr))); }); }
async function fetchJson(url, options={}) { const response=await fetch(url,options);const payload=await response.json().catch(()=>({}));if(!response.ok){const error=new Error(payload.error||String(response.status));error.status=response.status;error.payload=payload;throw error;}return{response,payload}; }
async function health(baseUrl) { for(let index=0;index<80;index+=1){try{if((await fetchJson(baseUrl+'/api/health')).payload.ok)return;}catch{}await delay(100);}throw new Error('health_timeout'); }
async function register(baseUrl,label) { const result=await fetchJson(baseUrl+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:label+'-'+Date.now()+'@example.com',password:'correct-horse-battery-staple'})});return String(result.response.headers.get('set-cookie')||'').split(';')[0]; }

async function main() {
  const root=await fsp.mkdtemp(path.join(os.tmpdir(),'niannian-step01-flow-'));
  const dataRoot=path.join(root,'data'), videoPath=path.join(root,'fixture.mp4'), port=25000+crypto.randomInt(1000), baseUrl='http://127.0.0.1:'+port;
  let server='', stderr='';
  try {
    await run(process.env.NIANNIAN_FFMPEG_PATH||'ffmpeg',['-y','-f','lavfi','-i','color=c=black:s=320x568:d=16','-f','lavfi','-i','anullsrc=r=16000:cl=mono','-shortest','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',videoPath]);
    server=spawn(process.execPath,[path.join(projectRoot,'server.js')],{cwd:projectRoot,env:{...process.env,PORT:String(port),DATA_DIR:dataRoot,BRIDGE_TOKEN_HASH:crypto.createHash('sha256').update('test-token'.repeat(8)).digest('hex'),NIANNIAN_MEDIA_PREFLIGHT:'on',NIANNIAN_STEP01_AUTO_EXECUTE:'off'},stdio:['ignore','pipe','pipe']});
    server.stderr.on('data',chunk=>{stderr+=chunk;}); await health(baseUrl);
    const owner=await register(baseUrl,'owner'), intruder=await register(baseUrl,'intruder');
    const form=new FormData();form.set('name','Haika Step01 流程测试');form.set('rightsConfirmed','on');form.set('sourceVideo',new Blob([await fsp.readFile(videoPath)],{type:'video/mp4'}),'fixture.mp4');
    const created=await fetchJson(baseUrl+'/api/projects',{method:'POST',headers:{Cookie:owner},body:form});const project=created.payload.project;
    assert.equal(project.preflight.status,'passed');assert.equal(project.analysis.status,'awaiting_user_start');assert.equal(project.rightsAuthority.status,'confirmed');
    const range=await fetch(baseUrl+project.source.previewUrl,{headers:{Cookie:owner,Range:'bytes=0-99'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,100);
    assert.equal((await fetch(baseUrl+project.source.previewUrl,{headers:{Cookie:intruder}})).status,404);
    const queued=await fetchJson(baseUrl+'/api/projects/'+encodeURIComponent(project.id)+'/step01-analysis',{method:'POST',headers:{Cookie:owner,'Content-Type':'application/json'},body:'{}'});
    assert.equal(queued.response.status,202);assert.equal(queued.payload.project.analysis.status,'queued');assert.equal(queued.payload.project.analysis.runtimeProfile,'haika-step01-direct-v1');assert.equal(queued.payload.project.runtime.gateState,'step01_server_preparing');assert.equal(queued.payload.project.runtime.worker.mode,'haika_server_responses');
    const task=JSON.parse(await fsp.readFile(path.join(dataRoot,'jobs',project.id,'task.json'),'utf8'));const dashboard=JSON.parse(await fsp.readFile(path.join(dataRoot,'jobs',project.id,'gate_dashboard.json'),'utf8'));
    assert.equal(task.runtime_profile,'haika-step01-direct-v1');assert.deepEqual(task.analysis_authorization.allowed_skill_routes,['mx-shortdrama-00-router','mx-shortdrama-01-frame-extract']);assert.equal(task.constraints.server_execution_only,true);assert.equal(dashboard.gates.analysis_service.status,'preparing');assert.equal(Object.hasOwn(dashboard.gates,'mac_bridge_release'),false);assert.equal(Object.hasOwn(dashboard.gates,'hq_health'),false);
    const duplicate=await fetchJson(baseUrl+'/api/projects/'+encodeURIComponent(project.id)+'/step01-analysis',{method:'POST',headers:{Cookie:owner,'Content-Type':'application/json'},body:'{}'});assert.equal(duplicate.payload.code,'STEP01_ANALYSIS_ALREADY_ACTIVE');
    process.stdout.write(JSON.stringify({ok:true,verified:['15-second MP4 preflight','owner-scoped source access','rights authority','Haika direct Step01 contract','two-skill allowlist','Mac gates removed from new task','duplicate start coalescing']})+'\n');
  } finally { if(server){server.kill();await delay(100);if(server.exitCode===null)server.kill('SIGKILL');}await fsp.rm(root,{recursive:true,force:true});if(stderr)process.stderr.write(stderr); }
}
main().catch(error=>{process.stderr.write(error.stack+'\n');process.exitCode=1;});
