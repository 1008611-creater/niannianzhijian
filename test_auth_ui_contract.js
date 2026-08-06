'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const index = read('index.html');
const activeClient = read('mvp-step02-r13.js');
const server = read('server.js');

assert.match(index, /<script src="\.\/mvp-step02-r13\.js\?v=[^"]+" defer><\/script>/);
assert.doesNotMatch(index, /mvp\.js/);
assert.match(index, /id="accountMenu"/);
assert.match(index, /data-modal="login"/);
assert.match(activeClient, /data-open-project-wizard/);
assert.match(activeClient, /data-open-script-drama-wizard/);
assert.match(activeClient, /data-account-logout/);
assert.match(activeClient, /function toggleAccountMenu\(\)/);
assert.match(activeClient, /api\('\/api\/auth\/' \+ type/);
assert.match(server, /pathname === '\/api\/auth\/register'/);
assert.match(server, /pathname === '\/api\/auth\/login'/);
assert.match(server, /pathname === '\/api\/auth\/session'/);

process.stdout.write(JSON.stringify({ok:true,verified:[
  'the current r13 client is the only main-site account and project runtime',
  'login, registration, session, logout, redraw creation, and script creation contracts remain present',
  'the retired mvp.js client is not reintroduced by the HTML shell'
]}) + '\n');
