import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import type { Plugin } from 'vite';
import { safePublicFetch } from '../safe-public-fetch.ts';
import { uploadDir } from '../media-dir.ts';
import { ffmpegBin, ffprobeBin } from '../media-binaries.ts';
import { readStore, setStoredEntry } from './project-store.ts';
import { CURRENT_PROJECT_VERSION } from '../../shared/project-version.ts';

const MAX_SOURCE_BYTES = 300 * 1024 * 1024;
const REQUEST_PATH = '/api/niannian-smart-cut/import';

type SmartCutImport = {
  jobId?: string;
  projectName?: string;
  source?: { url?: string; assetId?: string; originalName?: string };
  preset?: string;
  aspectRatio?: string;
  captionStyle?: string;
  scriptText?: string | null;
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage, limit = 128 * 1024): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > limit) throw new Error('request body too large');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

function bridgeSecret(): string {
  return String(process.env.NIANNIAN_SMART_CUT_BRIDGE_SECRET || '');
}

function hasValidSignature(raw: Buffer, provided: string | undefined): boolean {
  const secret = bridgeSecret();
  if (!secret || !provided || !/^[a-f0-9]{64}$/i.test(provided)) return false;
  const expected = createHmac('sha256', secret).update(raw).digest('hex');
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'));
}

function allowedSourceUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    const main = new URL(String(process.env.NIANNIAN_SMART_CUT_MAIN_URL || 'https://ai.cau.fun'));
    if (url.origin !== main.origin || !/^\/api\/internal\/smart-cut\/assets\//.test(url.pathname)) return null;
    return url;
  } catch {
    return null;
  }
}

function suffixFor(contentType: string | null, hint: string | undefined): '.mp4' | '.webm' {
  if (contentType?.split(';', 1)[0].trim().toLowerCase() === 'video/webm') return '.webm';
  return extname(String(hint || '')).toLowerCase() === '.webm' ? '.webm' : '.mp4';
}

async function importSource(url: URL, nameHint?: string): Promise<{ src: string; bytes: number; filename: string }> {
  const response = await safePublicFetch(url, {signal: AbortSignal.timeout(10 * 60_000)});
  if (!response.ok || !response.body) throw new Error(`source asset request failed: ${response.status}`);
  const declared = Number(response.headers.get('content-length') || '');
  if (Number.isFinite(declared) && declared > MAX_SOURCE_BYTES) throw new Error('source asset exceeds maximum size');
  const contentType = response.headers.get('content-type');
  if (!['video/mp4', 'video/webm'].includes(contentType?.split(';', 1)[0].trim().toLowerCase() || '')) {
    await response.body.cancel().catch(() => undefined);
    throw new Error('source asset is not a supported video');
  }
  const directory = uploadDir();
  await mkdir(directory, {recursive: true});
  const filename = `niannian-smart-cut-${randomUUID()}${suffixFor(contentType, nameHint)}`;
  const partPath = join(directory, `.${filename}.part`);
  const finalPath = join(directory, filename);
  let bytes = 0;
  const counter = new (class extends Transform {
    override _transform(chunk: Buffer, _encoding: BufferEncoding, done: (error?: Error | null, data?: Buffer) => void): void {
      bytes += chunk.length;
      if (bytes > MAX_SOURCE_BYTES) { done(new Error('source asset exceeds maximum size')); return; }
      done(null, chunk);
    }
  })();
  try {
    await pipeline(Readable.fromWeb(response.body as unknown as import('node:stream/web').ReadableStream), counter, createWriteStream(partPath, {flags: 'wx'}));
    await stat(partPath);
    await rename(partPath, finalPath);
    return {src:`/media/uploads/${filename}`, bytes, filename};
  } catch (error) {
    await rm(partPath, {force: true}).catch(() => undefined);
    await rm(finalPath, {force: true}).catch(() => undefined);
    throw error;
  }
}

function run(binary: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {windowsHide: true});
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve({stdout, stderr}) : reject(new Error(`${basename(binary)} exited ${code}: ${stderr.slice(-400)}`)));
  });
}

async function mediaInfo(file: string): Promise<{ durationSeconds: number; width?: number; height?: number }> {
  const {stdout} = await run(ffprobeBin(), ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', file]);
  const parsed = JSON.parse(stdout) as { format?: { duration?: string }; streams?: Array<{ codec_type?: string; width?: number; height?: number }> };
  const video = parsed.streams?.find((stream) => stream.codec_type === 'video');
  const durationSeconds = Number(parsed.format?.duration || 0);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error('could not determine source duration');
  return {durationSeconds, ...(Number.isFinite(video?.width) ? {width: video?.width} : {}), ...(Number.isFinite(video?.height) ? {height: video?.height} : {})};
}

async function silenceSpans(file: string): Promise<Array<{ start: number; end: number }>> {
  const {stderr} = await run(ffmpegBin(), ['-hide_banner', '-i', file, '-af', 'silencedetect=noise=-35dB:d=0.75', '-f', 'null', '-']);
  const starts = [...stderr.matchAll(/silence_start:\s*([0-9.]+)/g)].map((match) => Number(match[1]));
  const ends = [...stderr.matchAll(/silence_end:\s*([0-9.]+)/g)].map((match) => Number(match[1]));
  return starts.map((start, index) => ({start, end: ends[index] ?? start})).filter((span) => Number.isFinite(span.start) && Number.isFinite(span.end) && span.end > span.start);
}

function compactSegments(duration: number, silences: Array<{ start: number; end: number }>): Array<{ start: number; end: number }> {
  const kept: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (const silence of silences) {
    if (silence.end - silence.start < 0.9 || silence.start <= cursor) continue;
    const before = Math.min(duration, Math.max(cursor, silence.start + 0.12));
    if (before - cursor >= 0.12) kept.push({start: cursor, end: before});
    cursor = Math.min(duration, Math.max(cursor, silence.end - 0.12));
  }
  if (duration - cursor >= 0.12) kept.push({start:cursor, end:duration});
  return kept.length ? kept : [{start:0,end:duration}];
}

async function createEditorProject(input: SmartCutImport, imported: { src: string; bytes: number; filename: string }): Promise<{ editorProjectId: string; sourceDurationSeconds: number; roughCutDurationSeconds: number; removedSilenceSeconds: number }> {
  const diskPath = join(uploadDir(), imported.filename);
  const info = await mediaInfo(diskPath);
  const silences = await silenceSpans(diskPath).catch(() => []);
  const segments = compactSegments(info.durationSeconds, silences);
  const fps = 30;
  let timelineFrame = 0;
  const items = segments.map((segment) => {
    const durationInFrames = Math.max(1, Math.round((segment.end - segment.start) * fps));
    const item = {id:`smart-cut-clip-${randomUUID()}`,track:'V1',startFrame:timelineFrame,durationInFrames,srcInFrame:Math.max(0, Math.round(segment.start * fps)),kind:'video',name:'智能粗剪片段',src:imported.src};
    timelineFrame += durationInFrames;
    return item;
  });
  const editorProjectId = randomUUID();
  const timelineId = `tl_${randomUUID()}`;
  const project = {
    version:CURRENT_PROJECT_VERSION,
    assets:[{id:`asset-${randomUUID()}`,name:String(input.source?.originalName || '主视频').slice(0, 160),sourceFilename:String(input.source?.originalName || imported.filename).slice(0, 160),kind:'video',src:imported.src,durationInFrames:Math.max(1, Math.round(info.durationSeconds * fps)),sourceSize:imported.bytes,...(info.width ? {width:info.width} : {}),...(info.height ? {height:info.height} : {})}],
    mediaFolders:[],
    timelines:[{id:timelineId,name:'智能粗剪',order:0,fps,width:1080,height:1920,items,selectedId:null,trackOrder:['V1'],tracks:{V1:{kind:'video'}}}],
    activeTimelineId:timelineId,
    niannianSmartCut:{jobId:input.jobId,sourceAssetId:input.source?.assetId || undefined,preset:input.preset || 'talking_head',aspectRatio:input.aspectRatio || '9:16',captionStyle:input.captionStyle || 'bold-outline',scriptText:input.scriptText || null}
  };
  const store = await readStore();
  const projects = Array.isArray(store.entries.projects) ? store.entries.projects : [];
  await setStoredEntry(`project:${editorProjectId}`, project);
  await setStoredEntry('smart-cut:' + editorProjectId, {jobId:input.jobId || null,source:imported.src,createdAt:Date.now()});
  await setStoredEntry('projects', [{id:editorProjectId,name:String(input.projectName || '念念智能粗剪').slice(0, 160),updatedAt:Date.now(),description:'来自念念 AI 智能剪辑节点'}, ...projects]);
  const roughCutDurationSeconds = timelineFrame / fps;
  return {editorProjectId,sourceDurationSeconds:info.durationSeconds,roughCutDurationSeconds,removedSilenceSeconds:Math.max(0, info.durationSeconds - roughCutDurationSeconds)};
}

export function niannianSmartCutPlugin(): Plugin {
  return {
    name:'niannian-smart-cut',
    configureServer(server) {
      server.middlewares.use(REQUEST_PATH, async (req, res) => {
        if (req.method !== 'POST') { sendJson(res, 405, {error:'method not allowed'}); return; }
        try {
          const raw = await readBody(req);
          if (!hasValidSignature(raw, typeof req.headers['x-niannian-smart-cut-signature'] === 'string' ? req.headers['x-niannian-smart-cut-signature'] : undefined)) { sendJson(res, 401, {error:'invalid smart cut bridge signature'}); return; }
          const input = JSON.parse(raw.toString('utf8') || '{}') as SmartCutImport;
          if (!/^SCJ-[a-f0-9]{24}$/.test(String(input.jobId || ''))) { sendJson(res, 422, {error:'invalid smart cut job'}); return; }
          const sourceUrl = allowedSourceUrl(String(input.source?.url || ''));
          if (!sourceUrl) { sendJson(res, 422, {error:'invalid smart cut source'}); return; }
          const imported = await importSource(sourceUrl, input.source?.originalName);
          const result = await createEditorProject(input, imported);
          sendJson(res, 201, {ok:true,...result});
        } catch (error) {
          server.config.logger.error(`[niannian-smart-cut] ${error instanceof Error ? error.message : String(error)}`);
          sendJson(res, 502, {error:'smart cut project import failed'});
        }
      });
    }
  };
}

export async function notifyNiannianSmartCutExport(input: { jobId: `SCJ-${string}`; publicPath: string; originalName: string; durationSeconds?: number; }): Promise<void> {
  if (!/^SCJ-[a-f0-9]{24}$/.test(input.jobId)) throw new Error('invalid smart-cut job id');
  if (!/^\/media\/uploads\/[A-Za-z0-9._-]+$/.test(input.publicPath)) throw new Error('invalid smart-cut output path');
  const secret = bridgeSecret();
  if (!secret) throw new Error('smart-cut bridge secret is not configured');
  const main = new URL(String(process.env.NIANNIAN_SMART_CUT_MAIN_URL || 'https://ai.cau.fun').replace(/\/+$/, ''));
  const editor = new URL(String(process.env.NIANNIAN_SMART_CUT_EDITOR_PUBLIC_URL || 'https://edit.cau.fun').replace(/\/+$/, ''));
  const body = JSON.stringify({output:{url:new URL(input.publicPath, editor).toString(),originalName:String(input.originalName || '念念智能剪辑成片.mp4').slice(0, 160),...(Number.isFinite(input.durationSeconds) ? {durationSeconds:input.durationSeconds} : {})}});
  const signature = createHmac('sha256', secret).update(body).digest('hex');
  const response = await fetch(new URL(`/api/internal/smart-cut/jobs/${encodeURIComponent(input.jobId)}/complete`, main), {method:'POST',headers:{'Content-Type':'application/json','X-Niannian-Smart-Cut-Signature':signature},body,signal:AbortSignal.timeout(60_000)});
  if (!response.ok) throw new Error(`smart-cut callback failed: ${response.status}`);
}
