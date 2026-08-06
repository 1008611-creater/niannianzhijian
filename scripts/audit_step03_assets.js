'use strict';

const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const crypto = require('node:crypto');

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function fail(code, detail) {
  const error = new Error(detail || code);
  error.code = code;
  throw error;
}

function imageFacts(bytes) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    return { mime: 'image/png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length >= 12 && bytes.subarray(0, 2).equals(Buffer.from([0xff, 0xd8]))) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { mime: 'image/jpeg', width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
      }
      if (marker === 0xd9 || marker === 0xda) break;
      const segmentLength = bytes.readUInt16BE(offset + 2);
      if (segmentLength < 2) break;
      offset += 2 + segmentLength;
    }
  }
  fail('STEP03_ASSET_IMAGE_FORMAT_UNSUPPORTED');
}

async function locatePlan(root, projectId, planId) {
  const ownersRoot = path.join(root, 'v1', 'owners');
  const owners = await fsp.readdir(ownersRoot, { withFileTypes: true });
  const matches = [];
  for (const owner of owners) {
    if (!owner.isDirectory() || !/^[a-f0-9]{64}$/.test(owner.name)) continue;
    const directory = path.join(ownersRoot, owner.name, 'projects', projectId, 'plans', planId);
    if (await fsp.stat(path.join(directory, 'plan.json')).then(row => row.isFile()).catch(() => false)) matches.push(directory);
  }
  if (matches.length !== 1) fail('STEP03_PLAN_IDENTITY_NOT_UNIQUE', String(matches.length));
  return matches[0];
}

async function main() {
  const [rootArg, projectId, planId, analysisRunId, sourceSha256, sourceBytesRaw] = process.argv.slice(2);
  if (!rootArg || !projectId || !planId || !analysisRunId || !/^[a-f0-9]{64}$/.test(sourceSha256 || '') || !/^\d+$/.test(sourceBytesRaw || '')) {
    fail('STEP03_AUDIT_ARGUMENTS_INVALID');
  }
  const root = path.resolve(rootArg);
  const directory = await locatePlan(root, projectId, planId);
  const plan = JSON.parse(await fsp.readFile(path.join(directory, 'plan.json'), 'utf8'));
  const planCore = Object.fromEntries(Object.entries(plan).filter(([key]) => key !== 'plan_sha256'));
  if (plan.plan_sha256 !== sha256(canonical(planCore))) fail('STEP03_PLAN_SHA_INVALID');
  if (plan.project_id !== projectId || plan.plan_id !== planId || plan.analysis_run_id !== analysisRunId || plan.source_sha256 !== sourceSha256 || Number(plan.source_bytes) !== Number(sourceBytesRaw)) {
    fail('STEP03_PLAN_BINDING_INVALID');
  }

  const state = JSON.parse(await fsp.readFile(path.join(directory, 'state.json'), 'utf8'));
  const tasks = new Map((state.tasks || []).map(task => [task.task_id, structuredClone(task)]));
  const eventsRoot = path.join(directory, 'task-events');
  const eventNames = (await fsp.readdir(eventsRoot)).filter(name => /^\d{13}-[a-f0-9]{16}\.json$/.test(name)).sort();
  const eventHistory = new Map();
  for (const name of eventNames) {
    const event = JSON.parse(await fsp.readFile(path.join(eventsRoot, name), 'utf8'));
    const expected = sha256(canonical({ task_id: event.task_id, patch: event.patch, created_at: event.created_at }));
    if (event.schema_version !== 'niannian.step03_task_event.v1' || event.event_sha256 !== expected) fail('STEP03_TASK_EVENT_INVALID', name);
    const task = tasks.get(event.task_id);
    if (!task) fail('STEP03_TASK_EVENT_ORPHAN', name);
    const history = eventHistory.get(event.task_id) || [];
    history.push(event.patch);
    eventHistory.set(event.task_id, history);
    Object.assign(task, event.patch);
  }

  const assets = (state.assets || []).slice().sort((a, b) => a.asset_id.localeCompare(b.asset_id));
  const assetTasks = [...tasks.values()].filter(task => task.type === 'asset').sort((a, b) => a.item_id.localeCompare(b.item_id));
  if (assets.length !== 18 || assetTasks.length !== 18) fail('STEP03_ASSET_COUNT_INVALID', `${assets.length}/${assetTasks.length}`);
  if (new Set(assetTasks.map(task => task.transaction_key)).size !== assetTasks.length) fail('STEP03_TRANSACTION_KEY_DUPLICATE');
  if (new Set(assetTasks.map(task => String(task.provider_task_id || ''))).size !== assetTasks.length || assetTasks.some(task => !task.provider_task_id)) fail('STEP03_PROVIDER_TASK_ID_INVALID');

  const manifest = [];
  for (const asset of assets) {
    const task = assetTasks.find(row => row.item_id === asset.asset_id);
    if (!task || asset.attempts?.length !== 1 || asset.attempts[0] !== task.task_id) fail('STEP03_ASSET_ATTEMPT_INVALID', asset.asset_id);
    const reducerAcceptedSha256 = asset.attempts.at(-1) === task.task_id && task.status === 'accepted' ? task.artifact_sha256 : null;
    if (task.provider !== 'runninghub' || task.status !== 'accepted' || reducerAcceptedSha256 !== task.artifact_sha256) fail('STEP03_ASSET_NOT_ACCEPTED', asset.asset_id);
    const history = eventHistory.get(task.task_id) || [];
    const intentIndex = history.findIndex(patch => patch.submission_intent_sha256);
    const providerIndex = history.findIndex(patch => patch.provider_task_id);
    const artifactIndex = history.findIndex(patch => patch.artifact_id && patch.artifact_sha256 && patch.artifact_bytes);
    const acceptedIndex = history.findIndex(patch => patch.status === 'accepted');
    if (intentIndex < 0 || providerIndex <= intentIndex || artifactIndex <= providerIndex || acceptedIndex < artifactIndex) fail('STEP03_PROVIDER_EVENT_ORDER_INVALID', asset.asset_id);
    if (!/^artifacts\/ART-[a-f0-9]{24}\.(png|jpg|webp)$/.test(task.artifact_key || '') || path.isAbsolute(task.artifact_key)) fail('STEP03_ARTIFACT_KEY_INVALID', asset.asset_id);
    const artifactPath = path.resolve(directory, ...task.artifact_key.split('/'));
    const artifactsRoot = path.resolve(directory, 'artifacts');
    if (!artifactPath.startsWith(artifactsRoot + path.sep)) fail('STEP03_ARTIFACT_PATH_INVALID', asset.asset_id);
    const bytes = await fsp.readFile(artifactPath);
    if (bytes.length !== Number(task.artifact_bytes) || sha256(bytes) !== task.artifact_sha256) fail('STEP03_ARTIFACT_INTEGRITY_INVALID', asset.asset_id);
    const facts = imageFacts(bytes);
    if (facts.mime !== task.artifact_mime || facts.height <= facts.width || Math.abs((facts.width / facts.height) - (9 / 16)) > 0.01) fail('STEP03_ASSET_DIMENSION_INVALID', asset.asset_id);
    manifest.push({ asset_id: asset.asset_id, sha256: task.artifact_sha256, bytes: bytes.length, mime: facts.mime, width: facts.width, height: facts.height });
  }

  const aggregateSha256 = sha256(canonical(manifest));
  process.stdout.write(JSON.stringify({
    ok: true,
    project_id: projectId,
    analysis_run_id: analysisRunId,
    plan_id: planId,
    asset_tasks: assetTasks.length,
    accepted: assetTasks.filter(task => task.status === 'accepted').length,
    provider: 'runninghub',
    unique_transactions: new Set(assetTasks.map(task => task.transaction_key)).size,
    provider_id_persisted_before_artifact: true,
    artifacts_verified: manifest.length,
    total_bytes: manifest.reduce((sum, row) => sum + row.bytes, 0),
    dimensions: [...new Set(manifest.map(row => `${row.width}x${row.height}`))],
    aggregate_sha256: aggregateSha256
  }) + '\n');
}

main().catch(error => {
  process.stderr.write(JSON.stringify({ ok: false, code: error.code || 'STEP03_ASSET_AUDIT_FAILED', message: error.message }) + '\n');
  process.exitCode = 1;
});
