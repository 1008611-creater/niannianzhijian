'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const release = '20260728-header-logo-removed-r1';
const heroWords = [
  '做高燃短剧',
  '做精品漫剧',
  '做真人情感剧',
  '做爆款商品视频',
  '做电影感品牌片',
  '做转绘出海短剧'
];

assert.match(index, /class="hero-title-row" aria-label="用念念 AI 做高燃短剧"/);
assert.match(index, /id="heroVerb" aria-live="polite">做高燃短剧<\/span>/);
assert.match(index, /<h1 aria-label="全品类爆款AI视频一键创作"><span>全品类爆款AI视频<\/span><span>一键创作<\/span><\/h1>/);
assert.match(index, new RegExp(`app\\.js\\?v=${release}`));
assert.match(app, new RegExp(`const serviceWorkerRelease = "${release}"`));
const heroWordsMatch = app.match(/const heroWords = (\[[^\n]+\]);/);
assert.ok(heroWordsMatch, 'heroWords declaration missing');
assert.deepEqual(JSON.parse(heroWordsMatch[1]), heroWords);
assert.match(worker, new RegExp(`const CACHE_NAME = 'niannian-app-shell-${release}'`));
assert.match(worker, new RegExp(`/app\\.js\\?v=${release}`));

for (const stale of [
  '让角色、镜头与资产持续一致',
  '做高燃反转短剧',
  '做角色一致漫剧',
  '做连续真人短剧',
  '做高转化商品视频'
]) {
  assert.equal(index.includes(stale) || app.includes(stale), false, `stale homepage copy: ${stale}`);
}

console.log(JSON.stringify({ok:true, release, title:'全品类爆款AI视频一键创作', hero_words:heroWords}));
