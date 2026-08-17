const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'studio', 'assets', 'asset-library-upload-contract-r2.js'), 'utf8');
const assetLibrarySource = fs.readFileSync(path.join(__dirname, 'studio', 'assets', 'AssetLibraryPanel-BHyPOGab-r4.js'), 'utf8');
assert.match(assetLibrarySource, /type:"file",accept:[A-Za-z_$][A-Za-z0-9_$]*,multiple:!0,"aria-label":n\("assetLibrary\.filePicker"\)/);
const listeners = [];
const coverInput = {
  multiple: false,
  attributes: {accept: 'image/png,image/jpeg,image/webp'},
  getAttribute(name) { return this.attributes[name] || null; },
  setAttribute(name, value) { this.attributes[name] = value; }
};
const canvasInput = {
  multiple: true,
  attributes: {accept: 'image/*,video/*,audio/*'},
  getAttribute(name) { return this.attributes[name] || null; },
  setAttribute(name, value) { this.attributes[name] = value; }
};
const context = {
  window: {},
  document: {
    documentElement: {},
    querySelectorAll(selector) {
      assert.equal(selector, 'input[type="file"]');
      return [coverInput, canvasInput];
    }
  },
  MutationObserver: class {
    constructor(callback) { listeners.push(callback); }
    observe(target, options) { assert.equal(target, context.document.documentElement); assert.equal(options.subtree, true); }
  }
};

vm.runInNewContext(source, context, {filename: 'asset-library-upload-contract-r2.js'});
assert.equal(coverInput.attributes['data-niannian-canvas-asset-upload'], undefined);
assert.equal(canvasInput.attributes['data-niannian-canvas-asset-upload'], 'true');
assert.equal(canvasInput.id, 'niannian-canvas-asset-upload');
assert.equal(listeners.length, 1);
console.log('ASSET_LIBRARY_UPLOAD_CONTRACT_OK');
