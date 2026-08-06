const assert = require('assert/strict');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const step01Ledger = require('./bridge/niannian_step01_source_ledger');
const {sourceVisionEvidence} = require('./bridge/niannian_step03_planner');
const {createStep03Service,canonical,sha256} = require('./bridge/niannian_step03_runtime');

const EXPECTED = {
  projectId:'NN-20260715083045-8120F5',
  analysisRunId:'analysis-1-0dc5c5d751592e9fd0656a81',
  sourceSha256:'a46f74392e2b3f7ec813b4eba5a0cd9756a7c30225e0033fd671d2cab21cd30c',
  sourceBytes:145897161
};
const project = {id:EXPECTED.projectId, ownerId:'owner-1', analysis:{runId:EXPECTED.analysisRunId}, source:{sha256:EXPECTED.sourceSha256, bytes:EXPECTED.sourceBytes}};

function variantShots(count = 37) {
  return Array.from({length:count}, (_, index) => ({
    shot_id:'S' + String(index + 1).padStart(3, '0'),
    start_sec:index * 2,
    end_sec:(index + 1) * 2,
    duration_sec:2,
    target_people_identity:index < 24 ? 'Ruoruo' : 'supporting',
    localized_setting:'Mexico City civil registry',
    action:'localized action ' + (index + 1),
    target_dialogue:index % 4 === 0 ? 'localized dialogue ' + (index + 1) : '',
    expression_intent:'contained emotion',
    cultural_replacements:[],
    continuity_requirements:[]
  }));
}

async function makeEvidenceRoot(root) {
  const source = path.join(__dirname, 'data-local', 'step01-evidence', 'NN-20260715083045-8120F5', 'EP001');
  const evidenceRoot = path.join(root, 'evidence');
  await fsp.mkdir(evidenceRoot, {recursive:true});
  const wrapper = JSON.parse(await fsp.readFile(path.join(source, 'step01-evidence-manifest.json'), 'utf8'));
  await fsp.writeFile(path.join(evidenceRoot, 'step01-evidence-manifest.json'), JSON.stringify(wrapper, null, 2) + '\n');
  await fsp.cp(path.join(source, 'artifacts'), path.join(evidenceRoot, 'artifacts'), {recursive:true});
  return evidenceRoot;
}

async function installRecoveredFrames(evidenceRoot) {
  const artifacts = path.join(evidenceRoot, 'artifacts');
  const manifest = JSON.parse(await fsp.readFile(path.join(artifacts, 'shotlevel_start_mid_end_manifest.json'), 'utf8'));
  const sourceRows = Array.isArray(manifest) ? manifest : manifest.frames;
  const output = path.join(artifacts, 'recovered_source_frames');
  await fsp.mkdir(output, {recursive:true});
  const frames = [];
  for (const row of sourceRows.filter(item => ['start','mid','end'].includes(item.point))) {
    const source = path.join(artifacts, 'shotlevel_start_mid_end_frames', row.file);
    const target = path.join(output, row.file);
    await fsp.copyFile(source, target);
    const bytes = await fsp.readFile(target);
    frames.push({file:row.file, point:row.point, shot_id:Number(row.shot_id), time_sec:Number(row.time_sec), timecode:row.timecode, relative_path:'recovered_source_frames/' + row.file, bytes:bytes.length, sha256:step01Ledger.sha256(bytes), width:1080, height:1920});
  }
  const core = {schema_version:'niannian.step01_frame_recovery.v1',status:'verified',downstream_consumable:true,project_id:EXPECTED.projectId,source_sha256:EXPECTED.sourceSha256,source_bytes:EXPECTED.sourceBytes,frames,generated_at:'2026-07-25T00:00:00.000Z',generator:{kind:'test'}};
  await fsp.writeFile(path.join(artifacts, 'step01_frame_recovery_manifest.json'), JSON.stringify({...core, manifest_sha256:step01Ledger.sha256(step01Ledger.canonical(core))}, null, 2) + '\n');
}

async function run() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-step01-ledger-'));
  const evidenceRoot = await makeEvidenceRoot(root);
  const overlayRoot = path.join(root, 'overlays');
  const ledger = await step01Ledger.readLedger({evidenceRoot, overlayRoot, project});
  assert.equal(ledger.schema_version, step01Ledger.LEDGER_SCHEMA);
  assert.equal(ledger.project_id, EXPECTED.projectId);
  assert.equal(ledger.analysis_run_id, EXPECTED.analysisRunId);
  assert.equal(ledger.source_sha256, EXPECTED.sourceSha256);
  assert.equal(ledger.counts.shots, 37);
  assert.equal(ledger.counts.frame_evidence, 111);
  assert.equal(ledger.counts.dialogue_rows, 13);
  assert.equal(ledger.counts.ocr_rows, 34);
  assert.ok(ledger.shots.every(shot => shot.frame_evidence.length === 3));
  assert.ok(ledger.shots.every(shot => shot.frame_evidence.every(frame => frame.relative_path.startsWith('shotlevel_start_mid_end_frames/'))));
  assert.ok(ledger.shots.some(shot => shot.dialogue_ids.length));
  assert.ok(ledger.shots.some(shot => shot.ocr_ids.length));
  const visionBlocks = await sourceVisionEvidence({source_authority:{...ledger, shots:ledger.shots.slice(0, 1)}}, evidenceRoot);
  assert.equal(visionBlocks.length, 2);
  assert.equal(visionBlocks.filter(row => row.type === 'input_image').length, 1);
  assert.ok(visionBlocks.filter(row => row.type === 'input_image').every(row => row.image_url.startsWith('data:image/webp;base64,')));
  await installRecoveredFrames(evidenceRoot);
  const recoveredLedger = await step01Ledger.readLedger({evidenceRoot, overlayRoot, project});
  assert.notEqual(recoveredLedger.snapshot_sha256, ledger.snapshot_sha256);
  assert.ok(recoveredLedger.shots.every(shot => shot.frame_evidence.every(frame => frame.relative_path.startsWith('recovered_source_frames/'))));
  const recoveredVisionBlocks = await sourceVisionEvidence({source_authority:{...recoveredLedger, shots:recoveredLedger.shots.slice(0, 1)}}, evidenceRoot);
  assert.equal(recoveredVisionBlocks.filter(row => row.type === 'input_image').length, 1);
  const md = step01Ledger.markdownProjection(ledger);
  assert.match(md, /Step01 Source Shot Authority Ledger/);
  assert.match(md, /S001/);

  const revised = await step01Ledger.appendRevision({
    evidenceRoot,
    overlayRoot,
    project,
    ifMatch:'"step01-ledger-' + recoveredLedger.snapshot_sha256 + '"',
    actor:'owner-1',
    body:{shot_id:'S001', reason:'用户修正人物出场事实', changes:[{field:'characters', before:[], after:['source-female-lead']}, {field:'source_visual_facts', before:'', after:'女主在民政登记处前景出现，红色造型与排队票形成连续性证据。'}]}
  });
  assert.notEqual(revised.snapshot_sha256, ledger.snapshot_sha256);
  assert.deepEqual(revised.shots[0].characters, ['source-female-lead']);
  assert.equal(revised.shots[0].user_revision_ids.length, 1);
  await assert.rejects(() => step01Ledger.appendRevision({evidenceRoot, overlayRoot, project, ifMatch:'"step01-ledger-stale"', actor:'owner-1', body:{shot_id:'S001', changes:[{field:'action', after:'bad'}]}}), error => error.code === 'STEP01_LEDGER_REVISION_CONFLICT');
  await assert.rejects(() => step01Ledger.appendRevision({evidenceRoot, overlayRoot, project, ifMatch:'"step01-ledger-' + revised.snapshot_sha256 + '"', actor:'owner-1', body:{shot_id:'S001', changes:[{field:'provider_task_id', after:'leak'}]}}), error => error.code === 'STEP01_LEDGER_FIELD_NOT_EDITABLE');

  const step02Variant = {
    variant_id:'S02-es-MX-cb2612ff9b63b23253fb',
    snapshot_id:'S01-0146865b967f3a434f31b73f',
    snapshot_sha256:'1'.repeat(64),
    locale:'es-MX',
    status:'confirmed',
    qa:{passed:true},
    confirmed_sha256:'2'.repeat(64),
    global_context:{character_map:[]},
    shots:variantShots()
  };
  const step03Root = path.join(root, 'step03');
  const step03 = createStep03Service({
    root:step03Root,
    evidenceRoot,
    step01SourceLedgerOverlayRoot:overlayRoot,
    expected:EXPECTED,
    step02Service:{async getVariant(){return JSON.parse(JSON.stringify(step02Variant));}},
    bundleRoot:path.join(__dirname, 'runtime', 'skill-bundles', 'shortdrama-visual-assets-runtime-1')
  });
  const created = await step03.createPlan({ownerId:'owner-1', project, locale:'es-MX', step02VariantId:step02Variant.variant_id, idempotencyKey:sha256(canonical({test:'ledger-bound-plan'}))});
  assert.equal(created.created, true);
  assert.equal(created.plan.step01_source_ledger_sha256, revised.snapshot_sha256);
  const claim = await step03.claimNextTask({workerId:'ledger-test-worker'});
  assert.equal(claim.task.type, 'planning');
  assert.equal(claim.task.planning_input.source_authority.snapshot_sha256, revised.snapshot_sha256);
  assert.equal(claim.task.planning_input.source_authority.counts.shots, 37);
  assert.equal(claim.task.planning_input.source_authority.counts.frame_evidence, 111);
  assert.equal(claim.task.planning_input.source_authority.dialogue_rows.length, 13);
  assert.equal(claim.task.planning_input.source_authority.ocr_rows.length, 34);
  assert.equal(claim.task.planning_input.shots.length, 37);

  await fsp.rm(root, {recursive:true, force:true});
  process.stdout.write(JSON.stringify({ok:true, shots:37, frames:111, dialogue_rows:13, ocr_rows:34, step03_source_authority:true}) + '\n');
}

run().catch(error => {
  process.stderr.write(String(error.stack || error) + '\n');
  process.exitCode = 1;
});
