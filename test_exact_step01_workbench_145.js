const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const root = __dirname;
const projectId = 'NN-20260715083045-8120F5';
const analysisRunId = 'analysis-1-0dc5c5d751592e9fd0656a81';
const sourceSha256 = 'a46f74392e2b3f7ec813b4eba5a0cd9756a7c30225e0033fd671d2cab21cd30c';
const contractSha256 = '9887052943ef52a0721fb93ccc08acfcad8792de2f1e734bea7dc12387398a25';
const sessionsPath = path.join(root, 'data-local', 'sessions.json');
const evidenceRoot = path.join(root, 'data-local', 'step01-evidence', projectId, 'EP001');

function directoryDigest(directory) {
  const hash = crypto.createHash('sha256');
  const visit = current => {
    for (const entry of fs.readdirSync(current, {withFileTypes:true}).sort((a,b) => a.name.localeCompare(b.name))) {
      const file = path.join(current, entry.name);
      const relative = path.relative(directory, file).split(path.sep).join('/');
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) {
        hash.update(relative + '\0');
        hash.update(fs.readFileSync(file));
      }
    }
  };
  visit(directory);
  return hash.digest('hex');
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForServer(url, processHandle, logs) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) throw new Error('隔离 4188 服务提前退出：' + logs.join(''));
    try {
      const response = await fetch(url + '/api/health');
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('隔离镜头核对服务启动超时：' + logs.join(''));
}

function revisionFor(shot, {revisionId, baseRevision, patch}) {
  return {
    schema_version:'niannian.shot_revision_overlay.v1',
    project_id:projectId,
    analysis_run_id:analysisRunId,
    shot_id:shot.shot_id,
    base_revision:baseRevision,
    revision_id:revisionId,
    actor_type:'human',
    actor_id:'USR-942D3E3BEC5115DC',
    changed_fields:Object.keys(patch),
    patch,
    source_evidence_binding:{
      source_sha256:sourceSha256,
      analysis_run_id:analysisRunId,
      shot_id:shot.shot_id,
      start_sec:shot.start_sec,
      end_sec:shot.end_sec,
      frame_sha256:['start','mid','end'].map(point => shot.frames[point].sha256)
    },
    candidate_request_id:null,
    created_at:new Date().toISOString()
  };
}

(async () => {
  const token = crypto.randomBytes(32).toString('hex');
  const sessionId = crypto.randomBytes(12).toString('hex');
  const unique = sessionId.slice(0, 8);
  const originalEvidenceDigest = directoryDigest(evidenceRoot);
  const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'niannian-shot-review-ui-'));
  const overlayRoot = path.join(isolatedRoot, 'overlays');
  fs.mkdirSync(path.join(root,'output','playwright'), {recursive:true});
  const port = await freePort();
  const baseUrl = 'http://127.0.0.1:' + port;
  const serverLogs = [];
  const server = spawn(process.execPath, ['server.js'], {
    cwd:root,
    env:{...process.env,PORT:String(port),DATA_DIR:path.join(root,'data-local'),NIANNIAN_SHOT_REVIEW_OVERLAY_ROOT:overlayRoot},
    stdio:['ignore','pipe','pipe'],
    windowsHide:true
  });
  server.stdout.on('data', chunk => serverLogs.push(String(chunk)));
  server.stderr.on('data', chunk => serverLogs.push(String(chunk)));

  const sessions = JSON.parse(fs.readFileSync(sessionsPath, 'utf8'));
  sessions.push({
    id:sessionId,
    userId:'USR-942D3E3BEC5115DC',
    tokenHash:crypto.createHash('sha256').update(token).digest('hex'),
    createdAt:new Date().toISOString(),
    expiresAt:new Date(Date.now() + 60 * 60 * 1000).toISOString()
  });
  fs.writeFileSync(sessionsPath, JSON.stringify(sessions, null, 2) + '\n');

  let browser;
  try {
    await waitForServer(baseUrl, server, serverLogs);
    browser = await chromium.launch({headless:true});
    const context = await browser.newContext({viewport:{width:1440,height:900}});
    await context.addCookies([{name:'niannian_session',value:token,url:baseUrl}]);
    const page = await context.newPage();
    const browserErrors = [];
    const shotReviewResponses = [];
    const apiRequests = [];
    page.on('pageerror', error => browserErrors.push(String(error.message || error)));
    page.on('console', message => {
      const text = message.text();
      if (message.type() === 'error' && !/status of 409 \(Conflict\)/.test(text)) browserErrors.push(text);
    });
    page.on('request', request => { if (request.url().includes('/api/')) apiRequests.push(request.url()); });
    page.on('response', async response => {
      if (response.url().includes('/shot-review')) shotReviewResponses.push({url:response.url(),status:response.status(),contract:await response.headerValue('X-Shot-Review-Contract')});
    });

    const sessionResponse = await page.request.get(baseUrl + '/api/auth/session');
    assert.strictEqual(sessionResponse.status(), 200);
    assert.strictEqual((await sessionResponse.json()).user?.email, '1453637677@qq.com');

    await page.goto(baseUrl + '/#redraw/' + projectId + '/stage/01', {waitUntil:'domcontentloaded'});
    await page.waitForSelector('.source-review-shot:nth-child(37) img', {timeout:20000});
    assert.ok(shotReviewResponses.some(item => item.url.includes('/shot-review?analysis_run_id=') && item.status === 200 && item.contract === contractSha256));
    assert.ok(!apiRequests.some(url => url.includes('/step01-evidence')), 'exact Step01 页面不得回退到旧 evidence 投影');
    assert.strictEqual(await page.locator('.source-review-shot').count(), 37);
    const stageText = await page.locator('.source-review-stage').innerText();
    ['37 镜头','13 对白','34 OCR','完整 37 镜头时间轴'].forEach(text => assert.ok(stageText.includes(text), text));
    ['Mac 控制面','Artifact 传输','Runtime','Provider','自动恢复','转绘任务参数','路由决策'].forEach(text => assert.ok(!stageText.includes(text), text));

    await page.click('[data-source-facts-shot-id="S010"]');
    await page.waitForFunction(() => document.querySelector('.source-review-current-label')?.textContent === 'S010');
    const shot10StartMs = Number(await page.locator('[data-source-facts-shot-id="S010"]').getAttribute('data-start-ms'));
    const currentTimeAfterClick = await page.locator('.redraw-source-video').evaluate(video => video.currentTime);
    assert.ok(Math.abs(currentTimeAfterClick - shot10StartMs / 1000) < 0.15);
    const widths = [];
    for (let index = 0; index < 3; index += 1) widths.push(await page.locator('.source-review-frame-triad img').nth(index).evaluate(img => img.naturalWidth));
    assert.deepStrictEqual(widths, [1080,1080,1080]);

    const sceneProof = '室内走廊 · UI 保存刷新验证 ' + unique;
    await page.click('[data-edit-source-review]');
    await page.waitForSelector('[data-source-review-editor="S010"]');
    await page.fill('[data-source-review-draft="scene"]', sceneProof);
    await page.selectOption('[data-source-review-draft="review_status"]', 'accepted');
    await page.click('[data-save-source-review]');
    await page.waitForSelector('.source-review-saved-note', {timeout:10000});
    assert.ok((await page.locator('.source-review-detail-pane').innerText()).includes(sceneProof));

    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForSelector('.source-review-shot:nth-child(37) img', {timeout:20000});
    await page.click('[data-source-facts-shot-id="S010"]');
    await page.waitForFunction(() => document.querySelector('.source-review-current-label')?.textContent === 'S010');
    assert.ok((await page.locator('.source-review-detail-pane').innerText()).includes(sceneProof));

    const actionDraft = '人物向门口转身 · 冲突草稿 ' + unique;
    await page.click('[data-edit-source-review]');
    await page.waitForSelector('[data-source-review-editor="S010"]');
    await page.fill('[data-source-review-draft="action"]', actionDraft);

    const singleUrl = baseUrl + '/api/projects/' + projectId + '/shot-review/shots/S010?analysis_run_id=' + analysisRunId;
    const externalRead = await page.request.get(singleUrl);
    assert.strictEqual(externalRead.status(), 200);
    const externalEtag = externalRead.headers().etag;
    const externalShot = (await externalRead.json()).shot;
    const externalRevision = revisionFor(externalShot, {
      revisionId:'rev-S010-external-' + unique,
      baseRevision:externalShot.active_revision,
      patch:{camera:{summary:'固定机位 · 并发版本 ' + unique}}
    });
    const externalWrite = await page.request.post(baseUrl + '/api/projects/' + projectId + '/shot-review/shots/S010/revisions', {
      headers:{'Content-Type':'application/json','If-Match':externalEtag},
      data:externalRevision
    });
    assert.strictEqual(externalWrite.status(), 201);

    await page.click('[data-save-source-review]');
    await page.waitForSelector('.source-review-save-message.is-conflict', {timeout:10000});
    assert.strictEqual(await page.locator('[data-source-review-draft="action"]').inputValue(), actionDraft);
    await page.screenshot({path:path.join(root,'output','playwright','step01-source-review-conflict-1440x900.png'),fullPage:false});
    await page.click('[data-rebase-source-review]');
    await page.click('[data-save-source-review]');
    await page.waitForSelector('.source-review-saved-note', {timeout:10000});

    const finalRead = await page.request.get(singleUrl);
    assert.strictEqual(finalRead.status(), 200);
    const finalPayload = await finalRead.json();
    assert.strictEqual(finalPayload.shot.scene.summary, sceneProof);
    assert.strictEqual(finalPayload.shot.action.summary, actionDraft);
    assert.strictEqual(finalPayload.shot.camera.summary, '固定机位 · 并发版本 ' + unique);
    assert.strictEqual(finalPayload.revision_history.length, 3);

    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForSelector('.source-review-shot:nth-child(37) img', {timeout:20000});
    await page.click('[data-source-facts-shot-id="S010"]');
    const refreshedText = await page.locator('.source-review-detail-pane').innerText();
    assert.ok(refreshedText.includes(sceneProof));
    assert.ok(refreshedText.includes(actionDraft));
    const dimensions = await page.evaluate(() => ({innerHeight,scrollHeight:document.scrollingElement.scrollHeight,bodyScrollHeight:document.body.scrollHeight,scrollWidth:document.scrollingElement.scrollWidth,innerWidth}));
    assert.ok(dimensions.scrollHeight <= dimensions.innerHeight, JSON.stringify(dimensions));
    assert.ok(dimensions.bodyScrollHeight <= dimensions.innerHeight, JSON.stringify(dimensions));
    assert.ok(dimensions.scrollWidth <= dimensions.innerWidth, JSON.stringify(dimensions));
    await page.screenshot({path:path.join(root,'output','playwright','step01-source-review-save-refresh-1440x900.png'),fullPage:false});

    const mobile = await context.newPage();
    await mobile.setViewportSize({width:390,height:844});
    await mobile.goto(baseUrl + '/#redraw/' + projectId + '/stage/01', {waitUntil:'domcontentloaded'});
    await mobile.waitForSelector('.source-review-shot:nth-child(37) img', {timeout:20000});
    await mobile.click('[data-source-facts-shot-id="S010"]');
    await mobile.click('[data-edit-source-review]');
    await mobile.waitForSelector('[data-source-review-editor="S010"]');
    const mobileDimensions = await mobile.evaluate(() => ({innerWidth,scrollWidth:document.scrollingElement.scrollWidth,stageWidth:document.querySelector('.source-review-stage')?.getBoundingClientRect().width}));
    assert.ok(mobileDimensions.scrollWidth <= mobileDimensions.innerWidth, JSON.stringify(mobileDimensions));
    assert.ok(mobileDimensions.stageWidth <= mobileDimensions.innerWidth + 0.5, JSON.stringify(mobileDimensions));
    await mobile.screenshot({path:path.join(root,'output','playwright','step01-source-review-edit-390x844.png'),fullPage:false});
    await mobile.close();

    assert.deepStrictEqual(browserErrors, []);
    assert.ok(!apiRequests.some(url => url.includes('/reanalysis')), '未开放的 AI 单镜头重分析不得发出请求');
    assert.strictEqual(directoryDigest(evidenceRoot), originalEvidenceDigest);
    console.log(JSON.stringify({status:'PASS',level:'integrated_frontend',shots:37,save_readback:true,refresh_readback:true,conflict_draft_preserved:true,rebase_save:true,desktop_one_viewport:true,mobile_no_horizontal_overflow:true,evidence_immutable:true}));
  } finally {
    if (browser) await browser.close();
    const latestSessions = JSON.parse(fs.readFileSync(sessionsPath, 'utf8'));
    fs.writeFileSync(sessionsPath, JSON.stringify(latestSessions.filter(session => session.id !== sessionId), null, 2) + '\n');
    server.kill();
    await new Promise(resolve => {
      if (server.exitCode !== null) return resolve();
      server.once('exit', resolve);
      setTimeout(resolve, 3000).unref();
    });
    fs.rmSync(isolatedRoot, {recursive:true,force:true});
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
