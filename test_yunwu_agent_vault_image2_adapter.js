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
    const adapter = createYunwuAgentVaultImage2Adapter({env, tempRoot:root, run:async (_python, args) => {
      const outputPath = args[args.indexOf('--output') + 1];
      const receiptPath = args[args.indexOf('--receipt') + 1];
      await fsp.writeFile(outputPath, await sharp({create:{width:16,height:24,channels:4,background:{r:1,g:2,b:3,alpha:1}}}).png().toBuffer());
      await fsp.writeFile(receiptPath, '{"status":"accepted_dimensions"}');
      return {code:0};
    }});
    assert.equal(adapter.dryRun({output_size:'2160x3840'}, []).payload.model, 'gpt-image-2-c');
    assert.throws(() => adapter.dryRun({output_size:'2160x3840'}, ['reference.png']), error => error.code === 'YUNWU_IMAGE_REFERENCE_UNSUPPORTED');
    const submitted = await adapter.submit({prompt:'三维国风角色',output_size:'2160x3840'}, []);
    const result = await adapter.query(submitted.taskId, submitted.payload);
    assert.equal(result.status, 'completed');
    assert.equal(result.inlineImages.length, 1);
    assert.equal((await fsp.readdir(root)).length, 0);
    console.log('YUNWU_AGENT_VAULT_IMAGE2_ADAPTER_CONTRACT_OK');
  } finally { await fsp.rm(root, {recursive:true,force:true}); }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
