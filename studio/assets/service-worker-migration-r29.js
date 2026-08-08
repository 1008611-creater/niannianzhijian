(function () {
  'use strict';

  const migrationKey = 'niannian-studio-worker-migration-r29';
  if (!('serviceWorker' in navigator) || sessionStorage.getItem(migrationKey)) return;

  navigator.serviceWorker.getRegistrations().then(async registrations => {
    if (!registrations.length) return;
    sessionStorage.setItem(migrationKey, '1');
    await Promise.all(registrations.map(registration => registration.update()));
    setTimeout(() => location.reload(), 400);
  }).catch(() => {});
}());
