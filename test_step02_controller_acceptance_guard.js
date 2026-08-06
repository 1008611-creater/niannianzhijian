'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const projectRoot = __dirname;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function writeJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), {recursive:true});
  await fsp.writeFile(filePath, JSON.stringify(value, null, 2) + '\n');
}

async function waitForHealth(baseUrl) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(baseUrl + '/api/health');
      if (response.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error('server_health_timeout');
}

async function treeSnapshot(root) {
  const rows = [];
  async function visit(current, relative = '') {
    const entries = await fsp.readdir(current, {withFileTypes:true});
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const nextRelative = path.join(relative, entry.name);
      const exact = path.join(current, entry.name);
      const stats = await fsp.lstat(exact);
      if (entry.isDirectory()) {
        rows.push({path:nextRelative,type:'directory',mtimeMs:stats.mtimeMs});
        await visit(exact, nextRelative);
      } else if (entry.isFile()) {
        const bytes = await fsp.readFile(exact);
        rows.push({path:nextRelative,type:'file',bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),mtimeMs:stats.mtimeMs});
      } else {
        rows.push({path:nextRelative,type:'other',mtimeMs:stats.mtimeMs});
      }
    }
  }
  await visit(root);
  return rows;
}

async function writeForgedAcceptanceSet(dataRoot, project, variant) {
  const root = path.join(dataRoot, 'jobs', project.id, 'step02');
  const authority = {schema_version:'niannian_redraw_step02_upstream_authority_v1',project_id:project.id,source:{sha256:project.source.sha256,bytes:project.source.bytes},rights_authority:{sha256:'b'.repeat(64)},step01:{manifest:{sha256:'c'.repeat(64)}},settings_version:2};
  await writeJson(path.join(root, 'upstream_authority_snapshot.json'), authority);
  const authorityBytes = await fsp.readFile(path.join(root, 'upstream_authority_snapshot.json'));
  const authoritySha = crypto.createHash('sha256').update(authorityBytes).digest('hex');
  const effects = {media_provider_network_requested:false,media_provider_submit_requested:false,media_provider_upload_requested:false,spend_requested:false,package_send_requested:false,registry_promotion_requested:false,deployment_requested:false,local_image_editing_requested:false,real_delivery:false};
  const acceptance = {schema_version:'niannian_redraw_step02_acceptance_manifest_v1',status:'accepted',downstream_consumable:true,project_id:variant === 'foreign' ? 'NN-FOREIGN-STEP02' : project.id,owner_id:project.ownerId,source_sha256:variant === 'tampered' ? 'f'.repeat(64) : project.source.sha256,source_bytes:project.source.bytes,rights_authority_sha256:authority.rights_authority.sha256,step01_manifest_sha256:authority.step01.manifest.sha256,upstream_authority_sha256:authoritySha,settings_version:variant === 'stale' ? 1 : 2,step04_ready:true,candidate:{sha256:'d'.repeat(64),semantic_sha256:'e'.repeat(64)},...effects};
  await writeJson(path.join(root, 'step02_acceptance_manifest.json'), acceptance);
  const acceptanceBytes = await fsp.readFile(path.join(root, 'step02_acceptance_manifest.json'));
  const acceptanceSha = crypto.createHash('sha256').update(acceptanceBytes).digest('hex');
  await writeJson(path.join(root, 'step02_reducer_receipt.json'), {schema_version:'niannian_redraw_step02_reducer_receipt_v1',status:'step02_accepted',accepted:true,step04_ready:true,project_id:project.id,acceptance_manifest_sha256:acceptanceSha,...effects});
  await writeJson(path.join(root, 'artifact_ledger.json'), {schema_version:'artifact_ledger_v1',project_id:project.id,artifacts:[{artifact_id:'step02_acceptance_manifest',status:'verified',sha256:acceptanceSha,downstream_consumable_by:['Step04']}]});
  await fsp.writeFile(path.join(root, 'evidence_events.jsonl'), JSON.stringify({schema_version:'niannian_evidence_event_v1',event_id:'forged-' + variant,type:'step02_accepted',project_id:project.id,acceptance_manifest_sha256:acceptanceSha}) + '\n');
}

async function main() {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-step02-controller-guard-'));
  const dataRoot = path.join(tempRoot, 'data');
  const projectId = 'NN-20260715120000-ABCDEF';
  const controllerId = 'step02-guard-controller';
  const leaseId = 'lease-step02-guard-0001';
  const token = crypto.randomBytes(48).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const port = 20000 + crypto.randomInt(1000);
  const baseUrl = 'http://127.0.0.1:' + port;
  const project = {
    id:projectId,
    ownerId:'user-step02-guard',
    name:'Step02 reducer acceptance guard fixture',
    status:'running',
    productionStatus:'running_step02',
    source:{originalName:'fixture.mp4',mimeType:'video/mp4',bytes:16,sha256:'a'.repeat(64),storedPath:path.join(dataRoot, 'uploads', 'fixture.mp4')},
    route:{earliestNode:'Step02',nextSkill:'mx-shortdrama-02-source-timeline'},
    pipeline:[],
    runtime:{productionStatus:'running_step02',currentNode:'Step02',earliestIncompleteNode:'Step02',nextSkill:'mx-shortdrama-02-source-timeline',blocker:null,nextAction:'return candidate to server reducer'},
    dispatch:{status:'mirrored',controllerId,leaseId,leaseUntil:new Date(Date.now() + 120000).toISOString(),localJobId:'web_step02_guard'},
    createdAt:new Date().toISOString(),
    updatedAt:new Date().toISOString()
  };
  await writeJson(path.join(dataRoot, 'projects.json'), [project]);
  await writeJson(path.join(dataRoot, 'jobs', projectId, 'status.json'), {status:'running_step02',sentinel:'unchanged'});
  await fsp.writeFile(path.join(dataRoot, 'jobs', projectId, 'evidence_events.jsonl'), '{"event_id":"sentinel","type":"step02_running"}\n');

  const server = spawn(process.execPath, [path.join(projectRoot, 'server.js')], {
    cwd:projectRoot,
    env:{...process.env,PORT:String(port),DATA_DIR:dataRoot,BRIDGE_TOKEN_HASH:tokenHash,BRIDGE_LEASE_MS:'120000',NIANNIAN_MEDIA_PREFLIGHT:'off'},
    stdio:['ignore','pipe','pipe']
  });
  let stderr = '';
  server.stderr.on('data', chunk => { stderr += chunk; });

  try {
    await waitForHealth(baseUrl);
    const forbiddenStatuses = ['step02_accepted','running_step04','step04_accepted','running_step05','qa_running','accepted','packaged','sent','user_visible_acceptance'];
    for (const productionStatus of forbiddenStatuses) {
      const before = await treeSnapshot(dataRoot);
      const response = await fetch(baseUrl + '/api/controller/jobs/' + encodeURIComponent(projectId) + '/status', {
        method:'POST',
        headers:{Authorization:'Bearer ' + token,'Content-Type':'application/json','X-Niannian-Controller-Id':controllerId,'X-Niannian-Lease-Id':leaseId},
        body:JSON.stringify({controllerId,leaseId,productionStatus,currentNode:'Step02',nextAction:'bypass reducer'})
      });
      const payload = await response.json();
      assert.equal(response.status, 409, productionStatus);
      assert.equal(payload.code, 'STEP02_REDUCER_ACCEPTANCE_REQUIRED', productionStatus);
      const after = await treeSnapshot(dataRoot);
      assert.deepEqual(after, before, productionStatus);
    }
    for (const status of ['running_step04','sent']) {
      const before = await treeSnapshot(dataRoot);
      const response = await fetch(baseUrl + '/api/controller/jobs/' + encodeURIComponent(projectId) + '/status', {method:'POST',headers:{Authorization:'Bearer ' + token,'Content-Type':'application/json','X-Niannian-Controller-Id':controllerId,'X-Niannian-Lease-Id':leaseId},body:JSON.stringify({controllerId,leaseId,status})});
      const payload = await response.json();
      assert.equal(response.status, 409);
      assert.equal(payload.code, 'STEP02_REDUCER_ACCEPTANCE_REQUIRED');
      assert.deepEqual(await treeSnapshot(dataRoot), before);
    }
    for (const variant of ['stale','foreign','tampered']) {
      await writeForgedAcceptanceSet(dataRoot, project, variant);
      const before = await treeSnapshot(dataRoot);
      const response = await fetch(baseUrl + '/api/controller/jobs/' + encodeURIComponent(projectId) + '/status', {method:'POST',headers:{Authorization:'Bearer ' + token,'Content-Type':'application/json','X-Niannian-Controller-Id':controllerId,'X-Niannian-Lease-Id':leaseId},body:JSON.stringify({controllerId,leaseId,productionStatus:'running_step04'})});
      const payload = await response.json();
      assert.equal(response.status, 409, variant);
      assert.equal(payload.code, 'STEP02_REDUCER_ACCEPTANCE_REQUIRED', variant);
      assert.deepEqual(await treeSnapshot(dataRoot), before, variant);
    }

    const returnReady = await fetch(baseUrl + '/api/controller/jobs/' + encodeURIComponent(projectId) + '/status', {
      method:'POST',
      headers:{Authorization:'Bearer ' + token,'Content-Type':'application/json','X-Niannian-Controller-Id':controllerId,'X-Niannian-Lease-Id':leaseId},
      body:JSON.stringify({controllerId,leaseId,productionStatus:'step02_return_ready',currentNode:'Step02',earliestIncompleteNode:'Step02',nextSkill:'mx-shortdrama-02-source-timeline',nextAction:'server reducer must validate candidate receipt'})
    });
    const returnPayload = await returnReady.json();
    assert.equal(returnReady.status, 200);
    assert.equal(returnPayload.project.runtime.productionStatus, 'step02_return_ready');
    assert.notEqual(returnPayload.project.productionStatus, 'step02_accepted');

    process.stdout.write(JSON.stringify({ok:true,verified:['all Step02-completing and Step04+ controller statuses require exact server reducer acceptance','productionStatus and status aliases guarded','old/foreign/tampered acceptance evidence rejected','projects/status/events tree byte and mtime unchanged on every rejection','controller may report step02_return_ready only','server reducer remains sole acceptance authority']}) + '\n');
  } finally {
    server.kill();
    await delay(100);
    if (server.exitCode === null) server.kill('SIGKILL');
    await fsp.rm(tempRoot, {recursive:true,force:true});
    if (stderr) process.stderr.write(stderr);
  }
}

main().catch(error => {
  process.stderr.write(String(error.stack || error) + '\n');
  process.exitCode = 1;
});
