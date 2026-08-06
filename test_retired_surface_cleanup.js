'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runtimeFiles, parseArgs } = require('./build_canonical_release_stage');

const root = __dirname;
const retiredFiles = ['canvas.js', 'canvas.css', 'nomi-canvas-entry.js', 'mvp.js', 'mvp-step02-r8.js', 'mvp-step02-r9.js', 'mvp-step02-r10.js', 'mvp-step02-r11.js', 'mvp-step02-r12.js'];
for (const file of retiredFiles) assert.equal(fs.existsSync(path.join(root, file)), false, 'retired_surface_file_present:' + file);

for (const file of ['canvas.js', 'canvas.css', 'nomi-canvas-entry.js']) assert.equal(runtimeFiles.includes(file), false, 'retired_surface_packaged:' + file);

const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
assert.equal(serviceWorker.includes('/canvas.js?'), false, 'retired_canvas_script_precached');
assert.equal(serviceWorker.includes('/canvas.css?'), false, 'retired_canvas_css_precached');

const productCss = fs.readFileSync(path.join(root, 'product.css'), 'utf8');
assert.equal(productCss.includes('assets/workbench/production-console-bg-v1.png'), false, 'retired_workbench_background_referenced');

const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const activeClient = fs.readFileSync(path.join(root, 'mvp-step02-r13.js'), 'utf8');
assert.equal(index.includes('mvp.js'), false, 'retired_legacy_client_loaded_by_html');
assert.equal(app.includes('mvp.js'), false, 'retired_legacy_client_loaded_by_shell');
assert.equal(serviceWorker.includes('mvp.js'), false, 'retired_legacy_client_precached');
assert.match(index, /mvp-step02-r13\.js/, 'active_client_entry_missing');
assert.match(app, /\/studio\/#\/studio\?projectId=/, 'legacy_canvas_project_redirect_missing');
assert.match(activeClient, /function normalizeMainSitePath\(\)/, 'legacy_canvas_normalizer_missing');
assert.match(activeClient, /\/studio\/#\/studio\?projectId=/, 'formal_nomi_project_route_missing');

assert.throws(() => parseArgs(['--output', 'candidate', '--release-id', 'only-id']), /release_stage_candidate_contract_incomplete/);
assert.deepEqual(parseArgs([
  '--output', 'candidate',
  '--release-id', 'retired-surface-cleanup-r1',
  '--parent-release', 'online-baseline-r1',
  '--scope', 'retire one bounded surface',
  '--allowed-file', 'sw.js,canvas.js'
]).candidate.allowed_files, ['sw.js', 'canvas.js']);

process.stdout.write(JSON.stringify({
  ok:true,
  verified:[
    'retired self-built canvas source absent',
    'superseded r8-r12 client revisions absent',
    'retired canvas assets are not precached or packaged',
    'retired legacy mvp client is absent from source, HTML, shell, and offline cache',
    'retired workbench background is not referenced',
    'legacy #canvas project URLs continue to resolve to formal /studio/ deep links'
  ]
}) + '\n');
