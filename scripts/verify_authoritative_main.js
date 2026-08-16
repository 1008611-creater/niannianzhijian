#!/usr/bin/env node

const { execFileSync } = require('node:child_process');
const path = require('node:path');

function runGit(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function fail(message) {
  throw new Error(message);
}

const repo = process.cwd();
const allowDetached = process.argv.includes('--allow-detached');
const expectedRef = process.env.GITHUB_REF || 'refs/heads/main';

try {
  const root = runGit(['rev-parse', '--show-toplevel'], repo);
  const branch = runGit(['branch', '--show-current'], repo);
  const status = runGit(['status', '--porcelain=v1'], repo);

  if (path.resolve(root) !== path.resolve(repo)) {
    fail(`must run from the authoritative repository root: ${root}`);
  }
  if (!allowDetached && branch !== 'main') {
    fail(`current branch is ${branch || '(detached HEAD)'}, expected main`);
  }
  if (allowDetached && expectedRef !== 'refs/heads/main') {
    fail(`CI ref is ${expectedRef}, expected refs/heads/main`);
  }
  if (status) {
    fail('working tree is not clean; commit or move changes to an isolated worktree first');
  }

  runGit(['rev-parse', '--verify', 'origin/main'], repo);
  const [behind, ahead] = runGit(['rev-list', '--left-right', '--count', 'HEAD...origin/main'])
    .split(/\s+/)
    .map(Number);
  if (behind !== 0 || ahead !== 0) {
    fail(`HEAD differs from origin/main (behind=${behind}, ahead=${ahead}); update or publish through a PR`);
  }

  const head = runGit(['rev-parse', '--short', 'HEAD'], repo);
  console.log(`AUTHORITY CHECK PASSED: clean main synchronized with origin/main at ${head}`);
} catch (error) {
  console.error(`AUTHORITY CHECK FAILED: ${error.stderr?.toString().trim() || error.message}`);
  process.exitCode = 1;
}
