const {execFile} = require('child_process');
const crypto = require('crypto');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const {promisify} = require('util');

const execFileAsync = promisify(execFile);

function validationError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  error.httpStatus = 502;
  return error;
}

function ratio(value) {
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(String(value || ''));
  if (!match || Number(match[1]) <= 0 || Number(match[2]) <= 0) throw validationError('H3_TARGET_DIMENSION_MISMATCH', '视频画幅参数无效');
  return Number(match[1]) / Number(match[2]);
}

function validateH3MediaMetadata(actual, expected) {
  const width = Number(actual?.width);
  const height = Number(actual?.height);
  const durationSeconds = Number(actual?.durationSeconds);
  const expectedDuration = Number(expected?.durationSeconds);
  const expectedWidth = Number(expected?.width);
  const expectedHeight = Number(expected?.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw validationError('H3_TARGET_DIMENSION_MISMATCH', '视频未返回有效画幅');
  if (!Number.isFinite(expectedWidth) || !Number.isFinite(expectedHeight) || expectedWidth <= 0 || expectedHeight <= 0 || width !== expectedWidth || height !== expectedHeight) throw validationError('H3_TARGET_DIMENSION_MISMATCH', '视频实际尺寸与任务设置不一致');
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw validationError('H3_OUTPUT_DURATION_MISMATCH', '视频未返回有效时长');
  if (Math.abs(width / height - ratio(expected?.aspectRatio)) > 0.05) throw validationError('H3_TARGET_DIMENSION_MISMATCH', '视频实际画幅与任务设置不一致');
  if (!Number.isFinite(expectedDuration) || expectedDuration <= 0 || Math.abs(durationSeconds - expectedDuration) > Math.max(1, expectedDuration * 0.15)) throw validationError('H3_OUTPUT_DURATION_MISMATCH', '视频实际时长与任务设置不一致');
  return {width,height,durationSeconds:Number(durationSeconds.toFixed(3)),codec:String(actual?.codec || '') || null};
}

async function inspectH3Media(bytes, expected, options = {}) {
  if (options.testMetadata) return validateH3MediaMetadata(options.testMetadata, expected);
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'niannian-h3-media-'));
  const mediaPath = path.join(tempRoot, crypto.randomBytes(8).toString('hex') + '.' + (options.extension === 'webm' ? 'webm' : 'mp4'));
  try {
    await fs.writeFile(mediaPath, bytes, {flag:'wx'});
    let stdout;
    try {
      ({stdout} = await execFileAsync(String(options.ffprobePath || 'ffprobe'), ['-v','error','-show_entries','format=duration:stream=codec_type,codec_name,width,height','-of','json',mediaPath], {timeout:Math.max(3000, Number(options.timeoutMs || 20000))}));
    } catch {
      throw validationError('H3_OUTPUT_MEDIA_UNVERIFIED', '无法读取视频媒体信息');
    }
    let parsed;
    try { parsed = JSON.parse(stdout || '{}'); }
    catch { throw validationError('H3_OUTPUT_MEDIA_UNVERIFIED', '视频媒体信息格式无效'); }
    const video = Array.isArray(parsed.streams) ? parsed.streams.find(stream => stream?.codec_type === 'video') : null;
    return validateH3MediaMetadata({width:video?.width,height:video?.height,durationSeconds:parsed.format?.duration,codec:video?.codec_name}, expected);
  } finally {
    await fs.rm(tempRoot, {recursive:true,force:true}).catch(() => {});
  }
}

module.exports = {inspectH3Media, validateH3MediaMetadata};
