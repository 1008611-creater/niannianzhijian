import type { IncomingMessage, ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Plugin } from 'vite';

import { ffmpegBin, ffprobeBin } from '../media-binaries.ts';
import { isSafeUploadName, resolveUploadFile } from '../media-dir.ts';

const MAX_JSON_BYTES = 32 * 1024;
const OCR_TIMEOUT_MS = 60_000;
const VISION_TIMEOUT_MS = 75_000;
const MAX_VISION_IMAGE_BYTES = 12 * 1024 * 1024;
const VIDEO_UNDERSTANDING_TIMEOUT_MS = 180_000;
const MAX_INLINE_VIDEO_BYTES = 18 * 1024 * 1024;
const MAX_SAMPLED_VIDEO_FRAMES = 8;
const IMAGE_EXTENSIONS = new Set(['.avif', '.bmp', '.gif', '.heic', '.jpeg', '.jpg', '.png', '.tif', '.tiff', '.webp']);
const VISION_IMAGE_EXTENSIONS = new Set(['.jpeg', '.jpg', '.png', '.webp']);
const VISION_ENTITY_KINDS = new Set(['product', 'person', 'brand', 'scene', 'text']);

export interface AssetIntelligenceOptions {
  tesseractPath: string;
  tessdataDir: string;
  visionBaseUrl: string;
  visionApiKey: string;
  visionModel: string;
  videoBaseUrl: string;
  videoApiKey: string;
  videoModel: string;
}

export interface LocalOcrResult {
  text: string;
  languageRequested: string;
  languageUsed: string;
  sampleTimeMs?: number;
  warning?: string;
}

export interface VisionEntity {
  kind: 'product' | 'person' | 'brand' | 'scene' | 'text';
  label: string;
  confidence?: number;
}

export interface VisionScene {
  label: string;
  confidence?: number;
}

export interface VisionAnalysisResult {
  tags: string[];
  entities: VisionEntity[];
  scenes: VisionScene[];
  model: string;
  sampleTimeMs?: number;
}

export interface VideoUnderstandingSegment {
  startMs: number;
  endMs: number;
  label: string;
}

export interface VideoUnderstandingResult {
  summary: string;
  tags: string[];
  segments: VideoUnderstandingSegment[];
  model: string;
  videoTokens: number;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.length;
    if (total > MAX_JSON_BYTES) throw new Error('request body too large');
    chunks.push(bytes);
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('request body must be an object');
  return value as Record<string, unknown>;
}

function uploadPath(src: string): string | null {
  const clean = decodeURIComponent(src.split('?')[0] ?? '').trim();
  const match = /^\/media\/uploads\/([^/]+)$/.exec(clean);
  return match?.[1] && isSafeUploadName(match[1]) ? resolveUploadFile(match[1]) : null;
}

function run(command: string, args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${command} timed out`));
    }, timeoutMs);
    child.stdout?.on('data', (data: Buffer) => { stdout += String(data); });
    child.stderr?.on('data', (data: Buffer) => { stderr += String(data); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}

export function parseTesseractLanguages(output: string): string[] {
  return output.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[A-Za-z0-9_]+$/.test(line));
}

export function chooseTesseractLanguages(requested: string, available: readonly string[]): { used: string; warning?: string } {
  const wanted = requested.split('+').map((value) => value.trim()).filter(Boolean);
  const usable = wanted.filter((value) => available.includes(value));
  if (usable.length) {
    return { used: usable.join('+'), ...(usable.length === wanted.length ? {} : { warning: `本机未安装语言包：${wanted.filter((value) => !usable.includes(value)).join('、')}` }) };
  }
  const fallback = available.includes('eng') ? 'eng' : available[0];
  if (!fallback) throw new Error('Tesseract 未安装任何语言包');
  return { used: fallback, warning: `请求的语言包不可用，已回退至 ${fallback}` };
}

async function captureVideoFrame(input: string, timeMs: number, directory: string): Promise<string> {
  const output = join(directory, 'ocr-frame.png');
  await run(ffmpegBin(), [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
    '-ss', String(Math.max(0, timeMs) / 1000), '-i', input,
    '-frames:v', '1', '-vf', 'scale=1920:-2:force_original_aspect_ratio=decrease', output,
  ], OCR_TIMEOUT_MS);
  return output;
}

async function captureVisionFrame(input: string, timeMs: number, directory: string): Promise<string> {
  const output = join(directory, 'vision-frame.jpg');
  await run(ffmpegBin(), [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
    '-ss', String(Math.max(0, timeMs) / 1000), '-i', input,
    '-frames:v', '1', '-vf', 'scale=1536:-2:force_original_aspect_ratio=decrease', '-q:v', '2', output,
  ], VISION_TIMEOUT_MS);
  return output;
}

async function probeVideoDurationMs(input: string): Promise<number> {
  const result = await run(ffprobeBin(), [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', input,
  ], VISION_TIMEOUT_MS);
  const seconds = Number(result.stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('无法读取视频时长');
  return Math.round(seconds * 1000);
}

function extension(path: string): string {
  const match = /\.[^.]+$/.exec(path);
  return match?.[0].toLowerCase() ?? '';
}

function imageMimeType(path: string): 'image/jpeg' | 'image/png' | 'image/webp' {
  switch (extension(path)) {
    case '.png': return 'image/png';
    case '.webp': return 'image/webp';
    default: return 'image/jpeg';
  }
}

function normalizedLabel(value: unknown, maximum = 120): string | undefined {
  if (typeof value !== 'string') return undefined;
  const label = value.replace(/\s+/g, ' ').trim().slice(0, maximum);
  return label || undefined;
}

function normalizedConfidence(value: unknown): number | undefined {
  const confidence = Number(value);
  return Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : undefined;
}

function uniqueLabels(values: readonly string[], maximum: number): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, maximum);
}

function parseJsonObject(content: string, errorMessage: string): Record<string, unknown> {
  const stripped = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let value: unknown;
  try {
    value = JSON.parse(stripped);
  } catch {
    throw new Error(errorMessage);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(errorMessage);
  return value as Record<string, unknown>;
}

/** Parse only the small public metadata contract returned by a compatible vision model. */
export function parseVisionAnalysis(content: string): Omit<VisionAnalysisResult, 'model' | 'sampleTimeMs'> {
  const record = parseJsonObject(content, '视觉模型未返回有效 JSON');
  const tags = uniqueLabels((Array.isArray(record.tags) ? record.tags : [])
    .map((item) => normalizedLabel(item, 80)).filter((item): item is string => Boolean(item)), 32);
  const entities = (Array.isArray(record.entities) ? record.entities : []).flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const label = normalizedLabel(row.label);
    const kind = typeof row.kind === 'string' && VISION_ENTITY_KINDS.has(row.kind) ? row.kind as VisionEntity['kind'] : undefined;
    return label && kind ? [{ kind, label, ...(normalizedConfidence(row.confidence) !== undefined
      ? { confidence: normalizedConfidence(row.confidence) } : {}) }] : [];
  }).slice(0, 32);
  const scenes = (Array.isArray(record.scenes) ? record.scenes : []).flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const label = normalizedLabel(row.label);
    return label ? [{ label, ...(normalizedConfidence(row.confidence) !== undefined
      ? { confidence: normalizedConfidence(row.confidence) } : {}) }] : [];
  }).slice(0, 16);
  return { tags, entities, scenes };
}

export function parseVideoUnderstanding(content: string): Omit<VideoUnderstandingResult, 'model' | 'videoTokens'> {
  const record = parseJsonObject(content, '视频理解模型未返回有效 JSON');
  const summary = normalizedLabel(record.summary, 4_000);
  if (!summary) throw new Error('视频理解模型未返回摘要');
  const segments = (Array.isArray(record.segments) ? record.segments : []).flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const startMs = Math.max(0, Math.round(Number(row.startMs)));
    const endMs = Math.max(startMs + 1, Math.round(Number(row.endMs)));
    const label = normalizedLabel(row.label, 800);
    return Number.isFinite(startMs) && Number.isFinite(endMs) && label ? [{ startMs, endMs, label }] : [];
  }).slice(0, 120);
  if (!segments.length) throw new Error('视频理解模型未返回可用时间段');
  return {
    summary,
    tags: uniqueLabels((Array.isArray(record.tags) ? record.tags : [])
      .map((item) => normalizedLabel(item, 80)).filter((item): item is string => Boolean(item)), 48),
    segments,
  };
}

function videoUnderstandingPrompt(customPrompt?: string): string {
  const focus = normalizedLabel(customPrompt, 600);
  return [
    'Analyze the complete attached video for a professional short-video editor.',
    'Return JSON only: {"summary":string,"tags":[string],"segments":[{"startMs":number,"endMs":number,"label":string}]}.',
    'Cover the full duration in chronological segments. Each label should concisely combine visible action, subjects, scene changes, readable on-screen text, and important audio or dialogue when present.',
    'Use Chinese. Use real millisecond ranges from the video. Do not invent unseen content, identify private people, or infer protected traits.',
    'Choose boundaries useful for clip selection; keep segments <= 120 and tags <= 48.',
    ...(focus ? [`Editing focus: ${focus}`] : []),
  ].join(' ');
}

function sampledVideoPrompt(times: number[], customPrompt?: string): string {
  const focus = normalizedLabel(customPrompt, 600);
  return [
    'Analyze the attached video frames in chronological order for a professional short-video editor.',
    `Frame timestamps in milliseconds, in the same order as the images: ${times.join(', ')}.`,
    'Return JSON only: {"summary":string,"tags":[string],"segments":[{"startMs":number,"endMs":number,"label":string}]}.',
    'Use only visible evidence from the frames. Create real ranges using the supplied timestamps; do not invent unseen dialogue or exact video content. Combine adjacent frames into useful scene/action ranges and cover the observed sequence.',
    'Use Chinese. Keep segments <= 120 and tags <= 48.',
    ...(focus ? [`Editing focus: ${focus}`] : []),
  ].join(' ');
}

async function runSampledVideoUnderstanding(
  input: string,
  options: AssetIntelligenceOptions,
  prompt?: string,
): Promise<VideoUnderstandingResult> {
  const endpoint = sampledVideoEndpoint(options.videoBaseUrl);
  const durationMs = await probeVideoDurationMs(input);
  const frameCount = Math.min(MAX_SAMPLED_VIDEO_FRAMES, Math.max(2, Math.ceil(durationMs / 10_000)));
  const times = Array.from({ length: frameCount }, (_, index) => Math.min(durationMs - 1, Math.round(index * durationMs / frameCount)));
  const temp = await mkdtemp(join(tmpdir(), 'openchatcut-video-sampled-'));
  try {
    const content: Array<Record<string, unknown>> = [{ type: 'text', text: sampledVideoPrompt(times, prompt) }];
    for (const timeMs of times) {
      const frame = await captureVisionFrame(input, timeMs, temp);
      const image = await readFile(frame);
      content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image.toString('base64')}`, detail: 'low' } });
    }
    const response = await fetch(endpoint, {
      method: 'POST', signal: AbortSignal.timeout(VIDEO_UNDERSTANDING_TIMEOUT_MS),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${options.videoApiKey.trim()}` },
      body: JSON.stringify({
        model: options.videoModel.trim() || 'gemini-3.5-flash-lite', temperature: 0.1,
        response_format: { type: 'json_object' }, messages: [{ role: 'user', content }],
      }),
    });
    if (!response.ok) throw new Error(`云雾视觉帧分析请求失败（HTTP ${response.status}）`);
    const body = await response.json().catch(() => null) as { choices?: Array<{ message?: { content?: unknown } }> } | null;
    const text = body?.choices?.[0]?.message?.content;
    if (typeof text !== 'string') throw new Error('云雾视觉帧分析未返回内容');
    return { ...parseVideoUnderstanding(text), model: `${options.videoModel.trim() || 'gemini-3.5-flash-lite'}-sampled-frames`, videoTokens: frameCount };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

export function sampledVideoEndpoint(rawBaseUrl: string): string {
  const baseUrl = rawBaseUrl.trim().replace(/\/+$/, '');
  const apiBaseUrl = /\/v1$/i.test(baseUrl)
    ? baseUrl
    : baseUrl.replace(/\/v1beta$/i, '').concat('/v1');
  return `${apiBaseUrl}/chat/completions`;
}

async function prepareInlineVideo(input: string, directory: string): Promise<string> {
  const original = await stat(input);
  if (original.size <= MAX_INLINE_VIDEO_BYTES) return input;
  const output = join(directory, 'video-understanding.mp4');
  await run(ffmpegBin(), [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', input,
    '-map', '0:v:0', '-map', '0:a?', '-vf', 'scale=min(640\\,iw):-2',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '36',
    '-c:a', 'aac', '-b:a', '40k', '-movflags', '+faststart', output,
  ], VIDEO_UNDERSTANDING_TIMEOUT_MS);
  const compressed = await stat(output);
  if (compressed.size > MAX_INLINE_VIDEO_BYTES) {
    throw new Error('视频过长，低码率分析副本仍超过 18MB；请先截取需要理解的片段');
  }
  return output;
}

export async function runVideoUnderstanding(
  input: string,
  options: AssetIntelligenceOptions,
  prompt?: string,
): Promise<VideoUnderstandingResult> {
  if (!existsSync(input)) throw new Error('素材文件不存在');
  if (!options.videoApiKey.trim()) throw new Error('尚未配置 Gemini API Key');
  const model = options.videoModel.trim() || 'gemini-3.5-flash-lite';
  const baseUrl = options.videoBaseUrl.trim().replace(/\/+$/, '').replace(/\/openai$/i, '');
  if (/api3\.wlai\.vip$/i.test(baseUrl)) return runSampledVideoUnderstanding(input, options, prompt);
  if (!/\/v1beta$/i.test(baseUrl)) throw new Error('Gemini Base URL 必须以 /v1beta 结尾');
  const temp = await mkdtemp(join(tmpdir(), 'openchatcut-video-understanding-'));
  try {
    const source = await prepareInlineVideo(input, temp);
    const video = await readFile(source);
    const response = await fetch(`${baseUrl}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      signal: AbortSignal.timeout(VIDEO_UNDERSTANDING_TIMEOUT_MS),
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': options.videoApiKey.trim() },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [
          { text: videoUnderstandingPrompt(prompt) },
          { inlineData: { mimeType: 'video/mp4', data: video.toString('base64') } },
        ] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 8_192, temperature: 0.1 },
      }),
    });
    if (!response.ok) throw new Error(`Gemini 视频理解请求失败（HTTP ${response.status}）`);
    const body = await response.json().catch(() => null) as Record<string, unknown> | null;
    const details = (body?.usageMetadata as { promptTokensDetails?: unknown } | undefined)?.promptTokensDetails;
    const videoTokens = (Array.isArray(details) ? details : []).reduce((total, item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return total;
      const row = item as Record<string, unknown>;
      return String(row.modality).toUpperCase() === 'VIDEO' ? total + Math.max(0, Number(row.tokenCount) || 0) : total;
    }, 0);
    if (videoTokens <= 0) throw new Error('渠道未返回 VIDEO token，无法确认模型看到完整视频');
    const candidates = body?.candidates;
    const parts = Array.isArray(candidates) && candidates[0] && typeof candidates[0] === 'object'
      ? ((candidates[0] as { content?: { parts?: unknown } }).content?.parts) : undefined;
    const content = (Array.isArray(parts) ? parts : []).map((part) => (
      part && typeof part === 'object' && !Array.isArray(part) && typeof (part as { text?: unknown }).text === 'string'
        ? String((part as { text: string }).text) : ''
    )).join('').trim();
    if (!content) throw new Error('Gemini 视频理解未返回分析内容');
    return { ...parseVideoUnderstanding(content), model, videoTokens };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

function visionPrompt(customPrompt?: string): string {
  const focus = normalizedLabel(customPrompt, 600);
  return [
    'Analyze this single media frame for an editable short-video asset library.',
    'Return JSON only: {"tags":[string],"entities":[{"kind":"product|person|brand|scene|text","label":string,"confidence":0..1}],"scenes":[{"label":string,"confidence":0..1}]}.',
    'Use concise Chinese labels where possible. Describe only visible, non-sensitive facts. Never identify a person, infer protected traits, or invent text that cannot be read.',
    'Tags should make the asset searchable for product, person, action, camera framing, or setting. Keep tags <= 32, entities <= 32, scenes <= 16.',
    ...(focus ? [`User focus: ${focus}`] : []),
  ].join(' ');
}

export async function runVisionAnalysis(
  input: string,
  options: AssetIntelligenceOptions,
  sampleTimeMs?: number,
  prompt?: string,
): Promise<VisionAnalysisResult> {
  if (!existsSync(input)) throw new Error('素材文件不存在');
  if (!options.visionApiKey.trim()) throw new Error('尚未配置 OpenAI 兼容视觉分析 API Key');
  const temp = await mkdtemp(join(tmpdir(), 'openchatcut-vision-'));
  try {
    const source = VISION_IMAGE_EXTENSIONS.has(extension(input))
      ? input
      : await captureVisionFrame(input, sampleTimeMs ?? 0, temp);
    const info = await stat(source);
    if (info.size > MAX_VISION_IMAGE_BYTES) throw new Error('分析帧过大，无法发送到视觉模型');
    const image = await readFile(source);
    const endpoint = `${options.visionBaseUrl.trim().replace(/\/+$/, '')}/chat/completions`;
    const response = await fetch(endpoint, {
      method: 'POST', signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${options.visionApiKey.trim()}` },
      body: JSON.stringify({
        model: options.visionModel.trim() || 'gpt-4.1-mini', temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: [
          { type: 'text', text: visionPrompt(prompt) },
          { type: 'image_url', image_url: { url: `data:${imageMimeType(source)};base64,${image.toString('base64')}`, detail: 'low' } },
        ] }],
      }),
    });
    if (!response.ok) throw new Error(`视觉模型请求失败（HTTP ${response.status}）`);
    const body = await response.json().catch(() => null) as { choices?: Array<{ message?: { content?: unknown } }> } | null;
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('视觉模型未返回分析内容');
    return {
      ...parseVisionAnalysis(content), model: options.visionModel.trim() || 'gpt-4.1-mini',
      ...(sampleTimeMs !== undefined && !VISION_IMAGE_EXTENSIONS.has(extension(input)) ? { sampleTimeMs } : {}),
    };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

export async function runLocalOcr(
  input: string,
  options: AssetIntelligenceOptions,
  languageRequested = 'eng+chi_sim',
  sampleTimeMs?: number,
): Promise<LocalOcrResult> {
  if (!existsSync(input)) throw new Error('素材文件不存在');
  const listArgs = options.tessdataDir.trim()
    ? ['--tessdata-dir', options.tessdataDir.trim(), '--list-langs']
    : ['--list-langs'];
  const listed = await run(options.tesseractPath, listArgs, OCR_TIMEOUT_MS);
  const chosen = chooseTesseractLanguages(languageRequested, parseTesseractLanguages(listed.stdout));
  const temp = await mkdtemp(join(tmpdir(), 'openchatcut-ocr-'));
  try {
    const source = IMAGE_EXTENSIONS.has(extension(input))
      ? input
      : await captureVideoFrame(input, sampleTimeMs ?? 0, temp);
    const args = [source, 'stdout', '-l', chosen.used, '--psm', '11'];
    if (options.tessdataDir.trim()) args.push('--tessdata-dir', options.tessdataDir.trim());
    const recognized = await run(options.tesseractPath, args, OCR_TIMEOUT_MS);
    const text = recognized.stdout.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 100_000);
    return {
      text,
      languageRequested,
      languageUsed: chosen.used,
      ...(sampleTimeMs !== undefined && !IMAGE_EXTENSIONS.has(extension(input)) ? { sampleTimeMs } : {}),
      ...(chosen.warning ? { warning: chosen.warning } : {}),
    };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

export function assetIntelligencePlugin(options: AssetIntelligenceOptions): Plugin {
  return {
    name: 'openchatcut-asset-intelligence',
    configureServer(server) {
      server.middlewares.use('/api/asset-intelligence/ocr', async (req, res) => {
        if (req.method !== 'POST') { sendJson(res, 405, { error: 'method not allowed - use POST' }); return; }
        try {
          const body = await readJson(req);
          const input = uploadPath(String(body.src ?? ''));
          if (!input) throw new Error('src must be a local /media/uploads path');
          const timeMs = Number(body.timeMs);
          const result = await runLocalOcr(
            input,
            options,
            typeof body.language === 'string' && body.language.trim() ? body.language.trim() : 'eng+chi_sim',
            Number.isFinite(timeMs) && timeMs >= 0 ? Math.round(timeMs) : undefined,
          );
          sendJson(res, 200, result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          server.config.logger.error(`[asset-intelligence:ocr] ${message}`);
          sendJson(res, 400, { error: message });
        }
      });
      server.middlewares.use('/api/asset-intelligence/vision', async (req, res) => {
        if (req.method !== 'POST') { sendJson(res, 405, { error: 'method not allowed - use POST' }); return; }
        try {
          const body = await readJson(req);
          const input = uploadPath(String(body.src ?? ''));
          if (!input) throw new Error('src must be a local /media/uploads path');
          const timeMs = Number(body.timeMs);
          const result = await runVisionAnalysis(
            input, options,
            Number.isFinite(timeMs) && timeMs >= 0 ? Math.round(timeMs) : undefined,
            typeof body.prompt === 'string' ? body.prompt : undefined,
          );
          sendJson(res, 200, result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          server.config.logger.error(`[asset-intelligence:vision] ${message}`);
          sendJson(res, 400, { error: message });
        }
      });
      server.middlewares.use('/api/asset-intelligence/video', async (req, res) => {
        if (req.method !== 'POST') { sendJson(res, 405, { error: 'method not allowed - use POST' }); return; }
        try {
          const body = await readJson(req);
          const input = uploadPath(String(body.src ?? ''));
          if (!input) throw new Error('src must be a local /media/uploads path');
          const result = await runVideoUnderstanding(
            input,
            options,
            typeof body.prompt === 'string' ? body.prompt : undefined,
          );
          sendJson(res, 200, result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          server.config.logger.error(`[asset-intelligence:video] ${message}`);
          sendJson(res, 400, { error: message });
        }
      });
    },
  };
}
