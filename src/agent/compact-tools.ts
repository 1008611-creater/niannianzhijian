import type { AgentModelChoice } from './model-selection';
import { TOOL_SCHEMAS } from './tools';
import type { AgentToolSchema } from './tool-schema';

/**
 * The provider fallback for an unlisted model is 8K. The complete editor
 * catalog is intentionally much larger than that, so small-context models
 * receive the tools needed for the common narrated-short workflow only.
 * Larger models keep the complete catalog and therefore retain every feature.
 */
export const SMALL_CONTEXT_WINDOW_TOKENS = 32_768;

const SMALL_CONTEXT_TOOL_NAMES = new Set([
  'read_timeline',
  'view_asset_frames',
  'analyze_asset',
  'assemble_rough_cut',
  'render_rough_cut_voiceover',
  'prepare_rough_cut_captions',
  'place_rough_cut_bgm',
  'check_rough_cut_ready',
  'view_timeline_frames',
  'list_audio',
  'submit_music',
  'track_progress',
]);

export function usesSmallContextMode(choice: AgentModelChoice): boolean {
  return choice.backend === 'api'
    && choice.capabilities.contextWindowTokens.value < SMALL_CONTEXT_WINDOW_TOKENS;
}

export function toolSchemasForChoice(choice: AgentModelChoice): readonly AgentToolSchema[] {
  if (!usesSmallContextMode(choice)) return TOOL_SCHEMAS;
  return TOOL_SCHEMAS.filter((schema) => SMALL_CONTEXT_TOOL_NAMES.has(schema.name));
}

export function smallContextToolNames(): readonly string[] {
  return [...SMALL_CONTEXT_TOOL_NAMES];
}
