'use strict';

// Haika's Step01 worker is deliberately evidence-first: it creates and hashes
// every media input before GPT may describe the source frames.
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const {spawn} = require('child_process');
const sharp = require('sharp');
const evidencePackage = require('./niannian_step01_evidence_package');
const evidenceEvents = require('./niannian_step01_evidence_events');

const PROFILE = 'haika-step01-hq-full-v1';
const EVIDENCE_PROFILE = 'hq_full';
const ROUTES = Object.freeze(['mx-shortdrama-00-router', 'mx-shortdrama-01-frame-extract']);
const MAX_SEGMENTS = 8;
const DEFAULT_GPT_ATTEMPTS = 2;

function now() { return new Date().toISOString(); }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function safeProjectId(value) {
  const id = String(value || '').trim();
  if (!/^NN-[A-Z0-9-]{10,80}$/.test(id)) throw coded('STEP01_SERVER_PROJECT_ID_INVALID', '项目标识无效');
  return id;
}
function coded(code, message, cause) { const error = new Error(message || code); error.code = code; error.cause = cause; return error; }
function isInside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return Boolean(relative) && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}
async function atomicJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), {recursive:true});
  const temporary = filePath + '.tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
  await fsp.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', {encoding:'utf8', flag:'wx'});
  await fsp.rename(temporary, filePath);
}
async function acquireRunLock(jobRoot, analysisRunId) {
  const lockPath = path.join(jobRoot, 'analysis_runs', analysisRunId, 'server_step01.lock');
  await fsp.mkdir(path.dirname(lockPath), {recursive:true});
  try {
    const handle = await fsp.open(lockPath, 'wx');
    await handle.writeFile(JSON.stringify({pid:process.pid, created_at:now(), profile:PROFILE}) + '\n');
    return async () => { await handle.close().catch(() => {}); await fsp.unlink(lockPath).catch(() => {}); };
  } catch (error) {
    if (error.code === 'EEXIST') throw coded('STEP01_SERVER_RUN_LOCKED', '当前原片分析仍在执行');
    throw error;
  }
}
async function fileEvidence(filePath) {
  const stats = await fsp.lstat(filePath);
  if (!stats.isFile() || stats.isSymbolicLink()) throw coded('STEP01_SERVER_ARTIFACT_INVALID', '分析产物不是安全文件');
  const bytes = await fsp.readFile(filePath);
  return {exact_path:filePath, sha256:sha256(bytes), bytes:bytes.length};
}
async function writeJsonArtifact(root, relativePath, value) {
  const target = path.resolve(root, relativePath);
  if (!isInside(root, target)) throw coded('STEP01_SERVER_ARTIFACT_PATH_INVALID', '分析产物路径无效');
  await atomicJson(target, value);
  const evidence = await fileEvidence(target);
  return {relative_path:path.relative(root, target).replace(/\\/g, '/'), ...evidence};
}
function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {cwd:options.cwd, windowsHide:true, stdio:['ignore', 'pipe', 'pipe']});
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += String(chunk); });
    child.stderr.on('data', chunk => { stderr += String(chunk); });
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(coded('STEP01_SERVER_MEDIA_TIMEOUT', '媒体分析超时')); }, options.timeoutMs || 120000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => {
      clearTimeout(timer);
      if (code !== 0) return reject(coded('STEP01_SERVER_MEDIA_COMMAND_FAILED', String(command) + ' 执行失败', {code, stderr:stderr.slice(-2000)}));
      resolve({stdout, stderr});
    });
  });
}
function ffprobeCommand() { return String(process.env.NIANNIAN_FFPROBE_PATH || 'ffprobe'); }
function ffmpegCommand() { return String(process.env.NIANNIAN_FFMPEG_PATH || 'ffmpeg'); }
function hqPythonCommand(env = process.env) { return String(env.NIANNIAN_STEP01_HQ_PYTHON || 'python3'); }
function hqRunnerPath(env = process.env) { return String(env.NIANNIAN_STEP01_HQ_RUNNER || path.join(__dirname, 'niannian_step01_hq_runner.py')); }
function hqSkillRoots(env = process.env) {
  const step01 = String(env.NIANNIAN_STEP01_HQ_STEP01_SKILL_ROOT || '').trim();
  const step02 = String(env.NIANNIAN_STEP01_HQ_STEP02_SKILL_ROOT || '').trim();
  if (!step01 || !step02) throw coded('STEP01_HQ_RUNTIME_NOT_CONFIGURED', '完整原片分析运行环境尚未配置');
  return {step01, step02};
}
function hqCapabilities(env = process.env) {
  const keys = ['MIMO_API_KEY', 'PADDLEOCR_API_TOKEN', 'NIANNIAN_STEP01_GPT_API_KEY'];
  const missing = keys.filter(key => !String(env[key] || '').trim());
  if (missing.length) throw coded('STEP01_HQ_CREDENTIALS_MISSING', '完整原片分析服务尚未配置');
  return {credentials_configured:true, required_services:['mimo_asr', 'paddle_ocr', 'gpt_5_6'], missing:[]};
}
async function runHqWorker({sourcePath, root, project, analysisRun, env = process.env}) {
  const manifestPath = path.join(root, 'step01_evidence_manifest.json');
  const existingManifest = await fsp.readFile(manifestPath, 'utf8').then(JSON.parse).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
  if (existingManifest) {
    validateHqManifest(existingManifest, project, analysisRun);
    return existingManifest;
  }
  const roots = hqSkillRoots(env);
  hqCapabilities(env);
  const runner = hqRunnerPath(env);
  const runnerStats = await fsp.stat(runner).catch(() => null);
  if (!runnerStats?.isFile()) throw coded('STEP01_HQ_RUNNER_MISSING', '完整原片分析执行器缺失');
  const episodeId = 'EP001';
  await run(hqPythonCommand(env), [runner, '--source', sourcePath, '--output', root, '--episode-id', episodeId, '--project-id', project.id, '--analysis-run-id', analysisRun.id, '--source-revision', String(analysisRun.source_revision), '--source-sha256', project.source.sha256, '--source-bytes', String(project.source.bytes), '--step01-skill-root', roots.step01, '--step02-skill-root', roots.step02], {cwd:root,timeoutMs:Math.max(300000, Number(env.NIANNIAN_STEP01_HQ_TIMEOUT_MS || 3600000))});
  const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
  validateHqManifest(manifest, project, analysisRun);
  return manifest;
}
function validateHqManifest(manifest, project, analysisRun) {
  if (manifest.schema_version !== 'step01_evidence_manifest_v1'
    || manifest.profile !== EVIDENCE_PROFILE
    || manifest.status !== 'verified'
    || manifest.downstream_consumable !== true
    || manifest.project_id !== project.id
    || manifest.analysis_run_id !== analysisRun.id
    || Number(manifest.source_revision) !== Number(project.sourceRevision)
    || manifest.source_sha256 !== project.source.sha256
    || Number(manifest.source_bytes) !== Number(project.source.bytes)) {
    throw coded('STEP01_HQ_MANIFEST_INVALID', '完整原片证据未通过校验');
  }
}
async function readVerifiedJsonPointer(root, pointer, code) {
  const relative = String(pointer?.relative_path || '').replace(/\\/g, '/');
  const target = path.resolve(root, relative);
  if (!relative || !isInside(root, target)) throw coded(code, '完整原片证据路径无效');
  const evidence = await fileEvidence(target);
  if (evidence.sha256 !== pointer.sha256 || evidence.bytes !== Number(pointer.bytes)) throw coded(code, '完整原片证据哈希不一致');
  return JSON.parse(await fsp.readFile(target, 'utf8'));
}
async function attachHqVisualFacts({root, manifest, project, analysisRun, env, fetchImpl}) {
  const accepted = await readVerifiedJsonPointer(root, manifest.transnet?.accepted_shots, 'STEP01_HQ_TRANSNET_POINTER_INVALID');
  const supplement = await readVerifiedJsonPointer(root, manifest.transnet?.shot_supplement, 'STEP01_HQ_FRAME_POINTER_INVALID');
  const rawShots = Array.isArray(accepted?.shots) ? accepted.shots : [];
  const rawFrames = Array.isArray(supplement?.rows) ? supplement.rows : [];
  const timeline = rawShots.map((shot, index) => ({shot_id:String(shot.shot_id ?? index + 1),start_sec:Number(shot.start_sec),end_sec:Number(shot.end_sec),method:'transnetv2'}));
  if (!timeline.length || timeline.some(shot => !Number.isFinite(shot.start_sec) || !Number.isFinite(shot.end_sec) || shot.end_sec <= shot.start_sec)) throw coded('STEP01_HQ_TRANSNET_CONTENT_INVALID', '真实镜头时间线无效');
  const frames = rawFrames.map(row => ({shot_id:String(row.shot_id),point:String(row.point),time_sec:Number(row.time_sec || 0),relative_path:String(row.relative_path || ''),sha256:String(row.sha256 || ''),bytes:Number(row.bytes || 0)}));
  if (frames.length !== timeline.length * 3) throw coded('STEP01_HQ_FRAME_COVERAGE_INVALID', '真实镜头关键帧覆盖不完整');
  for (const frame of frames) {
    const filePath = path.resolve(root, frame.relative_path);
    if (!isInside(root, filePath)) throw coded('STEP01_HQ_FRAME_POINTER_INVALID', '真实镜头关键帧路径无效');
    const evidence = await fileEvidence(filePath);
    if (evidence.sha256 !== frame.sha256 || evidence.bytes !== frame.bytes) throw coded('STEP01_HQ_FRAME_HASH_INVALID', '真实镜头关键帧哈希不一致');
  }
  const visualInputs = await createVisualAnalysisFrames({
    root,
    frames,
    maxDimension:Number(env.NIANNIAN_STEP01_GPT_FRAME_MAX_DIMENSION || 1024),
    quality:Number(env.NIANNIAN_STEP01_GPT_FRAME_JPEG_QUALITY || 72)
  });
  manifest.visual_inputs = visualInputs.manifest;
  await atomicJson(path.join(root, 'step01_evidence_manifest.json'), manifest);
  const visual = await analyzeFramesBatched({
    config:modelConfig(env), root, project, analysisRun, timeline, frames:visualInputs.frames, fetchImpl,
    batchSize:Number(env.NIANNIAN_STEP01_GPT_SHOT_BATCH_SIZE || 1)
  });
  const visualFacts = await writeJsonArtifact(root, 'artifacts/visual_facts.json', {schema_version:'niannian_haika_step01_visual_facts_v1',project_id:project.id,analysis_run_id:analysisRun.id,source_sha256:project.source.sha256,model:visual.model,segments:visual.segments});
  manifest.visual_facts = visualFacts;
  manifest.execution = {...manifest.execution,model:visual.model};
  await atomicJson(path.join(root, 'step01_evidence_manifest.json'), manifest);
  return {manifest, visualFacts};
}
async function createVisualAnalysisFrames({root, frames, maxDimension = 1024, quality = 72}) {
  const limit = Math.max(512, Math.min(1536, Number(maxDimension || 1024)));
  const jpegQuality = Math.max(50, Math.min(90, Number(quality || 72)));
  const outputFrames = [];
  const mappings = [];
  for (const frame of frames) {
    const sourcePath = path.resolve(root, frame.relative_path);
    if (!isInside(root, sourcePath)) throw coded('STEP01_HQ_FRAME_POINTER_INVALID', '真实镜头关键帧路径无效');
    const fileName = 'S' + String(frame.shot_id).padStart(4, '0') + '_' + String(frame.point) + '.jpg';
    const targetPath = path.resolve(root, 'artifacts', 'visual_inputs', fileName);
    if (!isInside(root, targetPath)) throw coded('STEP01_HQ_VISUAL_INPUT_PATH_INVALID', '视觉分析副本路径无效');
    await fsp.mkdir(path.dirname(targetPath), {recursive:true});
    const temporaryPath = targetPath + '.tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
    try {
      await sharp(sourcePath, {failOn:'error'}).rotate().resize({width:limit,height:limit,fit:'inside',withoutEnlargement:true}).jpeg({quality:jpegQuality,chromaSubsampling:'4:2:0'}).toFile(temporaryPath);
      await fsp.rm(targetPath, {force:true});
      await fsp.rename(temporaryPath, targetPath);
    } finally {
      await fsp.rm(temporaryPath, {force:true}).catch(() => {});
    }
    const derivative = await fileEvidence(targetPath);
    const relativePath = path.relative(root, targetPath).replace(/\\/g, '/');
    outputFrames.push({...frame,relative_path:relativePath,sha256:derivative.sha256,bytes:derivative.bytes});
    mappings.push({shot_id:String(frame.shot_id),point:String(frame.point),source:{relative_path:String(frame.relative_path).replace(/\\/g, '/'),sha256:String(frame.sha256),bytes:Number(frame.bytes)},analysis_copy:{relative_path:relativePath,sha256:derivative.sha256,bytes:derivative.bytes}});
  }
  const manifest = await writeJsonArtifact(root, 'artifacts/visual_input_derivatives.json', {schema_version:'niannian_step01_visual_input_derivatives_v1',transformation:{format:'jpeg',max_dimension:limit,quality:jpegQuality,fit:'inside',source_frames_preserved:true},frames:mappings});
  return {frames:outputFrames,manifest,mappings};
}
async function probe(sourcePath) {
  const {stdout} = await run(ffprobeCommand(), ['-v','error','-show_entries','format=duration:stream=codec_type,width,height,avg_frame_rate','-of','json',sourcePath]);
  let raw;
  try { raw = JSON.parse(stdout); } catch { throw coded('STEP01_SERVER_FFPROBE_JSON_INVALID', '媒体探测结果无效'); }
  const video = (raw.streams || []).find(item => item.codec_type === 'video') || {};
  const audio = (raw.streams || []).filter(item => item.codec_type === 'audio');
  const duration = Number(raw.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(Number(video.width)) || !Number.isFinite(Number(video.height))) throw coded('STEP01_SERVER_MEDIA_CONTRACT_INVALID', '源视频媒体信息不完整');
  const fraction = String(video.avg_frame_rate || '0/1').split('/').map(Number);
  const fps = fraction[1] ? fraction[0] / fraction[1] : 0;
  return {duration_seconds:duration, width:Number(video.width), height:Number(video.height), fps:Number.isFinite(fps) ? fps : 0, audio_stream_count:audio.length, raw};
}
function segmentTimeline(duration) {
  const count = Math.max(1, Math.min(MAX_SEGMENTS, Math.ceil(duration / 2)));
  return Array.from({length:count}, (_, index) => {
    const start = duration * index / count;
    const end = duration * (index + 1) / count;
    return {shot_id:String(index + 1), start_sec:Number(start.toFixed(3)), end_sec:Number(end.toFixed(3)), method:'uniform_time_segment'};
  });
}
async function extractFrame(sourcePath, targetPath, second) {
  await fsp.mkdir(path.dirname(targetPath), {recursive:true});
  await run(ffmpegCommand(), ['-y','-ss',String(Math.max(0, second)),'-i',sourcePath,'-frames:v','1','-q:v','2',targetPath]);
  return fileEvidence(targetPath);
}
async function createFrameEvidence({sourcePath, root, timeline}) {
  const rows = [];
  for (const shot of timeline) {
    const values = {start:shot.start_sec, mid:(shot.start_sec + shot.end_sec) / 2, end:Math.max(shot.start_sec, shot.end_sec - 0.04)};
    for (const [point, second] of Object.entries(values)) {
      const fileName = 'S' + String(shot.shot_id).padStart(4, '0') + '_' + point + '.jpg';
      const filePath = path.join(root, 'artifacts', 'shot_frames', fileName);
      const evidence = await extractFrame(sourcePath, filePath, second);
      rows.push({shot_id:String(shot.shot_id), point, time_sec:Number(second.toFixed(3)), relative_path:path.relative(root, filePath).replace(/\\/g, '/'), sha256:evidence.sha256, bytes:evidence.bytes});
    }
  }
  return rows;
}
function modelConfig(env = process.env) {
  const base = String(env.NIANNIAN_STEP01_GPT_API_BASE_URL || env.NIANNIAN_STEP03_GPT_API_BASE_URL || '').replace(/\/+$/, '');
  const key = String(env.NIANNIAN_STEP01_GPT_API_KEY || env.KRILL_CODEX_API_KEY || env.NIANNIAN_GPT_API_KEY || '').trim();
  const model = String(env.NIANNIAN_STEP01_GPT_MODEL || env.NIANNIAN_STEP03_GPT_MODEL || 'gpt-5.6-sol').trim();
  if (!/^https:\/\//.test(base) || !key || !model) throw coded('STEP01_SERVER_GPT_PROFILE_NOT_CONFIGURED', '原片分析服务尚未配置');
  return {base, key, model, endpoint:base + '/responses'};
}
function skillInstructions() {
  return [
    '允许路由：mx-shortdrama-00-router -> mx-shortdrama-01-frame-extract。',
    '只做 Step01 原片事实：逐段依据给定起中末帧描述可见人物、场景、动作、道具和可读文字。',
    '不得推断姓名、关系、动机、因果、镜头外事件或后续创作内容；看不清必须写入 uncertainty。',
    '不得调用工具、不得生成图片或视频、不得请求 Provider、不得输出提示词、不得改变像素或文件。',
    '每个 source_segment_id 必须恰好出现一次；visible_text 只能记录帧中可辨识的原始文字。'
  ].join('\n');
}
function responseSchema() {
  return {type:'object',additionalProperties:false,required:['segments'],properties:{segments:{type:'array',items:{type:'object',additionalProperties:false,required:['source_segment_id','observed_facts','visible_text','uncertainty'],properties:{source_segment_id:{type:'string'},observed_facts:{type:'array',items:{type:'string'}},visible_text:{type:'array',items:{type:'string'}},uncertainty:{type:'array',items:{type:'string'}}}}}}};
}
function extractResponseText(response) {
  if (typeof response?.output_text === 'string') return response.output_text;
  const parts = [];
  for (const output of response?.output || []) for (const content of output?.content || []) if (typeof content?.text === 'string') parts.push(content.text);
  if (!parts.length) throw coded('STEP01_SERVER_GPT_RESPONSE_EMPTY', '原片分析服务未返回结构化结果');
  return parts.join('\n');
}
function validateModelOutput(value, timeline) {
  if (!value || !Array.isArray(value.segments) || value.segments.length !== timeline.length) throw coded('STEP01_SERVER_GPT_SCHEMA_INVALID', '原片分析结果不完整');
  const expected = new Set(timeline.map(item => 'S' + String(item.shot_id).padStart(4, '0')));
  const seen = new Set();
  const clean = value.segments.map(item => {
    const id = String(item?.source_segment_id || '');
    if (!expected.has(id) || seen.has(id)) throw coded('STEP01_SERVER_GPT_SCOPE_INVALID', '原片分析结果包含未授权片段');
    seen.add(id);
    const list = key => (Array.isArray(item[key]) ? item[key] : []).map(value => String(value).trim()).filter(Boolean).slice(0, 20).map(value => value.slice(0, 400));
    return {source_segment_id:id, observed_facts:list('observed_facts'), visible_text:list('visible_text'), uncertainty:list('uncertainty')};
  });
  if (seen.size !== expected.size) throw coded('STEP01_SERVER_GPT_COVERAGE_INVALID', '原片分析未覆盖全部片段');
  return clean;
}
async function analyzeFrames({config, root, project, analysisRun, timeline, frames, fetchImpl = global.fetch}) {
  const frameByShot = new Map();
  for (const frame of frames) { const rows = frameByShot.get(frame.shot_id) || []; rows.push(frame); frameByShot.set(frame.shot_id, rows); }
  const content = [{type:'input_text',text:JSON.stringify({project_id:project.id,analysis_run_id:analysisRun.id,source_sha256:project.source.sha256,segments:timeline.map(shot => ({source_segment_id:'S' + String(shot.shot_id).padStart(4, '0'),start_ms:Math.round(shot.start_sec*1000),end_ms:Math.round(shot.end_sec*1000),frame_points:(frameByShot.get(shot.shot_id) || []).map(frame => frame.point)})),constraints:{source_facts_only:true,provider_submission_requested:false,package_send_requested:false,local_image_editing_requested:false}})}];
  for (const shot of timeline) for (const frame of (frameByShot.get(shot.shot_id) || []).sort((a,b) => a.point.localeCompare(b.point))) {
    const bytes = await fsp.readFile(path.join(root, frame.relative_path));
    content.push({type:'input_text',text:'source_segment_id=' + 'S' + String(shot.shot_id).padStart(4, '0') + '; frame_point=' + frame.point});
    const extension = path.extname(frame.relative_path).toLowerCase();
    const mime = extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : 'image/jpeg';
    content.push({type:'input_image',image_url:'data:' + mime + ';base64,' + bytes.toString('base64')});
  }
  const request = {model:config.model,store:false,instructions:skillInstructions(),input:[{role:'user',content}],text:{format:{type:'json_schema',name:'niannian_haika_step01_visual_facts_v1',strict:true,schema:responseSchema()}}};
  let response;
  try { response = await fetchImpl(config.endpoint, {method:'POST',headers:{authorization:'Bearer ' + config.key,'content-type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(Math.max(30000, Number(process.env.NIANNIAN_STEP01_GPT_TIMEOUT_MS || 180000)))}); }
  catch (error) { throw coded('STEP01_SERVER_GPT_NETWORK_FAILED', '原片分析服务网络请求失败', error); }
  if (!response.ok) throw coded('STEP01_SERVER_GPT_HTTP_' + response.status, '原片分析服务请求失败');
  let parsed;
  try { parsed = JSON.parse(extractResponseText(await response.json())); }
  catch (error) { if (error.code) throw error; throw coded('STEP01_SERVER_GPT_JSON_INVALID', '原片分析服务未返回有效 JSON', error); }
  return {segments:validateModelOutput(parsed, timeline), model:config.model};
}
function retriableGptError(error) {
  return /^STEP01_SERVER_GPT_(NETWORK_FAILED|HTTP_(429|5\d\d))$/.test(String(error?.code || ''));
}
async function analyzeFramesWithRetry(options) {
  const attempts = Math.max(1, Math.min(3, Number(process.env.NIANNIAN_STEP01_GPT_MAX_ATTEMPTS || DEFAULT_GPT_ATTEMPTS)));
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { return await analyzeFrames(options); }
    catch (error) {
      lastError = error;
      if (attempt === attempts || !retriableGptError(error)) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
  throw lastError;
}
async function analyzeFramesBatched(options) {
  const timeline = options.timeline || [];
  const frames = options.frames || [];
  const batchSize = Math.max(1, Math.min(8, Number(options.batchSize || 1)));
  const completed = [];
  let model = options.config.model;
  async function analyzeBatch(batchTimeline) {
    const shotIds = new Set(batchTimeline.map(shot => String(shot.shot_id)));
    const batchFrames = frames.filter(frame => shotIds.has(String(frame.shot_id)));
    try {
      const result = await analyzeFramesWithRetry({...options, timeline:batchTimeline, frames:batchFrames});
      model = result.model;
      completed.push(...result.segments);
    } catch (error) {
      if (String(error?.code || '') !== 'STEP01_SERVER_GPT_HTTP_413' || batchTimeline.length <= 1) throw error;
      const middle = Math.ceil(batchTimeline.length / 2);
      await analyzeBatch(batchTimeline.slice(0, middle));
      await analyzeBatch(batchTimeline.slice(middle));
    }
  }
  for (let start = 0; start < timeline.length; start += batchSize) await analyzeBatch(timeline.slice(start, start + batchSize));
  return {segments:validateModelOutput({segments:completed}, timeline), model};
}
async function writeServerEvidence({root, project, analysisRun, sourcePath, probeValue, timeline, frames, visual}) {
  const manifestRoot = root;
  const probe = await writeJsonArtifact(root, 'artifacts/media_probe.json', probeValue);
  const shots = await writeJsonArtifact(root, 'artifacts/accepted_segments.json', {schema_version:'niannian_step01_segments_v1',method:'uniform_time_segment',shots:timeline});
  const supplement = await writeJsonArtifact(root, 'artifacts/shotlevel_start_mid_end_manifest.json', {schema_version:'niannian_step01_shot_frames_v1',rows:frames});
  const native = await writeJsonArtifact(root, 'artifacts/native_frame_manifest.json', {schema_version:'niannian_step01_native_frames_v1',frames});
  const visualFacts = await writeJsonArtifact(root, 'artifacts/visual_facts.json', {schema_version:'niannian_haika_step01_visual_facts_v1',project_id:project.id,analysis_run_id:analysisRun.id,source_sha256:project.source.sha256,model:visual.model,segments:visual.segments});
  const audioPath = path.join(root, 'artifacts', 'source_16k_mono.wav');
  if (probeValue.audio_stream_count > 0) await run(ffmpegCommand(), ['-y','-i',sourcePath,'-vn','-ac','1','-ar','16000',audioPath]);
  else await run(ffmpegCommand(), ['-y','-f','lavfi','-i','anullsrc=r=16000:cl=mono','-t',String(probeValue.duration_seconds),'-ac','1','-ar','16000',audioPath]);
  const audio = {relative_path:path.relative(root,audioPath).replace(/\\/g,'/'), ...await fileEvidence(audioPath)};
  const ocrRows = visual.segments.flatMap(segment => segment.visible_text.map((text, index) => ({id:'O' + segment.source_segment_id.slice(1) + '-' + String(index+1),start_sec:timeline.find(shot => ('S' + String(shot.shot_id).padStart(4,'0')) === segment.source_segment_id).start_sec,end_sec:timeline.find(shot => ('S' + String(shot.shot_id).padStart(4,'0')) === segment.source_segment_id).end_sec,text,source:'gpt_vision_frame_evidence'})));
  const ocrText = ['id,start_sec,end_sec,text,source', ...ocrRows.map(row => [row.id,row.start_sec,row.end_sec,JSON.stringify(row.text),row.source].join(','))].join('\n') + '\n';
  const audioText = 'id,start_sec,end_sec,event,source\n';
  const ocrPath = path.join(root, 'artifacts', 'ocr_ledger.csv');
  const audioLedgerPath = path.join(root, 'artifacts', 'audio_event_ledger.csv');
  await fsp.writeFile(ocrPath, ocrText, 'utf8'); await fsp.writeFile(audioLedgerPath, audioText, 'utf8');
  const ocr = {relative_path:path.relative(root,ocrPath).replace(/\\/g,'/'), ...await fileEvidence(ocrPath)};
  const audioLedger = {relative_path:path.relative(root,audioLedgerPath).replace(/\\/g,'/'), ...await fileEvidence(audioLedgerPath)};
  const asrReceipt = await writeJsonArtifact(root, 'artifacts/asr_receipt.json', {schema_version:'niannian_step01_audio_evidence_v1',status:'not_transcribed',reason:'Haika direct GPT frame analysis does not claim audio transcription without a configured ASR service.',provider_submission_requested:false});
  const alignmentReceipt = await writeJsonArtifact(root, 'artifacts/audio_alignment_receipt.json', {schema_version:'niannian_step01_audio_alignment_v1',status:'not_applicable',reason:'No transcript was produced.',provider_submission_requested:false});
  const ocrReceipt = await writeJsonArtifact(root, 'artifacts/ocr_receipt.json', {schema_version:'niannian_step01_ocr_evidence_v1',status:'completed',source:'gpt_vision_frame_evidence',row_count:ocrRows.length});
  const validation = await writeJsonArtifact(root, 'artifacts/validation_receipt.json', {schema_version:'niannian_step01_server_validation_v1',status:'passed',checks:{source_binding:true,frame_coverage:frames.length===timeline.length*3,model_segment_coverage:visual.segments.length===timeline.length,provider_submit:false,package_send:false,local_image_editing:false},completed_at:now()});
  const manifest = {
    schema_version:'step01_evidence_manifest_v1',profile:PROFILE,status:'verified',downstream_consumable:true,test_only:false,
    project_id:project.id,analysis_run_id:analysisRun.id,source_revision:Number(project.sourceRevision),source_sha256:project.source.sha256,source_bytes:Number(project.source.bytes),
    source:{ffprobe:probe},minute_chunks:{index:shots},native_frames:{manifest:native,frames},transnet:{accepted_shots:shots,shot_supplement:supplement},
    audio:{wav:audio,event_ledger:audioLedger,mimo_transcript_receipt:asrReceipt,forced_aligner_receipt:alignmentReceipt},ocr:{ledger:ocr,receipt:ocrReceipt},validation:{receipt:validation},visual_facts:visualFacts,
    execution:{runtime_profile:PROFILE,allowed_skill_routes:ROUTES,model:visual.model,provider_submission_requested:false,package_send_requested:false,local_image_editing_requested:false},created_at:now()
  };
  const manifestEvidence = await writeJsonArtifact(manifestRoot, 'step01_evidence_manifest.json', manifest);
  return {manifest, manifestEvidence, visualFacts};
}
function classify(error) {
  const code = String(error?.code || 'STEP01_SERVER_FAILED');
  if (/GPT_PROFILE|GPT_NETWORK|GPT_HTTP|MEDIA_TIMEOUT/.test(code)) return 'blocked_resource';
  if (/SOURCE|CONTRACT|SCOPE|COVERAGE|SCHEMA/.test(code)) return 'blocked_contract';
  return 'infra_failed';
}
async function runProject(options = {}) {
  const projectId = safeProjectId(options.projectId || process.argv[2]);
  const dataRoot = path.resolve(options.dataRoot || process.env.NIANNIAN_DATA_DIR || path.join(__dirname, '..', 'data'));
  const projectsPath = path.join(dataRoot, 'projects.json');
  const jobsRoot = path.join(dataRoot, 'jobs');
  const resultPath = path.join(jobsRoot, projectId, 'server_step01_result.json');
  let project, analysisRun, releaseRunLock;
  try {
    const projects = JSON.parse(await fsp.readFile(projectsPath, 'utf8'));
    project = projects.find(item => item.id === projectId);
    if (!project) throw coded('STEP01_SERVER_PROJECT_NOT_FOUND', '项目不存在');
    analysisRun = {id:String(project.analysis?.runId || ''),source_revision:Number(project.analysis?.sourceRevision),source_sha256:String(project.analysis?.sourceSha256 || '')};
    if (!/^analysis-[a-zA-Z0-9-]{8,100}$/.test(analysisRun.id) || analysisRun.source_revision !== Number(project.sourceRevision) || analysisRun.source_sha256 !== project.source?.sha256) throw coded('STEP01_SERVER_RUN_BINDING_INVALID', '分析运行绑定无效');
    const jobRoot = path.join(jobsRoot, projectId);
    const task = JSON.parse(await fsp.readFile(path.join(jobRoot, 'task.json'), 'utf8'));
    if (task.runtime_profile !== PROFILE || task.analysis_authorization?.allowed_scope !== 'step01_evidence_only' || JSON.stringify(task.analysis_authorization?.allowed_skill_routes || []) !== JSON.stringify(ROUTES)) throw coded('STEP01_SERVER_TASK_CONTRACT_INVALID', '服务器分析合同无效');
    const previousResult = await fsp.readFile(resultPath, 'utf8').then(JSON.parse).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
    if (previousResult?.status === 'evidence_ready' && previousResult.analysis_run_id === analysisRun.id && previousResult.runtime_profile === PROFILE) return previousResult;
    releaseRunLock = await acquireRunLock(jobRoot, analysisRun.id);
    const sourcePath = path.resolve(dataRoot, String(project.source?.storage_key || ''));
    if (!isInside(path.join(dataRoot, 'uploads'), sourcePath)) throw coded('STEP01_SERVER_SOURCE_PATH_INVALID', '源视频路径无效');
    const source = await fileEvidence(sourcePath);
    if (source.sha256 !== project.source.sha256 || source.bytes !== Number(project.source.bytes)) throw coded('STEP01_SERVER_SOURCE_SHA256_MISMATCH', '源视频完整性校验失败');
    const root = path.join(jobRoot, 'analysis_runs', analysisRun.id, 'server_evidence');
    const deliveryRoot = path.join(jobRoot, 'analysis_runs', analysisRun.id, 'evidence');
    await fsp.mkdir(root, {recursive:true});
    await evidenceEvents.appendEvidenceEvent(path.join(jobRoot, 'evidence_events.jsonl'), {type:'server_analysis_started',project_id:projectId,analysis_run_id:analysisRun.id,source_revision:analysisRun.source_revision,source_sha256:source.sha256,dispatch_id:'haika-' + analysisRun.id,phase_key:PROFILE,status:'running',evidence_sha256:analysisRun.id});
    await evidenceEvents.appendEvidenceEvent(path.join(jobRoot, 'evidence_events.jsonl'), {type:'skill_route_selected',project_id:projectId,analysis_run_id:analysisRun.id,source_revision:analysisRun.source_revision,source_sha256:source.sha256,dispatch_id:'haika-' + analysisRun.id,phase_key:PROFILE,status:'selected',evidence_sha256:sha256(JSON.stringify(ROUTES))});
    const baseManifest = await runHqWorker({sourcePath,root,project,analysisRun,env:options.env || process.env});
    const {manifest, visualFacts} = await attachHqVisualFacts({root,manifest:baseManifest,project,analysisRun,env:options.env || process.env,fetchImpl:options.fetchImpl || global.fetch});
    const manifestEvidence = await fileEvidence(path.join(root, 'step01_evidence_manifest.json'));
    await evidenceEvents.appendEvidenceEvent(path.join(jobRoot, 'evidence_events.jsonl'), {type:'analysis_service_task_reconciled',project_id:projectId,analysis_run_id:analysisRun.id,source_revision:analysisRun.source_revision,source_sha256:source.sha256,dispatch_id:'haika-' + analysisRun.id,phase_key:PROFILE,status:'completed',evidence_sha256:manifestEvidence.sha256});
    await evidenceEvents.appendEvidenceEvent(path.join(jobRoot, 'evidence_events.jsonl'), {type:'server_analysis_completed',project_id:projectId,analysis_run_id:analysisRun.id,source_revision:analysisRun.source_revision,source_sha256:source.sha256,dispatch_id:'haika-' + analysisRun.id,phase_key:PROFILE,status:'completed',evidence_sha256:visualFacts.sha256});
    const packaged = await evidencePackage.buildStep01EvidencePackage({sourceRoot:root,outputRoot:deliveryRoot,project,analysisRun:{id:analysisRun.id}});
    await evidencePackage.validateStep01EvidencePackage({outputRoot:deliveryRoot,expected:{projectId,analysisRunId:analysisRun.id,sourceSha256:source.sha256,sourceRevision:analysisRun.source_revision}});
    for (const type of ['return_manifest_received','artifact_paths_verified','step01_validation_passed','step01_evidence_accepted']) await evidenceEvents.appendEvidenceEvent(path.join(jobRoot, 'evidence_events.jsonl'), {type,project_id:projectId,analysis_run_id:analysisRun.id,source_revision:analysisRun.source_revision,source_sha256:source.sha256,dispatch_id:'haika-' + analysisRun.id,phase_key:PROFILE,status:type === 'step01_evidence_accepted' ? 'accepted' : 'completed',evidence_sha256:packaged.bundle.sha256});
    const result = {schema_version:'niannian_step01_server_executor_result_v1',remote_project_id:projectId,analysis_run_id:analysisRun.id,status:'evidence_ready',production_status:'evidence_ready',runtime_profile:PROFILE,quality_profile:EVIDENCE_PROFILE,allowed_skill_routes:ROUTES,worker:{status:'completed',mode:'haika_hq_full',model:manifest.execution?.model || 'gpt-5.6-sol'},evidence_root:deliveryRoot,evidence_bundle_sha256:packaged.bundle.sha256,provider_submission_requested:false,package_send_requested:false,local_image_editing_requested:false,completed_at:now()};
    await atomicJson(resultPath, result); return result;
  } catch (error) {
    if (error.code === 'STEP01_SERVER_RUN_LOCKED') return {remote_project_id:projectId,analysis_run_id:analysisRun?.id || null,status:'running',runtime_profile:PROFILE};
    const result = {schema_version:'niannian_step01_server_executor_result_v1',remote_project_id:projectId,analysis_run_id:analysisRun?.id || null,status:'failed',production_status:classify(error),runtime_profile:PROFILE,blocker_code:String(error.code || 'STEP01_SERVER_FAILED'),provider_submission_requested:false,package_send_requested:false,local_image_editing_requested:false,failed_at:now()};
    await atomicJson(resultPath, result).catch(() => {}); throw error;
  } finally {
    if (releaseRunLock) await releaseRunLock();
  }
}

if (require.main === module) runProject().catch(error => { process.stderr.write('step01_server_executor_failed: ' + String(error.code || error.message || error) + '\n'); process.exitCode = 1; });

module.exports = {PROFILE, EVIDENCE_PROFILE, ROUTES, analyzeFrames, analyzeFramesWithRetry, analyzeFramesBatched, attachHqVisualFacts, createVisualAnalysisFrames, hqCapabilities, modelConfig, runHqWorker, runProject, segmentTimeline, validateModelOutput};
