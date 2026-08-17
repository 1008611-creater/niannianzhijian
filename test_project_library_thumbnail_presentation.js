'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, 'studio/assets/project-library-management.js'), 'utf8');
const studioHtml = fs.readFileSync(path.join(__dirname, 'studio/index.html'), 'utf8');

[
  'applyThumbnailPresentation(card, index);',
  "preview.dataset.niannianCoverPresentation = 'thumbnail';",
  "image.loading = index < 6 ? 'eager' : 'lazy';",
  "image.setAttribute('fetchpriority', index < 6 ? 'high' : 'low');",
  "image.alt = '项目封面缩略图';",
  'object-fit:contain!important',
  'data-niannian-cover-presentation=thumbnail',
  'inset:50% auto auto 50%!important',
  'transform:translate(-50%,-50%)!important',
  "failedCover.dataset.niannianCoverFallback = 'video';",
  "failedCover.setAttribute('aria-label', '视频素材封面');",
  'data-niannian-cover-fallback=video',
  'content:"视频素材"',
  'data-card-cover-navigator',
  'data-card-cover-direction',
  'data-cover-navigator',
  'data-cover-direction',
  'shiftDialogCover',
  'autoCoverUrl(project)'
].forEach((contract) => assert.ok(source.includes(contract), `missing project thumbnail contract: ${contract}`));

assert.match(studioHtml, /project-library-management\.js\?v=20260818-storyboard-group-contract-r8/);

console.log('PROJECT_LIBRARY_THUMBNAIL_PRESENTATION_CONTRACT_OK');
