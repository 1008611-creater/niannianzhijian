'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const FACTS_SCHEMA = 'niannian_source_facts_package_v1';
const FACTS_PROFILE = 'source-facts-v1';
const LEGACY_STATUS = 'legacy_source_facts_derived';
const REQUIRED_ARTIFACTS = Object.freeze([
  'source_manifest',
  'shot_index',
  'frame_manifest',
  'dialogue_ledger',
  'ocr_ledger',
  'continuity_facts',
  'source_facts_timeline',
  'fact_coverage_qa'
]);

function sha256(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }

function isInside(parent, candidate, allowRoot = false) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  if (!relative) return allowRoot;
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

function safeRelative(value, code) {
  const relative = String(value || '').replace(/\\/g, '/');
  if (!relative || relative.startsWith('/') || relative.includes('\0') || relative.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error(code || 'step01_source_facts_relative_path_invalid');
  }
  return relative;
}

async function readJson(filePath) { return JSON.parse(await fsp.readFile(filePath, 'utf8')); }

async function atomicJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), {recursive:true});
  const temp = filePath + '.tmp-' + process.pid + '-' + crypto.randomBytes(3).toString('hex');
  await fsp.writeFile(temp, JSON.stringify(value, null, 2) + '\n', {encoding:'utf8', flag:'wx'});
  await fsp.rename(temp, filePath);
}

async function fileEvidence(filePath) {
  const stats = await fsp.lstat(filePath);
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error('step01_source_facts_file_invalid');
  const bytes = await fsp.readFile(filePath);
  return {exact_path:filePath, sha256:sha256(bytes), bytes:bytes.length};
}

function evidencePath(root, pointer, code) {
  const relative = safeRelative(pointer && pointer.relative_path, code || 'step01_source_facts_evidence_path_invalid');
  const candidate = path.resolve(root, relative);
  if (!isInside(root, candidate)) throw new Error(code || 'step01_source_facts_evidence_outside_root');
  return candidate;
}

function parseCsv(text) {
  const rows = [];
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  if (!lines.length) return rows;
  const parseLine = line => {
    const values = [];
    let value = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (character === '"') {
        if (quoted && line[index + 1] === '"') { value += '"'; index += 1; }
        else quoted = !quoted;
      } else if (character === ',' && !quoted) { values.push(value.trim()); value = ''; }
      else value += character;
    }
    values.push(value.trim());
    return values;
  };
  const headers = parseLine(lines.shift()).map(value => value.replace(/\s+/g, '_').toLowerCase());
  for (const line of lines) {
    const values = parseLine(line);
    if (!values.some(Boolean)) continue;
    const row = {};
    headers.forEach((header, index) => { row[header] = values[index] || ''; });
    rows.push(row);
  }
  return rows;
}

function numeric(row, names) {
  for (const name of names) {
    const value = Number(row && row[name]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function textValue(row, names) {
  for (const name of names) {
    const value = String(row && row[name] || '').trim();
    if (value) return value;
  }
  return '';
}

function overlaps(start, end, candidateStart, candidateEnd) {
  if (!Number.isFinite(candidateStart)) return false;
  const finalEnd = Number.isFinite(candidateEnd) ? candidateEnd : candidateStart;
  return candidateStart <= end && finalEnd >= start;
}

function normalizeRows(rows, kind) {
  return rows.map((row, index) => {
    const startSec = numeric(row, ['start_sec', 'start', 'start_time', 'begin_sec', 'begin']);
    const endSec = numeric(row, ['end_sec', 'end', 'end_time', 'finish_sec', 'finish']);
    return {
      id:(kind === 'dialogue' ? 'D' : 'O') + String(index + 1).padStart(4, '0'),
      start_ms:Number.isFinite(startSec) ? Math.round(startSec * 1000) : null,
      end_ms:Number.isFinite(endSec) ? Math.round((Number.isFinite(endSec) ? endSec : startSec) * 1000) : null,
      text:textValue(row, kind === 'dialogue' ? ['text', 'transcript', 'content', 'sentence'] : ['text', 'ocr_text', 'content', 'recognized_text']),
      speaker:kind === 'dialogue' ? textValue(row, ['speaker', 'speaker_id', 'role']) || null : null,
      source_row:index + 2,
      raw:row
    };
  });
}

function buildTimeline(shots, frames, dialogue, ocr) {
  const framesByShot = new Map();
  for (const frame of frames) {
    const current = framesByShot.get(frame.shot_id) || [];
    current.push(frame);
    framesByShot.set(frame.shot_id, current);
  }
  return shots.map((shot, index) => {
    const start = Number(shot.start_sec);
    const end = Number(shot.end_sec);
    const shotId = String(shot.shot_id || index + 1);
    const dialogueIds = dialogue.filter(row => overlaps(start, end, row.start_ms === null ? null : row.start_ms / 1000, row.end_ms === null ? null : row.end_ms / 1000)).map(row => row.id);
    const ocrIds = ocr.filter(row => overlaps(start, end, row.start_ms === null ? null : row.start_ms / 1000, row.end_ms === null ? null : row.end_ms / 1000)).map(row => row.id);
    return {
      shot_id:'S' + shotId.padStart(4, '0'),
      source_shot_id:shotId,
      start_ms:Math.round(start * 1000),
      end_ms:Math.round(end * 1000),
      evidence:{
        keyframes:(framesByShot.get(shotId) || []).sort((left, right) => String(left.point).localeCompare(String(right.point))),
        dialogue_ids:dialogueIds,
        ocr_ids:ocrIds
      },
      observed_facts:{
        characters:[],
        settings:[],
        actions:[],
        props:[],
        continuity_notes:[]
      },
      uncertainties:[
        'Only source-bound visual, audio, and OCR evidence is asserted here; no creative interpretation is included.'
      ]
    };
  });
}

async function writeArtifact(outputRoot, artifactId, value) {
  const filePath = path.join(outputRoot, artifactId + '.json');
  await atomicJson(filePath, value);
  const evidence = await fileEvidence(filePath);
  return {artifact_id:artifactId, node_id:'Step01', ...evidence, status:'verified', downstream_consumable_by:['Step02']};
}

async function buildSourceFactsPackage(options = {}) {
  const sourceRoot = path.resolve(String(options.sourceRoot || ''));
  const outputRoot = path.resolve(String(options.outputRoot || ''));
  const project = options.project || {};
  const analysisRun = options.analysisRun || {};
  if (!sourceRoot || !outputRoot || !project.id || !project.source?.sha256 || !Number.isInteger(project.sourceRevision) || !analysisRun.id) {
    throw new Error('step01_source_facts_build_input_invalid');
  }
  const manifestPath = path.join(sourceRoot, 'step01_evidence_manifest.json');
  const manifest = await readJson(manifestPath);
  if (manifest.schema_version !== 'step01_evidence_manifest_v1' || manifest.status !== 'verified' || manifest.downstream_consumable !== true || manifest.test_only === true || manifest.source_sha256 !== project.source.sha256 || Number(manifest.source_bytes) !== Number(project.source.bytes)) {
    throw new Error('step01_source_facts_manifest_invalid');
  }
  const [probe, shots, supplement, dialogueText, ocrText] = await Promise.all([
    readJson(evidencePath(sourceRoot, manifest.source?.ffprobe, 'step01_source_facts_ffprobe_missing')),
    readJson(evidencePath(sourceRoot, manifest.transnet?.accepted_shots, 'step01_source_facts_shots_missing')),
    readJson(evidencePath(sourceRoot, manifest.transnet?.shot_supplement, 'step01_source_facts_frames_missing')),
    fsp.readFile(evidencePath(sourceRoot, manifest.audio?.event_ledger, 'step01_source_facts_dialogue_missing'), 'utf8'),
    fsp.readFile(evidencePath(sourceRoot, manifest.ocr?.ledger, 'step01_source_facts_ocr_missing'), 'utf8')
  ]);
  const durationSeconds = Number(probe.duration_seconds || probe.durationSeconds || project.preflight?.durationSeconds);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !Array.isArray(shots.shots) || !shots.shots.length || !Array.isArray(supplement.rows)) {
    throw new Error('step01_source_facts_evidence_content_invalid');
  }
  const frames = supplement.rows.map(row => ({
    shot_id:String(row.shot_id || ''),
    point:String(row.point || ''),
    relative_path:safeRelative(row.relative_path, 'step01_source_facts_frame_path_invalid'),
    sha256:String(row.sha256 || ''),
    bytes:Number(row.bytes || 0)
  }));
  const dialogue = normalizeRows(parseCsv(dialogueText), 'dialogue');
  const ocr = normalizeRows(parseCsv(ocrText), 'ocr');
  const timeline = buildTimeline(shots.shots, frames, dialogue, ocr);
  const expectedPoints = new Set(['start', 'mid', 'end']);
  const coverage = timeline.length > 0 && timeline.every(item => item.end_ms > item.start_ms && new Set(item.evidence.keyframes.map(frame => frame.point)).size === expectedPoints.size);
  const firstStart = Math.min(...timeline.map(item => item.start_ms));
  const lastEnd = Math.max(...timeline.map(item => item.end_ms));
  const timeCoverage = firstStart <= 250 && Math.abs(lastEnd - Math.round(durationSeconds * 1000)) <= 1000;
  if (!coverage || !timeCoverage) throw new Error('step01_source_facts_coverage_invalid');
  await fsp.mkdir(outputRoot, {recursive:true});
  const sourceManifest = {
    schema_version:FACTS_SCHEMA,
    profile:FACTS_PROFILE,
    project_id:project.id,
    analysis_run_id:analysisRun.id,
    source_revision:project.sourceRevision,
    source_sha256:project.source.sha256,
    source_bytes:project.source.bytes,
    source_duration_ms:Math.round(durationSeconds * 1000),
    evidence_manifest:{relative_path:path.relative(sourceRoot, manifestPath).replace(/\\/g, '/'), sha256:(await fileEvidence(manifestPath)).sha256},
    test_only:false,
    real_delivery:false
  };
  const continuity = {schema_version:FACTS_SCHEMA, project_id:project.id, analysis_run_id:analysisRun.id, source_sha256:project.source.sha256, observations:[], unresolved:true, note:'Continuity facts remain evidence-first until a dedicated visual fact extractor contributes source-bound observations.'};
  const qa = {schema_version:FACTS_SCHEMA, status:'passed', project_id:project.id, analysis_run_id:analysisRun.id, source_sha256:project.source.sha256, checks:{source_binding:true, shot_time_coverage:true, frame_coverage:true, dialogue_ledger_bound:true, ocr_ledger_bound:true, test_only_rejected:true}, coverage:{source_duration_ms:Math.round(durationSeconds * 1000), first_shot_start_ms:firstStart, last_shot_end_ms:lastEnd, shot_count:timeline.length, frame_count:frames.length, dialogue_count:dialogue.length, ocr_count:ocr.length}, real_delivery:false};
  const artifacts = [];
  artifacts.push(await writeArtifact(outputRoot, 'source_manifest', sourceManifest));
  artifacts.push(await writeArtifact(outputRoot, 'shot_index', {schema_version:FACTS_SCHEMA, project_id:project.id, analysis_run_id:analysisRun.id, source_sha256:project.source.sha256, shots:shots.shots}));
  artifacts.push(await writeArtifact(outputRoot, 'frame_manifest', {schema_version:FACTS_SCHEMA, project_id:project.id, analysis_run_id:analysisRun.id, source_sha256:project.source.sha256, frames}));
  artifacts.push(await writeArtifact(outputRoot, 'dialogue_ledger', {schema_version:FACTS_SCHEMA, project_id:project.id, analysis_run_id:analysisRun.id, source_sha256:project.source.sha256, entries:dialogue}));
  artifacts.push(await writeArtifact(outputRoot, 'ocr_ledger', {schema_version:FACTS_SCHEMA, project_id:project.id, analysis_run_id:analysisRun.id, source_sha256:project.source.sha256, entries:ocr}));
  artifacts.push(await writeArtifact(outputRoot, 'continuity_facts', continuity));
  artifacts.push(await writeArtifact(outputRoot, 'source_facts_timeline', {schema_version:FACTS_SCHEMA, project_id:project.id, analysis_run_id:analysisRun.id, source_sha256:project.source.sha256, duration_ms:Math.round(durationSeconds * 1000), shots:timeline}));
  artifacts.push(await writeArtifact(outputRoot, 'fact_coverage_qa', qa));
  const ledger = {schema_version:'artifact_ledger_v1', project_id:project.id, analysis_run_id:analysisRun.id, source_revision:project.sourceRevision, source_sha256:project.source.sha256, status:'verified', artifacts, test_only:false, real_delivery:false};
  const ledgerArtifact = await writeArtifact(outputRoot, 'artifact_ledger', ledger);
  const result = {schema_version:FACTS_SCHEMA, project_id:project.id, analysis_run_id:analysisRun.id, source_revision:project.sourceRevision, source_sha256:project.source.sha256, status:LEGACY_STATUS, success:true, production_eligible:false, artifact_ledger_sha256:ledgerArtifact.sha256, test_only:false, real_delivery:false};
  const resultArtifact = await writeArtifact(outputRoot, 'result_manifest', result);
  const packageValue = {schema_version:FACTS_SCHEMA, profile:FACTS_PROFILE, project_id:project.id, analysis_run_id:analysisRun.id, source_revision:project.sourceRevision, source_sha256:project.source.sha256, source_bytes:project.source.bytes, status:LEGACY_STATUS, production_eligible:false, artifacts:[...artifacts, ledgerArtifact, resultArtifact], timeline:{artifact_id:'source_facts_timeline', sha256:artifacts.find(item => item.artifact_id === 'source_facts_timeline').sha256}, qa:{artifact_id:'fact_coverage_qa', sha256:artifacts.find(item => item.artifact_id === 'fact_coverage_qa').sha256, status:'passed'}, test_only:false, real_delivery:false};
  const packagePath=path.join(outputRoot, 'legacy_source_facts_package.json');
  await atomicJson(packagePath, packageValue);
  return {...packageValue, exact_path:packagePath, ...(await fileEvidence(packagePath))};
}

async function validateSourceFactsPackage(options = {}) {
  const packagePath = path.resolve(String(options.packagePath || ''));
  const expected = options.expected || {};
  const packageValue = await readJson(packagePath);
  if (options.allowLegacyOnly!==true || packageValue.schema_version !== FACTS_SCHEMA || packageValue.profile !== FACTS_PROFILE || packageValue.status !== LEGACY_STATUS || packageValue.production_eligible !== false || packageValue.test_only === true || packageValue.real_delivery !== false || packageValue.project_id !== expected.projectId || packageValue.analysis_run_id !== expected.analysisRunId || packageValue.source_sha256 !== expected.sourceSha256 || Number(packageValue.source_revision) !== Number(expected.sourceRevision) || !Array.isArray(packageValue.artifacts)) {
    throw new Error('step01_source_facts_package_contract_invalid');
  }
  const root = path.dirname(packagePath);
  const artifacts = new Map();
  for (const artifact of packageValue.artifacts) {
    const id = String(artifact.artifact_id || '');
    if (!id || artifacts.has(id) || artifact.status !== 'verified' || !/^[a-f0-9]{64}$/.test(String(artifact.sha256 || '')) || !Number.isSafeInteger(Number(artifact.bytes)) || Number(artifact.bytes) < 1) throw new Error('step01_source_facts_artifact_contract_invalid');
    const expectedPath = path.join(root, id + '.json');
    const actual = await fileEvidence(expectedPath);
    if (actual.sha256 !== artifact.sha256 || actual.bytes !== Number(artifact.bytes)) throw new Error('step01_source_facts_artifact_hash_mismatch:' + id);
    artifacts.set(id, artifact);
  }
  for (const id of REQUIRED_ARTIFACTS) if (!artifacts.has(id)) throw new Error('step01_source_facts_required_artifact_missing:' + id);
  const [timeline, qa] = await Promise.all([
    readJson(path.join(root, 'source_facts_timeline.json')),
    readJson(path.join(root, 'fact_coverage_qa.json'))
  ]);
  if (!Array.isArray(timeline.shots) || !timeline.shots.length || qa.status !== 'passed' || qa.checks?.source_binding !== true || qa.checks?.shot_time_coverage !== true || qa.checks?.frame_coverage !== true) throw new Error('step01_source_facts_qa_invalid');
  return {package:packageValue, evidence:await fileEvidence(packagePath), timeline, qa};
}

module.exports = {FACTS_PROFILE, FACTS_SCHEMA, LEGACY_STATUS, REQUIRED_ARTIFACTS, buildSourceFactsPackage, fileEvidence, validateSourceFactsPackage};
