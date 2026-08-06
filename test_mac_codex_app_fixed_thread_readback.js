'use strict';

const assert = require('assert');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const {PROJECT_ROOT,THREADS} = require('./bridge/mac_codex_app_employee_bootstrap');
const readback = require('./bridge/mac_codex_app_fixed_thread_readback');

class FakeClient {
  constructor(options = {}) { this.options = options; this.reads = 0; }
  async request(method, params) {
    assert.equal(method, 'thread/read');
    this.reads += 1;
    const fixed = THREADS.find(item => item.thread_id === params.threadId);
    if (!fixed) throw new Error('unknown_thread');
    const active = this.options.activeThreadId === fixed.thread_id;
    return {thread:{id:fixed.thread_id,name:this.options.wrongIdentity === fixed.thread_id ? 'wrong' : fixed.title,cwd:PROJECT_ROOT,status:{type:active ? 'active' : 'idle'},turns:[{id:'turn-'+fixed.employee,status:'completed',error:null,items:[{type:'agentMessage',text:'sensitive-looking response is represented by a hash only'}]}]}};
  }
  close() {}
}

async function main() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-fixed-readback-'));
  try {
    const selected = THREADS[0];
    const compactionPath = path.join(root, 'compaction.json');
    await fsp.writeFile(compactionPath, JSON.stringify({schema_version:'niannian_mac_employee01_compaction_receipt_v1',status:'failed',contract_id:'employee01-native-context-test-v1',thread_id:selected.thread_id,compacted_event:null,terminal_readback:null,error:{code:'employee01_compaction_test_failure',message:'secret must not return',message_sha256:'a'.repeat(64),message_bytes:22,secret_redacted:true},created_at:'2026-07-21T00:00:00Z'}));
    const client = new FakeClient();
    const receiptPath = path.join(root, 'readback.json');
    const first = await readback.runAppReadback({requestId:'fixed-readback-0001',threadId:selected.thread_id,receiptPath,compactionReceiptPath:compactionPath,client});
    assert.equal(first.status, 'readback_verified');
    assert.equal(client.reads, THREADS.length);
    assert.equal(first.receipt.all_fixed_threads_idle, true);
    assert.equal(first.receipt.turn_start_requested, false);
    assert.equal(first.receipt.media_provider_network_requested, false);
    assert.equal(first.receipt.target.thread_id, selected.thread_id);
    assert.equal(Object.prototype.hasOwnProperty.call(first.receipt.target, 'latest_assistant_text'), false);
    assert.match(first.receipt.target.latest_assistant_response_sha256, /^[a-f0-9]{64}$/);
    assert.equal(first.receipt.employee01_compaction.error.code, 'employee01_compaction_test_failure');
    assert.equal(first.receipt.employee01_compaction.raw_error_returned, false);
    assert.equal(JSON.stringify(first.receipt.employee01_compaction).includes('secret must not return'), false);
    const replay = await readback.runAppReadback({requestId:'fixed-readback-0001',threadId:selected.thread_id,receiptPath,client:new FakeClient()});
    assert.equal(replay.status, 'replayed');
    const active = await readback.runAppReadback({requestId:'fixed-readback-active',threadId:selected.thread_id,receiptPath:path.join(root,'active.json'),client:new FakeClient({activeThreadId:THREADS[2].thread_id})});
    assert.equal(active.receipt.all_fixed_threads_idle, false);
    await assert.rejects(() => readback.runAppReadback({requestId:'fixed-readback-bad2',threadId:selected.thread_id,receiptPath:path.join(root,'bad-identity.json'),client:new FakeClient({wrongIdentity:selected.thread_id})}), /thread_identity_mismatch/);
    await assert.rejects(() => readback.runAppReadback({requestId:'fixed-readback-bad3',threadId:'019f0000-0000-0000-0000-000000000000',receiptPath:path.join(root,'bad-thread.json'),client:new FakeClient()}), /thread_id_rejected/);
  } finally {
    await fsp.rm(root, {recursive:true,force:true});
  }
  process.stdout.write(JSON.stringify({ok:true,verified:['five fixed Mac threads read by exact ID only','target identity/cwd validated','active state reported without starting a turn','no response text or credentials in receipt','only hash and byte count returned','idempotent readback receipt replay']}) + '\n');
}

main().catch(error => { process.stderr.write(String(error.stack || error) + '\n'); process.exitCode = 1; });
