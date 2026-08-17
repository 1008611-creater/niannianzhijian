'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_TOKEN_FILE = 'C:/Users/lsb/.config/niannian-ai/bridge-token.txt';
const DEFAULT_HASH_FILE = 'C:/Users/lsb/.config/niannian-ai/bridge-token.sha256';

function normalizedPath(value, fallback) {
  return path.resolve(String(value || fallback));
}

function readHashFile(filePath, readFileSync = fs.readFileSync) {
  try {
    const value = String(readFileSync(filePath, 'utf8')).trim().toLowerCase();
    return /^[a-f0-9]{64}$/.test(value) ? value : '';
  } catch (error) {
    if (error && error.code === 'ENOENT') return '';
    throw error;
  }
}

function resolveBridgeTokenHash(env = process.env, readFileSync = fs.readFileSync, platform = process.platform) {
  const configured = String(env.BRIDGE_TOKEN_HASH || '').trim().toLowerCase();
  if (configured) return /^[a-f0-9]{64}$/.test(configured) ? configured : '';
  const configuredHashFile = String(env.NIANNIAN_BRIDGE_TOKEN_HASH_FILE || '').trim();
  if (!configuredHashFile && platform !== 'win32') return '';
  const hashFile = normalizedPath(configuredHashFile, DEFAULT_HASH_FILE);
  return readHashFile(hashFile, readFileSync);
}

function buildStep01ControllerEnv(baseEnv = process.env, overrides = {}) {
  return {
    ...baseEnv,
    ...overrides,
    NIANNIAN_BRIDGE_TOKEN_FILE:normalizedPath(
      overrides.NIANNIAN_BRIDGE_TOKEN_FILE || baseEnv.NIANNIAN_BRIDGE_TOKEN_FILE,
      DEFAULT_TOKEN_FILE
    ),
    NIANNIAN_BRIDGE_TOKEN_HASH_FILE:normalizedPath(
      overrides.NIANNIAN_BRIDGE_TOKEN_HASH_FILE || baseEnv.NIANNIAN_BRIDGE_TOKEN_HASH_FILE,
      DEFAULT_HASH_FILE
    )
  };
}

module.exports = {
  DEFAULT_TOKEN_FILE,
  DEFAULT_HASH_FILE,
  readHashFile,
  resolveBridgeTokenHash,
  buildStep01ControllerEnv
};
