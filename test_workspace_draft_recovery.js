'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = fs.promises;
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {chromium} = require('playwright');
const JSZip = require('jszip');

const root = __dirname;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForHealth(baseUrl) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(baseUrl + '/api/health');
      const payload = await response.json();
      if (response.ok && payload.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error('draft_recovery_server_health_timeout');
}

async function register(baseUrl) {
  const response = await fetch(baseUrl + '/api/auth/register', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email:'draft-' + Date.now() + '@example.com', password:'correct-horse-battery-staple'})
  });
  const payload = await response.json();
  assert([200, 201].includes(response.status), 'expected successful local registration');
  const cookie = String(response.headers.get('set-cookie') || '').split(';')[0];
  const match = /^niannian_session=([^;]+)$/.exec(cookie);
  assert(match, 'expected local session cookie');
  return match[1];
}

async function createDocxFixture(paragraphs) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + paragraphs.map(text => '<w:p><w:r><w:t>' + text + '</w:t></w:r></w:p>').join('') + '<w:sectPr/></w:body></w:document>');
  return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
}

async function main() {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-draft-recovery-'));
  const port = 23000 + crypto.randomInt(1000);
  const baseUrl = 'http://127.0.0.1:' + port;
  const server = spawn(process.execPath, [path.join(root, 'server.js')], {
    cwd:root,
    env:{...process.env, PORT:String(port), DATA_DIR:path.join(tempRoot, 'data'), NIANNIAN_LOCAL_PREVIEW_INSECURE_SESSION:'on', NIANNIAN_MEDIA_PREFLIGHT:'off', NIANNIAN_N05_REGENERATION_AUTOSTART:'off', ZHUANHUI_WORKSPACE:tempRoot},
    stdio:['ignore', 'ignore', 'ignore']
  });
  let browser = null;
  try {
    await waitForHealth(baseUrl);
    const session = await register(baseUrl);
    browser = await chromium.launch({headless:true});
    const context = await browser.newContext();
    await context.addCookies([{name:'niannian_session', value:session, domain:'127.0.0.1', path:'/'}]);
    const page = await context.newPage();
    await page.goto(baseUrl + '/#workbench', {waitUntil:'domcontentloaded'});
    const openScriptWizard = page.locator('[data-view-panel="workbench"] .workbench-header .workbench-card-action[data-open-script-drama-wizard]');
    await openScriptWizard.waitFor({state:'visible'});
    assert.equal(await openScriptWizard.count(), 1);
    await openScriptWizard.click();
    const form = page.locator('#scriptDramaCreateForm');
    await page.waitForFunction(() => document.activeElement?.getAttribute('name') === 'name');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('name')), 'name');
    await page.keyboard.press('Escape');
    await form.waitFor({state:'hidden'});
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-open-script-drama-wizard') === '');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-open-script-drama-wizard')), '', await page.evaluate(() => document.activeElement?.outerHTML || 'no_active_element'));
    await openScriptWizard.click();
    await form.locator('[name="name"]').fill('会话草稿恢复回归');
    await form.locator('[name="audience"]').fill('创作审核用户');
    await form.locator('[name="sourceText"]').fill('这是只保存在当前浏览器会话中的草稿文本。'.repeat(10));
    await page.reload({waitUntil:'domcontentloaded'});
    await openScriptWizard.waitFor({state:'visible'});
    assert.equal(await openScriptWizard.count(), 1);
    await openScriptWizard.click();
    assert.equal(await form.locator('[name="name"]').inputValue(), '会话草稿恢复回归');
    assert.equal(await form.locator('[name="audience"]').inputValue(), '创作审核用户');
    assert.equal(await form.locator('[name="sourceText"]').inputValue(), '这是只保存在当前浏览器会话中的草稿文本。'.repeat(10));
    assert.equal(await form.locator('[name="rightsConfirmed"]').isChecked(), false);
    assert.equal(await form.locator('[name="sourceDocument"]').inputValue(), '');
    const closeScriptWizard = page.locator('#scriptDramaWizard .wizard-close');
    assert.equal(await closeScriptWizard.count(), 1);
    await closeScriptWizard.click();
    const openRedrawWizard = page.locator('[data-view-panel="workbench"] .workbench-header .workbench-text-action[data-open-project-wizard]');
    assert.equal(await openRedrawWizard.count(), 1);
    await openRedrawWizard.click();
    const redrawForm = page.locator('#projectCreateForm');
    await page.waitForFunction(() => document.activeElement?.getAttribute('name') === 'name');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('name')), 'name');
    await redrawForm.locator('[name="name"]').fill('转绘会话草稿恢复回归');
    await redrawForm.locator('[name="notes"]').fill('仅用于浏览器会话草稿恢复验证。');
    const redrawDraftBeforeReload = await page.evaluate(() => {
      const key = Object.keys(sessionStorage).find(item => item.includes(':redraw-project'));
      return key ? JSON.parse(sessionStorage.getItem(key)).values : null;
    });
    assert.deepEqual(redrawDraftBeforeReload, {
      name:'转绘会话草稿恢复回归',
      notes:'仅用于浏览器会话草稿恢复验证。'
    });
    await page.reload({waitUntil:'domcontentloaded'});
    await openRedrawWizard.waitFor({state:'visible'});
    await openRedrawWizard.click();
    assert.equal(await redrawForm.locator('[name="name"]').inputValue(), '');
    const resumeRedrawDraft=redrawForm.locator('[data-resume-redraw-draft]');
    assert.equal(await resumeRedrawDraft.isVisible(),true);
    await resumeRedrawDraft.click();
    assert.equal(await redrawForm.locator('[name="name"]').inputValue(), '转绘会话草稿恢复回归');
    assert.equal(await redrawForm.locator('[name="notes"]').inputValue(), '仅用于浏览器会话草稿恢复验证。');
    assert.equal(await redrawForm.locator('[name="rightsConfirmed"]').isChecked(), false);
    assert.equal(await redrawForm.locator('[name="sourceVideo"]').inputValue(), '');
    await page.keyboard.press('Escape');
    await redrawForm.waitFor({state:'hidden'});
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-open-project-wizard') === '');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-open-project-wizard')), '', await page.evaluate(() => document.activeElement?.outerHTML || 'no_active_element'));

    const browserDocx = await createDocxFixture([
      '第一章：林晚在雨夜走出民政局，掌心里攥着婚戒。顾言撑伞站在路边，告诉她车已经等好了。城市霓虹落进积水，她没有回头，只问接下来去哪里。',
      '顾言说先去查清那份解约通知。林晚看着被雨水打湿的玻璃门，决定不再等任何人的解释，而是亲自拿回属于自己的生活。'
    ]);
    await openScriptWizard.click();
    await form.locator('[name="name"]').fill('浏览器可恢复上传验证');
    await form.locator('[name="audience"]').fill('短剧用户');
    const documentInput = form.locator('[name="sourceDocument"]');
    assert.equal(await documentInput.count(), 1);
    await documentInput.setInputFiles({name:'browser-resumable.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:browserDocx});
    await form.locator('[name="rightsConfirmed"]').check();
    const submitScript = form.locator('[type="submit"]');
    assert.equal(await submitScript.count(), 1);
    await submitScript.click();
    await form.waitFor({state:'hidden'});
    await page.locator('[data-workbench-project]').waitFor({state:'visible'});
    assert.equal(await page.locator('[data-workbench-project]').count(), 1);
    assert.match(await page.locator('[data-workbench-project]').innerText(), /浏览器可恢复上传验证/);
    await context.close();
    await browser.close();
    browser = null;
    console.log(JSON.stringify({ok:true, verified:['temporary-owner session draft reload', 'script text and settings recovery', 'redraw text and settings recovery', 'wizard initial focus', 'Escape closes each wizard and returns focus to its trigger', 'no rights confirmation persistence', 'no file persistence', 'browser Word resumable-upload project creation']}));
  } finally {
    if (browser) await browser.close();
    server.kill();
    await fsp.rm(tempRoot, {recursive:true, force:true});
  }
}

main().catch(error => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
