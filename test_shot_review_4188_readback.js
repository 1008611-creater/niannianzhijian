'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const {chromium} = require('playwright');

const PROJECT_ID='NN-20260715083045-8120F5';
const RUN_ID='analysis-1-0dc5c5d751592e9fd0656a81';
const USER_ID='USR-942D3E3BEC5115DC';

(async()=>{
  const sessionsPath='data-local/sessions.json',token=crypto.randomBytes(32).toString('hex'),sessionId='shot-review-4188-'+Date.now();
  const sessions=JSON.parse(fs.readFileSync(sessionsPath,'utf8'));
  sessions.push({id:sessionId,userId:USER_ID,tokenHash:crypto.createHash('sha256').update(token).digest('hex'),createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()});
  fs.writeFileSync(sessionsPath,JSON.stringify(sessions,null,2)+'\n');
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
    page.on('pageerror',error=>errors.push(String(error.message||error)));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.context().addCookies([{name:'niannian_session',value:token,url:'http://127.0.0.1:4188'}]);
    const api=await page.request.get('http://127.0.0.1:4188/api/projects/'+PROJECT_ID+'/shot-review?analysis_run_id='+RUN_ID);
    assert.equal(api.status(),200);const model=await api.json();assert.equal(model.shots.length,37);assert.equal(api.headers()['x-shot-review-contract'],'9887052943ef52a0721fb93ccc08acfcad8792de2f1e734bea7dc12387398a25');
    const single=await page.request.get('http://127.0.0.1:4188/api/projects/'+PROJECT_ID+'/shot-review/shots/S001?analysis_run_id='+RUN_ID);assert.equal(single.status(),200);assert.ok(single.headers().etag);
    await page.goto('http://127.0.0.1:4188/#workbench',{waitUntil:'domcontentloaded'});await page.waitForSelector('.workbench-project-card',{timeout:10000});
    const exactCard=page.locator('[data-workbench-project="redraw:'+PROJECT_ID+'"]');
    assert.equal(await exactCard.count(),1,'exact Step01 workbench card missing');
    await exactCard.click();await page.waitForSelector('[data-open-redraw-studio="'+PROJECT_ID+'"]',{timeout:10000});await page.click('[data-open-redraw-studio="'+PROJECT_ID+'"]');
    await page.waitForSelector('.source-review-stage',{timeout:10000});await page.waitForSelector('.source-review-shot:nth-child(37) img',{timeout:10000});
    assert.equal(await page.locator('.source-review-shot').count(),37);const timeline=await page.locator('.source-review-timeline').innerText();assert.ok(timeline.includes('S001')&&timeline.includes('S037'));
    const detail=await page.locator('.source-review-detail-pane').innerText();assert.ok(detail.includes('ForcedAligner')&&detail.includes('PP-OCRv6'));
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({status:'PASS',level:'integrated_backend_plus_existing_read_only_ui_regression',api:{full:200,single:200},ui:{workbench_card:true,shot_timeline:37,detail_evidence:true},manual_revision_ui_enabled:false}));
  }finally{
    await browser.close();const latest=JSON.parse(fs.readFileSync(sessionsPath,'utf8'));fs.writeFileSync(sessionsPath,JSON.stringify(latest.filter(item=>item.id!==sessionId),null,2)+'\n');
  }
})().catch(error=>{console.error(error.stack);process.exit(1);});
