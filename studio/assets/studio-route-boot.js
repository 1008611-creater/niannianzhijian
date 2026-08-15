(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var root = document.documentElement;
  var timeoutId = 0;

  function hasProjectRoute() {
    try {
      var url = new URL(window.location.href);
      if (url.searchParams.get('projectId')) return true;
      var hashQuery = url.hash.indexOf('?');
      return hashQuery >= 0 && new URLSearchParams(url.hash.slice(hashQuery)).has('projectId');
    } catch (error) {
      return false;
    }
  }

  function applyRouteGate() {
    var pending = hasProjectRoute();
    root.classList.toggle('nomi-project-route-pending', pending);
    if (timeoutId) window.clearTimeout(timeoutId);
    if (!pending) return;
    timeoutId = window.setTimeout(function () {
      root.classList.remove('nomi-project-route-pending');
    }, 15000);
  }

  applyRouteGate();
  window.addEventListener('hashchange', applyRouteGate);
  window.addEventListener('popstate', applyRouteGate);
  new MutationObserver(function () {
    if (root.classList.contains('nomi-project-route-pending') && document.querySelector('.nomi-studio-app')) {
      root.classList.remove('nomi-project-route-pending');
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = 0;
    }
  }).observe(document.documentElement, {childList: true, subtree: true});
}());
