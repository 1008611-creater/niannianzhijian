const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'studio', 'assets', 'asset-library-clipboard-upload-r1.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, 'studio', 'index.html'), 'utf8');
assert.match(indexHtml, /asset-library-clipboard-upload-r1\.js\?v=20260817-clipboard-upload-r1/);
const listeners = new Map();
const dispatched = [];
const imageFile = {name: 'clipboard-reference.png', type: 'image/png'};
const assetInput = {
  getAttribute(name) { return name === 'accept' ? 'image/*,video/*,audio/*' : null; },
  dispatchEvent(event) { dispatched.push(event.type); },
  files: null
};

class FakeDataTransfer {
  constructor() {
    this.items = {add: file => { this.files = [file]; }};
    this.files = [];
  }
}

class FakeEvent {
  constructor(type, options) { this.type = type; this.bubbles = Boolean(options && options.bubbles); }
}

const context = {
  window: {addEventListener(type, listener) { listeners.set(type, listener); }},
  document: {querySelectorAll(selector) { assert.equal(selector, 'input[type="file"]'); return [assetInput]; }},
  DataTransfer: FakeDataTransfer,
  Event: FakeEvent
};
vm.runInNewContext(source, context, {filename: 'asset-library-clipboard-upload-r1.js'});

let prevented = false;
listeners.get('paste')({
  defaultPrevented: false,
  target: {closest() { return null; }},
  clipboardData: {items: [{type: 'image/png', getAsFile() { return imageFile; }}]},
  preventDefault() { prevented = true; }
});
assert.deepEqual(assetInput.files, [imageFile]);
assert.deepEqual(dispatched, ['input', 'change']);
assert.equal(prevented, true);

dispatched.length = 0;
prevented = false;
listeners.get('paste')({
  defaultPrevented: false,
  target: {closest(selector) { return selector.startsWith('input') ? {} : null; }},
  clipboardData: {items: [{type: 'image/png', getAsFile() { return imageFile; }}]},
  preventDefault() { prevented = true; }
});
assert.deepEqual(dispatched, []);
assert.equal(prevented, false);

console.log('ASSET_LIBRARY_CLIPBOARD_UPLOAD_OK');
