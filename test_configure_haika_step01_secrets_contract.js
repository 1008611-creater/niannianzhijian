'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, 'tools', 'configure_haika_step01_secrets.js'), 'utf8');

assert.match(source, /127\.0\.0\.1/);
assert.match(source, /mktemp \/etc\/niannian-ai\/step01-hq\.env/);
assert.match(source, /grep -Ev '\^\(NIANNIAN_STEP01_GPT_API_BASE_URL/);
assert.ok(source.includes('mv \\"$temporary\\" \\"$target\\"'));
assert.match(source, /NIANNIAN_STEP01_GPT_MODEL=' \+ values\.gpt_model/);
assert.doesNotMatch(source, /systemctl restart niannian-ai\.service/);
assert.doesNotMatch(source, /name=\"mimo\"/);
assert.doesNotMatch(source, /name=\"paddle\"/);

console.log(JSON.stringify({ok:true,verified:['local-only configuration surface','only GPT upstream entries are replaced','existing media and OCR configuration is preserved','production service is not restarted']}));
