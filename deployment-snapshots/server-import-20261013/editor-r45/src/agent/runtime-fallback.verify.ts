import assert from 'node:assert/strict';
import { AgentPreOutputFailure } from './api-runtime.ts';
import { runWithAgentFallback } from './runtime.ts';
import type { AgentModelChoice } from './model-selection.ts';

const choice = (id: string, providerLabel: string) => ({
  id,
  providerLabel,
} as AgentModelChoice);

const primary = choice('openai:primary', 'OpenAI');
const fallback = choice('mcgrox:fallback', 'McGrox');
const attempts: string[] = [];
const switches: string[] = [];
const result = await runWithAgentFallback(
  [primary, fallback],
  async (current) => {
    attempts.push(current.id);
    if (current === primary) throw new AgentPreOutputFailure(Object.assign(new Error('forbidden'), { statusCode: 403 }));
    return 'received';
  },
  (from, to) => switches.push(`${from.id}->${to.id}`),
  (error) => { throw error; },
);

assert.equal(result, 'received');
assert.deepEqual(attempts, [primary.id, fallback.id]);
assert.deepEqual(switches, [`${primary.id}->${fallback.id}`]);
console.log('runtime-fallback.verify: ok');
