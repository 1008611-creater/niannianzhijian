'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const adapter = fs.readFileSync(path.join(__dirname, 'studio', 'assets', 'web-runtime-adapter-r4.js'), 'utf8');
const controls = fs.readFileSync(path.join(__dirname, 'studio', 'assets', 'project-library-management.js'), 'utf8');
const routeBoot = fs.readFileSync(path.join(__dirname, 'studio', 'assets', 'studio-route-boot.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'studio', 'index.html'), 'utf8');

[
  'autoThumbnailUrls',
  'thumbnailUrls: visibleUrls',
  'updateMetadata: async function',
  "method: 'PATCH'",
  'customCoverAssetId',
  'persistProjectMetadata(next)'
].forEach(token => assert(adapter.includes(token), `网页项目桥接缺少合同：${token}`));

[
  'data-project-card=true',
  '重命名与封面',
  '画布节点封面',
  '自定义封面',
  'window.nomiDesktop.assets.importFile',
  'api.updateMetadata'
].forEach(token => assert(controls.includes(token), `项目库管理界面缺少合同：${token}`));

assert(html.includes('project-library-management.js?v=20260818-storyboard-group-contract-r8'));
assert(html.includes('web-runtime-adapter-r4.js?v=20260819-dola-persistence-r3'));
assert(html.includes('studio-route-boot.js?v=20260818-storyboard-group-contract-r8'));
assert(html.includes('nomi-project-route-pending'));
assert(routeBoot.includes('projectId') && routeBoot.includes('nomi-studio-app'));
assert(routeBoot.includes('.nomi-studio-app, .nomi-library-page'), '项目路由遮罩必须在画布或项目库任一真实页面挂载后关闭');
assert(!controls.includes('api_key'));
assert(!controls.includes('token'));
console.log('PROJECT_LIBRARY_MANAGEMENT_CONTRACT_OK');
