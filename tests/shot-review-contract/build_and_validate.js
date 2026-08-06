'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const CONTRACT = path.join(ROOT, 'docs', 'shot-review-contract');
const EVIDENCE = path.join(ROOT, 'data-local', 'step01-evidence', 'NN-20260715083045-8120F5', 'EP001');
const ARTIFACTS = path.join(EVIDENCE, 'artifacts');
const EXPECTED = Object.freeze({
  projectId: 'NN-20260715083045-8120F5',
  analysisRunId: 'analysis-1-0dc5c5d751592e9fd0656a81',
  sourceSha256: 'a46f74392e2b3f7ec813b4eba5a0cd9756a7c30225e0033fd671d2cab21cd30c',
  shots: 37,
  frames: 111,
  dialogue: 13,
  ocr: 34
});

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function sha256(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }
function round(value) { return Number(Number(value).toFixed(3)); }
function rel(file) { return path.relative(ROOT, file).split(path.sep).join('/'); }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); }

function writeContractManifest() {
  const names = [
    'api-contract.md',
    'mapping-rules.md',
    'schemas/revision-overlay.schema.json',
    'schemas/shot-review-model.schema.json',
    'schemas/single-shot-reanalysis-input.schema.json',
    'schemas/single-shot-reanalysis-output.schema.json'
  ];
  const files = names.sort().map(name => ({ path: name, sha256: sha256(fs.readFileSync(path.join(CONTRACT, name))), bytes: fs.statSync(path.join(CONTRACT, name)).size }));
  const aggregate = sha256(Buffer.from(files.map(file => `${file.path}:${file.sha256}`).join('\n')));
  writeJson(path.join(CONTRACT, 'contract-manifest.json'), { schema_version: 'niannian.shot_review_contract_manifest.v1', aggregate_sha256: aggregate, files });
}

function inspectPng(file) {
  const buffer = fs.readFileSync(file);
  assert(buffer.length >= 24, `PNG too short: ${file}`);
  assert(buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])), `PNG signature invalid: ${file}`);
  assert.equal(buffer.toString('ascii', 12, 16), 'IHDR', `PNG IHDR missing: ${file}`);
  return { bytes: buffer.length, sha256: sha256(buffer), readable: true, width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function overlapSeconds(event, shot) {
  return round(Math.max(0, Math.min(Number(event.end_sec), shot.end_sec) - Math.max(Number(event.start_sec), shot.start_sec)));
}

function mapInterval(event, shots) {
  if (event.start_sec === null || event.start_sec === undefined || event.end_sec === null || event.end_sec === undefined || !Number.isFinite(Number(event.start_sec)) || !Number.isFinite(Number(event.end_sec))) return [];
  const mapped = shots.map(shot => ({ shot, overlap: overlapSeconds(event, shot) })).filter(item => item.overlap > 0);
  if (mapped.length) return mapped;
  const point = Number(event.start_sec);
  const exactStarts = shots.filter(shot => shot.start_sec === point);
  if (exactStarts.length) return [{ shot: exactStarts[0], overlap: 0, boundary: 'starts_at_shot_start' }];
  const exactEnds = shots.filter(shot => shot.end_sec === point);
  return exactEnds.length ? [{ shot: exactEnds[exactEnds.length - 1], overlap: 0, boundary: 'starts_at_shot_end' }] : [];
}

function mapPoint(row, shots) {
  if (row.time_sec === null || row.time_sec === undefined || !Number.isFinite(Number(row.time_sec))) return [];
  const point = Number(row.time_sec);
  const candidates = shots.filter(shot => point >= shot.start_sec && point <= shot.end_sec);
  if (!candidates.length) return [];
  candidates.sort((a, b) => b.start_sec - a.start_sec || a.sequence - b.sequence);
  return [candidates[0]];
}

function build() {
  const wrapperFile = path.join(EVIDENCE, 'step01-evidence-manifest.json');
  const strictFile = path.join(ARTIFACTS, 'step01_evidence_manifest.json');
  const shotsFile = path.join(ARTIFACTS, 'transnet_shots', 'EP001_transnet_shots.json');
  const framesFile = path.join(ARTIFACTS, 'shotlevel_start_mid_end_manifest.json');
  const dialogueFile = path.join(ARTIFACTS, 'EP001_dialogue_ledger.json');
  const ocrFile = path.join(ARTIFACTS, 'smart_ocr', 'EP001_smart_ocr_ledger.json');
  const alignerFile = path.join(ARTIFACTS, 'EP001_qwen3_forced_aligner_receipt.json');
  const wrapper = readJson(wrapperFile);
  const strict = readJson(strictFile);
  const rawShots = readJson(shotsFile);
  const frameRows = readJson(framesFile);
  const dialogueRows = readJson(dialogueFile).rows;
  const ocrRows = readJson(ocrFile);
  const aligner = readJson(alignerFile);

  assert.equal(wrapper.projectId, EXPECTED.projectId);
  assert.equal(wrapper.analysisRunId, EXPECTED.analysisRunId);
  assert.equal(wrapper.source.sha256, EXPECTED.sourceSha256);
  assert.equal(wrapper.status, 'completed');
  assert.equal(strict.status, 'verified');
  assert.equal(strict.downstream_consumable, true);
  assert.equal(strict.source.sha256, EXPECTED.sourceSha256);
  assert.equal(rawShots.length, EXPECTED.shots);
  assert.equal(frameRows.length, EXPECTED.frames);
  assert.equal(dialogueRows.length, EXPECTED.dialogue);
  assert.equal(ocrRows.length, EXPECTED.ocr);
  assert.equal(aligner.ok, true);
  assert.equal(aligner.timestamps_are_forced_alignment, true);
  assert.equal(aligner.segments, EXPECTED.dialogue);

  const shots = rawShots.map((row, index) => {
    const sequence = Number(row.shot_id);
    assert.equal(sequence, index + 1, 'shots must be ordered and contiguous');
    const start = Number(row.start_sec), end = Number(row.end_sec), mid = Number(row.mid_sec);
    assert(start <= mid && mid <= end, `shot ${sequence} has invalid midpoint`);
    if (index) assert(start > Number(rawShots[index - 1].end_sec), `shot ${sequence} overlaps prior shot`);
    return {
      shot_id: `S${String(sequence).padStart(3, '0')}`,
      sequence,
      start_sec: start,
      end_sec: end,
      duration_sec: round(end - start),
      start_timecode: row.start_timecode,
      end_timecode: row.end_timecode,
      frames: {},
      dialogue: [],
      forced_alignment: [],
      ocr: [],
      speaker: [],
      review_status: 'unreviewed',
      active_revision: null
    };
  });

  const frameAudit = [];
  for (const row of frameRows) {
    const shot = shots[Number(row.shot_id) - 1];
    assert(shot, `frame references unknown shot ${row.shot_id}`);
    assert(['start', 'mid', 'end'].includes(row.point));
    assert(!shot.frames[row.point], `duplicate ${row.point} for ${shot.shot_id}`);
    assert(Number(row.time_sec) >= shot.start_sec && Number(row.time_sec) <= shot.end_sec);
    assert.equal(Number(row.source_start), shot.start_sec);
    assert.equal(Number(row.source_end), shot.end_sec);
    const localFile = path.join(ARTIFACTS, 'shotlevel_start_mid_end_frames', row.file);
    const image = inspectPng(localFile);
    const frame = { point: row.point, time_sec: Number(row.time_sec), timecode: row.timecode, frame_index: Number(row.frame_index), path: rel(localFile), ...image };
    shot.frames[row.point] = frame;
    frameAudit.push({ shot_id: shot.shot_id, point: row.point, path: frame.path, bytes: image.bytes, sha256: image.sha256, readable: true, dimensions: `${image.width}x${image.height}`, ownership_verified: true });
  }
  for (const shot of shots) assert.deepEqual(Object.keys(shot.frames).sort(), ['end', 'mid', 'start']);

  const dialogueAudit = [];
  for (const row of dialogueRows) {
    assert(row.event_id && row.text);
    assert(Number.isFinite(Number(row.start_sec)) && Number.isFinite(Number(row.end_sec)));
    assert(Number(row.end_sec) >= Number(row.start_sec));
    const mappings = mapInterval(row, shots);
    assert(mappings.length, `unassigned dialogue ${row.event_id}`);
    const mappedShotIds = [];
    for (const item of mappings) {
      const value = { event_id: row.event_id, start_sec: Number(row.start_sec), end_sec: Number(row.end_sec), text: row.text, speaker: row.speaker || 'speaker_unknown', overlap_sec: item.overlap, source_tool: row.source_tool, ...(item.boundary ? { boundary_rule: item.boundary } : {}) };
      item.shot.dialogue.push(value);
      item.shot.forced_alignment.push({ event_id: row.event_id, start_sec: value.start_sec, end_sec: value.end_sec, overlap_sec: item.overlap, timing_basis: aligner.timing_basis, receipt_path: rel(alignerFile) });
      if (!item.shot.speaker.includes(value.speaker)) item.shot.speaker.push(value.speaker);
      mappedShotIds.push(item.shot.shot_id);
    }
    dialogueAudit.push({ event_id: row.event_id, start_sec: Number(row.start_sec), end_sec: Number(row.end_sec), shot_ids: mappedShotIds, mapped: true });
  }

  const ocrAudit = [];
  for (const row of ocrRows) {
    assert(row.ocr_text);
    assert(Number.isFinite(Number(row.time_sec)));
    const mappings = mapPoint(row, shots);
    assert.equal(mappings.length, 1, `OCR ${row.order} must map to exactly one shot`);
    const shot = mappings[0];
    shot.ocr.push({ row_id: `ocr-${String(row.order).padStart(4, '0')}`, time_sec: Number(row.time_sec), timecode: row.timecode, text: row.ocr_text, region: row.region, model: row.paddle_model, source_frame_file: row.frame_file });
    ocrAudit.push({ row_id: `ocr-${String(row.order).padStart(4, '0')}`, time_sec: Number(row.time_sec), shot_id: shot.shot_id, mapped: true });
  }

  const model = {
    schema_version: 'niannian.shot_review_model.v1',
    project_id: EXPECTED.projectId,
    episode_id: 'EP001',
    analysis_run_id: EXPECTED.analysisRunId,
    source_evidence: {
      source_sha256: EXPECTED.sourceSha256,
      source_bytes: Number(wrapper.source.bytes),
      immutable: true,
      wrapper_manifest_path: rel(wrapperFile),
      strict_manifest_path: rel(strictFile),
      forced_alignment_receipt_path: rel(alignerFile),
      evidence_binding_sha256: sha256(Buffer.from([EXPECTED.projectId, EXPECTED.analysisRunId, EXPECTED.sourceSha256].join(':')))
    },
    mapping_policy: 'niannian.shot_text_overlap.v1',
    shots,
    unassigned_dialogue: [],
    unassigned_ocr: []
  };
  const audit = {
    schema_version: 'niannian.shot_review_audit.v1',
    audit_level: 'structural_local_evidence',
    project_id: EXPECTED.projectId,
    analysis_run_id: EXPECTED.analysisRunId,
    source_sha256: EXPECTED.sourceSha256,
    result: 'pass',
    counts: { shots_expected: 37, shots_verified: shots.length, frames_expected: 111, frames_verified: frameAudit.length, frames_readable: frameAudit.filter(x => x.readable).length, dialogue_rows_expected: 13, dialogue_rows_verified: dialogueAudit.length, dialogue_shot_associations: dialogueAudit.reduce((n, x) => n + x.shot_ids.length, 0), ocr_rows_expected: 34, ocr_rows_verified: ocrAudit.length, ocr_shot_associations: ocrAudit.length, unassigned_dialogue: 0, unassigned_ocr: 0 },
    shot_audit: shots.map(shot => ({ shot_id: shot.shot_id, start_sec: shot.start_sec, end_sec: shot.end_sec, duration_sec: shot.duration_sec, triad_points: Object.keys(shot.frames).sort(), frame_count: Object.keys(shot.frames).length, all_frames_readable: Object.values(shot.frames).every(frame => frame.readable), dialogue_associations: shot.dialogue.length, forced_alignment_associations: shot.forced_alignment.length, ocr_associations: shot.ocr.length, ownership_verified: true, result: 'pass' })),
    frame_audit: frameAudit,
    dialogue_audit: dialogueAudit,
    ocr_audit: ocrAudit
  };
  writeJson(path.join(CONTRACT, 'fixtures', 'shot-review-model.json'), model);
  writeJson(path.join(CONTRACT, 'audit', 'step01-audit.json'), audit);
  writeContractManifest();
  return { model, audit };
}

function validateModel(model) {
  assert.equal(model.schema_version, 'niannian.shot_review_model.v1');
  assert.equal(model.shots.length, 37);
  for (const shot of model.shots) {
    assert(/^S\d{3}$/.test(shot.shot_id));
    assert(shot.start_sec <= shot.end_sec && shot.duration_sec >= 0);
    assert.deepEqual(Object.keys(shot.frames).sort(), ['end', 'mid', 'start']);
    assert(Array.isArray(shot.dialogue) && Array.isArray(shot.forced_alignment) && Array.isArray(shot.ocr));
    assert(Array.isArray(shot.speaker));
    assert(['unreviewed', 'in_review', 'accepted', 'needs_revision'].includes(shot.review_status));
  }
}

function validateOverlay(overlay, currentRevision) {
  const required = ['schema_version','project_id','shot_id','base_revision','revision_id','actor_type','changed_fields','source_evidence_binding','created_at'];
  required.forEach(key => assert(Object.prototype.hasOwnProperty.call(overlay, key), `overlay missing ${key}`));
  assert.equal(overlay.schema_version, 'niannian.shot_revision_overlay.v1');
  assert.equal(overlay.base_revision, currentRevision, 'REVISION_CONFLICT');
  assert.notEqual(overlay.revision_id, overlay.base_revision);
  assert(['human', 'ai_candidate'].includes(overlay.actor_type));
  assert(Array.isArray(overlay.changed_fields) && overlay.changed_fields.length > 0);
  assert.equal(overlay.source_evidence_binding.source_sha256, EXPECTED.sourceSha256);
}

function validateReanalysisInput(input, model) {
  assert.equal(input.schema_version, 'niannian.single_shot_reanalysis_input.v1');
  const shot = model.shots.find(item => item.shot_id === input.shot_id);
  assert(shot, 'unknown shot');
  assert.deepEqual(input.allowed_time_range, { start_sec: shot.start_sec, end_sec: shot.end_sec });
  assert.deepEqual(Object.keys(input.frames).sort(), ['end', 'mid', 'start']);
  assert.equal(input.constraints.allow_external_tools, false);
  assert.equal(input.constraints.allow_full_video_reanalysis, false);
  assert.equal(input.constraints.allow_step02_start, false);
  assert(input.idempotency_key.length >= 32);
}

function run() {
  const { model, audit } = build();
  validateModel(model);
  assert.equal(audit.result, 'pass');
  assert.equal(audit.shot_audit.length, 37);
  assert.equal(audit.counts.frames_readable, 111);
  const overlay = readJson(path.join(CONTRACT, 'fixtures', 'manual-revision-overlay.example.json'));
  validateOverlay(overlay, overlay.base_revision);
  assert.throws(() => validateOverlay({ ...overlay, base_revision: 'stale-revision' }, overlay.base_revision), /REVISION_CONFLICT/);
  const input = readJson(path.join(CONTRACT, 'fixtures', 'single-shot-reanalysis-input.example.json'));
  validateReanalysisInput(input, model);
  const bad = JSON.parse(JSON.stringify(input)); bad.allowed_time_range.end_sec += 1;
  assert.throws(() => validateReanalysisInput(bad, model));
  const syntheticShots = [{ shot_id: 'S001', sequence: 1, start_sec: 0, end_sec: 1 }, { shot_id: 'S002', sequence: 2, start_sec: 1, end_sec: 2 }];
  assert.deepEqual(mapInterval({ start_sec: 1, end_sec: 1 }, syntheticShots).map(x => x.shot.shot_id), ['S002'], 'interval boundary belongs to the shot that starts there');
  assert.deepEqual(mapInterval({ start_sec: 0.5, end_sec: 1.5 }, syntheticShots).map(x => x.shot.shot_id), ['S001', 'S002'], 'cross-shot interval maps to every positive overlap');
  assert.deepEqual(mapInterval({ start_sec: null, end_sec: null }, syntheticShots), [], 'missing interval is unassigned');
  assert.deepEqual(mapPoint({ time_sec: 1 }, syntheticShots).map(x => x.shot_id), ['S002'], 'point boundary belongs to later-starting shot');
  assert.deepEqual(mapPoint({ time_sec: null }, syntheticShots), [], 'missing point is unassigned');
  console.log(JSON.stringify({ status: 'PASS', level: 'structural', shots: 37, frames: 111, dialogue_rows: 13, dialogue_associations: audit.counts.dialogue_shot_associations, ocr_rows: 34, ocr_associations: 34 }));
}

if (require.main === module) run();
module.exports = { build, validateModel, validateOverlay, validateReanalysisInput, mapInterval, mapPoint };
