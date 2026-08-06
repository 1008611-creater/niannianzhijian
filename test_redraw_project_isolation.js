'use strict';

const assert=require('assert');
const crypto=require('crypto');
const fsp=require('fs').promises;
const fs=require('fs');
const os=require('os');
const path=require('path');
const {spawn}=require('child_process');
const {chromium}=require('playwright');

const projectRoot=__dirname;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function sha256(value){return crypto.createHash('sha256').update(value).digest('hex');}
async function writeJson(filePath,value){await fsp.mkdir(path.dirname(filePath),{recursive:true});await fsp.writeFile(filePath,JSON.stringify(value,null,2)+'\n','utf8');}
async function run(command,args){return new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd:projectRoot,windowsHide:true,stdio:['ignore','ignore','pipe']});let error='';child.stderr.on('data',chunk=>{error+=chunk;});child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error(command+'_failed_'+code+':'+error)));});}
async function fetchResult(url,options={}){const response=await fetch(url,options);const payload=await response.json().catch(()=>({}));return {response,payload};}
async function fetchOk(url,options={}){const result=await fetchResult(url,options);if(!result.response.ok)throw new Error((result.payload.code||result.response.status)+':'+(result.payload.error||''));return result;}
async function waitForHealth(baseUrl){for(let i=0;i<80;i+=1){try{if((await fetchOk(baseUrl+'/api/health')).payload.ok)return;}catch{}await delay(100);}throw new Error('server_health_timeout');}
async function register(baseUrl){const result=await fetchOk(baseUrl+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'isolation-'+Date.now()+'@example.com',password:'correct-horse-battery-staple'})});return String(result.response.headers.get('set-cookie')||'').split(';')[0];}
async function formFor(videoPath,overrides={}){const form=new FormData();const values={name:'并发隔离转绘项目',notes:'fixture only',rightsConfirmed:'on',...overrides};for(const [key,value] of Object.entries(values))form.set(key,value);form.set('sourceVideo',new Blob([await fsp.readFile(videoPath)],{type:'video/mp4'}),'fixture.mp4');return form;}
async function create(baseUrl,cookie,videoPath,overrides={}){return fetchResult(baseUrl+'/api/projects',{method:'POST',headers:{Cookie:cookie},body:await formFor(videoPath,overrides)});}
async function rewriteRights(dataRoot,projectId,mutate,{updateProjection=false}={}){const projectsPath=path.join(dataRoot,'projects.json');const projects=JSON.parse(await fsp.readFile(projectsPath,'utf8'));const project=projects.find(item=>item.id===projectId);const rightsPath=path.join(dataRoot,'jobs',projectId,'rights_authority.json');const rights=JSON.parse(await fsp.readFile(rightsPath,'utf8'));mutate(rights);const bytes=Buffer.from(JSON.stringify(rights,null,2)+'\n','utf8');await fsp.writeFile(rightsPath,bytes);if(updateProjection){project.rightsAuthority=rights;project.rightsAuthorityReceipt={...project.rightsAuthorityReceipt,event_id:rights.event_id,sha256:sha256(bytes),bytes:bytes.length};await fsp.writeFile(projectsPath,JSON.stringify(projects,null,2)+'\n','utf8');}return {rights,bytes};}
async function assertNoDispatch(dataRoot,projectId){const root=path.join(dataRoot,'jobs',projectId);for(const relative of ['step01_authorization.json','step01_orchestrator_result.json','step01_app_phase_exports'])assert.equal(fs.existsSync(path.join(root,relative)),false,relative+' must not exist');}

async function main(){
  const root=await fsp.mkdtemp(path.join(os.tmpdir(),'niannian-redraw-isolation-'));const dataRoot=path.join(root,'data');const jobsRoot=path.join(dataRoot,'jobs');const video=path.join(root,'audio.mp4');const silent=path.join(root,'silent.mp4');const port=26000+crypto.randomInt(1000);const baseUrl='http://127.0.0.1:'+port;let server;let browser;
  try{
    await fsp.mkdir(path.join(jobsRoot,'NN-COLLISION-SENTINEL-0001'),{recursive:true});await fsp.writeFile(path.join(jobsRoot,'NN-COLLISION-SENTINEL-0001','sentinel.txt'),'do-not-touch','utf8');
    await run(process.env.FFMPEG_PATH||'ffmpeg',['-y','-f','lavfi','-i','color=c=black:s=320x180:r=24','-f','lavfi','-i','sine=frequency=500:sample_rate=48000','-t','16','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',video]);
    await run(process.env.FFMPEG_PATH||'ffmpeg',['-y','-f','lavfi','-i','color=c=black:s=320x180:r=24','-t','16','-c:v','libx264','-pix_fmt','yuv420p','-an',silent]);
    server=spawn(process.execPath,[path.join(projectRoot,'server.js')],{cwd:projectRoot,env:{...process.env,NODE_ENV:'test',PORT:String(port),DATA_DIR:dataRoot,NIANNIAN_MEDIA_PREFLIGHT:'on',NIANNIAN_STEP01_AUTO_EXECUTE:'off',NIANNIAN_TEST_PROJECT_ID_SEQUENCE:'NN-COLLISION-SENTINEL-0001,NN-CONCURRENT-A-0001,NN-CONCURRENT-B-0001,NN-RIGHTS-TEST-0001,NN-NOAUDIO-TEST-0001'},stdio:['ignore','ignore','pipe']});let serverError='';server.stderr.on('data',chunk=>{serverError+=chunk;});await waitForHealth(baseUrl);const cookie=await register(baseUrl);

    const invalid=await create(baseUrl,cookie,video,{quality:'4k'});assert.equal(invalid.response.status,400);assert.equal(invalid.payload.code,'PROJECT_FIELD_NOT_ALLOWED');
    const [first,second]=await Promise.all([create(baseUrl,cookie,video,{name:'并发项目 A'}),create(baseUrl,cookie,video,{name:'并发项目 B'})]);assert.equal(first.response.status,201);assert.equal(second.response.status,201);assert.notEqual(first.payload.project.id,second.payload.project.id);assert(![first.payload.project.id,second.payload.project.id].includes('NN-COLLISION-SENTINEL-0001'));assert.equal(await fsp.readFile(path.join(jobsRoot,'NN-COLLISION-SENTINEL-0001','sentinel.txt'),'utf8'),'do-not-touch');
    const persisted=JSON.parse(await fsp.readFile(path.join(dataRoot,'projects.json'),'utf8'));for(const created of [first.payload.project,second.payload.project]){const row=persisted.find(item=>item.id===created.id);assert(row);assert.equal(row.source.sha256,created.source.sha256);assert.equal(row.rightsAuthority.source_sha256,created.source.sha256);assert.equal(fs.existsSync(path.join(jobsRoot,created.id,'rights_authority.json')),true);}assert.equal((await fsp.readdir(dataRoot)).some(name=>name.startsWith('projects.json.tmp')),false);

    const rightsProject=first.payload.project;const rightsPath=path.join(jobsRoot,rightsProject.id,'rights_authority.json');const originalRightsBytes=await fsp.readFile(rightsPath);const originalProjects=await fsp.readFile(path.join(dataRoot,'projects.json'));
    await fsp.appendFile(rightsPath,' ');let rejected=await fetchResult(baseUrl+'/api/projects/'+rightsProject.id+'/step01-analysis',{method:'POST',headers:{Cookie:cookie}});assert.equal(rejected.response.status,409);assert.equal(rejected.payload.code,'STEP01_RIGHTS_AUTHORITY_SHA256_MISMATCH');await assertNoDispatch(dataRoot,rightsProject.id);await fsp.writeFile(rightsPath,originalRightsBytes);await fsp.writeFile(path.join(dataRoot,'projects.json'),originalProjects);
    for(const [name,mutate,code] of [
      ['revoke',rights=>{rights.revoked=true;},'STEP01_RIGHTS_AUTHORITY_REVOKED_OR_INVALID'],
      ['user',rights=>{rights.confirmed_by_user_id='another-user';},'STEP01_RIGHTS_AUTHORITY_USER_MISMATCH'],
      ['source',rights=>{rights.source_sha256='0'.repeat(64);},'STEP01_RIGHTS_AUTHORITY_SOURCE_MISMATCH'],
      ['scope',rights=>{rights.scope='different_scope';},'STEP01_RIGHTS_AUTHORITY_SCOPE_MISMATCH']
    ]){await rewriteRights(dataRoot,rightsProject.id,mutate,{updateProjection:true});rejected=await fetchResult(baseUrl+'/api/projects/'+rightsProject.id+'/step01-analysis',{method:'POST',headers:{Cookie:cookie}});assert.equal(rejected.response.status,409,name);assert.equal(rejected.payload.code,code,name);await assertNoDispatch(dataRoot,rightsProject.id);await fsp.writeFile(rightsPath,originalRightsBytes);await fsp.writeFile(path.join(dataRoot,'projects.json'),originalProjects);}
    const stored=JSON.parse(await fsp.readFile(path.join(dataRoot,'projects.json'),'utf8')).find(item=>item.id===rightsProject.id);await fsp.appendFile(stored.source.storedPath,'tamper');rejected=await fetchResult(baseUrl+'/api/projects/'+rightsProject.id+'/step01-analysis',{method:'POST',headers:{Cookie:cookie}});assert.equal(rejected.response.status,409);assert.equal(rejected.payload.code,'STEP01_SOURCE_SHA256_MISMATCH');await assertNoDispatch(dataRoot,rightsProject.id);

    const noAudio=await create(baseUrl,cookie,silent,{name:'无音轨阻塞项目'});assert.equal(noAudio.response.status,201);assert.equal(noAudio.payload.project.preflight.status,'failed');assert.equal(noAudio.payload.project.preflight.code,'SOURCE_AUDIO_STREAM_REQUIRED');assert.equal(noAudio.payload.project.analysis.status,'blocked_preflight');

    browser=await chromium.launch({headless:true});const context=await browser.newContext();await context.addCookies([{name:'niannian_session',value:cookie.slice('niannian_session='.length),domain:'127.0.0.1',path:'/'}]);const page=await context.newPage();await page.goto(baseUrl+'/#projects',{waitUntil:'domcontentloaded'});
    await page.evaluate(()=>{const userKey=Object.keys(sessionStorage).find(key=>key.includes(':redraw-project'));if(userKey)sessionStorage.removeItem(userKey);});
    const session=await fetchOk(baseUrl+'/api/auth/session',{headers:{Cookie:cookie}});const draftKey='niannian-ai:workspace-draft:v1:'+session.payload.user.id+':redraw-project';await page.evaluate(({draftKey})=>sessionStorage.setItem(draftKey,JSON.stringify({schemaVersion:1,values:{name:'不应自动恢复的旧草稿',remakeMode:'style_remake',targetLanguage:'source',aspectRatio:'16:9',quality:'720p',replacementBrief:'这是一段只应显式恢复的旧草稿内容。',notes:'old'}})),{draftKey});await page.locator('[data-open-project-wizard]').first().click();assert.equal(await page.locator('#projectCreateForm [name="name"]').inputValue(),'');await page.locator('[data-resume-redraw-draft]').click();assert.equal(await page.locator('#projectCreateForm [name="name"]').inputValue(),'不应自动恢复的旧草稿');await page.locator('[data-close-project-wizard]').first().click();
    await page.goto(baseUrl+'/#redraw/NN-DOES-NOT-EXIST-0001/stage/01');await page.waitForSelector('#redrawStudioContent .team-empty');assert.match(await page.locator('#redrawStudioContent').innerText(),/未找到这个转绘项目/);assert.doesNotMatch(await page.locator('#redrawStudioContent').innerText(),/并发项目 A|并发项目 B/);await page.goto(baseUrl+'/#redraw/new');await page.waitForSelector('#redrawStudioContent .team-empty');assert.match(await page.locator('#redrawStudioContent').innerText(),/创建一个全新的转绘项目/);await context.close();await browser.close();browser=null;

    process.stdout.write(JSON.stringify({ok:true,verified:['strict create field allowlist','Stage01 settings rejected before source facts','collision retry preserves old job sentinel','two concurrent creates persist unique isolated NN IDs','unique atomic projects temp writes','fresh wizard does not auto-restore cancelled draft','explicit draft resume only','unknown/new redraw route never falls back to old project','rights SHA tamper/revoke/user/source/scope rejected with 409 and zero dispatch','source tamper rejected before authorization','hq_full no-audio preflight blocked','fixture media only; authority 001.mp4 untouched']})+'\n');
    assert.equal(serverError,'');
  }finally{if(browser)await browser.close().catch(()=>{});if(server){server.kill();await delay(100);}await fsp.rm(root,{recursive:true,force:true});}
}
main().catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
