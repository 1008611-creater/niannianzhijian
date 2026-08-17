'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, 'studio/assets/web-runtime-adapter-r4.js'), 'utf8');
const values = new Map();
const projectId = 'NN-WEB-DOCUMENT-SYNC';
const localRecord = {
  id: projectId,
  name: '本地历史画布',
  createdAt: 1,
  updatedAt: 2,
  revision: 4,
  savedAt: 2,
  version: 1,
  payload: {
    generationCanvas: {
      nodes: [{id: 'kept-node', kind: 'image', position: {x: 10, y: 20}}],
      edges: [],
      groups: [{id: 'storyboard-e01-g1', name: '分镜·E01-G1', shotId: 'E01-G1', nodeIds: ['kept-node']}]
    }
  }
};
values.set('tapcanvas-open-workbench-project-v1:' + projectId, JSON.stringify(localRecord));
let remote = {revision: 0, document: {generationCanvas: {nodes: [], edges: [], groups: []}}};
let putCount = 0;
const events = [];

const localStorage = {
  getItem(key) { return values.has(key) ? values.get(key) : null; },
  setItem(key, value) { values.set(key, String(value)); },
  removeItem(key) { values.delete(key); },
  get length() { return values.size; },
  key(index) { return Array.from(values.keys())[index] || null; }
};
const context = {
  window: {
    location: {href: 'https://studio.invalid/studio/?projectId=' + projectId, search: '?projectId=' + projectId, hash: '#/studio'},
    localStorage,
    dispatchEvent(event) { events.push(event); }
  },
  URLSearchParams,
  URL,
  Map,
  Set,
  Array,
  String,
  Date,
  Math,
  JSON,
  Promise,
  Blob,
  FormData,
  Uint8Array,
  setTimeout,
  clearTimeout,
  crypto: {randomUUID: () => '00000000-0000-0000-0000-000000000000'},
  CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init && init.detail; },
  fetch: async (pathname, options = {}) => {
    if (pathname === '/api/canvas/provider-status') return {ok:true, json:async () => ({providerStatus:{modelCatalog:{models:[]}}})};
    if (pathname === '/api/studio/projects/' + projectId && (!options.method || options.method === 'GET')) {
      return {ok:true, json:async () => ({project:{id:projectId,name:'服务端项目'},revision:remote.revision,document:remote.document,updatedAt:'2026-08-18T00:00:00.000Z'})};
    }
    if (pathname === '/api/studio/projects/' + projectId && options.method === 'PUT') {
      putCount += 1;
      assert.equal(options.headers['if-match'], '"nomi-rev-0"');
      const body = JSON.parse(options.body);
      assert.equal(body.document.generationCanvas.nodes[0].id, 'kept-node');
      remote = {revision: 1, document: body.document};
      return {ok:true, json:async () => ({revision:1,document:remote.document,updatedAt:'2026-08-18T00:01:00.000Z'})};
    }
    throw new Error('unexpected request ' + pathname);
  }
};

vm.runInNewContext(source, context, {filename: 'web-runtime-adapter.js'});
(async () => {
  const loaded = await context.window.nomiDesktop.projects.readAsync(projectId);
  assert.equal(putCount, 1, '空服务端文档应只迁移一次本地历史画布');
  assert.equal(loaded.payload.generationCanvas.nodes[0].id, 'kept-node');
  assert.equal(context.window.nomiDesktop.projects.read(projectId).payload.generationCanvas.groups[0].shotId, 'E01-G1');
  assert.equal(events.filter(event => event.type === 'niannian-project-document-migrated').length, 1);

  const loadedAgain = await context.window.nomiDesktop.projects.readAsync(projectId);
  assert.equal(putCount, 1, '非空服务端文档不得被本地副本重复覆盖');
  assert.equal(loadedAgain.revision, 1);
  console.log('WEB_RUNTIME_ADAPTER_DOCUMENT_SYNC_OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
