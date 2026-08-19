'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const projectRoot = __dirname;
const assetsRoot = path.join(projectRoot, 'studio', 'assets');
const releaseTag = 'r(?:4|5|6)';
const moduleCacheVersion = '20260818-storyboard-group-contract-r8';
const studioClosureCacheVersion = moduleCacheVersion;
const rootModuleName = 'index-M-8MrEH2-r28-19b89ec-r6.js';
const generationControllerName = 'generationRunController-DH5v5RRt-r4.js';
const generationControllerCacheVersion = moduleCacheVersion;
const starts = ['index-M-8MrEH2-r28-19b89ec-r6.js', 'web-runtime-adapter-r4.js'];

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

function modulePreloadUrls(html) {
  return [...html.matchAll(/<link\s+rel=["']modulepreload["'][^>]*\shref=["'](\.\/assets\/[^"']+)["']/g)]
    .map(match => match[1]);
}

const html = fs.readFileSync(path.join(projectRoot, 'studio', 'index.html'), 'utf8');
assert.doesNotMatch(html, /<script type="module" crossorigin src="\.\/assets\/index-M-8MrEH2-r28-19b89ec-r6\.js/);
assert.match(html, new RegExp(`\\./assets/web-runtime-adapter-${releaseTag}\\.js\\?v=[A-Za-z0-9._-]+`));
assert.doesNotMatch(html, /index-M-8MrEH2-r28-19b89ec\.js(?:\?|['"])/);
assert.doesNotMatch(html, /web-runtime-adapter\.js(?:\?|['"])/);
assert.doesNotMatch(html, /20260808-static-r[23]/);

const assetLibraryPanel = fs.readFileSync(path.join(assetsRoot, 'AssetLibraryPanel-BHyPOGab-r4.js'), 'utf8');
assert.match(assetLibraryPanel, /function Xt\(currentProjectId\)/);
assert.match(assetLibraryPanel, /currentProjectId&&!\w+\.includes\(currentProjectId\)&&\w+\.unshift\(currentProjectId\)/);
assert.match(assetLibraryPanel, /\{assets:\w+,projects:\w+,loading:\w+,refresh:\w+\}/);
assert.match(assetLibraryPanel, /export\{[^}]*AssetLibraryContent/);

const reachable = new Set();
const queue = [...starts];
while (queue.length) {
  const name = queue.shift();
  if (reachable.has(name)) continue;
  assert.equal(fs.existsSync(path.join(assetsRoot, name)), true, `missing Studio module: ${name}`);
  reachable.add(name);
  const source = fs.readFileSync(path.join(assetsRoot, name), 'utf8');
  assertCanonicalQueries(source);
  assert.doesNotMatch(source, /\?v=20260816-batch-group-feedback-r8(?:["')])/);
  for (const dependency of localReferences(source)) {
    assertPhysicalName(dependency);
    assert.equal(fs.existsSync(path.join(assetsRoot, dependency)), true, `missing Studio dependency: ${dependency}`);
    if (!reachable.has(dependency)) queue.push(dependency);
  }
}

for (const name of reachable) assertPhysicalName(name);
assert.equal([...reachable].filter(name => name.endsWith('.js')).length >= 150, true);

for (const href of modulePreloadUrls(html)) {
  const importUrl = href.replace(/^\.\/assets\//, './');
  const isImported = [...reachable].some(name => fs.readFileSync(path.join(assetsRoot, name), 'utf8').includes(importUrl));
  assert.equal(isImported, true, `modulepreload must use the exact same URL as a reachable module import: ${href}`);
}

for (const name of reachable) {
  if (!name.endsWith('.js')) continue;
  const source = fs.readFileSync(path.join(assetsRoot, name), 'utf8');
  assertCanonicalQueries(source);
  const rootModuleVersions = [...source.matchAll(new RegExp(`${rootModuleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\?v=([^"')]+)`, 'g'))].map(match => match[1]);
  assert.deepEqual([...new Set(rootModuleVersions)], rootModuleVersions.length ? [moduleCacheVersion] : [], `mixed root module identity: ${name}`);
  const generationControllerVersions = [...source.matchAll(new RegExp(`${generationControllerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\?v=([^"')]+)`, 'g'))].map(match => match[1]);
  assert.deepEqual([...new Set(generationControllerVersions)], generationControllerVersions.length ? [generationControllerCacheVersion] : [], `mixed generation controller identity: ${name}`);
  assert.doesNotMatch(source, /index-M-8MrEH2-r27\.js|NomiStudioApp-DDB0IgSO-r27\.js/);
  assert.doesNotMatch(source, /\?v=20260808-static-r[123](?:["')])/);
  assert.doesNotMatch(source, /\?v=20260809-static-r4(?:["')])/);
  assert.doesNotMatch(source, /\?v=20260811-static-r5(?:["')])/);
  for (const dependency of localReferences(source)) {
    if (!dependency.endsWith('.js')) continue;
    const escapedDependency = dependency.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const dependencyVersion = name === rootModuleName && dependency.startsWith('NomiStudioApp-')
      ? '20260820-portal-cleanup-r1'
      : studioClosureCacheVersion;
    assert.match(source, new RegExp(`${escapedDependency}\\?v=${dependencyVersion}(?:["')])`), `Studio module is not in the current closure: ${name}`);
  }
  assert.doesNotMatch(source, /(?:index-M-8MrEH2-r28-19b89ec|NomiStudioApp-DDB0IgSO-r28-19b89ec)-r4\.js\?v=20260816-batch-group-feedback-r8/);
  assert.doesNotMatch(source, /(?:index-M-8MrEH2-r28-19b89ec|NomiStudioApp-DDB0IgSO-r28-19b89ec)-r4\.js\?v=20260816-persisted-image-r1/);
  assert.doesNotMatch(source, /(?:index-M-8MrEH2-r28-19b89ec|NomiStudioApp-DDB0IgSO-r28-19b89ec)-r4\.js\?v=20260816-persisted-image-r2/);
  assert.doesNotMatch(source, /(?:index-M-8MrEH2-r28-19b89ec|NomiStudioApp-DDB0IgSO-r28-19b89ec)-r4\.js\?v=20260816-persisted-image-r3/);
}

const serviceWorker = fs.readFileSync(path.join(projectRoot, 'sw.js'), 'utf8');
assert.match(serviceWorker, /niannian-app-shell-20260810-project-library-rows-r1/);
assert.match(serviceWorker, /url\.pathname\.startsWith\('\/studio\/assets\/'\)/);

console.log(`STUDIO_ROOT_MODULE_IDENTITY_CONTRACT_OK (${reachable.size} assets)`);
