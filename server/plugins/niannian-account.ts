import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
type NextFunction = (error?: unknown) => void;

type EditorUser = { id: string; email: string };
type Ticket = { v: 1; userId: string; email: string; exp: number; nonce?: string };

const SESSION_COOKIE = 'niannian_editor_session';
const MAIN_ORIGIN = () => (process.env.NIANNIAN_MAIN_ORIGIN?.trim() || 'https://ai.cau.fun').replace(/\/+$/, '');
const EDITOR_ORIGIN = () => (process.env.NIANNIAN_EDITOR_ORIGIN?.trim() || 'https://edit.cau.fun').replace(/\/+$/, '');

function secret(): string | null {
  const value = process.env.NIANNIAN_EDITOR_SSO_SECRET?.trim();
  return value && value.length >= 32 ? value : null;
}

function integrationEnabled(): boolean { return Boolean(secret()); }

function localWslDev(): boolean { return process.env.LOCAL_WSL_DEV === '1'; }

function localWslUser(): EditorUser | null {
  return localWslDev() ? { id: 'local-wsl-user', email: 'local-wsl@example.invalid' } : null;
}

function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.end(JSON.stringify(body));
}

function cookies(req: IncomingMessage): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    try { result[key] = decodeURIComponent(part.slice(index + 1).trim()); } catch { /* ignore malformed cookie */ }
  }
  return result;
}

function verifyTicket(value: string | undefined): EditorUser | null {
  const signingSecret = secret();
  if (!signingSecret) return null;
  const [payload, provided] = String(value || '').split('.');
  if (!payload || !provided || !/^[a-f0-9]{64}$/i.test(provided)) return null;
  const expected = Buffer.from(createHmac('sha256', signingSecret).update(payload).digest('hex'), 'hex');
  const actual = Buffer.from(provided, 'hex');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<Ticket>;
    if (parsed.v !== 1) return null;
    if (typeof parsed.userId !== 'string' || typeof parsed.email !== 'string' || Number(parsed.exp) <= Date.now()) return null;
    return { id: parsed.userId, email: parsed.email };
  } catch { return null; }
}

function issueSession(user: EditorUser): string {
  const payload = Buffer.from(JSON.stringify({v:1,userId:user.id,email:user.email,exp:Date.now() + 14 * 24 * 60 * 60 * 1000,nonce:randomBytes(12).toString('hex')})).toString('base64url');
  return `${payload}.${createHmac('sha256', secret()!).update(payload).digest('hex')}`;
}

function currentUser(req: IncomingMessage): EditorUser | null {
  return verifyTicket(cookies(req)[SESSION_COOKIE]) || localWslUser();
}

function validReturnTo(value: string | null): string {
  const fallback = '/';
  if (!value) return fallback;
  try {
    const target = new URL(value, EDITOR_ORIGIN());
    const allowed = new URL(EDITOR_ORIGIN());
    return target.origin === allowed.origin && target.pathname.startsWith('/') ? `${target.pathname}${target.search}${target.hash}` : fallback;
  } catch { return fallback; }
}

async function exchange(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET') return json(res, 405, {error:'method not allowed'});
  const url = new URL(req.url || '/', EDITOR_ORIGIN());
  const user = verifyTicket(url.searchParams.get('ticket') || undefined);
  if (!user) return json(res, 401, {error:'念念 AI 登录票据已失效，请重新登录'});
  res.statusCode = 302;
  res.setHeader('Location', validReturnTo(url.searchParams.get('returnTo')));
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(issueSession(user))}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${14 * 24 * 60 * 60}`);
  res.end();
}

async function consume(user: EditorUser, operationId: string, step: string, credits: number): Promise<Response> {
  const body = JSON.stringify({userId:user.id, operationId, step, credits});
  const signature = createHmac('sha256', secret()!).update(body).digest('hex');
  return fetch(`${MAIN_ORIGIN()}/api/internal/editor-billing/consume`, {
    method:'POST', headers:{'Content-Type':'application/json','X-Niannian-Editor-Signature':signature}, body,
    signal: AbortSignal.timeout(20_000),
  });
}

async function balance(user: EditorUser): Promise<number> {
  const userId = encodeURIComponent(user.id);
  const signature = createHmac('sha256', secret()!).update(user.id).digest('hex');
  const response = await fetch(`${MAIN_ORIGIN()}/api/internal/editor-billing/balance?userId=${userId}`, {
    headers: {'X-Niannian-Editor-Signature': signature},
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('CREDITS_UNAVAILABLE');
  const body = await response.json() as {balance?: unknown};
  return Number.isFinite(Number(body.balance)) ? Math.max(0, Math.trunc(Number(body.balance))) : 0;
}

function stepCost(step: string): number {
  const configured = process.env.NIANNIAN_EDITOR_STEP_PRICES?.trim();
  if (configured) {
    for (const entry of configured.split(',')) {
      const [name, raw] = entry.split(':', 2).map((value) => value?.trim());
      if (name === step && /^\d+$/.test(raw || '')) return Math.max(0, Math.min(100000, Number(raw)));
    }
  }
  return 1;
}

async function guard(step: string, req: IncomingMessage, res: ServerResponse, next: NextFunction): Promise<void> {
  if (!integrationEnabled() || req.method !== 'POST') return next();
  const user = currentUser(req);
  if (!user) return json(res, 401, {error:'请先登录念念 AI'});
  if (localWslDev() && stepCost(step) === 0) return next();
  const operationId = String(req.headers['x-niannian-operation-id'] || `${step}:${Date.now()}:${randomBytes(6).toString('hex')}`).slice(0, 160);
  try {
    const response = await consume(user, operationId, step, stepCost(step));
    if (response.ok) return next();
    const body = await response.json().catch(() => ({})) as {error?: string};
    return json(res, response.status === 402 ? 402 : 503, {error: body.error === 'CREDITS_INSUFFICIENT' ? '积分不足，请先充值' : '积分服务暂不可用'});
  } catch {
    return json(res, 503, {error:'积分服务暂不可用，请稍后重试'});
  }
}

const guardedRoutes: Array<[string, string]> = [
  ['/api/mimo-asr/transcribe', 'mimo_asr'],
  ['/api/mimo-qwen-asr/transcribe', 'mimo_qwen_asr'],
  ['/api/openai-asr/transcribe', 'openai_asr'],
  ['/api/assemblyai-upload', 'assemblyai_asr'],
  ['/generate/voice', 'mimo_tts'],
  ['/api/asset-intelligence/ocr', 'ocr'],
  ['/api/asset-intelligence/vision', 'vision'],
  ['/api/qwen-forced-aligner/align', 'forced_align'],
  ['/api/detect-scenes', 'scene_detection'],
  ['/generate/image', 'image_generation'],
  ['/generate/video', 'video_generation'],
  ['/generate/music', 'music_generation'],
  ['/generate/sound', 'sound_generation'],
  ['/export/job', 'export'],
];

export function niannianAccountPlugin(): Plugin {
  return {
    name: 'niannian-account-and-billing',
    configureServer(server) {
      server.middlewares.use('/api/niannian-auth/exchange', (req, res) => { void exchange(req, res); });
      server.middlewares.use('/api/niannian-auth/session', (req, res) => {
        if (req.method !== 'GET') return json(res, 405, {error:'method not allowed'});
        const user = currentUser(req);
        if (integrationEnabled() && !user) return json(res, 401, {error:'请先登录念念 AI'});
        return json(res, 200, {integrated:integrationEnabled(), user});
      });
      server.middlewares.use('/api/niannian-auth/credits', (req, res) => {
        if (req.method !== 'GET') return json(res, 405, {error:'method not allowed'});
        if (!integrationEnabled()) return json(res, 200, {integrated:false, balance:null});
        const user = currentUser(req);
        if (!user) return json(res, 401, {error:'请先登录念念 AI'});
        if (localWslDev()) return json(res, 200, {integrated:true, balance:0});
        void balance(user).then((value) => json(res, 200, {integrated:true, balance:value})).catch(() => json(res, 503, {error:'积分服务暂不可用'}));
      });
      for (const [path, step] of guardedRoutes) server.middlewares.use(path, (req, res, next) => { void guard(step, req, res, next); });
    },
  };
}
