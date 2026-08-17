(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var selector = 'input[type="file"]';
  var contractAttribute = 'data-niannian-canvas-asset-upload';

  function isCanvasAssetInput(input) {
    var accept = String(input.getAttribute('accept') || '').toLowerCase();
    return input.multiple && accept.includes('image/') && accept.includes('video/') && accept.includes('audio/');
  }

  function bindCanvasAssetInput() {
    var inputs = Array.prototype.slice.call(document.querySelectorAll(selector));
    var input = inputs.find(isCanvasAssetInput);
    if (!input) return;
    input.id = 'niannian-canvas-asset-upload';
    input.setAttribute(contractAttribute, 'true');
  }

  bindCanvasAssetInput();
  new MutationObserver(bindCanvasAssetInput).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}());
