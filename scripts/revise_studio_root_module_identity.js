'use strict';

const fs = require('fs');
const path = require('path');

const assetsRoot = path.resolve(__dirname, '..', 'studio', 'assets');
const indexPath = path.resolve(__dirname, '..', 'studio', 'index.html');
const oldEntry = 'index-M-8MrEH2-r27.js';
const nextEntry = 'index-M-8MrEH2-r28-19b89ec.js';
const oldApp = 'NomiStudioApp-DDB0IgSO-r27.js';
const nextApp = 'NomiStudioApp-DDB0IgSO-r28-19b89ec.js';
const oldEntryPath = path.join(assetsRoot, oldEntry);
const nextEntryPath = path.join(assetsRoot, nextEntry);
const oldAppPath = path.join(assetsRoot, oldApp);
const nextAppPath = path.join(assetsRoot, nextApp);

if (!fs.existsSync(oldEntryPath) || !fs.existsSync(oldAppPath)) {
  throw new Error('studio_root_module_source_missing');
}
if (fs.existsSync(nextEntryPath) || fs.existsSync(nextAppPath)) {
  throw new Error('studio_root_module_target_exists');
}

const assetFiles = fs.readdirSync(assetsRoot).filter(name => name.endsWith('.js'));
let entryReferenceCount = 0;
let appReferenceCount = 0;
for (const name of assetFiles) {
  const filePath = path.join(assetsRoot, name);
  const source = fs.readFileSync(filePath, 'utf8');
  let next = source
    .replaceAll(oldEntry, nextEntry)
    .replaceAll(oldApp + '?v=20260808-r27', nextApp)
    .replaceAll(oldApp, nextApp);
  if (next !== source) {
    entryReferenceCount += source.includes(oldEntry) ? 1 : 0;
    appReferenceCount += source.includes(oldApp) ? 1 : 0;
    fs.writeFileSync(filePath, next);
  }
}

fs.renameSync(oldEntryPath, nextEntryPath);
fs.renameSync(oldAppPath, nextAppPath);

const index = fs.readFileSync(indexPath, 'utf8');
const nextIndex = index
  .replace('./assets/' + oldEntry, './assets/' + nextEntry);
if (nextIndex === index || nextIndex.includes(oldEntry)) {
  throw new Error('studio_html_entry_rewrite_failed');
}
fs.writeFileSync(indexPath, nextIndex);

process.stdout.write(JSON.stringify({
  ok: true,
  entry: nextEntry,
  app: nextApp,
  entryReferenceCount,
  appReferenceCount
}) + '\n');
