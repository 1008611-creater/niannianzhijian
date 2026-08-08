import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { isSafeUploadName, resolveUploadFile } from '../media-dir.ts';
import { runMimoAsr } from './mimo-asr.ts';
import { alignForcedAudio, normalizeForcedAlignerWords } from './qwen-forced-aligner.ts';

const MAX_JSON_BYTES = 8 * 1024;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.destroyed || res.writableEnded) return;
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
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

function localUpload(src: unknown, resolveFile: (name: string) => string | null = resolveUploadFile): string | null {
  if (typeof src !== 'string') return null;
  let clean: string;
  try { clean = decodeURIComponent(src.split('?')[0] ?? '').trim(); } catch { return null; }
  const name = /^\/media\/uploads\/([^/]+)$/.exec(clean)?.[1];
  return name && isSafeUploadName(name) ? resolveFile(name) : null;
}

export interface MimoQwenAsrOptions { baseUrl: string; apiKey: string; model: string; }

export async function handleMimoQwenAsr(
  req: IncomingMessage,
  res: ServerResponse,
  options: MimoQwenAsrOptions,
  dependencies: {
    resolveFile?: (name: string) => string | null;
    transcribe?: (file: string, options: MimoQwenAsrOptions, language: unknown) => ReturnType<typeof runMimoAsr>;
    align?: (file: string, text: string) => ReturnType<typeof alignForcedAudio>;
  } = {},
): Promise<void> {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed — use POST' });
  try {
    const body = await readJson(req);
    const audio = localUpload(body.src, dependencies.resolveFile);
    if (!audio) return sendJson(res, 400, { error: 'src must be a local /media/uploads/<safe-name> media path' });
    const transcription = await (dependencies.transcribe ?? runMimoAsr)(audio, options, body.language);
    const aligned = await (dependencies.align ?? alignForcedAudio)(audio, transcription.text);
    const words = normalizeForcedAlignerWords(aligned.words);
    return sendJson(res, 200, {
      ok: true,
      text: transcription.text,
      words,
      model: `${transcription.model}+${aligned.model}`,
      granularity: aligned.granularity,
      providers: { transcript: 'mimo-asr', alignment: aligned.model },
    });
  } catch (error) {
    return sendJson(res, 502, { error: error instanceof Error ? error.message : String(error) });
  }
}

export function mimoQwenAsrPlugin(options: MimoQwenAsrOptions): Plugin {
  return { name: 'openchatcut-mimo-qwen-asr', configureServer(server) {
    server.middlewares.use('/api/mimo-qwen-asr/transcribe', (req, res) => {
      void handleMimoQwenAsr(req, res, options).catch((error) => {
        sendJson(res, 502, { error: error instanceof Error ? error.message : String(error) });
      });
    });
  } };
}
