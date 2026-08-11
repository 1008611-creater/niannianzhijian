import { isExternalGlobalReadTool, isExternalReadTool } from './external-tool-policy';
import { TOOL_SCHEMAS } from './tools';

/** Q&A mode can inspect the current project and skills, but never mutate it. */
export const ASK_MODE_TOOL_SCHEMAS = TOOL_SCHEMAS.filter(
  (tool) => isExternalGlobalReadTool(tool.name) || isExternalReadTool(tool.name),
);
