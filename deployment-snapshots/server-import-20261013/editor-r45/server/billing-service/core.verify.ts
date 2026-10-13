import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { normalizeBillingInput, validBillingSignature } from './core.ts';

const secret = 'billing-service-test-secret-at-least-32-bytes';
const payload = JSON.stringify({ userId: 'u1', operationId: 'op1', step: 'agent_llm', credits: 1 });
const signature = createHmac('sha256', secret).update(payload).digest('hex');
assert.equal(validBillingSignature(secret, payload, signature), true);
assert.equal(validBillingSignature(secret, `${payload}x`, signature), false);
assert.deepEqual(normalizeBillingInput(JSON.parse(payload)), {
  userId: 'u1', operationId: 'op1', step: 'agent_llm', credits: 1,
});
assert.equal(normalizeBillingInput({ userId: 'u1', operationId: '', step: 'agent_llm', credits: 1 }), null);
assert.equal(normalizeBillingInput({ userId: 'u1', operationId: 'op1', step: 'agent_llm', credits: -1 }), null);
console.log('billing-service core verify: ok');
