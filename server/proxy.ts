// Shared streaming proxy for Vite dev and the Electron embedded server.
// `target()` and `headers()` are evaluated for every request, so settings saved
// through the keystore take effect immediately without exposing keys to browser JS.
import { request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { Agent as HttpAgent } from 'node:http';
import { HttpsProxyAgent } from 'https-proxy-agent';

type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => unknown;

// Optional outbound proxy (Clash etc.) for providers blocked by the network.
// node:https does not read HTTPS_PROXY by itself, so we attach a CONNECT
// tunnel agent when the environment asks for one. Lazily cached; disabled
// for plain-http targets and when no proxy env is set.
let proxyAgent: HttpAgent | null | undefined;

function outboundProxyAgent(): HttpAgent | null {
  if (proxyAgent !== undefined) return proxyAgent;
  const proxyUrl = process.env.HTTPS_PROXY
    ?? process.env.https_proxy
    ?? process.env.HTTP_PROXY
    ?? process.env.http_proxy;
  if (!proxyUrl) {
    proxyAgent = null;
    return null;
  }
  try {
    proxyAgent = new HttpsProxyAgent(proxyUrl);
  } catch {
    proxyAgent = null;
  }
  return proxyAgent;
}

const HOP_BY_HOP = new Set(['host', 'connection', 'keep-alive', 'proxy-authorization', 'proxy-connection', 'transfer-encoding', 'upgrade', 'te', 'trailer']);

// Browser-only headers that must never reach upstream. Cookies are shared across
// every localhost port, so a large accumulated cookie jar on a dev machine would
// otherwise be forwarded verbatim and rejected by provider gateways (431/400).
// Origin/Referer/Sec-Fetch headers describe the local editor page, not the
// provider request. Some OpenAI-compatible gateways treat those values as a
// CSRF check and reject otherwise valid API keys.
const NEVER_FORWARD: Record<string, true> = {
  'x-openchatcut-provider': true,
  'x-openchatcut-request-kind': true,
  'x-openchatcut-streaming': true,
  'x-openchatcut-tool-count': true,
  'x-openchatcut-message-count': true,
  'x-niannian-operation-id': true,
  cookie: true,
  origin: true,
  referer: true,
  'sec-fetch-site': true,
  'sec-fetch-mode': true,
  'sec-fetch-dest': true,
  'sec-fetch-user': true,
};

function safeHeader(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return typeof value === 'string' && value.length <= 32 && /^[a-z0-9_-]+$/i.test(value)
    ? value
    : undefined;
}

function safeCountHeader(req: IncomingMessage, name: string): number | undefined {
  const value = safeHeader(req, name);
  if (!value || !/^\d{1,6}$/.test(value)) return undefined;
  const count = Number(value);
  return Number.isSafeInteger(count) ? count : undefined;
}

function endpointCategory(path: string): string {
  if (path.endsWith('/chat/completions')) return 'chat_completions';
  if (path.endsWith('/responses')) return 'responses';
  return 'other';
}

function logUpstreamFailure(
  status: number,
  request: IncomingMessage,
  path: string,
  requestBytes: number,
): void {
  const kind = safeHeader(request, 'x-openchatcut-request-kind') ?? 'unknown';
  const streaming = safeHeader(request, 'x-openchatcut-streaming') ?? 'unknown';
  const tools = safeCountHeader(request, 'x-openchatcut-tool-count');
  const messages = safeCountHeader(request, 'x-openchatcut-message-count');
  console.warn(
    `[proxy] upstream_error status=${status} endpoint=${endpointCategory(path)}`
      + ` kind=${kind} streaming=${streaming} tools=${tools ?? 'unknown'}`
      + ` messages=${messages ?? 'unknown'} requestBytes=${requestBytes}`,
  );
}

export interface ProxyRoute {
  /** Target API prefix, evaluated per request. */
  target: (req: IncomingMessage) => string;
  /** Outbound headers, evaluated per request. */
  headers: (req: IncomingMessage) => Record<string, string>;
  /** Normalize generic relay responses so provider SDKs can parse JSON. */
  forceJsonContentType?: boolean;
  /** Replace upstream error bodies with one actionable message. */
  errorMessage?: (status: number, req: IncomingMessage) => string;
}

export function proxyMiddleware(route: ProxyRoute): Middleware {
  return (req, res) => {
    let requestBytes = 0;
    req.on('data', (chunk: Buffer | string) => {
      requestBytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
    });
    let target: URL;
    try {
      target = new URL(route.target(req));
      if (target.protocol !== 'http:' && target.protocol !== 'https:') {
        throw new Error('unsupported proxy protocol');
      }
    } catch {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'proxy target is not a valid URL' }));
      return;
    }
    const headers: Record<string, string | string[]> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (!HOP_BY_HOP.has(k.toLowerCase()) && !NEVER_FORWARD[k.toLowerCase()] && v !== undefined) {
        headers[k] = v;
      }
    }
    headers.host = target.host;
    for (const [k, v] of Object.entries(route.headers(req))) if (v) headers[k] = v;

    const basePath = target.pathname.replace(/\/$/, '');
    const rawUrl = req.url ?? '/';
    const queryAt = rawUrl.indexOf('?');
    const requestPath = queryAt === -1 ? rawUrl : rawUrl.slice(0, queryAt);
    const search = new URLSearchParams(target.search);
    if (queryAt !== -1) {
      for (const [name, value] of new URLSearchParams(rawUrl.slice(queryAt + 1))) {
        search.append(name, value);
      }
    }
    const query = search.size > 0 ? `?${search.toString()}` : '';
    const doRequest = target.protocol === 'http:' ? httpRequest : httpsRequest;
    const agent = target.protocol === 'https:' ? outboundProxyAgent() : null;
    const upstream = doRequest({
      host: target.hostname,
      port: target.port || (target.protocol === 'http:' ? 80 : 443),
      method: req.method,
      path: basePath + requestPath + query,
      headers,
      ...(agent ? { agent } : {}),
    }, (upRes) => {
      const status = upRes.statusCode ?? 502;
      if (status >= 400 && route.errorMessage) {
        upRes.resume();
        logUpstreamFailure(status, req, basePath + requestPath, requestBytes);
        res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: { message: route.errorMessage(status, req) } }));
        return;
      }
      const outHeaders: Record<string, string | string[]> = {};
      for (const [k, v] of Object.entries(upRes.headers)) {
        if (!HOP_BY_HOP.has(k.toLowerCase()) && v !== undefined) outHeaders[k] = v;
      }
      if (route.forceJsonContentType) {
        const ct = String(outHeaders['content-type'] ?? '');
        if (!ct.includes('application/json') && !ct.includes('text/event-stream')) {
          outHeaders['content-type'] = 'application/json';
        }
      }
      res.writeHead(status, outHeaders);
      upRes.pipe(res);
    });

    upstream.on('error', (err) => {
      const code = typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: unknown }).code ?? 'unknown').slice(0, 32)
        : 'unknown';
      console.warn(`[proxy] transport_error code=${code} endpoint=${endpointCategory(basePath + requestPath)}`);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: route.errorMessage?.(502, req) ?? '上游请求失败，请稍后重试。' } }));
      } else if (!res.writableEnded) {
        res.end();
      }
    });
    res.on('close', () => upstream.destroy());
    req.pipe(upstream);
  };
}
