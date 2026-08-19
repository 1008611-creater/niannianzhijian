'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const adapter = fs.readFileSync(path.join(__dirname, 'studio', 'assets', 'web-runtime-adapter-r4.js'), 'utf8');
const controls = fs.readFileSync(path.join(__dirname, 'studio', 'assets', 'project-library-management.js'), 'utf8');
const studioApp = fs.readFileSync(path.join(__dirname, 'studio', 'assets', 'NomiStudioApp-DDB0IgSO-r28-19b89ec-r6.js'), 'utf8');
const studioEntry = fs.readFileSync(path.join(__dirname, 'studio', 'assets', 'index-M-8MrEH2-r28-19b89ec-r6.js'), 'utf8');
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
assert(html.includes('index-M-8MrEH2-r28-19b89ec-r6.js?v=20260819-project-rename-r2'));
assert(studioEntry.includes('./NomiStudioApp-DDB0IgSO-r28-19b89ec-r6.js?v=20260819-project-rename-r2'));
assert(!studioEntry.includes('./NomiStudioApp-DDB0IgSO-r28-19b89ec-r6.js?v=20260818-storyboard-group-contract-r8'), '主界面动态入口不能混用旧资源版本');
assert(html.includes('web-runtime-adapter-r4.js?v=20260819-dola-bridge-preflight-r4'));
assert(html.includes('studio-route-boot.js?v=20260818-storyboard-group-contract-r8'));
assert(html.includes('nomi-project-route-pending'));
assert(studioApp.includes('renameRequestRef=y.useRef(0)'), '主界面必须为重命名请求保留顺序保护');
assert(studioApp.includes('K.projects&&typeof K.projects.updateMetadata==="function"'), '重命名必须优先调用独立项目元数据接口');
assert(studioApp.includes('K.projects.updateMetadata(s.id,{name:w})'), '重命名必须只提交项目名称元数据');
assert(studioApp.includes('d(K&&K.name?{...s,...K,name:K.name}:N)'), '服务器确认成功后才能更新界面名称');
assert(routeBoot.includes('projectId') && routeBoot.includes('nomi-studio-app'));
assert(routeBoot.includes('.nomi-studio-app, .nomi-library-page'), '项目路由遮罩必须在画布或项目库任一真实页面挂载后关闭');
assert(!controls.includes('api_key'));
assert(!controls.includes('token'));
console.log('PROJECT_LIBRARY_MANAGEMENT_CONTRACT_OK');
