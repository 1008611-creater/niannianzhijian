import assert from 'node:assert/strict';
import { quickRunErrorMessage } from './quickRunError';

assert.equal(quickRunErrorMessage('upstream returned 429'), '当前理解服务繁忙，素材和已完成的分析都已保留。请稍后重新制作。');
assert.equal(quickRunErrorMessage('network unavailable'), 'network unavailable');
assert.equal(quickRunErrorMessage(undefined), undefined);

console.log('quickRunError.verify: ok');
