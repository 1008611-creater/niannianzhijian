#!/opt/node24/bin/node
'use strict';

const fs = require('fs');
const path = require('path');

const [stageRoot] = process.argv.slice(2);
if (!stageRoot) throw new Error('runtime_stage_root_required');
const packageRoot = path.join(stageRoot, 'package');
const studioIndex = path.join(packageRoot, 'studio', 'index.html');
if (!fs.existsSync(path.join(packageRoot, 'server.js'))) throw new Error('server_entry_missing');
if (!fs.existsSync(studioIndex)) throw new Error('studio_index_missing');
const index = fs.readFileSync(studioIndex, 'utf8');
const assetsRoot = path.join(packageRoot, 'studio', 'assets');
const assets = fs.readdirSync(assetsRoot);
if (!index.includes('web-runtime-adapter.js?v=20260807-r18')) throw new Error('web_adapter_cache_bust_missing');
if (!assets.some(name => /^NomiStudioApp-.*\.js$/.test(name))) throw new Error('studio_bundle_entry_missing');
if (!assets.includes('web-runtime-adapter.js')) throw new Error('web_runtime_adapter_missing');
process.stdout.write(JSON.stringify({ok:true,verified:['server entry','studio bundle entry','web runtime adapter cache bust']}) + '\n');
