import assert from 'node:assert/strict';
import { niannianAccountPlugin } from './niannian-account.ts';

type Handler = (req: any, res: any, next?: () => void) => void | Promise<void>;

function responseProbe() {
  let body = '';
  const headers: Record<string, string> = {};
  return {
    res: {
      statusCode: 200,
      setHeader(name: string, value: string) { headers[name] = value; },
      end(value?: string) { body = String(value ?? ''); },
    },
    read() { return { status: this.res.statusCode, headers, body: JSON.parse(body || '{}') }; },
  };
}

const previous = {
  local: process.env.LOCAL_WSL_DEV,
  secret: process.env.NIANNIAN_EDITOR_SSO_SECRET,
  prices: process.env.NIANNIAN_EDITOR_STEP_PRICES,
  admins: process.env.NIANNIAN_EDITOR_ADMIN_IDS,
};
process.env.LOCAL_WSL_DEV = '1';
process.env.NIANNIAN_EDITOR_SSO_SECRET = 'local-wsl-editor-sso-secret-20260807';
  process.env.NIANNIAN_EDITOR_STEP_PRICES = 'agent_llm:0,agent_codex:0,export:0,vision:0,video_understanding:0,ocr:0';

try {
  const routes = new Map<string, Handler[]>();
  niannianAccountPlugin().configureServer?.({
    middlewares: { use(path: string, handler: Handler) { routes.set(path, [...(routes.get(path) ?? []), handler]); } },
  } as any);

  const sessionProbe = responseProbe();
  routes.get('/api/niannian-auth/session')?.[0]({ method: 'GET', headers: {} }, sessionProbe.res);
  assert.equal(sessionProbe.read().status, 200);
  assert.deepEqual(sessionProbe.read().body, {
    integrated: true,
    user: { id: 'local-wsl-user', email: 'local-wsl@example.invalid' },
    admin: true,
  });

  let nextCalls = 0;
  const exportGuard = routes.get('/export/job')?.[0];
  assert.ok(exportGuard, 'export route is guarded');
  const exportProbe = responseProbe();
  await exportGuard({ method: 'POST', headers: {} }, exportProbe.res, () => { nextCalls += 1; });
  assert.equal(nextCalls, 1, 'zero-cost local export bypasses remote billing');
  assert.equal(exportProbe.read().status, 200);

  let llmCalls = 0;
  const llmGuard = routes.get('/llm')?.[0];
  assert.ok(llmGuard, 'agent LLM route is guarded');
  const llmProbe = responseProbe();
  await llmGuard({ method: 'POST', headers: {} }, llmProbe.res, () => { llmCalls += 1; });
  assert.equal(llmCalls, 1, 'zero-cost local agent LLM bypasses remote billing');
  assert.equal(llmProbe.read().status, 200);

  for (const path of ['/api/asset-intelligence/vision', '/api/asset-intelligence/video', '/api/asset-intelligence/ocr']) {
    let calls = 0;
    const route = routes.get(path)?.[0];
    assert.ok(route, `${path} is guarded`);
    const probe = responseProbe();
    await route({ method: 'POST', headers: {} }, probe.res, () => { calls += 1; });
    assert.equal(calls, 1, `zero-cost local ${path} bypasses remote billing`);
    assert.equal(probe.read().status, 200);
  }

  delete process.env.LOCAL_WSL_DEV;
  process.env.NIANNIAN_EDITOR_ADMIN_IDS = 'admin@example.test';
  const adminTicketPayload = Buffer.from(JSON.stringify({
    v: 1,
    userId: 'admin-user',
    email: 'admin@example.test',
    exp: Date.now() + 60_000,
  })).toString('base64url');
  const { createHmac } = await import('node:crypto');
  const adminSignature = createHmac('sha256', process.env.NIANNIAN_EDITOR_SSO_SECRET)
    .update(adminTicketPayload).digest('hex');
  let adminNextCalls = 0;
  const adminProbe = responseProbe();
  await llmGuard({
    method: 'POST',
    headers: { cookie: `niannian_editor_session=${adminTicketPayload}.${adminSignature}` },
  }, adminProbe.res, () => { adminNextCalls += 1; });
  assert.equal(adminNextCalls, 1, 'administrator provider verification bypasses end-user billing');

  console.log('niannian-account.verify: ok');
} finally {
  if (previous.local === undefined) delete process.env.LOCAL_WSL_DEV; else process.env.LOCAL_WSL_DEV = previous.local;
  if (previous.secret === undefined) delete process.env.NIANNIAN_EDITOR_SSO_SECRET; else process.env.NIANNIAN_EDITOR_SSO_SECRET = previous.secret;
  if (previous.prices === undefined) delete process.env.NIANNIAN_EDITOR_STEP_PRICES; else process.env.NIANNIAN_EDITOR_STEP_PRICES = previous.prices;
  if (previous.admins === undefined) delete process.env.NIANNIAN_EDITOR_ADMIN_IDS; else process.env.NIANNIAN_EDITOR_ADMIN_IDS = previous.admins;
}
