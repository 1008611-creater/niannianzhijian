(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  var selectorPattern = /模型接入|接入模型|添加模型|中转站|供应商配置/;
  var style = document.createElement('style');
  style.textContent = '[data-nomi-admin-model-entry="hidden"]{display:none!important}';
  (document.head || document.documentElement).appendChild(style);

  function markEntries() {
    var elements = document.querySelectorAll('button,a,[role="button"],nav,[data-testid]');
    elements.forEach(function (element) {
      if (element.dataset.nomiAdminModelEntry === 'admin') return;
      var text = String(element.textContent || '').replace(/\s+/g, ' ').trim();
      if (text && selectorPattern.test(text)) element.dataset.nomiAdminModelEntry = 'hidden';
    });
  }

  markEntries();
  var observer = new MutationObserver(markEntries);
  observer.observe(document.documentElement, {childList: true, subtree: true});
  fetch('/api/auth/session', {credentials: 'same-origin'}).then(function (response) { return response.ok ? response.json() : null; }).then(function (body) {
    if (body && body.user && body.user.isAdmin === true) {
      document.documentElement.dataset.nomiAdmin = 'true';
      document.querySelectorAll('[data-nomi-admin-model-entry="hidden"]').forEach(function (element) { element.dataset.nomiAdminModelEntry = 'admin'; });
    }
  }).catch(function () {});
}());
