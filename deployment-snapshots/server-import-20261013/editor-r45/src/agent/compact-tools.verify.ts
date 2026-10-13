import assert from 'node:assert/strict';
import { estimateTextTokens } from './context-compaction';
import { smallContextToolNames } from './compact-tools';
import { TOOL_SCHEMAS } from './tools';

const names = new Set(smallContextToolNames());
const schemas = TOOL_SCHEMAS.filter((schema) => names.has(schema.name));
assert.ok(schemas.length >= 10, 'small-context mode must retain the narrated-short workflow');
for (const required of [
  'view_asset_frames', 'assemble_rough_cut', 'render_rough_cut_voiceover',
  'prepare_rough_cut_captions', 'place_rough_cut_bgm', 'check_rough_cut_ready',
]) assert.ok(names.has(required), `missing compact workflow tool ${required}`);
assert.ok(
  estimateTextTokens(JSON.stringify(schemas)) < 4_500,
  'compact tool definitions must leave room for the compact system prompt and user request',
);
console.log('compact-tools.verify: small-context tool catalog stays within budget');
