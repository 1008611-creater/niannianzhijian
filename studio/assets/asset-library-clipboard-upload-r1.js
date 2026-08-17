(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  function isTextEditor(target) {
    if (!target || typeof target.closest !== 'function') return false;
    return Boolean(target.closest('input:not([type="file"]), textarea, [contenteditable="true"], [contenteditable=""]'));
  }

  function imageFileFromClipboard(event) {
    var items = event && event.clipboardData && event.clipboardData.items;
    if (!items || typeof items.length !== 'number') return null;
    for (var index = 0; index < items.length; index += 1) {
      var item = items[index];
      if (!item || !String(item.type || '').toLowerCase().startsWith('image/')) continue;
      var file = typeof item.getAsFile === 'function' ? item.getAsFile() : null;
      if (file) return file;
    }
    return null;
  }

  function assetLibraryInput() {
    return document.querySelector('input[data-niannian-canvas-asset-upload="true"]');
  }

  function assignClipboardFile(input, file) {
    if (typeof DataTransfer !== 'function' || typeof Event !== 'function') return false;
    var transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('input', {bubbles: true}));
    input.dispatchEvent(new Event('change', {bubbles: true}));
    return true;
  }

  window.addEventListener('paste', function (event) {
    if (event.defaultPrevented || isTextEditor(event.target)) return;
    var file = imageFileFromClipboard(event);
    if (!file) return;
    var input = assetLibraryInput();
    if (!input || !assignClipboardFile(input, file)) return;
    event.preventDefault();
  }, true);
}());
