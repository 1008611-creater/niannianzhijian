const assert = require('node:assert/strict');
const {DOLA_PROMPT_PREFIX, withDolaPromptPrefix} = require('./bridge/niannian_dola_desktop_api_adapter');

const prompt = withDolaPromptPrefix('一名女侠在雨夜拔剑，镜头缓慢推近。');
assert.ok(prompt.startsWith(DOLA_PROMPT_PREFIX));
assert.ok(prompt.endsWith('一名女侠在雨夜拔剑，镜头缓慢推近。'));
assert.equal((prompt.match(/生成模型固定为：seedance2\.5/g) || []).length, 1);
assert.equal(withDolaPromptPrefix(prompt), prompt);
console.log('DOLA_PROMPT_PREFIX_CONTRACT_OK');
