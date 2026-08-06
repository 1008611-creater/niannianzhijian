const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const LEDGER_SCHEMA = 'niannian.step01_source_shot_ledger.v1';
const REVISION_SCHEMA = 'niannian.step01_source_shot_ledger_revision.v1';

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(Buffer.isBuffer(value) ? value : String(value)).digest('hex');
}

function codedError(code, httpStatus, message) {
  const error = new Error(message || code);
  error.code = code;
  error.httpStatus = httpStatus;
  return error;
}

function safeSegment(value, pattern = /^[A-Za-z0-9._:-]{1,160}$/) {
  const output = String(value || '');
  if (!pattern.test(output)) throw codedError('STEP01_LEDGER_IDENTIFIER_INVALID', 422, '账本标识无效');
  return output;
}

function seconds(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function timecode(value) {
  const sec = Math.max(0, seconds(value));
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const remainder = (sec % 60).toFixed(3).padStart(6, '0');
  return [hours, minutes].map(part => String(part).padStart(2, '0')).join(':') + ':' + remainder;
}

async function readJson(filePath, fallback) {
  try { return JSON.parse(await fsp.readFile(filePath, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT' && arguments.length > 1) return fallback;
    throw error;
  }
}

async function atomicWriteJson(filePath, value, {exclusive = false} = {}) {
  await fsp.mkdir(path.dirname(filePath), {recursive:true});
  const temporary = filePath + '.tmp-' + process.pid + '-' + crypto.randomBytes(6).toString('hex');
  await fsp.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', {flag:'wx'});
  try {
    if (exclusive) {
      try { await fsp.link(temporary, filePath); return true; }
      catch (error) { if (error.code === 'EEXIST') return false; throw error; }
      finally { await fsp.rm(temporary, {force:true}); }
    }
    await fsp.rename(temporary, filePath);
    return true;
  } catch (error) {
    await fsp.rm(temporary, {force:true}).catch(() => {});
    throw error;
  }
}

function artifactByRole(manifest, role) {
  return (manifest.artifacts || []).find(row => row.role === role || row.role === role.replace(':', '_'));
}

function rowsFrom(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.rows)) return value.rows;
  if (Array.isArray(value?.segments)) return value.segments;
  return [];
}

function normalizeShotId(value) {
  const raw = String(value || '').replace(/^S/i, '');
  return 'S' + raw.padStart(3, '0');
}

function safeFrameRelativePath(value) {
  const relative = String(value || '').replace(/\\/g, '/');
  if (!relative || path.isAbsolute(relative) || relative.includes('\0') || path.posix.normalize(relative) !== relative || relative.startsWith('../')) {
    throw codedError('STEP01_LEDGER_FRAME_PATH_INVALID', 503, 'Step01 权威关键帧路径无效');
  }
  return relative;
}

async function recoveredFrameManifest({artifactRoot, project}) {
  const manifestPath = path.join(artifactRoot, 'step01_frame_recovery_manifest.json');
  const recovery = await readJson(manifestPath, null);
  if (!recovery) return null;
  if (recovery.schema_version !== 'niannian.step01_frame_recovery.v1' || recovery.status !== 'verified' || recovery.downstream_consumable !== true || recovery.project_id !== project.id || recovery.source_sha256 !== project.source?.sha256 || Number(recovery.source_bytes) !== Number(project.source?.bytes) || !Array.isArray(recovery.frames)) {
    throw codedError('STEP01_LEDGER_FRAME_RECOVERY_INVALID', 503, 'Step01 恢复关键帧清单无效');
  }
  const records = [];
  for (const frame of recovery.frames) {
    const relativePath = safeFrameRelativePath(frame.relative_path);
    if (!relativePath.startsWith('recovered_source_frames/') || !/\.png$/i.test(relativePath) || !/^[a-f0-9]{64}$/.test(String(frame.sha256 || '')) || !Number.isSafeInteger(Number(frame.bytes)) || Number(frame.bytes) <= 0) {
      throw codedError('STEP01_LEDGER_FRAME_RECOVERY_INVALID', 503, 'Step01 恢复关键帧记录无效');
    }
    const filePath = path.resolve(artifactRoot, ...relativePath.split('/'));
    if (!filePath.startsWith(path.resolve(artifactRoot, 'recovered_source_frames') + path.sep)) throw codedError('STEP01_LEDGER_FRAME_PATH_INVALID', 503, 'Step01 权威关键帧路径无效');
    const bytes = await fsp.readFile(filePath).catch(() => null);
    if (!bytes || bytes.length !== Number(frame.bytes) || sha256(bytes) !== frame.sha256) throw codedError('STEP01_LEDGER_FRAME_RECOVERY_INTEGRITY_FAILED', 503, 'Step01 恢复关键帧完整性校验失败');
    records.push({
      role:'native_png:recovered_source_frames', relative_path:relativePath,
      sha256:frame.sha256, bytes:Number(frame.bytes), width:Number(frame.width || 1080), height:Number(frame.height || 1920)
    });
  }
  return {manifest:recovery, records};
}

function buildShotLedger({project, wrapper, strictManifest, transnetShots, shotFrames, dialogueLedger, ocrLedger}) {
  const strictFrames = new Map((strictManifest.artifacts || []).filter(row => /^(?:shotlevel_start_mid_end_frames|recovered_source_frames)\//.test(String(row.relative_path || ''))).map(row => [path.basename(String(row.relative_path)), row]));
  const frameRows = rowsFrom(shotFrames).map(row => {
    const authority = strictFrames.get(path.basename(String(row.file || row.relative_path || '')));
    return authority ? {...row, relative_path:authority.relative_path, sha256:authority.sha256, bytes:authority.bytes, width:authority.width, height:authority.height} : row;
  });
  const dialogueRows = rowsFrom(dialogueLedger).map((row, index) => ({
    dialogue_id:String(row.dialogue_id || row.event_id || 'D' + String(index + 1).padStart(3, '0')),
    source_start_sec:seconds(row.source_start_sec ?? row.start_sec),
    source_end_sec:seconds(row.source_end_sec ?? row.end_sec),
    source_speaker:String(row.source_speaker || row.speaker || 'speaker_unknown'),
    source_text:String(row.source_text || row.text || ''),
    evidence_basis:[row.source_tool || row.evidence_basis || row.notes || 'step01_dialogue_ledger'].flat().filter(Boolean),
    attribution_status:String(row.speaker_attribution_status || row.attribution_status || 'asr_or_subtitle_evidence')
  })).filter(row => row.source_text && row.source_end_sec >= row.source_start_sec);
  const ocrRows = rowsFrom(ocrLedger).map((row, index) => ({
    ocr_id:String(row.ocr_id || 'OCR' + String(index + 1).padStart(3, '0')),
    time_sec:seconds(row.time_sec),
    timecode:String(row.timecode || timecode(row.time_sec)),
    source_text:String(row.source_text || row.ocr_text || row.text || ''),
    region:String(row.region || row.crop_role || ''),
    model:String(row.paddle_model || row.model || ''),
    evidence_basis:String(row.selection_reasons || row.selection_reason || 'step01_smart_ocr')
  })).filter(row => row.source_text);
  const frameByShot = new Map();
  for (const frame of frameRows) {
    const shotId = normalizeShotId(frame.shot_id);
    const point = String(frame.point || '');
    if (!['start', 'mid', 'end'].includes(point)) continue;
    const row = frameByShot.get(shotId) || {};
    row[point] = {
      point,
      time_sec:seconds(frame.time_sec),
      timecode:String(frame.timecode || timecode(frame.time_sec)),
      relative_path:String(frame.relative_path || ''),
      sha256:String(frame.sha256 || ''),
      bytes:Number(frame.bytes || 0),
      width:Number(frame.width || 1080),
      height:Number(frame.height || 1920)
    };
    frameByShot.set(shotId, row);
  }
  const shots = rowsFrom(transnetShots).map((shot, index) => {
    const shotId = normalizeShotId(shot.shot_id || index + 1);
    const start = seconds(shot.start_sec);
    const end = seconds(shot.end_sec);
    const dialogues = dialogueRows.filter(row => row.source_end_sec >= start && row.source_start_sec <= end).map(row => row.dialogue_id);
    const ocr = ocrRows.filter(row => row.time_sec >= start && row.time_sec <= end).map(row => row.ocr_id);
    const frames = frameByShot.get(shotId) || {};
    return {
      shot_id:shotId,
      sequence:index + 1,
      start_sec:start,
      end_sec:end,
      duration_sec:Number((end - start).toFixed(3)),
      start_timecode:String(shot.start_timecode || timecode(start)),
      end_timecode:String(shot.end_timecode || timecode(end)),
      source_detector:String(shot.source_detector || 'transnetv2'),
      frame_evidence:['start', 'mid', 'end'].map(point => frames[point]).filter(Boolean),
      dialogue_ids:dialogues,
      ocr_ids:ocr,
      source_visual_facts:'',
      characters:[],
      wardrobe:'',
      props:[],
      action:'',
      expression:'',
      continuity_block_id:null,
      user_revision_ids:[]
    };
  }).filter(row => row.shot_id && row.duration_sec >= 0);
  const counts = strictManifest.counts || wrapper.strictEvidence?.counts || {};
  const content = {
    schema_version:LEDGER_SCHEMA,
    project_id:project.id,
    analysis_run_id:project.analysis?.runId || wrapper.analysisRunId,
    source_sha256:project.source?.sha256 || wrapper.source?.sha256,
    source_bytes:Number(project.source?.bytes || wrapper.source?.bytes || 0),
    evidence_manifest_sha256:artifactByRole(wrapper, 'frames')?.sha256 || sha256(canonical(strictManifest)),
    ledger_policy_version:'source-shot-ledger-from-step01-v1',
    counts:{
      shots:shots.length,
      frame_evidence:shots.reduce((sum, shot) => sum + shot.frame_evidence.length, 0),
      dialogue_rows:dialogueRows.length,
      ocr_rows:ocrRows.length,
      expected_shots:Number(counts.transnet_shots || shots.length),
      expected_frame_evidence:Number(counts.shot_triad_rows || 0)
    },
    shots,
    dialogue_rows:dialogueRows,
    ocr_rows:ocrRows,
    revisions:[],
    projection:{markdown_available:true, docx_available:false},
    created_at:String(wrapper.createdAt || strictManifest.created_at || '')
  };
  const snapshotSha = sha256(canonical(content));
  return {...content, snapshot_id:'S01LEDGER-' + snapshotSha.slice(0, 24), snapshot_sha256:snapshotSha};
}

async function buildLedgerFromEvidenceRoot({evidenceRoot, project}) {
  const root = path.resolve(evidenceRoot);
  const wrapper = await readJson(path.join(root, 'step01-evidence-manifest.json'));
  const artifactRoot = path.join(root, 'artifacts');
  const strictManifest = await readJson(path.join(artifactRoot, 'step01_evidence_manifest.json'));
  const transnetShots = await readJson(path.join(artifactRoot, 'transnet_shots', 'EP001_transnet_shots.json'));
  const shotFrames = await readJson(path.join(artifactRoot, 'shotlevel_start_mid_end_manifest.json'));
  const dialogueLedger = await readJson(path.join(artifactRoot, 'EP001_dialogue_ledger.json'), []);
  const ocrLedger = await readJson(path.join(artifactRoot, 'smart_ocr', 'EP001_smart_ocr_ledger.json'), []);
  if (wrapper.projectId !== project.id || wrapper.analysisRunId !== project.analysis?.runId) throw codedError('STEP01_LEDGER_BINDING_MISMATCH', 409, 'Step01 账本与项目 run 不一致');
  if (wrapper.source?.sha256 !== project.source?.sha256 || Number(wrapper.source?.bytes) !== Number(project.source?.bytes)) throw codedError('STEP01_LEDGER_SOURCE_MISMATCH', 409, 'Step01 账本与源视频不一致');
  if (strictManifest.status !== 'verified' || strictManifest.downstream_consumable !== true) throw codedError('STEP01_LEDGER_EVIDENCE_NOT_VERIFIED', 409, 'Step01 证据未通过严格校验');
  const recovery = await recoveredFrameManifest({artifactRoot, project});
  const evidenceManifest = recovery
    ? {...strictManifest, artifacts:recovery.records, recovered_source_frame_manifest_sha256:recovery.manifest.manifest_sha256 || sha256(canonical(recovery.manifest)), created_at:recovery.manifest.created_at || strictManifest.created_at}
    : strictManifest;
  return buildShotLedger({project, wrapper, strictManifest:evidenceManifest, transnetShots, shotFrames, dialogueLedger, ocrLedger});
}

function overlayRoot(root, project) {
  const projectId = typeof project === 'string' ? project : project?.id;
  const revisionId = typeof project === 'object' ? String(project?.analysis?.authorityRevisionId || '') : '';
  const base = path.join(path.resolve(root), safeSegment(projectId, /^[A-Za-z0-9-]{8,80}$/));
  // Legacy evidence keeps its historical overlay location. Accepted revisions
  // never inherit edits merely because an old shot happens to share an ID.
  return revisionId ? path.join(base, 'revisions-by-authority', safeSegment(revisionId, /^analysis-[A-Za-z0-9-]{8,120}$/)) : base;
}

async function readLedger({evidenceRoot, overlayRoot:overlay, project}) {
  const base = await buildLedgerFromEvidenceRoot({evidenceRoot, project});
  const revisionDir = path.join(overlayRoot(overlay, project), 'revisions');
  const names = (await fsp.readdir(revisionDir).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error))).filter(name => /^\d{13}-S01REV-[a-f0-9]{20}\.json$/.test(name)).sort();
  const revisions = [];
  const ledger = JSON.parse(JSON.stringify(base));
  for (const name of names) {
    const revision = await readJson(path.join(revisionDir, name));
    if (revision.schema_version !== REVISION_SCHEMA || revision.project_id !== project.id) throw codedError('STEP01_LEDGER_REVISION_CORRUPT', 503, 'Step01 账本修订事件损坏');
    const shot = ledger.shots.find(row => row.shot_id === revision.shot_id);
    if (!shot) throw codedError('STEP01_LEDGER_REVISION_SHOT_MISSING', 503, 'Step01 账本修订镜头不存在');
    for (const change of revision.changes || []) {
      if (!['source_visual_facts', 'characters', 'wardrobe', 'props', 'action', 'expression', 'continuity_block_id'].includes(change.field)) throw codedError('STEP01_LEDGER_REVISION_FIELD_INVALID', 503, 'Step01 账本修订字段无效');
      shot[change.field] = change.after;
    }
    shot.user_revision_ids = [...new Set([...(shot.user_revision_ids || []), revision.revision_id])];
    revisions.push(revision);
  }
  ledger.revisions = revisions.map(row => ({revision_id:row.revision_id, shot_id:row.shot_id, reason:row.reason, created_at:row.created_at, affected:row.affected}));
  const {snapshot_sha256, snapshot_id, ...withoutIdentity} = ledger;
  const nextSha = sha256(canonical(withoutIdentity));
  ledger.snapshot_id = 'S01LEDGER-' + nextSha.slice(0, 24);
  ledger.snapshot_sha256 = nextSha;
  return ledger;
}

function markdownProjection(ledger) {
  const lines = [
    '# Step01 Source Shot Authority Ledger',
    '',
    `Project: ${ledger.project_id}`,
    `Analysis run: ${ledger.analysis_run_id}`,
    `Source SHA-256: ${ledger.source_sha256}`,
    `Ledger SHA-256: ${ledger.snapshot_sha256}`,
    '',
    '| Shot | Timecode | Frames | Dialogue | OCR | Source visual facts | Characters | Action | Continuity |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |'
  ];
  for (const shot of ledger.shots) {
    const dialogue = shot.dialogue_ids.map(id => {
      const row = ledger.dialogue_rows.find(item => item.dialogue_id === id);
      return row ? `${row.source_speaker}: ${row.source_text}` : id;
    }).join('<br>');
    const ocr = shot.ocr_ids.map(id => {
      const row = ledger.ocr_rows.find(item => item.ocr_id === id);
      return row ? row.source_text : id;
    }).join('<br>');
    lines.push(`| ${shot.shot_id} | ${shot.start_timecode}-${shot.end_timecode} | ${shot.frame_evidence.length} | ${dialogue || ''} | ${ocr || ''} | ${shot.source_visual_facts || ''} | ${(shot.characters || []).join(', ')} | ${shot.action || ''} | ${shot.continuity_block_id || ''} |`);
  }
  return lines.join('\n') + '\n';
}

async function appendRevision({evidenceRoot, overlayRoot:overlay, project, ifMatch, body, actor}) {
  const current = await readLedger({evidenceRoot, overlayRoot:overlay, project});
  const etag = '"step01-ledger-' + current.snapshot_sha256 + '"';
  if (!ifMatch || String(ifMatch).replace(/^W\//, '') !== etag) throw codedError('STEP01_LEDGER_REVISION_CONFLICT', 409, 'Step01 账本已变化，请刷新后重试');
  const shotId = safeSegment(body?.shot_id, /^S\d{3}$/);
  if (!current.shots.some(row => row.shot_id === shotId)) throw codedError('STEP01_LEDGER_SHOT_NOT_FOUND', 404, '镜头不存在');
  const changes = Array.isArray(body?.changes) ? body.changes : [];
  if (!changes.length || changes.length > 12) throw codedError('STEP01_LEDGER_CHANGES_REQUIRED', 422, '修订内容无效');
  const allowed = new Set(['source_visual_facts', 'characters', 'wardrobe', 'props', 'action', 'expression', 'continuity_block_id']);
  const normalized = changes.map(change => {
    const field = String(change.field || '');
    if (!allowed.has(field)) throw codedError('STEP01_LEDGER_FIELD_NOT_EDITABLE', 422, '该字段不能从界面修订');
    return {field, before:change.before ?? null, after:change.after ?? null};
  });
  const revisionCore = {
    schema_version:REVISION_SCHEMA,
    project_id:project.id,
    analysis_run_id:project.analysis?.runId,
    source_sha256:project.source?.sha256,
    base_snapshot_sha256:current.snapshot_sha256,
    revision_id:'S01REV-' + sha256(canonical({shotId, normalized, actor, at:Date.now()})).slice(0, 20),
    shot_id:shotId,
    changes:normalized,
    reason:String(body?.reason || '').slice(0, 800),
    affected:{shots:[shotId], downstream_policy:'invalidate_only_affected_step03_items_no_provider_submit'},
    created_by:sha256(String(actor || 'unknown')),
    created_at:new Date().toISOString()
  };
  const revision = {...revisionCore, revision_sha256:sha256(canonical(revisionCore))};
  const filePath = path.join(overlayRoot(overlay, project), 'revisions', String(Date.now()).padStart(13, '0') + '-' + revision.revision_id + '.json');
  await atomicWriteJson(filePath, revision, {exclusive:true});
  return readLedger({evidenceRoot, overlayRoot:overlay, project});
}

module.exports = {
  LEDGER_SCHEMA,
  REVISION_SCHEMA,
  buildLedgerFromEvidenceRoot,
  readLedger,
  appendRevision,
  markdownProjection,
  canonical,
  sha256,
  codedError
};
