import { createServer, type ServerResponse } from 'node:http';
import { Pool } from 'pg';
import { consumeCredits, normalizeBillingInput, readBalance, validBillingSignature } from './core.ts';

const host = '127.0.0.1';
const port = Number(process.env.PORT || 18086);
const secret = process.env.NIANNIAN_EDITOR_SSO_SECRET?.trim() || '';
const databaseUrl = process.env.DATABASE_URL?.trim() || '';
if (secret.length < 32) throw new Error('NIANNIAN_EDITOR_SSO_SECRET is required');
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: databaseUrl, max: 4 });

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

async function body(request: AsyncIterable<Buffer | string>): Promise<string> {
  let value = '';
  for await (const chunk of request) {
    value += chunk.toString();
    if (Buffer.byteLength(value) > 32_768) throw new Error('BODY_TOO_LARGE');
  }
  return value;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${host}:${port}`);
    if (request.method === 'GET' && url.pathname === '/health') {
      await pool.query('SELECT 1');
      return json(response, 200, { ok: true });
    }
    if (request.method === 'GET' && url.pathname === '/api/internal/editor-billing/balance') {
      const userId = url.searchParams.get('userId')?.trim() || '';
      const signature = typeof request.headers['x-niannian-editor-signature'] === 'string'
        ? request.headers['x-niannian-editor-signature'] : undefined;
      if (!userId || !validBillingSignature(secret, userId, signature)) return json(response, 401, { error: 'EDITOR_BILLING_UNAUTHORIZED' });
      return json(response, 200, { balance: await readBalance(pool, userId) });
    }
    if (request.method === 'POST' && url.pathname === '/api/internal/editor-billing/consume') {
      const raw = await body(request);
      const signature = typeof request.headers['x-niannian-editor-signature'] === 'string'
        ? request.headers['x-niannian-editor-signature'] : undefined;
      if (!validBillingSignature(secret, raw, signature)) return json(response, 401, { error: 'EDITOR_BILLING_UNAUTHORIZED' });
      const input = normalizeBillingInput(JSON.parse(raw || '{}'));
      if (!input) return json(response, 400, { error: 'EDITOR_CREDIT_REQUEST_INVALID' });
      try {
        return json(response, 200, { ok: true, ...await consumeCredits(pool, input) });
      } catch (error) {
        const code = error instanceof Error ? error.message : 'EDITOR_BILLING_FAILED';
        return json(response, code === 'CREDITS_INSUFFICIENT' ? 402 : 409, {
          error: code === 'CREDITS_INSUFFICIENT' ? code : 'EDITOR_BILLING_FAILED',
        });
      }
    }
    return json(response, 404, { error: 'NOT_FOUND' });
  } catch {
    return json(response, 400, { error: 'BAD_REQUEST' });
  }
});

server.listen(port, host, () => console.log(`NianNian editor billing listening on http://${host}:${port}`));

async function shutdown(): Promise<void> {
  server.close();
  await pool.end();
}
process.once('SIGTERM', () => { void shutdown(); });
process.once('SIGINT', () => { void shutdown(); });
