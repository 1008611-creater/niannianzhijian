import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

import { isSafeUploadName, resolveUploadFile } from '../media-dir.ts';

const MAX_JSON_BYTES = 32 * 1024;
const MAX_TEXT_CHARS = 8_000;
const ALIGN_TIMEOUT_MS = 10 * 60_000;
const MODEL_ID = 'Qwen/Qwen3-ForcedAligner-0.6B-hf';

export interface ForcedAlignerWord { text: string; start: number; end: number; }
export interface ForcedAlignerResult {
  model: string;
  granularity: 'character' | 'word';
  words: ForcedAlignerWord[];
}

interface WorkerReply extends Partial<ForcedAlignerResult> { id?: string; ok?: boolean; error?: string; }
interface Pending { resolve: (result: ForcedAlignerResult) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>; }

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

function localUpload(src: unknown, resolveFile: (name: string) => string | null = resolveUploadFile): string | null {
  if (typeof src !== 'string') return null;
  let clean: string;
  try { clean = decodeURIComponent(src.split('?')[0] ?? '').trim(); } catch { return null; }
  const name = /^\/media\/uploads\/([^/]+)$/.exec(clean)?.[1];
  return name && isSafeUploadName(name) ? resolveFile(name) : null;
}

/** Preserve only actual, ordered, positive-duration model timestamps. */
export function normalizeForcedAlignerWords(value: unknown): ForcedAlignerWord[] {
  if (!Array.isArray(value)) throw new Error('forced aligner returned no timestamps');
  let previousEnd = -1;
  const words = value.flatMap((item): ForcedAlignerWord[] => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const text = typeof record.text === 'string' ? record.text.trim() : '';
    const start = Number(record.start);
    const end = Number(record.end);
    if (!text || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || start < previousEnd) return [];
    previousEnd = end;
    return [{ text, start: Math.round(start), end: Math.round(end) }];
  });
  if (!words.length) throw new Error('forced aligner returned no usable timestamps');
  return words;
}

class LocalForcedAligner {
  private child: ChildProcessWithoutNullStreams | null = null;
  private buffer = '';
  private readonly pending = new Map<string, Pending>();

  private root(): string {
    const nativeRoot = process.env.QWEN_FORCED_ALIGNER_NATIVE_ROOT?.trim();
    return nativeRoot && existsSync(nativeRoot) ? nativeRoot : join(process.cwd(), '.work', 'qwen-forced-aligner');
  }

  private python(): string {
    const root = this.root();
    return process.platform === 'win32' ? join(root, 'venv', 'Scripts', 'python.exe') : join(root, 'venv', 'bin', 'python');
  }

  private start(): ChildProcessWithoutNullStreams {
    if (this.child && !this.child.killed) return this.child;
    const python = this.python();
    if (!existsSync(python)) throw new Error('Qwen 强制对齐环境未安装：请先安装 Qwen3-ForcedAligner-0.6B 本地运行环境');
    const root = this.root();
    const worker = join(process.cwd(), 'server', 'qwen-forced-aligner-worker.py');
    const localModel = join(root, 'model');
    const nativeModel = process.env.QWEN_FORCED_ALIGNER_NATIVE_MODEL?.trim();
    const model = nativeModel && existsSync(nativeModel)
      ? nativeModel
      : existsSync(localModel) ? localModel : MODEL_ID;
    const child = spawn(python, ['-u', worker], {
      cwd: process.cwd(), windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', HF_HOME: join(root, 'hf-cache'), MODELSCOPE_CACHE: join(root, 'modelscope-cache'), QWEN_FORCED_ALIGNER_MODEL: model },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (part: Buffer) => this.receive(part.toString('utf8')));
    child.stderr.on('data', () => undefined); // Worker diagnostics deliberately stay server-local.
    child.on('exit', () => this.failAll(new Error('Qwen 强制对齐进程已停止')));
    child.on('error', (error) => this.failAll(error));
    this.child = child;
    return child;
  }

  private receive(part: string): void {
    this.buffer += part;
    for (;;) {
      const newline = this.buffer.indexOf('\n');
      if (newline < 0) return;
      const line = this.buffer.slice(0, newline); this.buffer = this.buffer.slice(newline + 1);
      try {
        const reply = JSON.parse(line) as WorkerReply;
        const id = typeof reply.id === 'string' ? reply.id : '';
        const pending = this.pending.get(id);
        if (!pending) continue;
        this.pending.delete(id); clearTimeout(pending.timer);
        if (!reply.ok) pending.reject(new Error(reply.error || 'Qwen 强制对齐失败'));
        else pending.resolve({ model: typeof reply.model === 'string' ? reply.model : MODEL_ID, granularity: reply.granularity === 'word' ? 'word' : 'character', words: normalizeForcedAlignerWords(reply.words) });
      } catch { /* Ignore malformed worker output; the matching request will time out with no fabricated result. */ }
    }
  }

  private failAll(error: Error): void {
    this.child = null;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
  }

  align(audio: string, text: string): Promise<ForcedAlignerResult> {
    const child = this.start();
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Qwen 强制对齐超时；模型仍会保留在本地进程中，可重试'));
      }, ALIGN_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({ id, audio, text })}\n`, (error) => {
        if (!error) return;
        const pending = this.pending.get(id);
        if (pending) { this.pending.delete(id); clearTimeout(pending.timer); pending.reject(error); }
      });
    });
  }
}

const aligner = new LocalForcedAligner();

/** Server-only bridge used by composite ASR providers. */
export function alignForcedAudio(audio: string, text: string): Promise<ForcedAlignerResult> {
  return aligner.align(audio, text);
}

export async function handleQwenForcedAligner(req: IncomingMessage, res: ServerResponse, dependencies: { align?: (audio: string, text: string) => Promise<ForcedAlignerResult>; resolveFile?: (name: string) => string | null } = {}): Promise<void> {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed — use POST' });
  if (String(req.headers['content-type'] ?? '').split(';', 1)[0]!.trim().toLowerCase() !== 'application/json') return sendJson(res, 415, { error: 'content-type must be application/json' });
  const origin = String(req.headers.origin ?? '').trim();
  if (origin) {
    try { if (new URL(origin).host !== String(req.headers.host ?? '')) return sendJson(res, 403, { error: 'untrusted request origin' }); }
    catch { return sendJson(res, 403, { error: 'untrusted request origin' }); }
  }
  try {
    const body = await readJson(req);
    const audio = localUpload(body.src, dependencies.resolveFile);
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!audio) return sendJson(res, 400, { error: 'src must be a local /media/uploads/<safe-name> audio path' });
    if (!text || text.length > MAX_TEXT_CHARS) return sendJson(res, 400, { error: `text is required and must be at most ${MAX_TEXT_CHARS} characters` });
    const result = await (dependencies.align ?? ((file, knownText) => aligner.align(file, knownText)))(audio, text);
    const words = normalizeForcedAlignerWords(result.words);
    return sendJson(res, 200, { ok: true, model: result.model, granularity: result.granularity, words });
  } catch (error) {
    return sendJson(res, 502, { error: error instanceof Error ? error.message : String(error) });
  }
}

export function qwenForcedAlignerPlugin(): Plugin {
  return { name: 'openchatcut-qwen-forced-aligner', configureServer(server) {
    server.middlewares.use('/api/qwen-forced-aligner/align', (req, res) => { void handleQwenForcedAligner(req, res); });
  } };
}
