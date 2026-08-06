'use strict';

const assert = require('assert');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const {prepare,executeOnce,paths} = require('./bridge/mac-employee-training/synthetic_execute_once');

async function main() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-training-synthetic-'));
  const fixturePath = path.join(__dirname, 'bridge', 'mac-employee-training', 'fixtures', 'script_n06_v001_v002.json');
  try {
    const prepared = await prepare({fixturePath,outputRoot:root,groupId:'V001',workspaceId:'synthetic-workspace-01'});
    assert.equal(prepared.employee_model_channel.used, false);
    assert.equal(prepared.media_provider_network_requested, false);
    assert.equal(prepared.media_provider_submit_requested, false);
    const executed = await executeOnce({outputRoot:root,groupId:'V001'});
    assert.equal(executed.status, 'test_only_qa_passed');
    assert.equal(executed.test_only, true);
    const v001Receipt = JSON.parse(await fsp.readFile(paths(root, 'V001').receipt, 'utf8'));
    const v001Task = JSON.parse(await fsp.readFile(paths(root, 'V001').task, 'utf8'));
    const v001Manifest = JSON.parse(await fsp.readFile(paths(root, 'V001').manifest, 'utf8'));
    const v001Projection = JSON.parse(await fsp.readFile(paths(root, 'V001').projection, 'utf8'));
    assert.equal(v001Receipt.real_delivery, false);
    assert.equal(v001Receipt.employee_model_channel.used, false);
    assert.equal(v001Receipt.media_provider_network_requested, false);
    assert.equal(v001Receipt.media_provider_submit_requested, false);
    assert.equal(v001Receipt.references.length, 4);
    assert(v001Receipt.references.every(item => path.win32.isAbsolute(item.exact_path) && /^[a-f0-9]{64}$/.test(item.sha256)));
    assert(v001Receipt.references.every(item => item.confirmed && item.upload_eligible && item.local_edit_applied === false));
    assert.equal(v001Task.transaction_id, v001Receipt.transaction_id);
    assert.equal(v001Task.spec_sha256, v001Receipt.spec_sha256);
    assert.equal(v001Task.prompt_sha256, v001Receipt.prompt_sha256);
    assert.equal(v001Manifest.spec_sha256, v001Receipt.spec_sha256);
    assert(v001Manifest.artifacts.includes(paths(root, 'V001').projection));
    assert.equal(v001Projection.media_state, 'test_only');
    await prepare({fixturePath,outputRoot:root,groupId:'V002',workspaceId:'synthetic-workspace-01'});
    const blocked = await executeOnce({outputRoot:root,groupId:'V002'});
    assert.equal(blocked.typed_blocker, 'SCRIPT_N06_V001_ONLY');
    const v002Projection = JSON.parse(await fsp.readFile(paths(root, 'V002').projection, 'utf8'));
    const v002Receipt = JSON.parse(await fsp.readFile(paths(root, 'V002').receipt, 'utf8'));
    assert.equal(v002Projection.typed_blocker, 'SCRIPT_N06_V001_ONLY');
    assert.equal(v002Projection.media_state, 'blocked');
    assert.equal(v002Receipt.test_only, true);
    assert.equal(v002Receipt.real_delivery, false);
    assert.equal(v002Receipt.employee_model_channel.used, false);
    assert.equal(v002Receipt.media_provider_network_requested, false);
    await assert.rejects(() => executeOnce({outputRoot:root,groupId:'V001'}), /SCRIPT_N06_EXECUTE_ONCE_REPLAY/);
    const all = [];
    async function walk(dir) { for (const entry of await fsp.readdir(dir, {withFileTypes:true})) { const file = path.join(dir, entry.name); if (entry.isDirectory()) await walk(file); else all.push(file); } }
    await walk(root);
    const contents = await Promise.all(all.map(file => fsp.readFile(file, 'utf8')));
    assert(contents.every(content => !content.includes('https://ai.mimo.fashion/api/video')));
    assert(contents.every(content => !content.includes('media_provider_submit_requested":true')));
    assert(contents.every(content => !content.includes('"provider_network_requested"')));
    process.stdout.write(JSON.stringify({ok:true,verified:['synthetic prepare transaction/spec SHA','fake task/poll/download','synthetic ffprobe 720x1280 11s','integrated visual QA only','ledger/checkpoint/result manifest/website projection','test_only V001 cannot unlock V002','typed SCRIPT_N06_V001_ONLY','execute-once replay rejection','employee model channel and media provider side effects are separated','no media provider network or submit']}) + '\n');
  } finally { await fsp.rm(root, {recursive:true,force:true}); }
}
main().catch(error => { process.stderr.write(String(error.stack || error) + '\n'); process.exitCode = 1; });
