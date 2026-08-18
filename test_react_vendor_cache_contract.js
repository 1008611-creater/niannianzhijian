const fs = require('node:fs');
const assert = require('node:assert/strict');

const nomi = fs.readFileSync('studio/assets/NomiStudioApp-DDB0IgSO-r28-19b89ec-r6.js', 'utf8');
const index = fs.readFileSync('studio/assets/index-M-8MrEH2-r28-19b89ec-r6.js', 'utf8');
const stale = '20260818-studio-cache-chain-r7';
const current = '20260818-storyboard-group-contract-r8';

assert.equal(nomi.includes(stale), false, 'NomiStudioApp must not reference the stale cache chain');
assert.ok(nomi.includes(`react-vendor-CRt0dbXk-r4.js?v=${current}`), 'NomiStudioApp must use the current React vendor URL');
assert.ok(nomi.includes(`runtime-vendor-BwexXt4y-r4.js?v=${current}`), 'NomiStudioApp must use the current runtime vendor URL');
assert.ok(index.includes(`react-vendor-CRt0dbXk-r4.js?v=${current}`), 'index must use the same React vendor URL');
assert.ok(index.includes(`runtime-vendor-BwexXt4y-r4.js?v=${current}`), 'index must use the same runtime vendor URL');

console.log('REACT_VENDOR_CACHE_CONTRACT_OK');
