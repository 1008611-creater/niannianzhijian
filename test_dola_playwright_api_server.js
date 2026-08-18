'use strict';

const assert = require('node:assert/strict');
const {createDolaPlaywrightApiServer} = require('./bridge/niannian_dola_playwright_api_server');

(async () => {
  let prepared = null;
  const fake = {
    preflight: async () => ({ready:true,seedance25:true,fileInputs:3,editableAreas:1,browser:{close:async()=>{}}}),
    prepare: async options => { prepared = options; return {browser:{close:async()=>{}},page:{},pageUrl:'https://www.dola.com/chat/create-video',counts:{image:1,audio:0,video:0}}; },
    submit: async () => ({pageUrl:'https://www.dola.com/chat/create-video'})
  };
  const bridge = createDolaPlaywrightApiServer({controller:fake});
  const server = await bridge.listen(19191);
  try {
    const health = await fetch('http://127.0.0.1:19191/api/v1/capabilities');
    const capabilities = await health.json();
    assert.equal(capabilities.ready, true);
    assert.equal(capabilities.seedance_2_5_available, true);
    const missing = await fetch('http://127.0.0.1:19191/v1/jobs', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({prompt:'测试',durationSeconds:30,confirmProviderSpend:false})});
    assert.equal(missing.status, 422);
    const queued = await fetch('http://127.0.0.1:19191/v1/jobs', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({prompt:'测试',aspectRatio:'16:9',durationSeconds:30,assets:[{kind:'reference_image',path:'C:\\temp\\ref.png'}],confirmProviderSpend:true})});
    const body = await queued.json();
    assert.equal(queued.status, 202);
    assert.match(body.job_id, /^DOLA-[a-f0-9]{24}$/);
    assert.equal(prepared.aspectRatio, '16:9');
    assert.match(prepared.prompt, /^【强制约束】/);
    const status = await fetch('http://127.0.0.1:19191/v1/jobs/' + body.job_id);
    assert.equal((await status.json()).status, 'queued');
    console.log('DOLA_PLAYWRIGHT_API_SERVER_CONTRACT_OK');
  } finally { await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
