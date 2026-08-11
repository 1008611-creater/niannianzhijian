'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');
const {buildStage} = require('../build_canonical_release_stage');

const trackedDiff = childProcess.spawnSync('git', ['diff', '--quiet', 'HEAD', '--'], {stdio:'ignore'});
if (trackedDiff.error || trackedDiff.status !== 0) throw new Error('BUILD_TRACKED_WORKTREE_NOT_CLEAN');

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'niannian-ci-build-'));
const candidateRoot = path.join(temporaryRoot, 'candidate');

try {
  const expectedSha = childProcess.execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim().toLowerCase();
  const result = buildStage(candidateRoot);
  if (result.release.source_git_revision !== expectedSha) throw new Error('BUILD_GIT_SHA_MISMATCH');
  if (result.gate.release_ready !== true) throw new Error('BUILD_RELEASE_GATE_FAILED');
  process.stdout.write(JSON.stringify({
    ok:true,
    gitSha:expectedSha,
    files:result.file_count,
    bytes:result.total_bytes
  }) + '\n');
} finally {
  fs.rmSync(temporaryRoot, {recursive:true, force:true});
}
