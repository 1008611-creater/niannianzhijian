'use strict';

const fs = require('fs');
const path = require('path');

const assetsRoot = path.resolve(__dirname, '..', 'studio', 'assets');
const oldName = 'r3f-vendor-4GhrsGNk.js';
const nextName = 'r3f-vendor-4GhrsGNk-r25.js';
const oldPath = path.join(assetsRoot, oldName);
const nextPath = path.join(assetsRoot, nextName);

if (!fs.existsSync(oldPath)) throw new Error('r3f_module_source_missing');
if (fs.existsSync(nextPath)) throw new Error('r3f_module_target_exists');

const references = fs.readdirSync(assetsRoot)
  .filter(name => name.endsWith('.js'))
  .filter(name => name !== oldName)
  .filter(name => fs.readFileSync(path.join(assetsRoot, name), 'utf8').includes(oldName));
if (references.length !== 7) throw new Error('r3f_module_reference_count_invalid:' + references.length);

for (const name of references) {
  const file = path.join(assetsRoot, name);
  const source = fs.readFileSync(file, 'utf8');
  const next = source.replaceAll(oldName, nextName);
  if (next === source || next.includes(oldName)) throw new Error('r3f_module_reference_rewrite_failed:' + name);
  fs.writeFileSync(file, next);
}

fs.renameSync(oldPath, nextPath);
const indexPath = path.resolve(__dirname, '..', 'studio', 'index.html');
const index = fs.readFileSync(indexPath, 'utf8');
const nextIndex = index.replace('index-M-8MrEH2.js?v=20260808-r23', 'index-M-8MrEH2.js?v=20260808-r25');
if (nextIndex === index) throw new Error('studio_entry_version_missing');
fs.writeFileSync(indexPath, nextIndex);
process.stdout.write(JSON.stringify({ok:true,module:nextName,referenceCount:references.length}) + '\n');
