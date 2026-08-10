'use strict';

const assert = require('assert/strict');
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = __dirname;
const assetsRoot = path.join(projectRoot, 'studio', 'assets');
const releaseTag = 'r4';
const moduleCacheVersion = '20260811-static-r5';
const adapterCacheVersion = '20260811-web-assets-r5';
const starts = ['index-M-8MrEH2-r28-19b89ec-r4.js', 'web-runtime-adapter-r4.js'];

function localReferences(source) {
  const references = [];
  const pattern = /["']\.\/([^"']+?\.(?:js|css))(?:\?[^"']*)?["']/g;
  for (const match of source.matchAll(pattern)) references.push(match[1]);
  return references;
}

function assertCanonicalQueries(source) {
  const pattern = /["']\.\/([^"']+?\.(?:js|css)(?:\?[^"']*)?)["']/g;
  for (const match of source.matchAll(pattern)) {
    assert.equal((match[1].match(/\?v=/g) || []).length <= 1, true, `duplicate module query: ${match[1]}`);
  }
}

function assertPhysicalName(name) {
  assert.match(name, new RegExp(`-${releaseTag}\\.(?:js|css)$`), `non-versioned Studio dependency: ${name}`);
}

const html = fs.readFileSync(path.join(projectRoot, 'studio', 'index.html'), 'utf8');
assert.match(html, new RegExp(`\\./assets/index-M-8MrEH2-r28-19b89ec-${releaseTag}\\.js\\?v=${moduleCacheVersion}`));
assert.match(html, new RegExp(`\\./assets/web-runtime-adapter-${releaseTag}\\.js\\?v=${adapterCacheVersion}`));
assert.doesNotMatch(html, /index-M-8MrEH2-r28-19b89ec\.js(?:\?|['"])/);
assert.doesNotMatch(html, /web-runtime-adapter\.js(?:\?|['"])/);
assert.doesNotMatch(html, /20260808-static-r[23]/);

const assetLibraryPanel = fs.readFileSync(path.join(assetsRoot, 'AssetLibraryPanel-BHyPOGab-r4.js'), 'utf8');
assert.match(assetLibraryPanel, /function Xt\(currentProjectId\)/);
assert.match(assetLibraryPanel, /currentProjectId&&!m\.includes\(currentProjectId\)&&m\.unshift\(currentProjectId\)/);
assert.match(assetLibraryPanel, /\{assets:M,refresh:O\}=Xt\(e\)/);
const assetLibrarySyntax = childProcess.spawnSync(
  process.execPath,
  ['--input-type=module', '--check'],
  { input: assetLibraryPanel, encoding: 'utf8' },
);
assert.equal(assetLibrarySyntax.status, 0, assetLibrarySyntax.stderr || 'asset library module syntax check failed');

const reachable = new Set();
const queue = [...starts];
while (queue.length) {
  const name = queue.shift();
  if (reachable.has(name)) continue;
  assert.equal(fs.existsSync(path.join(assetsRoot, name)), true, `missing Studio module: ${name}`);
  reachable.add(name);
  const source = fs.readFileSync(path.join(assetsRoot, name), 'utf8');
  assertCanonicalQueries(source);
  for (const dependency of localReferences(source)) {
    assertPhysicalName(dependency);
    assert.equal(fs.existsSync(path.join(assetsRoot, dependency)), true, `missing Studio dependency: ${dependency}`);
    if (!reachable.has(dependency)) queue.push(dependency);
  }
}

for (const name of reachable) assertPhysicalName(name);
assert.equal([...reachable].filter(name => name.endsWith('.js')).length >= 150, true);

for (const name of reachable) {
  if (!name.endsWith('.js')) continue;
  const source = fs.readFileSync(path.join(assetsRoot, name), 'utf8');
  assertCanonicalQueries(source);
  assert.doesNotMatch(source, /index-M-8MrEH2-r27\.js|NomiStudioApp-DDB0IgSO-r27\.js/);
  assert.doesNotMatch(source, /\?v=20260808-static-r[123](?:["')])/);
  assert.doesNotMatch(source, /\?v=20260809-static-r4(?:["')])/);
}

const serviceWorker = fs.readFileSync(path.join(projectRoot, 'sw.js'), 'utf8');
assert.match(serviceWorker, /niannian-app-shell-20260810-project-library-rows-r1/);
assert.match(serviceWorker, /url\.pathname\.startsWith\('\/studio\/assets\/'\)/);

console.log(`STUDIO_ROOT_MODULE_IDENTITY_CONTRACT_OK (${reachable.size} assets)`);
