import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { settingsPlugin } from './settings.ts';

type Handler = (req: any, res: any) => void | Promise<void>;

function responseProbe() {
  let body = '';
  return {
    res: {
      statusCode: 200,
      headers: {} as Record<string, string>,
      setHeader(name: string, value: string) { this.headers[name] = value; },
      end(value?: string) { body = String(value ?? ''); },
    },
    read() { return { status: this.res.statusCode, body: JSON.parse(body || '{}') }; },
  };
}

function ticket(secret: string, id: string, email: string): string {
  const payload = Buffer.from(JSON.stringify({ v: 1, userId: id, email, exp: Date.now() + 60_000 })).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('hex')}`;
}

const previous = {
  local: process.env.LOCAL_WSL_DEV,
  secret: process.env.NIANNIAN_EDITOR_SSO_SECRET,
  admins: process.env.NIANNIAN_EDITOR_ADMIN_IDS,
};
const secret = 'settings-verify-secret-20260809-32-bytes';
process.env.LOCAL_WSL_DEV = '';
process.env.NIANNIAN_EDITOR_SSO_SECRET = secret;
process.env.NIANNIAN_EDITOR_ADMIN_IDS = 'admin@example.com';

try {
  const routes = new Map<string, Handler>();
  settingsPlugin().configureServer?.({
    middlewares: { use(path: string, handler: Handler) { routes.set(path, handler); } },
  } as any);
  const handler = routes.get('/api/keys');
  assert.ok(handler, 'settings route is installed');

  const anonymous = responseProbe();
  await handler({ method: 'GET', headers: {}, async *[Symbol.asyncIterator]() {} }, anonymous.res);
  assert.equal(anonymous.read().status, 401);

  const ordinary = responseProbe();
  await handler({ method: 'GET', headers: { cookie: `niannian_editor_session=${ticket(secret, 'user-1', 'user@example.com')}` }, async *[Symbol.asyncIterator]() {} }, ordinary.res);
  assert.equal(ordinary.read().status, 200);
  assert.equal(ordinary.read().body.admin, false);
  assert.ok(!Object.keys(ordinary.read().body.models).some((name) => name.endsWith('_BASE_URL')));

  const ordinaryWrite = responseProbe();
  await handler({ method: 'POST', headers: { cookie: `niannian_editor_session=${ticket(secret, 'user-1', 'user@example.com')}` }, async *[Symbol.asyncIterator]() {} }, ordinaryWrite.res);
  assert.equal(ordinaryWrite.read().status, 403);

  const adminWrite = responseProbe();
  await handler({ method: 'POST', headers: { cookie: `niannian_editor_session=${ticket(secret, 'admin-1', 'admin@example.com')}` }, async *[Symbol.asyncIterator]() {} }, adminWrite.res);
  assert.equal(adminWrite.read().status, 200);
  assert.equal(adminWrite.read().body.admin, true);
  console.log('settings.verify: ok');
} finally {
  if (previous.local === undefined) delete process.env.LOCAL_WSL_DEV; else process.env.LOCAL_WSL_DEV = previous.local;
  if (previous.secret === undefined) delete process.env.NIANNIAN_EDITOR_SSO_SECRET; else process.env.NIANNIAN_EDITOR_SSO_SECRET = previous.secret;
  if (previous.admins === undefined) delete process.env.NIANNIAN_EDITOR_ADMIN_IDS; else process.env.NIANNIAN_EDITOR_ADMIN_IDS = previous.admins;
}
