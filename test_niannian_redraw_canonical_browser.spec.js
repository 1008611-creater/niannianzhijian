'use strict';
const {test,expect}=require('playwright/test');
const fs=require('fs/promises');
const os=require('os');
const path=require('path');
const {spawn}=require('child_process');
const dag=require('./bridge/niannian_redraw_canonical_dag');

let child,dataDir,base,cookie,projectId='NN-CANONICAL-BROWSER';
async function start(){
  dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'niannian-canonical-browser-'));
  const port=20000+Math.floor(Math.random()*1000);base='http://127.0.0.1:'+port;
  child=spawn(process.execPath,['server.js'],{cwd:__dirname,env:{...process.env,DATA_DIR:dataDir,PORT:String(port),NIANNIAN_MEDIA_PREFLIGHT:'off'},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('server timeout')),15000);child.stdout.on('data',chunk=>{if(String(chunk).includes('listening')){clearTimeout(timer);resolve();}});});
  const register=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'browser@example.com',password:'test-password-123'})});
  const user=(await register.json()).user;cookie=register.headers.get('set-cookie').split(';')[0].split('=')[1];
  const canonical=dag.resolveCanonicalState({legacy:{step:'Step02'},authority_revision:'revision-browser',current_authority_revision:'revision-browser',input_contract:{S01_EVIDENCE:true},output_contract:{accepted:true,artifact_ledger_verified:true}});
  await fs.writeFile(path.join(dataDir,'projects.json'),JSON.stringify([{id:projectId,ownerId:user.id,name:'七阶段验收项目',status:'running',productionStatus:'step02_accepted',createdAt:new Date().toISOString(),source:{originalName:'source.mp4',mimeType:'video/mp4',bytes:12,sha256:'b'.repeat(64),storedPath:'C:/internal/source.mp4'},analysis:{status:'completed',runId:'revision-browser'},runtime:{productionStatus:'step02_accepted',currentNode:'Step04',earliestIncompleteNode:'Step04',nextAction:'provider receipt internal',controllerId:'internal'},canonical}],null,2)+'\n');
}
test.beforeAll(start);
test.afterAll(async()=>{if(child&&child.exitCode===null){child.kill();await new Promise(resolve=>child.once('exit',resolve));}if(dataDir)await fs.rm(dataDir,{recursive:true,force:true});});

for(const viewport of [{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844}]){
  test('七个中文阶段与安全投影 - '+viewport.name,async({browser})=>{
    const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height}});
    await context.addCookies([{name:'niannian_session',value:cookie,url:base}]);
    const page=await context.newPage();
    await page.goto(base+'/#redraw/'+encodeURIComponent(projectId)+'/Step04');
    await expect(page.locator('.redraw-flow-stepper')).toBeVisible();
    const labels=await page.locator('.redraw-flow-step strong').allTextContents();
    expect(labels).toEqual(['原片分析','原片时间轴','地区改编','资产与首帧','视频生成','质量核验','可交付']);
    await expect(page).toHaveURL(new RegExp('#redraw/'+projectId+'/stage/03$'));
    const visible=await page.locator('body').innerText();
    expect(visible).not.toMatch(/Step\s*0?[1-5]|S0[1245]_|provider|receipt|controller|lease|token|[a-f0-9]{64}/i);
    const beforeFutureClick=page.url();
    await expect(page.locator('[data-redraw-studio-stage="07"]')).toBeDisabled();
    await page.locator('[data-redraw-studio-stage="07"]').evaluate(button=>button.click());
    await expect(page).toHaveURL(beforeFutureClick);
    await expect(page.locator('[data-redraw-studio-stage="03"]')).toHaveClass(/is-active/);
    await page.reload();
    await expect(page.locator('[data-redraw-studio-stage="03"]')).toHaveClass(/is-active/);
    await context.close();
  });
}
