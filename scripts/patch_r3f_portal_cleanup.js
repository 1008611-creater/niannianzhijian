'use strict';

const fs = require('fs');
const path = require('path');

const target = path.resolve(__dirname, '..', 'studio', 'assets', 'r3f-vendor-4GhrsGNk.js');
const source = fs.readFileSync(target, 'utf8');
const unsafe = '()=>{k&&k.removeChild(V),_e.unmount()}';
const safe = '()=>{k&&V.parentNode===k&&k.removeChild(V),_e.unmount()}';

if (source.includes(safe)) {
  process.stdout.write('R3F_PORTAL_CLEANUP_ALREADY_PATCHED\n');
  process.exit(0);
}
if (!source.includes(unsafe)) throw new Error('r3f_portal_cleanup_source_pattern_missing');
const patched = source.replace(unsafe, safe);
if (patched === source || patched.includes(unsafe)) throw new Error('r3f_portal_cleanup_replace_failed');
fs.writeFileSync(target, patched);
process.stdout.write('R3F_PORTAL_CLEANUP_PATCHED\n');
