'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'studio/index.html'), 'utf8');
const source = fs.readFileSync(path.join(__dirname, 'studio/assets/admin-model-visibility-r1.js'), 'utf8');
assert.match(html, /admin-model-visibility-r1\.js\?v=20260816-admin-model-r1/);
assert.ok(source.includes("'/api/auth/session'"));
assert.ok(source.includes('模型接入|添加模型|中转站|供应商配置'));
assert.match(source, /isAdmin === true/);
assert.match(source, /data-nomi-admin-model-entry/);
console.log('ADMIN_MODEL_VISIBILITY_CONTRACT_OK');
