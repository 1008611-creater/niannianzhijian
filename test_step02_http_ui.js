const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const net = require('net');
const os = require('os');
const path = require('path');
const {spawn} = require('child_process');
const {chromium} = require('playwright');
const {createShotReviewService} = require('./bridge/niannian_shot_review');
const {createStep02Service,sha256} = require('./bridge/niannian_step02_runtime');
const step01Ledger = require('./bridge/niannian_step01_source_ledger');

const projectId='NN-20260715083045-8120F5', runId='analysis-1-0dc5c5d751592e9fd0656a81', sourceSha='a46f74392e2b3f7ec813b4eba5a0cd9756a7c30225e0033fd671d2cab21cd30c', sourceBytes=145897161;
const expected={projectId,analysisRunId:runId,sourceSha256:sourceSha,sourceBytes,evidenceId:projectId+'-EP001'};
const owner='USR-STEP02-HTTP-OWNER';
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const response=value=>({output_text:JSON.stringify(value)});

class FixtureResponses {
  async call(body) {
    const name=body.text.format.name;
    if(name==='step02_global_context_v1')return response({character_map:[{source_identity:'原片人物',localized_identity:'Diego 与 Sofia',function:'冲突双方'}],continuity_rules:['关系与情绪连续'],causality:['冲突推动反转'],localization_principles:['自然墨西哥西班牙语']});
    if(name==='step02_shot_batch_v1'){
      const input=JSON.parse(body.input[0].content[0].text);
      return response({shots:input.shots.map(shot=>({shot_id:shot.shot_id,source_shot_ids:[shot.shot_id],target_people_identity:'Diego 与 Sofia',localized_setting:'墨西哥城现代公寓',action:'保持原片动作节拍',target_dialogue:'No voy a aceptar esto.',chinese_back_translation:'我不会接受这件事。',expression_intent:'克制而坚定',cultural_replacements:['称谓本地化'],continuity_requirements:['承接相邻镜头情绪'],duration_fit:{estimated_speech_seconds:2.2,fits:true,note:'适合原镜头'},structure_change:{type:'preserve',reason:'保持原镜头功能'}}))});
    }
    if(name==='step02_whole_episode_qa_v1')return response({passed:true,all_source_shots_mapped:true,character_continuity_passed:true,plot_causality_passed:true,language_naturalness_passed:true,back_translation_consistent:true,duration_fit_passed:true,findings:[]});
    throw new Error('unexpected_fixture_call:'+name);
  }
}

async function freePort(){return new Promise((resolve,reject)=>{const server=net.createServer();server.unref();server.on('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(error=>error?reject(error):resolve(port));});});}
async function waitHealth(base,child,logs){for(let i=0;i<150;i+=1){if(child.exitCode!==null)throw new Error('server_exited:'+logs.join(''));try{if((await fetch(base+'/api/health')).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,80));}throw new Error('server_timeout:'+logs.join(''));}

(async()=>{
  const temp=await fsp.mkdtemp(path.join(os.tmpdir(),'niannian-step02-http-'));
  const dataRoot=path.join(temp,'data'), overlayRoot=path.join(temp,'overlays'), runtimeRoot=path.join(temp,'step02-runtime');
  const evidenceRoot=path.join(__dirname,'data-local','step01-evidence',projectId,'EP001');
  const project={id:projectId,ownerId:owner,name:'001 国内短剧',source:{sha256:sourceSha,bytes:sourceBytes,originalName:'001.mp4'},analysis:{runId,sourceRevision:1,sourceSha256:sourceSha,status:'evidence_ready'},runtime:{referenceEvidenceId:expected.evidenceId}};
  const token=crypto.randomBytes(32).toString('hex');
  const otherOwner='USR-STEP02-HTTP-OTHER', otherToken=crypto.randomBytes(32).toString('hex');
  await fsp.mkdir(dataRoot,{recursive:true});
  await fsp.writeFile(path.join(dataRoot,'projects.json'),JSON.stringify([project],null,2)+'\n');
  await fsp.writeFile(path.join(dataRoot,'users.json'),JSON.stringify([{id:owner,email:'owner@example.test',status:'active'},{id:otherOwner,email:'other@example.test',status:'active'}],null,2)+'\n');
  await fsp.writeFile(path.join(dataRoot,'sessions.json'),JSON.stringify([
    {id:'session-step02',userId:owner,tokenHash:hash(token),createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()},
    {id:'session-step02-other',userId:otherOwner,tokenHash:hash(otherToken),createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()}
  ],null,2)+'\n');
  await fsp.writeFile(path.join(dataRoot,'script-projects.json'),'[]\n');
  let sourceLedger = await step01Ledger.readLedger({evidenceRoot,overlayRoot,project});
  for (const shot of sourceLedger.shots) {
    sourceLedger = await step01Ledger.appendRevision({evidenceRoot,overlayRoot,project,ifMatch:'"step01-ledger-'+sourceLedger.snapshot_sha256+'"',actor:'test',body:{shot_id:shot.shot_id,reason:'fixture visual fact',changes:[{field:'source_visual_facts',before:'',after:'测试用原片可见事实。'}]}});
  }
  const shotReview=createShotReviewService({contractRoot:path.join(__dirname,'docs','shot-review-contract'),evidenceRoot,overlayRoot,expected});
  const fixtureService=createStep02Service({root:runtimeRoot,evidenceRoot,bundleRoot:path.join(__dirname,'runtime','skill-bundles','shortdrama-localization-runtime-1'),shotReviewService:shotReview,responsesClient:new FixtureResponses(),expected});
  const review=await shotReview.getReview({ownerId:owner,project,analysisRunId:runId});
  const {snapshot}=await fixtureService.confirmStep01({ownerId:owner,project,analysisRunId:runId,ifMatch:review.etag,confirmedBy:owner});
  const key=sha256([projectId,snapshot.snapshot_sha256,'es-MX','whole_episode_v1'].join(':'));
  const created=await fixtureService.createVariant({ownerId:owner,project,locale:'es-MX',idempotencyKey:key});
  for(let i=0;i<100;i+=1){const variant=await fixtureService.getVariant({ownerId:owner,project,variantId:created.variant_id});if(variant.status==='ready')break;await new Promise(resolve=>setTimeout(resolve,30));}
  const variantDirectory=path.join(runtimeRoot,'v1','owners',sha256(owner),'projects',projectId,'step02-variants',snapshot.snapshot_id,'es-MX');
  const statePath=path.join(variantDirectory,'state.json'), qaFailedState=JSON.parse(await fsp.readFile(statePath,'utf8'));
  qaFailedState.status='qa_failed';
  qaFailedState.qa={schema_version:'niannian.step02_qa.v1',passed:false,all_source_shots_mapped:true,character_continuity_passed:true,plot_causality_passed:true,language_naturalness_passed:false,back_translation_consistent:true,duration_fit_passed:true,findings:[{shot_id:'S010',severity:'error',message:'对白不自然',suggestion:'缩短并改用当地口语'}]};
  qaFailedState.updated_at=new Date().toISOString();
  await fsp.writeFile(statePath,JSON.stringify(qaFailedState,null,2)+'\n');

  const port=await freePort(), base='http://127.0.0.1:'+port, logs=[];
  const child=spawn(process.execPath,['server.js'],{cwd:__dirname,env:{...process.env,PORT:String(port),DATA_DIR:dataRoot,NIANNIAN_EXACT_STEP01_EVIDENCE_ROOT:evidenceRoot,NIANNIAN_SHOT_REVIEW_OVERLAY_ROOT:overlayRoot,NIANNIAN_STEP02_RUNTIME_ROOT:runtimeRoot,NIANNIAN_MEDIA_PREFLIGHT:'off',NIANNIAN_STEP01_AUTO_EXECUTE:'off'},stdio:['ignore','pipe','pipe'],windowsHide:true});
  child.stdout.on('data',chunk=>logs.push(String(chunk)));child.stderr.on('data',chunk=>logs.push(String(chunk)));
  let browser;
  try{
    await waitHealth(base,child,logs);
    const anonymous=await fetch(base+'/api/projects/'+projectId+'/step02/variants');assert.equal(anonymous.status,401);
    const ownerIsolationRequests = [
      ['GET','/api/projects/'+projectId+'/step01/snapshots/current'],
      ['POST','/api/projects/'+projectId+'/step01/confirm'],
      ['GET','/api/projects/'+projectId+'/step02/variants'],
      ['POST','/api/projects/'+projectId+'/step02/variants'],
      ['GET','/api/projects/'+projectId+'/step02/variants/'+created.variant_id],
      ['POST','/api/projects/'+projectId+'/step02/variants/'+created.variant_id+'/shots/S001/revisions'],
      ['POST','/api/projects/'+projectId+'/step02/variants/'+created.variant_id+'/shots/S001/candidates'],
      ['POST','/api/projects/'+projectId+'/step02/variants/'+created.variant_id+'/shots/S001/adopt'],
      ['POST','/api/projects/'+projectId+'/step02/variants/'+created.variant_id+'/confirm']
    ];
    for (const [method,route] of ownerIsolationRequests) {
      const isolated = await fetch(base+route,{method,headers:{cookie:'niannian_session='+otherToken,'content-type':'application/json'},body:method==='POST'?'{}':undefined});
      assert.equal(isolated.status,404,'owner isolation failed for '+method+' '+route);
    }
    browser=await chromium.launch({headless:true});
    const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});await context.addCookies([{name:'niannian_session',value:token,url:base}]);
    const page=await context.newPage(), errors=[], step01ConfirmPosts=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(request.method()==='POST'&&request.url().includes('/step01/confirm'))step01ConfirmPosts.push(request.url());});
    await page.goto(base+'/#redraw-source-truth/'+projectId,{waitUntil:'domcontentloaded'});
    await page.waitForSelector('[data-source-truth-row="S037"]',{timeout:20000});
    assert.equal(await page.locator('[data-source-truth-row]').count(),37,'source truth must show every verified shot as a fact-ledger row');
    assert.equal(await page.locator('.source-truth-evidence figure').count(),111,'source truth must keep the three source frames for every shot');
    const compactSource=await context.newPage();await compactSource.setViewportSize({width:1366,height:768});await compactSource.goto(base+'/#redraw-source-truth/'+projectId,{waitUntil:'domcontentloaded'});await compactSource.waitForSelector('[data-source-truth-row="S037"]',{timeout:20000});const compactSize=await compactSource.evaluate(()=>({innerWidth,scrollWidth:document.scrollingElement.scrollWidth}));assert.ok(compactSize.scrollWidth<=compactSize.innerWidth,JSON.stringify(compactSize));await compactSource.close();
    const mobileSource=await context.newPage();await mobileSource.setViewportSize({width:390,height:844});await mobileSource.goto(base+'/#redraw-source-truth/'+projectId,{waitUntil:'domcontentloaded'});await mobileSource.waitForSelector('[data-source-truth-row="S037"]',{timeout:20000});const mobileSourceSize=await mobileSource.evaluate(()=>({innerWidth,scrollWidth:document.scrollingElement.scrollWidth}));assert.ok(mobileSourceSize.scrollWidth<=mobileSourceSize.innerWidth,JSON.stringify(mobileSourceSize));await mobileSource.close();
    await page.click('[data-source-truth-primary]');
    await page.waitForURL('**/#redraw/'+projectId+'/stage/02',{timeout:20000});
    await page.waitForSelector('[data-enter-step02-market="es-MX"]',{timeout:20000});
    assert.equal(step01ConfirmPosts.length,0,'matching current Snapshot must be reused instead of POSTing another confirmation');
    assert.equal(await page.locator('[data-enter-step02-market]').count(),3,'Step01 confirmation must land on the market gate');
    let staleSnapshotReads=0, staleConfirmPosts=0;
    const stalePage=await context.newPage();stalePage.on('pageerror',error=>errors.push(error.message));stalePage.on('request',request=>{if(request.method()==='POST'&&request.url().includes('/step01/confirm'))staleConfirmPosts+=1;});
    await stalePage.route('**/api/projects/'+projectId+'/step01/snapshots/current',async route=>{staleSnapshotReads+=1;const upstream=await route.fetch();const payload=await upstream.json();payload.snapshot.shot_review_revision='"stale-test-revision"';await route.fulfill({status:upstream.status(),headers:upstream.headers(),contentType:'application/json',body:JSON.stringify(payload)});});
    await stalePage.goto(base+'/#redraw-source-truth/'+projectId,{waitUntil:'domcontentloaded'});
    await stalePage.waitForSelector('[data-source-truth-primary]',{timeout:20000});
    await stalePage.click('[data-source-truth-primary]');
    await stalePage.waitForURL('**/#redraw/'+projectId+'/stage/02',{timeout:20000});
    assert.equal(staleSnapshotReads,1,'the stale Snapshot interception must exercise the current pointer read');
    assert.equal(staleConfirmPosts,1,'a stale Snapshot must confirm once using the strong application revision even when the proxy ETag is weak');
    await stalePage.close();
    const failurePage=await context.newPage();failurePage.on('pageerror',error=>errors.push(error.message));
    await failurePage.route('**/api/projects/'+projectId+'/step01/snapshots/current',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'STEP01_SNAPSHOT_READ_FAILED',error:'Snapshot 暂时不可读取'})}));
    await failurePage.goto(base+'/#redraw-source-truth/'+projectId,{waitUntil:'domcontentloaded'});
    await failurePage.waitForFunction(()=>document.querySelector('.source-truth-empty')?.textContent.includes('Snapshot 暂时不可读取'),{timeout:20000});
    assert.ok((await failurePage.locator('.source-truth-empty').innerText()).includes('Snapshot 暂时不可读取'),'Snapshot read failures must block the market gate');
    await failurePage.close();
    await page.goto(base+'/#redraw/'+projectId+'/stage/02',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('[data-enter-step02-market="es-MX"]',{timeout:20000});
    assert.equal(await page.locator('[data-enter-step02-market]').count(),3,'legacy Step02 route must be owned by the market gate');
    await page.click('[data-enter-step02-market="es-MX"]');
    await page.waitForURL('**/#redraw/'+projectId+'/stage/02/market/es-MX',{timeout:20000});
    await page.waitForSelector('.step02-shot-card:nth-child(37)',{timeout:20000});
    assert.equal(await page.locator('.step02-shot-card').count(),37);
    assert.equal(await page.locator('.step02-stage .redraw-source-video').count(),0,'Step02 must not include the full source player');
    const text=await page.locator('.step02-stage').innerText();
    ['海外改编','37 镜头海外改编时间轴','原片镜头映射','目标语言对白','中文回译','表达意图','墨西哥'].forEach(value=>assert.ok(text.includes(value),value));
    assert.equal(await page.locator('.step02-shot-card.is-qa-issue').count(),1);
    assert.equal(await page.locator('[data-confirm-step02-variant]').isEnabled(),true,'qa_failed variant must allow explicit re-QA after edits');
    await page.click('[data-step02-shot-id="S010"]');
    assert.ok((await page.locator('.step02-action-notice.is-qa').innerText()).includes('对白不自然'));
    await page.click('[data-edit-step02-shot]');
    assert.equal(await page.locator('[data-step02-draft="source_shot_ids"]').inputValue(),'S010');
    const changed='No voy a permitir que controles mi vida.';
    await page.fill('[data-step02-draft="target_dialogue"]',changed);
    await page.selectOption('[data-step02-draft="review_status"]','accepted');
    await page.click('[data-save-step02-shot]');
    await page.waitForSelector('.step02-localized-editor',{state:'detached',timeout:20000});
    await page.waitForFunction(value=>document.querySelector('.step02-localized-panel')?.textContent.includes(value),changed);
    await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('.step02-shot-card:nth-child(37)',{timeout:20000});await page.click('[data-step02-shot-id="S010"]');
    assert.ok((await page.locator('.step02-localized-panel').innerText()).includes(changed));
    await page.click('[data-open-step02-market]');
    assert.equal(await page.locator('.step02-market-options button').count(),3);
    const modalText=await page.locator('.step02-market-dialog').innerText();['Español (México)','Português (Brasil)','English (United States)'].forEach(value=>assert.ok(modalText.includes(value)));
    await page.click('[data-close-step02-market]');
    const dimensions=await page.evaluate(()=>({innerHeight,scrollHeight:document.scrollingElement.scrollHeight,innerWidth,scrollWidth:document.scrollingElement.scrollWidth}));
    assert.ok(dimensions.scrollHeight<=dimensions.innerHeight,JSON.stringify(dimensions));assert.ok(dimensions.scrollWidth<=dimensions.innerWidth,JSON.stringify(dimensions));
    const mobile=await context.newPage();await mobile.setViewportSize({width:390,height:844});await mobile.goto(base+'/#redraw/'+projectId+'/stage/02/market/es-MX',{waitUntil:'domcontentloaded'});await mobile.waitForSelector('.step02-shot-card:nth-child(37)',{timeout:20000});const mobileSize=await mobile.evaluate(()=>({innerWidth,scrollWidth:document.scrollingElement.scrollWidth}));assert.ok(mobileSize.scrollWidth<=mobileSize.innerWidth,JSON.stringify(mobileSize));await mobile.close();
    assert.deepEqual(errors,[]);
    process.stdout.write(JSON.stringify({ok:true,level:'integrated_http_ui',snapshot:snapshot.snapshot_id,variant:created.variant_id,shots:37,owner_isolation_routes:ownerIsolationRequests.length,snapshot_reused_without_post:true,stale_snapshot_confirmed_once:true,transition_failure_visible:true,qa_failed_edit_and_recheck:true,save_refresh:true,desktop_one_viewport:true,mobile_no_horizontal_overflow:true,market_gate:3,market_modal:3,no_source_player:true})+'\n');
  }finally{
    if(browser)await browser.close();child.kill();await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,2000).unref();});await fsp.rm(temp,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error.stack||error);process.exit(1);});
