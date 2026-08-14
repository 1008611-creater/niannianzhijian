'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const legacyRelativePath = 'bridge/mac-employee-training/execute_step01_hq_full.py';
const runnerPath = path.join(root, 'bridge', 'niannian_step01_hq_runner.py');
const legacyPath = path.join(root, legacyRelativePath);

assert.equal(fs.existsSync(legacyPath), true, 'Step01 hq executor must ship with the server runtime');
const runnerSource = fs.readFileSync(runnerPath, 'utf8');
assert.match(runnerSource, /"mac-employee-training"/);
assert.match(runnerSource, /"execute_step01_hq_full\.py"/);
assert.match(fs.readFileSync(legacyPath, 'utf8'), /def build_command_plan\(/);
assert.match(fs.readFileSync(legacyPath, 'utf8'), /def canonicalize_manifest\(/);

const tracked = childProcess.execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD', '--', legacyRelativePath], {cwd:root,encoding:'utf8'}).trim();
assert.equal(tracked, legacyRelativePath, 'Step01 hq executor cannot remain an ignored local-only dependency');

const releaseBuilder = fs.readFileSync(path.join(root, 'build_canonical_release_stage.js'), 'utf8');
assert.match(releaseBuilder, /gitTrackedFiles\('bridge'/, 'release staging must derive bridge files from committed source');
const { runtimeFiles } = require('./build_canonical_release_stage');
assert.equal(runtimeFiles.includes(legacyRelativePath), true, 'release staging must include the Step01 hq executor');

console.log(JSON.stringify({ok:true,verified:['hq executor is present','hq executor is committed','runner path is release-local','canonical release stages committed bridge runtime']}));
