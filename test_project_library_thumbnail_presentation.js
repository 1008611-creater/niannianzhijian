'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, 'studio/assets/project-library-management.js'), 'utf8');
const studioHtml = fs.readFileSync(path.join(__dirname, 'studio/index.html'), 'utf8');

[
  'applyThumbnailPresentation(card);',
  "preview.dataset.niannianCoverPresentation = 'thumbnail';",
  "image.setAttribute('fetchpriority', 'low');",
  "image.alt = '项目封面缩略图';",
  'object-fit:contain!important',
  'data-niannian-cover-presentation=thumbnail'
].forEach((contract) => assert.ok(source.includes(contract), `missing project thumbnail contract: ${contract}`));

assert.match(studioHtml, /project-library-management\.js\?v=20260816-r2/);

console.log('PROJECT_LIBRARY_THUMBNAIL_PRESENTATION_CONTRACT_OK');
