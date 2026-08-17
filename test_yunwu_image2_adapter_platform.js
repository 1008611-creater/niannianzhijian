const assert = require('assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const adapter = require('./bridge/niannian_yunwu_agent_vault_image2_adapter');

assert.equal(path.isAbsolute(adapter.DEFAULT_SCRIPT), true);
if (process.platform === 'win32') {
  assert.equal(adapter.DEFAULT_PYTHON, 'C:\\Users\\lsb\\anaconda3\\python.exe');
} else {
  assert.equal(adapter.DEFAULT_PYTHON, 'python3');
  assert.equal(adapter.DEFAULT_SCRIPT, path.join(__dirname, 'bridge', 'niannian_yunwu_image2_channel.py'));
}

const protectedProxy = adapter.protectedProxyEnv({
  AGENT_VAULT_TOKEN:'protected-test-token',
  AGENT_VAULT_VAULT:'niannian-production',
  HTTPS_PROXY:'http://127.0.0.1:14322'
});
const protectedProxyUrl = new URL(protectedProxy.HTTPS_PROXY);
assert.equal(decodeURIComponent(protectedProxyUrl.username), 'protected-test-token');
assert.equal(decodeURIComponent(protectedProxyUrl.password), 'niannian-production');
assert.equal(protectedProxy.HTTP_PROXY, protectedProxy.HTTPS_PROXY);

async function run() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yunwu-adapter-platform-'));
  try {
    const unavailableExecutor = adapter.createYunwuAgentVaultImage2Adapter({
      env:{AGENT_VAULT_ADDR:'http://vault.test', AGENT_VAULT_VAULT:'test', AGENT_VAULT_TOKEN:'protected', HTTPS_PROXY:'http://proxy.test'},
      tempRoot,
      run:async () => { const error = new Error('not found'); error.code = 'ENOENT'; throw error; }
    });
    await assert.rejects(
      () => unavailableExecutor.submit({prompt:'测试', resolution:'4k', aspect_ratio:'9:16', output_size:'2160x3840', image_channel:'yunwu-gpt-image-2-c'}),
      error => error.code === 'YUNWU_EXECUTOR_NOT_CONFIGURED'
    );
  } finally {
    await fs.rm(tempRoot, {recursive:true, force:true});
  }
  console.log('YUNWU_IMAGE2_ADAPTER_PLATFORM_CONTRACT_OK');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
