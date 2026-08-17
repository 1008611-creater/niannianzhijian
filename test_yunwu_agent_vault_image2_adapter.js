'use strict';

const assert = require('assert/strict');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const {createYunwuAgentVaultImage2Adapter} = require('./bridge/niannian_yunwu_agent_vault_image2_adapter');

async function run() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-yunwu-agent-vault-'));
  try {
    const env = {AGENT_VAULT_ADDR:'http://127.0.0.1:14321',AGENT_VAULT_VAULT:'niannian-production',AGENT_VAULT_TOKEN:'protected-test-token',HTTPS_PROXY:'http://127.0.0.1:14322'};
    let editArgs = null;
    const adapter = createYunwuAgentVaultImage2Adapter({env, tempRoot:root, run:async (_python, args) => {
      if (args.includes('edit')) editArgs = args;
      const receiptPath = args[args.indexOf('--receipt') + 1];
      if (args.includes('--submit')) {
        const outputPath = args[args.indexOf('--output') + 1];
        await fsp.writeFile(outputPath, await sharp({create:{width:16,height:24,channels:4,background:{r:1,g:2,b:3,alpha:1}}}).png().toBuffer());
      }
      await fsp.writeFile(receiptPath, '{"status":"accepted_dimensions"}');
      return {code:0};
    }});
    assert.equal((await adapter.dryRun({prompt:'预检',output_size:'2160x3840'}, [])).payload.model, 'gpt-image-2-c');
    const editPreflight = await adapter.dryRun({prompt:'预检',image_channel:'yunwu-gpt-image-2-c-edit',output_size:'3840x2160'}, ['reference.png']);
    assert.equal(editPreflight.payload.operation, 'edit');
    await assert.rejects(() => adapter.dryRun({prompt:'预检',image_channel:'yunwu-gpt-image-2-c-edit',output_size:'2160x3840'}, ['reference.png']), error => error.code === 'YUNWU_OUTPUT_SIZE_INVALID');
    const submitted = await adapter.submit({prompt:'三维国风角色',output_size:'2160x3840'}, []);
    const result = await adapter.query(submitted.taskId, submitted.payload);
    assert.equal(result.status, 'completed');
    assert.equal(result.inlineImages.length, 1);
    const edited = await adapter.submit({prompt:'三维国风角色横版设定',image_channel:'yunwu-gpt-image-2-c-edit',output_size:'3840x2160'}, ['reference.png']);
    assert.equal(editArgs.includes('--reference-image'), true);
    assert.equal(editArgs[editArgs.indexOf('--size') + 1], '3840x2160');
    await adapter.query(edited.taskId, edited.payload);
    assert.equal((await fsp.readdir(root)).length, 0);
    assert.equal((await fsp.readdir(root)).length, 0);
    const unavailable = createYunwuAgentVaultImage2Adapter({env,tempRoot:root,run:async () => {
      const error = new Error('missing executable');
      error.code = 'ENOENT';
      throw error;
    }});
    await assert.rejects(
      () => unavailable.submit({prompt:'执行器故障',output_size:'2160x3840'}, []),
      error => error.code === 'YUNWU_EXECUTOR_NOT_CONFIGURED'
    );
    const uncertain = createYunwuAgentVaultImage2Adapter({env,tempRoot:root,run:async (_python, args) => {
      const receiptPath = args[args.indexOf('--receipt') + 1];
      await fsp.writeFile(receiptPath, args.includes('--submit')
        ? '{"status":"uncertain_no_retry","error_type":"URLError"}'
        : '{"status":"dry_run"}');
      return {code:args.includes('--submit') ? 5 : 0};
    }});
    await assert.rejects(
      () => uncertain.submit({prompt:'网络诊断',output_size:'2160x3840'}, []),
      error => error.code === 'YUNWU_NETWORK_UNCERTAIN' && error.providerCode === 'uncertain:URLError'
    );
    const unavailableUpstream = createYunwuAgentVaultImage2Adapter({env,tempRoot:root,run:async (_python, args) => {
      const receiptPath = args[args.indexOf('--receipt') + 1];
      await fsp.writeFile(receiptPath, args.includes('--submit')
        ? '{"status":"rejected_http_error","error_type":"HTTPError","http_status":503}'
        : '{"status":"dry_run"}');
      return {code:args.includes('--submit') ? 1 : 0};
    }});
    await assert.rejects(
      () => unavailableUpstream.submit({prompt:'上游状态诊断',output_size:'2160x3840'}, []),
      error => error.code === 'YUNWU_UPSTREAM_UNAVAILABLE' && error.providerCode === 'http:503'
    );
    assert.equal((await fsp.readdir(root)).length, 0);
    console.log('YUNWU_AGENT_VAULT_IMAGE2_ADAPTER_CONTRACT_OK');
  } finally { await fsp.rm(root, {recursive:true,force:true}); }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
