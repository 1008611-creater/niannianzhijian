import assert from 'node:assert/strict';
import { ASK_MODE_TOOL_SCHEMAS } from './ask-mode-tools';
import { isExternalGlobalReadTool, isExternalReadTool } from './external-tool-policy';

const names = new Set(ASK_MODE_TOOL_SCHEMAS.map((tool) => tool.name));
assert(names.has('load_skill'), 'Q&A mode keeps the skill reader');
assert(names.has('read_project'), 'Q&A mode keeps project inspection');
assert(names.has('read_timeline'), 'Q&A mode keeps timeline inspection');
assert(!names.has('edit_captions'), 'Q&A mode excludes draft edits');
assert(!names.has('submit_render_job'), 'Q&A mode excludes live side effects');
assert(
  ASK_MODE_TOOL_SCHEMAS.every((tool) => isExternalGlobalReadTool(tool.name) || isExternalReadTool(tool.name)),
  'every Q&A tool is classified read-only',
);
console.log('ask-mode-tools.verify: read-only tool surface passed');
