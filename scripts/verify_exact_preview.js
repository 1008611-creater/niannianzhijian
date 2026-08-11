'use strict';

const {normalizeGitSha} = require('../bridge/niannian_release_identity');

async function main() {
  const target = String(process.argv[2] || '').replace(/\/+$/, '');
  const expectedSha = normalizeGitSha(process.argv[3]);
  if (!/^https:\/\//.test(target) || !expectedSha) throw new Error('PREVIEW_VERIFY_ARGUMENT_INVALID');

  const response = await fetch(`${target}/api/health`, {
    redirect:'error',
    signal:AbortSignal.timeout(15000),
    headers:{'Cache-Control':'no-cache'}
  });
  if (!response.ok) throw new Error(`PREVIEW_HEALTH_HTTP_${response.status}`);
  const body = await response.json();
  if (body?.ok !== true || body?.release?.preview !== true) throw new Error('PREVIEW_MODE_NOT_PROVEN');
  if (body.release.gitSha !== expectedSha) throw new Error('PREVIEW_GIT_SHA_MISMATCH');
  if (!body.release.releaseId) throw new Error('PREVIEW_RELEASE_ID_MISSING');
  process.stdout.write(JSON.stringify({
    ok:true,
    target,
    gitSha:body.release.gitSha,
    releaseId:body.release.releaseId
  }) + '\n');
}

main().catch(error => {
  process.stderr.write(String(error?.message || error) + '\n');
  process.exitCode = 1;
});
