import type { IncomingMessage, ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import type { Plugin } from 'vite';

import { ffmpegBin } from '../media-binaries.ts';
import { isSafeUploadName, resolveUploadFile } from '../media-dir.ts';

const MAX_JSON_BYTES = 8 * 1024;
const MAX_ENCODED_AUDIO_BYTES = 10_000_000;
// A data URL and Base64 increase size by roughly 4/3. Leave room for the prefix.
const MAX_AUDIO_BYTES = 7_000_000;
const REQUEST_TIMEOUT_MS = 10 * 60_000;
const FFMPEG_TIMEOUT_MS = 10 * 60_000;

export interface MimoAsrOptions {
  baseUrl: string;
  /** Deliberately shared with MiMo TTS: MIMO_TTS_API_KEY. */
  apiKey: string;
  model: string;
}

export interface MimoAsrResult {
  text: string;
  model: string;
  language: 'auto' | 'zh' | 'en';
}

export function isNoSpeechTranscript(text: string): boolean {
  return /^[（(]?\s*(?:无|没有|未检测到)\s*(?:语音|人声|说话|口播)(?:内容)?\s*[）)]?$/.test(text.trim());
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.destroyed || res.writableEnded) return;
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const declared = Number(req.headers['content-length'] ?? 0);
  if (Number.isFinite(declared) && declared > MAX_JSON_BYTES) throw new Error('request body too large');
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

function localUpload(src: unknown, resolveFile: (name: string) => string | null = resolveUploadFile): { name: string; file: string } | null {
  if (typeof src !== 'string') return null;
  let clean: string;
  try { clean = decodeURIComponent(src.split('?')[0] ?? '').trim(); } catch { return null; }
  const name = /^\/media\/uploads\/([^/]+)$/.exec(clean)?.[1];
  if (!name || !isSafeUploadName(name)) return null;
  const file = resolveFile(name);
  return file ? { name, file } : null;
}

function language(value: unknown): 'auto' | 'zh' | 'en' {
  return value === 'zh' || value === 'en' ? value : 'auto';
}

function audioKind(path: string): { format: 'mp3' | 'wav'; mime: 'audio/mpeg' | 'audio/wav' } | undefined {
  switch (extname(path).toLowerCase()) {
    case '.mp3': return { format: 'mp3', mime: 'audio/mpeg' };
    case '.wav': return { format: 'wav', mime: 'audio/wav' };
    default: return undefined;
  }
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegBin(), args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`ffmpeg timed out after ${Math.round(FFMPEG_TIMEOUT_MS / 1000)}s`));
    }, FFMPEG_TIMEOUT_MS);
    child.stderr?.on('data', (chunk: Buffer) => { stderr = `${stderr}${String(chunk)}`.slice(-4_000); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}

async function withMimoAudio<T>(input: string, execute: (audio: Buffer, kind: { format: 'mp3' | 'wav'; mime: 'audio/mpeg' | 'audio/wav' }) => Promise<T>): Promise<T> {
  const original = audioKind(input);
  const originalInfo = await stat(input).catch(() => null);
  if (!originalInfo?.isFile() || originalInfo.size < 1) throw new Error('media source not found');
  if (original && originalInfo.size <= MAX_AUDIO_BYTES) return execute(await readFile(input), original);

  const directory = await mkdtemp(join(tmpdir(), 'openchatcut-mimo-asr-'));
  try {
    const output = join(directory, 'input.mp3');
    await runFfmpeg([
      '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', input,
      '-vn', '-map', '0:a:0?', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '48k', output,
    ]);
    const audio = await readFile(output);
    return execute(audio, { format: 'mp3', mime: 'audio/mpeg' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** MiMo documents a plain transcript in choices[0].message.content, never word timing. */
export function parseMimoAsrResponse(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('MiMo ASR returned invalid JSON');
  const choices = (value as { choices?: unknown }).choices;
  const first = Array.isArray(choices) ? choices[0] : undefined;
  const choice = first && typeof first === 'object' && !Array.isArray(first) ? first as { message?: unknown; text?: unknown; transcript?: unknown } : undefined;
  const message = choice?.message && typeof choice.message === 'object' && !Array.isArray(choice.message)
    ? choice.message as { content?: unknown; audio?: unknown; transcript?: unknown }
    : undefined;
  const content = message?.content;
  const parts = Array.isArray(content)
    ? content.flatMap((part) => part && typeof part === 'object' && !Array.isArray(part)
      ? [typeof (part as { text?: unknown }).text === 'string' ? (part as { text: string }).text : '']
      : [])
    : [
      typeof content === 'string' ? content : '',
      typeof message?.transcript === 'string' ? message.transcript : '',
      typeof choice?.transcript === 'string' ? choice.transcript : '',
      typeof choice?.text === 'string' ? choice.text : '',
      message?.audio && typeof message.audio === 'object' && !Array.isArray(message.audio) && typeof (message.audio as { transcript?: unknown }).transcript === 'string'
        ? (message.audio as { transcript: string }).transcript
        : '',
    ];
  const text = parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 200_000);
  if (!text) {
    const shape = Array.isArray(content) ? 'array' : typeof content;
    const keys = message ? Object.keys(message).filter((key) => key !== 'content').join(',') || 'none' : 'none';
    const audioKeys = message?.audio && typeof message.audio === 'object' && !Array.isArray(message.audio)
      ? Object.keys(message.audio as Record<string, unknown>).join(',') || 'none'
      : typeof message?.audio;
    throw new Error(`MiMo ASR returned no transcript text (content is ${shape}; message keys: ${keys}; audio keys: ${audioKeys})`);
  }
  if (isNoSpeechTranscript(text)) throw new Error('MiMo ASR detected no spoken content in this media');
  return text;
}

async function upstreamError(response: Response): Promise<string> {
  const payload: unknown = await response.json().catch(() => null);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return `MiMo ASR request failed (HTTP ${response.status})`;
  const record = payload as { error?: unknown; message?: unknown };
  const error = record.error && typeof record.error === 'object' && !Array.isArray(record.error)
    ? record.error as { message?: unknown; code?: unknown }
    : undefined;
  const message = typeof error?.message === 'string' ? error.message : typeof record.message === 'string' ? record.message : '';
  const code = typeof error?.code === 'string' || typeof error?.code === 'number' ? ` (${error.code})` : '';
  return message ? `MiMo ASR request failed (HTTP ${response.status})${code}: ${message.slice(0, 400)}` : `MiMo ASR request failed (HTTP ${response.status})`;
}

export async function runMimoAsr(
  input: string,
  options: MimoAsrOptions,
  requestedLanguage: unknown = 'auto',
  fetchUpstream: typeof fetch = fetch,
): Promise<MimoAsrResult> {
  if (!options.apiKey.trim()) throw new Error('MiMo API Key is not configured. Configure MiMo TTS once; ASR reuses the same key.');
  const selectedLanguage = language(requestedLanguage);
  const model = options.model.trim() || 'mimo-v2.5';
  return withMimoAudio(input, async (audio, kind) => {
    if (audio.length > MAX_AUDIO_BYTES || Math.ceil(audio.length / 3) * 4 > MAX_ENCODED_AUDIO_BYTES) {
      throw new Error('MiMo ASR input is too large after encoding (maximum Base64 audio is 10 MB); split the media before transcribing');
    }
    const endpoint = `${options.baseUrl.trim().replace(/\/+$/, '')}/chat/completions`;
    const response = await fetchUpstream(endpoint, {
      method: 'POST', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { 'Content-Type': 'application/json', 'api-key': options.apiKey.trim() },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: [
          { type: 'input_audio', input_audio: {
            data: `data:${kind.mime};base64,${audio.toString('base64')}`,
            format: kind.format,
          } },
          { type: 'text', text: selectedLanguage === 'en'
            ? 'Transcribe this audio accurately. Return only the transcript, with no commentary.'
            : '请准确转写这段音频。只返回转写文本，不要解释或添加其他内容。' },
        ] }],
      }),
    });
    if (!response.ok) throw new Error(await upstreamError(response));
    return { text: parseMimoAsrResponse(await response.json().catch(() => null)), model, language: selectedLanguage };
  });
}

export async function handleMimoAsr(
  req: IncomingMessage,
  res: ServerResponse,
  options: MimoAsrOptions,
  dependencies: { fetchUpstream?: typeof fetch; resolveFile?: (name: string) => string | null } = {},
): Promise<void> {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed — use POST' });
  if (String(req.headers['content-type'] ?? '').split(';', 1)[0]!.trim().toLowerCase() !== 'application/json') {
    return sendJson(res, 415, { error: 'content-type must be application/json' });
  }
  const origin = String(req.headers.origin ?? '').trim();
  if (origin) {
    try {
      if (new URL(origin).host !== String(req.headers.host ?? '')) return sendJson(res, 403, { error: 'untrusted request origin' });
    } catch { return sendJson(res, 403, { error: 'untrusted request origin' }); }
  }
  try {
    const body = await readJson(req);
    const source = localUpload(body.src, dependencies.resolveFile);
    if (!source) return sendJson(res, 400, { error: 'src must be a local /media/uploads/<safe-name> media path' });
    const result = await runMimoAsr(source.file, options, body.language, dependencies.fetchUpstream ?? fetch);
    // This is intentionally text-only. Do not synthesize word timestamps here.
    return sendJson(res, 200, { ok: true, text: result.text, model: result.model, language: result.language, timing: 'none' });
  } catch (error) {
    return sendJson(res, 502, { error: error instanceof Error ? error.message : String(error) });
  }
}

export function mimoAsrPlugin(options: MimoAsrOptions): Plugin {
  return {
    name: 'openchatcut-mimo-asr',
    configureServer(server) {
      server.middlewares.use('/api/mimo-asr/transcribe', (req, res) => {
        void handleMimoAsr(req, res, options).catch((error) => {
          sendJson(res, 502, { error: error instanceof Error ? error.message : String(error) });
        });
      });
    },
  };
}
