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
};
process.env.LOCAL_WSL_DEV = '1';
process.env.NIANNIAN_EDITOR_SSO_SECRET = 'local-wsl-editor-sso-secret-20260807';
process.env.NIANNIAN_EDITOR_STEP_PRICES = 'export:0';

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
  });

  let nextCalls = 0;
  const exportGuard = routes.get('/export/job')?.[0];
  assert.ok(exportGuard, 'export route is guarded');
  const exportProbe = responseProbe();
  await exportGuard({ method: 'POST', headers: {} }, exportProbe.res, () => { nextCalls += 1; });
  assert.equal(nextCalls, 1, 'zero-cost local export bypasses remote billing');
  assert.equal(exportProbe.read().status, 200);

  console.log('niannian-account.verify: ok');
} finally {
  if (previous.local === undefined) delete process.env.LOCAL_WSL_DEV; else process.env.LOCAL_WSL_DEV = previous.local;
  if (previous.secret === undefined) delete process.env.NIANNIAN_EDITOR_SSO_SECRET; else process.env.NIANNIAN_EDITOR_SSO_SECRET = previous.secret;
  if (previous.prices === undefined) delete process.env.NIANNIAN_EDITOR_STEP_PRICES; else process.env.NIANNIAN_EDITOR_STEP_PRICES = previous.prices;
}
