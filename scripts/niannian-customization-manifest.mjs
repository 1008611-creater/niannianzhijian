import { execFileSync } from 'node:child_process';

const base = process.env.NIANNIAN_CUSTOM_BASE ?? 'e80afe0';
const names = execFileSync('git', ['diff', '--name-only', `${base}..HEAD`], { encoding: 'utf8' })
  .split(/\r?\n/)
  .map((name) => name.trim())
  .filter(Boolean);

const deleted = execFileSync('git', ['diff', '--diff-filter=D', '--name-only', `${base}..HEAD`], { encoding: 'utf8' })
  .split(/\r?\n/)
  .map((name) => name.trim())
  .filter(Boolean);

console.log(`# Niannian customization manifest (base: ${base})`);
console.log(`# Generated from the current branch; deleted paths remain protected boundaries.`);
console.log(`# Changed paths: ${names.length}; deleted paths: ${deleted.length}`);
for (const name of names) console.log(`${deleted.includes(name) ? 'D' : 'M'}\t${name}`);
