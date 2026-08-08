'use strict';

const fs = require('fs');
const path = require('path');

const assetsRoot = path.resolve(__dirname, '..', 'studio', 'assets');
const indexPath = path.resolve(__dirname, '..', 'studio', 'index.html');
const releaseTag = 'r4';
const cacheVersion = '20260809-static-r4';
const starts = ['index-M-8MrEH2-r28-19b89ec.js', 'web-runtime-adapter.js'];

function assetNameFromReference(reference) {
  const clean = reference.split('?', 1)[0];
  return clean.endsWith('.js') || clean.endsWith('.css') ? clean : null;
}

function localReferences(source) {
  const references = [];
  const pattern = /["']\.\/([^"']+?\.(?:js|css))(?:\?[^"']*)?["']/g;
  for (const match of source.matchAll(pattern)) {
    const name = assetNameFromReference(match[1]);
    if (name) references.push(name);
  }
  return references;
}

function targetName(name) {
  const extension = path.extname(name);
  return `${name.slice(0, -extension.length)}-${releaseTag}${extension}`;
}

const reachable = new Set();
const queue = [...starts];
while (queue.length) {
  const name = queue.shift();
  if (reachable.has(name)) continue;
  const sourcePath = path.join(assetsRoot, name);
  if (!fs.existsSync(sourcePath)) throw new Error(`studio_module_source_missing:${name}`);
  reachable.add(name);
  const source = fs.readFileSync(sourcePath, 'utf8');
  for (const dependency of localReferences(source)) {
    if (!reachable.has(dependency)) queue.push(dependency);
  }
}

const mapping = new Map([...reachable].map(name => [name, targetName(name)]));
for (const [name, nextName] of mapping) {
  const sourcePath = path.join(assetsRoot, name);
  const targetPath = path.join(assetsRoot, nextName);
  if (fs.existsSync(targetPath)) throw new Error(`studio_module_target_exists:${nextName}`);
  let source = fs.readFileSync(sourcePath, 'utf8');
  for (const [oldName, replacement] of [...mapping.entries()].sort((a, b) => b[0].length - a[0].length)) {
    source = source.split(`./${oldName}`).join(`./${replacement}`);
  }
  fs.writeFileSync(sourcePath, source);
}

const html = fs.readFileSync(indexPath, 'utf8');
let nextHtml = html;
for (const [oldName, replacement] of [...mapping.entries()].sort((a, b) => b[0].length - a[0].length)) {
  nextHtml = nextHtml.split(`./assets/${oldName}`).join(`./assets/${replacement}`);
}
nextHtml = nextHtml.replaceAll('20260808-static-r3', cacheVersion);
nextHtml = nextHtml.replaceAll('20260808-static-r2', cacheVersion);
if (nextHtml === html) throw new Error('studio_html_identity_rewrite_failed');
fs.writeFileSync(indexPath, nextHtml);

for (const [name, nextName] of mapping) {
  fs.renameSync(path.join(assetsRoot, name), path.join(assetsRoot, nextName));
}

process.stdout.write(JSON.stringify({
  ok: true,
  releaseTag,
  cacheVersion,
  renamed: mapping.size,
  js: [...mapping].filter(([name]) => name.endsWith('.js')).length,
  css: [...mapping].filter(([name]) => name.endsWith('.css')).length
}) + '\n');
