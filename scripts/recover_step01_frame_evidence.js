const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function canonical(value) { if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'; if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}'; return JSON.stringify(value); }
function arg(name, fallback = null) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] || fallback : fallback; }
function fail(code, message) { const error = new Error(message || code); error.code = code; throw error; }
async function json(filePath) { return JSON.parse(await fsp.readFile(filePath, 'utf8')); }
function ffmpeg(binary, args) { return new Promise((resolve, reject) => { const child = childProcess.spawn(binary, args, {stdio:['ignore','ignore','pipe']}); let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk.toString(); }); child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(Object.assign(new Error('ffmpeg failed'), {code:'STEP01_FRAME_RECOVERY_FFMPEG_FAILED', stderr:stderr.slice(-500)}))); }); }

async function run() {
  const evidenceRoot = path.resolve(arg('--evidence-root') || fail('STEP01_FRAME_RECOVERY_EVIDENCE_ROOT_REQUIRED'));
  const sourcePath = path.resolve(arg('--source') || fail('STEP01_FRAME_RECOVERY_SOURCE_REQUIRED'));
  const projectId = String(arg('--project') || fail('STEP01_FRAME_RECOVERY_PROJECT_REQUIRED'));
  const sourceSha = String(arg('--source-sha256') || fail('STEP01_FRAME_RECOVERY_SOURCE_SHA_REQUIRED'));
  const sourceBytes = Number(arg('--source-bytes') || fail('STEP01_FRAME_RECOVERY_SOURCE_BYTES_REQUIRED'));
  const ffmpegBinary = String(arg('--ffmpeg', 'ffmpeg'));
  const apply = process.argv.includes('--apply');
  if (!/^[a-f0-9]{64}$/.test(sourceSha) || !Number.isSafeInteger(sourceBytes) || sourceBytes <= 0) fail('STEP01_FRAME_RECOVERY_SOURCE_INVALID');
  const source = await fsp.readFile(sourcePath); if (source.length !== sourceBytes || sha256(source) !== sourceSha) fail('STEP01_FRAME_RECOVERY_SOURCE_INTEGRITY_FAILED');
  const artifacts = path.join(evidenceRoot, 'artifacts');
  const manifestValue = await json(path.join(artifacts, 'shotlevel_start_mid_end_manifest.json'));
  const requested = (Array.isArray(manifestValue) ? manifestValue : manifestValue.frames || []).filter(row => ['start','mid','end'].includes(row.point));
  if (!requested.length || new Set(requested.map(row => row.file)).size !== requested.length || requested.some(row => !Number.isFinite(Number(row.time_sec)) || !/^[A-Za-z0-9._-]+\.png$/.test(String(row.file || '')))) fail('STEP01_FRAME_RECOVERY_SHOT_MANIFEST_INVALID');
  const outputRoot = path.join(artifacts, 'recovered_source_frames');
  const rows = requested.map(row => ({file:row.file, point:row.point, shot_id:Number(row.shot_id), time_sec:Number(row.time_sec), timecode:String(row.timecode || ''), relative_path:'recovered_source_frames/' + row.file}));
  if (!apply) { process.stdout.write(JSON.stringify({ok:true,mode:'dry-run',project_id:projectId,source_sha256:sourceSha,frames:rows.length,output_root:outputRoot,provider_requests:0}) + '\n'); return; }
  await fsp.mkdir(outputRoot, {recursive:true});
  for (const row of rows) {
    const output = path.join(outputRoot, row.file);
    await fsp.rm(output, {force:true});
    await ffmpeg(ffmpegBinary, ['-hide_banner','-loglevel','error','-ss', String(row.time_sec), '-i', sourcePath, '-map','0:v:0','-frames:v','1','-an','-c:v','png','-pred','mixed',output]);
    const bytes = await fsp.readFile(output); row.bytes = bytes.length; row.sha256 = sha256(bytes);
  }
  const core = {schema_version:'niannian.step01_frame_recovery.v1',status:'verified',downstream_consumable:true,project_id:projectId,source_sha256:sourceSha,source_bytes:sourceBytes,frames:rows,generated_at:new Date().toISOString(),generator:{kind:'ffmpeg_source_frame_recovery',binary:path.basename(ffmpegBinary)}};
  const receipt = {...core, manifest_sha256:sha256(canonical(core))};
  const target = path.join(artifacts, 'step01_frame_recovery_manifest.json');
  await fsp.writeFile(target, JSON.stringify(receipt, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ok:true,mode:'apply',project_id:projectId,frames:rows.length,manifest_sha256:receipt.manifest_sha256,provider_requests:0}) + '\n');
}
run().catch(error => { process.stderr.write(JSON.stringify({ok:false,code:error.code || 'STEP01_FRAME_RECOVERY_FAILED',message:String(error.message || error).slice(0,300)}) + '\n'); process.exitCode = 1; });
