'use strict';

/**
 * @typedef {Object} ReleaseIdentity
 * @property {'preview'|'production'} mode
 * @property {boolean} preview
 * @property {string|null} gitSha
 * @property {string|null} releaseId
 */

/**
 * @param {string|undefined} value
 * @returns {string|null}
 */
function normalizeGitSha(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if (!/^[a-f0-9]{40}$/.test(normalized)) throw new Error('RELEASE_GIT_SHA_INVALID');
  return normalized;
}

/**
 * @param {NodeJS.ProcessEnv} [environment]
 * @returns {ReleaseIdentity}
 */
function readReleaseIdentity(environment = process.env) {
  const preview = environment.NIANNIAN_PREVIEW === '1';
  const gitSha = normalizeGitSha(environment.NIANNIAN_RELEASE_SHA);
  const releaseId = String(environment.NIANNIAN_RELEASE_ID || '').trim() || null;
  if (preview && (!gitSha || !releaseId)) throw new Error('PREVIEW_RELEASE_IDENTITY_REQUIRED');
  return {
    mode:preview ? 'preview' : 'production',
    preview,
    gitSha,
    releaseId
  };
}

module.exports = {normalizeGitSha, readReleaseIdentity};
