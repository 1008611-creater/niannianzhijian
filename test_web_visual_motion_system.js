'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const activeClient = fs.readFileSync(path.join(root, 'mvp-step02-r13.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'product.css'), 'utf8');
const heroOil = fs.readFileSync(path.join(root, 'hero-oil-paint.css'), 'utf8');

assert.match(index, /vendor\/gsap-3\.13\.0\.min\.js/);
assert.match(index, /vendor\/gsap-flip-3\.13\.0\.min\.js/);
assert.match(index, /mvp-step02-r13\.js/);
assert.doesNotMatch(index, /mvp\.js/);
assert.match(activeClient, /function canPlayStudioMotion\(\)/);
assert.match(activeClient, /function animateStudioEntry\(/);
assert.match(activeClient, /function animateWorkbenchProjectSelection\(/);
assert.match(activeClient, /function canUseWorkbenchViewTransition\(\)/);
assert.match(activeClient, /function renderWorkbenchAssetCatalog\(project\)/);
assert.match(activeClient, /new EventSource\('\/api\/events\/projects'\)/);
assert.match(activeClient, /function uploadScriptDocumentResumable\(file\)/);
assert.match(activeClient, /function renderStep04WordDelivery|step04WordDelivery/);
assert.match(app, /function setView\(viewName, \{ syncHash = true, scroll = "preserve" \} = \{\}\)/);
assert.match(app, /function createFluidRenderer\(canvas, palette = "default"\)/);
assert.match(heroOil, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(css, /\.studio-workbench \.workbench-launcher/);
assert.match(css, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
assert.match(css, /@media \(max-width: 760px\)/);

process.stdout.write(JSON.stringify({ok:true,verified:[
  'current main-site r13 runtime owns workbench motion, project events, uploads, and Step04 delivery display',
  'four-entry workbench and reduced-motion declarations remain present',
  'the retired mvp client is absent from the current visual runtime contract'
]}) + '\n');
