import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import type { Plugin } from 'vite';

import { isSafeUploadName, resolveUploadFile } from '../media-dir.ts';

const MAX_JSON_BYTES = 8 * 1024;
const MAX_SOURCE_BYTES = 200 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10 * 60_000;

export interface OpenAiAsrOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface OpenAiAsrWord {
  text: string;
  start: number;
  end: number;
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

function mimeType(name: string): string {
  switch (extname(name).toLowerCase()) {
    case '.mp3': return 'audio/mpeg';
    case '.wav': return 'audio/wav';
    case '.m4a': return 'audio/mp4';
    case '.aac': return 'audio/aac';
    case '.flac': return 'audio/flac';
    case '.ogg': return 'audio/ogg';
    case '.opus': return 'audio/ogg';
    case '.webm': return 'audio/webm';
    case '.mp4': return 'video/mp4';
    case '.mov': return 'video/quicktime';
    default: return 'application/octet-stream';
  }
}

function normalizedWord(value: unknown): OpenAiAsrWord | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const text = typeof row.word === 'string' ? row.word.trim() : typeof row.text === 'string' ? row.text.trim() : '';
  const startSeconds = Number(row.start);
  const endSeconds = Number(row.end);
  if (!text || !Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || endSeconds < startSeconds) return undefined;
  return { text, start: Math.round(startSeconds * 1000), end: Math.round(endSeconds * 1000) };
}

/** Strictly accepts verbose_json's word timing contract; plain text is not enough for captions. */
export function parseOpenAiAsrResponse(value: unknown): { text: string; words: OpenAiAsrWord[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('ASR provider returned invalid JSON');
  const record = value as Record<string, unknown>;
  const words = Array.isArray(record.words) ? record.words.map(normalizedWord).filter((word): word is OpenAiAsrWord => Boolean(word)) : [];
  if (!words.length) throw new Error('ASR provider returned no word timestamps; choose a model that supports verbose_json word timestamps');
  const text = typeof record.text === 'string' && record.text.trim() ? record.text.trim() : words.map((word) => word.text).join(' ');
  return { text, words };
}

export async function handleOpenAiAsr(
  req: IncomingMessage,
  res: ServerResponse,
  options: OpenAiAsrOptions,
  dependencies: { fetchUpstream?: typeof fetch; resolveFile?: (name: string) => string | null } = {},
): Promise<void> {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed — use POST' });
  if (String(req.headers['content-type'] ?? '').split(';', 1)[0]!.trim().toLowerCase() !== 'application/json') {
    return sendJson(res, 415, { error: 'content-type must be application/json' });
  }
  const origin = String(req.headers.origin ?? '').trim();
  if (origin) {
    try {
      const parsed = new URL(origin);
      if (parsed.host !== String(req.headers.host ?? '')) return sendJson(res, 403, { error: 'untrusted request origin' });
    } catch { return sendJson(res, 403, { error: 'untrusted request origin' }); }
  }
  try {
    const body = await readJson(req);
    const source = localUpload(body.src, dependencies.resolveFile);
    if (!source) return sendJson(res, 400, { error: 'src must be a local /media/uploads/<safe-name> media path' });
    if (!options.apiKey.trim()) return sendJson(res, 503, { error: 'OpenAI compatible ASR API Key is not configured' });
    const info = await stat(source.file).catch(() => null);
    if (!info?.isFile() || info.size < 1) return sendJson(res, 404, { error: 'media source not found' });
    if (info.size > MAX_SOURCE_BYTES) return sendJson(res, 413, { error: 'media source is too large for OpenAI compatible ASR (max 200 MB)' });
    const form = new FormData();
    form.set('file', new Blob([await readFile(source.file)], { type: mimeType(source.name) }), source.name);
    form.set('model', options.model.trim() || 'whisper-1');
    if (body.languageCode === 'zh') form.set('language', 'zh');
    form.set('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');
    const endpoint = `${options.baseUrl.trim().replace(/\/+$/, '')}/audio/transcriptions`;
    const response = await (dependencies.fetchUpstream ?? fetch)(endpoint, {
      method: 'POST', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Authorization: `Bearer ${options.apiKey.trim()}` }, body: form,
    });
    const raw = await response.text();
    if (!response.ok) return sendJson(res, 502, { error: `OpenAI compatible ASR request failed (HTTP ${response.status})`, detail: raw.replace(/\s+/g, ' ').slice(0, 300) });
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return sendJson(res, 502, { error: 'OpenAI compatible ASR returned invalid JSON' }); }
    const result = parseOpenAiAsrResponse(parsed);
    return sendJson(res, 200, { ok: true, text: result.text, words: result.words, model: options.model.trim() || 'whisper-1' });
  } catch (error) {
    return sendJson(res, 502, { error: error instanceof Error ? error.message : String(error) });
  }
}

export function openAiAsrPlugin(options: OpenAiAsrOptions): Plugin {
  return {
    name: 'openchatcut-openai-asr',
    configureServer(server) {
      server.middlewares.use('/api/openai-asr/transcribe', (req, res) => {
        void handleOpenAiAsr(req, res, options);
      });
    },
  };
}
