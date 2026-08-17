'use strict';

const crypto = require('crypto');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const {execFile} = require('child_process');
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
  if (!match || Number(match[1]) <= 0 || Number(match[2]) <= 0) throw validationError('DOLA_OUTPUT_ASPECT_RATIO_INVALID', 'Dola 任务画幅参数无效');
  return Number(match[1]) / Number(match[2]);
}

function validateDolaMediaMetadata(actual, expected) {
  const width = Number(actual?.width);
  const height = Number(actual?.height);
  const durationSeconds = Number(actual?.durationSeconds);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw validationError('DOLA_OUTPUT_DIMENSIONS_INVALID', 'Dola 未返回有效视频画幅');
  if (!Number.isFinite(durationSeconds) || Math.abs(durationSeconds - 30) > 1) throw validationError('DOLA_OUTPUT_DURATION_MISMATCH', 'Dola 成片未满足严格 30 秒要求');
  if (expected?.durationSeconds !== 30) throw validationError('DOLA_OUTPUT_DURATION_MISMATCH', 'Dola 任务时长合同无效');
  if (Math.abs(width / height - ratio(expected?.aspectRatio)) > 0.05) throw validationError('DOLA_OUTPUT_ASPECT_RATIO_MISMATCH', 'Dola 成片画幅与任务设置不一致');
  return {width,height,durationSeconds:Number(durationSeconds.toFixed(3)),codec:String(actual?.codec || '') || null};
}

async function inspectDolaMedia(bytes, expected, options = {}) {
  if (options.testMetadata) return validateDolaMediaMetadata(options.testMetadata, expected);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'niannian-dola-media-'));
  const extension = options.extension === 'mov' ? 'mov' : 'mp4';
  const mediaPath = path.join(root, crypto.randomBytes(8).toString('hex') + '.' + extension);
  try {
    await fs.writeFile(mediaPath, bytes, {flag:'wx'});
    let stdout;
    try {
      ({stdout} = await execFileAsync(String(options.ffprobePath || 'ffprobe'), ['-v','error','-show_entries','format=duration:stream=codec_type,codec_name,width,height','-of','json',mediaPath], {timeout:Math.max(3000, Number(options.timeoutMs || 20000))}));
    } catch {
      throw validationError('DOLA_OUTPUT_MEDIA_UNVERIFIED', '无法读取 Dola 成片媒体信息');
    }
    let parsed;
    try { parsed = JSON.parse(stdout || '{}'); }
    catch { throw validationError('DOLA_OUTPUT_MEDIA_UNVERIFIED', 'Dola 成片媒体信息格式无效'); }
    const video = Array.isArray(parsed.streams) ? parsed.streams.find(stream => stream?.codec_type === 'video') : null;
    return validateDolaMediaMetadata({width:video?.width,height:video?.height,durationSeconds:parsed.format?.duration,codec:video?.codec_name}, expected);
  } finally {
    await fs.rm(root,{recursive:true,force:true}).catch(() => {});
  }
}

module.exports = {inspectDolaMedia, validateDolaMediaMetadata};
