'use strict';

const assert = require('assert');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const {FIXED_RECEIPTS, readFixedHqReadback} = require('./bridge/niannian_mac_hq_readback');

async function main() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-mac-hq-readback-'));
  try {
    for (const [id, relative] of FIXED_RECEIPTS) {
      const filePath = path.join(root, ...relative.split('/'));
      await fsp.mkdir(path.dirname(filePath), {recursive:true});
      await fsp.writeFile(filePath, JSON.stringify({receipt_id:id,status:'passed',authorization:'Bearer never-return-this',provider_response:{body:'never-return-this'},small:'ok'}) + '\n');
    }
    const result = await readFixedHqReadback({projectRoot:root});
    assert.equal(result.status, 'complete');
    assert.equal(result.receipts.length, 5);
    assert(result.receipts.every(item => item.status === 'present' && /^[a-f0-9]{64}$/.test(item.sha256) && item.bytes > 0));
    assert.equal(result.receipts[0].receipt.authorization, '[redacted]');
    assert.equal(result.receipts[0].receipt.provider_response, '[redacted]');
    const safeCapability=readFixedHqReadback ? require('./bridge/niannian_mac_hq_readback').redact({ready:true,status:'ready',checked_at:'2026-07-18T10:00:00Z',evidence:{method:'synthetic',summary:'safe'},token:'never-return-this'},'credential:mimo_asr') : null;
    assert.equal(safeCapability.ready, true);
    assert.equal(safeCapability.status, 'ready');
    assert.equal(safeCapability.evidence.method, 'synthetic');
    assert.equal(safeCapability.token, undefined);
    await fsp.rm(path.join(root, ...FIXED_RECEIPTS[0][1].split('/')));
    assert.equal((await readFixedHqReadback({projectRoot:root})).status, 'incomplete');
  } finally { await fsp.rm(root, {recursive:true,force:true}); }
  process.stdout.write(JSON.stringify({ok:true,verified:['fixed five receipt paths','regular JSON receipt metadata','secret and raw-provider-response redaction','missing fixed receipt typed without arbitrary path fallback']}) + '\n');
}
main().catch(error => { process.stderr.write(String(error.stack || error) + '\n'); process.exitCode = 1; });
