'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const index = read('index.html');
const app = read('app.js');
const worker = read('sw.js');
const server = read('server.js');
const manifest = JSON.parse(read('manifest.webmanifest'));

assert.equal(manifest.name, '念念 AI');
assert.equal(manifest.start_url, '/#home');
assert.equal(manifest.display, 'standalone');
assert.match(index, /rel="manifest" href="\.\/manifest\.webmanifest"/);
assert.match(index, /id="connectionStatus"/);
assert.match(index, /mvp-step02-r13\.js/);
assert.doesNotMatch(index, /mvp\.js/);
assert.match(app, /navigator\.serviceWorker\.register\("\/sw\.js\?v=" \+ serviceWorkerRelease/);
assert.match(app, /window\.addEventListener\("offline", updateConnectionStatus\)/);
assert.match(worker, /const APP_SHELL = \[/);
assert.match(worker, /mvp-step02-r13\.js/);
assert.doesNotMatch(worker, /mvp\.js/);
assert.match(worker, /url\.pathname\.startsWith\('\/api\/'\)/);
assert.match(worker, /request\.mode === 'navigate'/);
assert.match(server, /'\.webmanifest':'application\/manifest\+json; charset=utf-8'/);
assert.match(server, /\['index\.html','app\.js','sw\.js','manifest\.webmanifest','product\.css','product-system\.css'\]/);

process.stdout.write(JSON.stringify({ok:true,verified:[
  'installable manifest metadata',
  'current active runtime is cached without the retired mvp client',
  'offline status and network-first navigation contracts remain present',
  'current no-store static header allowlist has no retired client entry'
]}) + '\n');
