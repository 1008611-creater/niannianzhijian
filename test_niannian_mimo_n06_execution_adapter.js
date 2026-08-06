'use strict';
const assert = require('assert');
const {execFile} = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const adapter = require('./bridge/niannian_mimo_n06_execution_adapter');

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
async function main() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-mimo-n06-execution-'));
  try {
    const referencePath = path.join(root, 'confirmed-frame.png');
    const referenceBytes = Buffer.from('confirmed-reference');
    await fsp.writeFile(referencePath, referenceBytes);
    const statusPath = path.join(root, 'mimo-status.json');
    const expiresAt = new Date(Date.now() + 60000).toISOString();
    await fsp.writeFile(statusPath, JSON.stringify({capabilities:{'credential:mimo_8001_session':{status:'ready',expires_at:expiresAt},'channel:mimo_8001_nonbillable_preflight':{status:'ready',expires_at:expiresAt}}}));
    const spec = {transaction_id:'N06INT-TEST-0001',provider:'mimo',execution_mode:'real_submit_v1',group_id:'V001',duration_sec:11,aspect_ratio:'9:16',quality_decision_token:'keep_720p_hard_gate',prompt:{text:'locked prompt',sha256:hash('locked prompt')},references:[{uploadEligible:true,path:referencePath,sha256:hash(referenceBytes),duty:'首帧'}]};
    const planned = await adapter.runExecution(spec, {statusPath, env:{}});
    assert.equal(planned.network_called, false);
    const specPath = path.join(root, 'spec.json');
    await fsp.writeFile(specPath, JSON.stringify(spec));
    const cli = await new Promise((resolve, reject) => execFile(process.execPath, [path.join(__dirname, 'bridge', 'niannian_mimo_n06_execution_adapter.js'), '--spec', specPath], (error, stdout, stderr) => error ? reject(new Error(stderr)) : resolve(JSON.parse(stdout))));
    assert.equal(cli.mode, 'plan_only');
    assert.equal(cli.network_called, false);
    const calls = [];
    const fetchImpl = async (url, init = {}) => {
      const target = String(url);
      calls.push({target, method:init.method || 'GET'});
      const json = data => ({ok:true,status:200,text:async()=>JSON.stringify({code:200,data}),arrayBuffer:async()=>Buffer.from('fake-mp4')});
      if (target.endsWith('/api/auth/verify')) return json({username:'redacted'});
      if (target.endsWith('/api/video/upload-apply')) return json({uploadUrl:'https://upload.invalid/reference',uploadHeaders:{},sessionKey:'session',storeUri:'uri',fileType:'image'});
      if (target === 'https://upload.invalid/reference') { assert.equal(init.headers['content-crc32'], adapter.crc32Hex(referenceBytes)); return {ok:true,status:200,text:async()=>'',arrayBuffer:async()=>Buffer.alloc(0)}; }
      if (target.endsWith('/api/video/upload-commit')) return json({imageUri:'uri',imageUrl:'https://image.invalid/ref'});
      if (target.endsWith('/api/video/generate')) return json({id:'mimo-task-001'});
      if (target.endsWith('/api/video/batch-status')) return json([{taskId:'mimo-task-001',status:1,videoUrl:'https://media.invalid/v.mp4'}]);
      if (target === 'https://media.invalid/v.mp4') return {ok:true,status:200,text:async()=>'',arrayBuffer:async()=>Buffer.from('fake-mp4')};
      throw new Error('unexpected_url');
    };
    const result = await adapter.runExecution(spec, {execute:true,confirmTransaction:spec.transaction_id,env:{NIANNIAN_N06_REAL_MIMO_EXECUTION:'on'},statusPath,getToken:async()=> 'never-output-token',fetchImpl,outputRoot:path.join(root,'output'),execFileImpl:(command,args,opts,done)=>done(null,JSON.stringify({streams:[{codec_type:'video',width:720,height:1280}],format:{duration:'11'}}),'' )});
    assert.equal(result.status, 'blocked_quality_review');
    assert.equal(result.provider_task_id, 'mimo-task-001');
    assert.equal(result.uploaded_reference_count, 1);
    assert.equal(result.provider_submit_requested, true);
    assert.equal(result.downloads_requested, true);
    assert.equal(result.ffprobe.width, 720);
    assert(!JSON.stringify(result).includes('never-output-token'));
    assert(calls.some(call => call.target.endsWith('/api/video/generate')));
    assert(calls.some(call => call.target.endsWith('/api/video/batch-status')));
    process.stdout.write(JSON.stringify({ok:true,verified:['explicit execution gate','Keychain token remains private','current Mimo upload apply commit contract','generate poll download flow','ffprobe hard gate','human visual QA remains required']}) + '\n');
  } finally { await fsp.rm(root, {recursive:true,force:true}); }
}
main().catch(error => { process.stderr.write(String(error.stack || error) + '\n'); process.exitCode = 1; });
