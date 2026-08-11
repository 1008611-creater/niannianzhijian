'use strict';

const assert = require('node:assert/strict');
const {normalizeGitSha, readReleaseIdentity} = require('./bridge/niannian_release_identity');

const sha = '0123456789abcdef0123456789abcdef01234567';

assert.equal(normalizeGitSha(sha.toUpperCase()), sha);
assert.equal(normalizeGitSha(''), null);
assert.throws(() => normalizeGitSha('0123'), /RELEASE_GIT_SHA_INVALID/);
assert.deepEqual(readReleaseIdentity({}), {
  mode:'production',
  preview:false,
  gitSha:null,
  releaseId:null
});
assert.deepEqual(readReleaseIdentity({
  NIANNIAN_PREVIEW:'1',
  NIANNIAN_RELEASE_SHA:sha,
  NIANNIAN_RELEASE_ID:'pr-90-0123456'
}), {
  mode:'preview',
  preview:true,
  gitSha:sha,
  releaseId:'pr-90-0123456'
});
assert.throws(
  () => readReleaseIdentity({NIANNIAN_PREVIEW:'1', NIANNIAN_RELEASE_SHA:sha}),
  /PREVIEW_RELEASE_IDENTITY_REQUIRED/
);

process.stdout.write(JSON.stringify({ok:true, verified:['exact SHA normalization', 'preview identity required', 'production fallback']}) + '\n');
