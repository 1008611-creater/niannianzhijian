'use strict';

const assert=require('assert/strict');
const fs=require('fs');
const fsp=fs.promises;
const http=require('http');
const os=require('os');
const path=require('path');
const {chromium}=require('playwright');
const clean=require('./bridge/niannian_step02_clean_handoff');
const fixture=require('./tests/fixtures/step02_clean_handoff_fixture');

const frontendRoot=path.join(__dirname,'verification_frontend');
const evidenceRoot=path.join(__dirname,'docs','agent-team','niannian-step02-clean-handoff','evidence');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8'};

async function startServer(projectionPath,port=0){
  const server=http.createServer(async(request,response)=>{
    try{
      if(request.url==='/projection.json'){response.writeHead(200,{'Content-Type':types['.json'],'Cache-Control':'no-store'});response.end(await fsp.readFile(projectionPath));return;}
      const name=request.url==='/'?'step02-clean-handoff-candidate.html':String(request.url||'').replace(/^\//,'');
      if(!/^step02-clean-handoff-candidate\.(?:html|css|js)$/.test(name)){response.writeHead(404);response.end();return;}
      const file=path.join(frontendRoot,name);response.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-store'});response.end(await fsp.readFile(file));
    }catch(caught){response.writeHead(500);response.end(caught.message);}
  });
  await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
  return server;
}

async function stopServer(server){await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}

async function assertPage(page){
  await page.waitForSelector('[data-source-row="S037"]');
  assert.equal(await page.locator('[data-source-row]').count(),37);
  const dimensions=await page.evaluate(()=>({innerWidth,scrollWidth:document.documentElement.scrollWidth,bodyScrollWidth:document.body.scrollWidth}));
  assert.ok(dimensions.scrollWidth<=dimensions.innerWidth,JSON.stringify(dimensions));assert.ok(dimensions.bodyScrollWidth<=dimensions.innerWidth,JSON.stringify(dimensions));
  const text=await page.locator('body').innerText();
  for(const required of ['正在整理镜头事实','37 / 37','红裙女主','床上通话女性','关键可读文字','困难镜头','候选分析'])assert.ok(text.includes(required),required);
  for(const forbidden of ['provider','SHA','task id','thread id','receipt','token','内部推理','speaker_unknown','待确认','已接受'])assert.ok(!text.toLowerCase().includes(forbidden.toLowerCase()),forbidden);
}

async function main(){
  const {candidate,authority}=fixture.candidateFixture();
  assert.equal(clean.validateCleanHandoff(candidate,{currentAuthority:authority.binding,ledgerShots:authority.ledger.shots,evidenceWindows:authority.evidenceWindows}),true);
  const projection=clean.buildWebsiteProjection(candidate);
  const durableRoot=await fsp.mkdtemp(path.join(os.tmpdir(),'step02-ui-projection-')),projectionPath=path.join(durableRoot,'projection.json');
  await fsp.writeFile(projectionPath,JSON.stringify(projection,null,2)+'\n');
  await fsp.mkdir(evidenceRoot,{recursive:true});
  let server=await startServer(projectionPath);const port=server.address().port;
  const browser=await chromium.launch({headless:true}),results=[];
  try{
    for(const viewport of [{width:1440,height:900},{width:1366,height:768},{width:390,height:844}]){
      const context=await browser.newContext({viewport,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
      page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});page.on('pageerror',caught=>errors.push(caught.message));
      await page.goto('http://127.0.0.1:'+port+'/',{waitUntil:'networkidle'});await assertPage(page);
      await page.reload({waitUntil:'networkidle'});await assertPage(page);
      assert.deepEqual(errors,[]);
      const screenshot=path.join(evidenceRoot,'step02-candidate-'+viewport.width+'x'+viewport.height+'.png');await page.screenshot({path:screenshot,fullPage:true});
      results.push({viewport,rows:37,reload_rows:37,no_horizontal_overflow:true,screenshot:path.relative(__dirname,screenshot).replace(/\\/g,'/')});await context.close();
    }
    await stopServer(server);server=null;
    server=await startServer(projectionPath,port);
    const context=await browser.newContext({viewport:{width:1366,height:768},serviceWorkers:'block'}),page=await context.newPage();await page.goto('http://127.0.0.1:'+port+'/',{waitUntil:'networkidle'});await assertPage(page);await context.close();
    const frontendSource=await fsp.readFile(path.join(frontendRoot,'step02-clean-handoff-candidate.js'),'utf8');assert.ok(frontendSource.includes("fetch('/projection.json'"));assert.ok(!frontendSource.includes('Array.from({length:37}'));
    process.stdout.write(JSON.stringify({ok:true,level:'phase_a_local_candidate_ui',projection_path:'durable_fixture_json',restart_rebuilt_rows:37,results,production_login:false,public_runtime:false})+'\n');
  }finally{await browser.close();if(server)await stopServer(server);await fsp.rm(durableRoot,{recursive:true,force:true});}
}

main().catch(error=>{process.stderr.write(error.stack+'\n');process.exitCode=1;});
