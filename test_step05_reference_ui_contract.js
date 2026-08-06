'use strict';

const assert = require('assert/strict');
const fs = require('fs');

const ui = fs.readFileSync(require.resolve('./mvp-step03-r1.js'), 'utf8');
const css = fs.readFileSync(require.resolve('./product.css'), 'utf8');

for (const value of [
  "['confirmation','视频参考确认']",
  '/step05/references',
  'X-Localization-Revision',
  'status.localizationRevision||status.payload.localization?.candidate?.localization_revision',
  '系统已检查',
  '需要您处理',
  '实际视频参考图',
  '确认本批视频参考图',
  '原片首帧或来源事实',
  '当前候选',
  '视频组 / 用途',
  '中文参考职责',
  '相关支撑资产',
  '问题类别',
  '备注',
  'data-step05-confirm-batch',
  'data-step05-reject',
  'data-step05-reroll',
  "decision:store.referenceDecisions[card.ref_key]==='通过'?'pass':''",
  "'If-Match':store.referenceEtag",
  "headers['Idempotency-Key']",
  "error.status===412",
  '视频参考图已更新，请核对当前图片后重新确认。',
  'void loadReferences()'
]) assert.ok(ui.includes(value), value);

assert.match(ui, /const step03Post=.*step05=url\.includes\('\/step05\/'\)/);
assert.match(ui, /if\(step03Post\|\|step05\).*X-Localization-Revision/);
assert.match(ui, /store\.plan=loaded\.payload\.plan;.*render\(\);schedule\(\);void loadReferences\(\)/);
assert.match(ui, /safeReferenceUrl/);
assert.match(ui, /\^\\\/api\\\//);
assert.match(ui, /aria-live="polite"/);
assert.match(ui, /aria-busy/);

for (const legacyUnlock of ['data-step03-accept-all', 'data-step03-confirm', 'data-step03-frame-accept', 'function acceptAll']) {
  assert.ok(!ui.includes(legacyUnlock), 'legacy unlock remains: ' + legacyUnlock);
}

for (const selector of [
  '.step05-reference-workspace',
  '.step05-reference-grid',
  '.step05-support-lanes',
  '.step05-reference-card',
  '.step05-reference-compare',
  '.step05-reference-issue',
  ':focus-visible',
  '@media (max-width:760px)',
  'overflow-x:hidden',
  'grid-template-columns:1fr'
]) assert.ok(css.includes(selector), selector);

assert.doesNotMatch(ui, /content_sha|authority_revision|provider_task|locked_prompt|internal_path/i);
assert.doesNotMatch(ui, /escape\([^)]*(?:localization_revision|referenceEtag|etag)[^)]*\)/i);
assert.doesNotMatch(ui, /PIL|OpenCV|ImageMagick|ffmpeg|canvas/i);

process.stdout.write(JSON.stringify({
  ok: true,
  step05_get: true,
  dual_track: true,
  exact_batch_headers: true,
  reject_and_reroll: true,
  stale_refresh: true,
  legacy_unlock_removed: true,
  mobile_single_column: true,
  focus_visible: true,
  safe_projection_only: true
}) + '\n');
