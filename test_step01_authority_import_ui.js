'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const client = fs.readFileSync(path.join(__dirname, 'mvp-step02-r13.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'product.css'), 'utf8');

assert.match(client, /project\.id === exactStep01ProjectId \? '<form class="step01-authority-import"/);
assert.match(client, /type="file" name="authority_archive" accept="\.tar\.gz,application\/gzip" required/);
assert.match(client, /type="file" name="authority_declaration" accept="\.json,application\/json" required/);
assert.match(client, /declaration\?\.schema_version === 'niannian\.step01_authority_import_declaration\.v1'/);
assert.match(client, /archive\.size !== Number\(declaration\.archive_bytes\)/);
assert.match(client, /'Idempotency-Key':idempotencyKey,'If-Match':'\*'/);
assert.match(client, /state\.step01AuthorityImport\?\.active/);
assert.match(client, /replacement\?\.replaceWith\(existingAuthorityImport\)/);
assert.match(client, /const xhr = new XMLHttpRequest\(\)/);
assert.match(client, /xhr\.upload\.addEventListener\('progress'/);
assert.match(client, /loaded \+ ' \/ ' \+ total \+ ' bytes/);
assert.match(client, /xhr\.open\('PUT', grant\.upload\.url, true\)/);
assert.match(client, /STEP01_AUTHORITY_IMPORT_ALREADY_COMPLETED/);
assert.doesNotMatch(client, /step01AuthorityImport\s*=\s*\{[^}]*url/s);
assert.doesNotMatch(client, /localStorage[\s\S]{0,120}grant\.upload\.url/);
assert.doesNotMatch(client, /console\.(?:log|info|debug|warn|error)\([^\n]*grant\.upload\.url/);
assert.match(css, /\.step01-authority-import/);

process.stdout.write(JSON.stringify({ok:true,actual_file_inputs:true,exact_project_only:true,signed_url_memory_only:true,idempotent_reconcile:true,upload_progress:true,active_form_preserved:true}) + '\n');
