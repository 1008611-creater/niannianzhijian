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

// TokenRhythm's GLM-5.1 advertises a 200K context, but its compatible
// endpoint rejects the full editor catalog (about 200KB of JSON) with HTTP
// 503. Keep the short-drama workflow on the compact catalog for this model;
// this is a request-size compatibility guard, not a claim about its context.
const COMPACT_TOOL_CATALOG_MODELS = new Set(['tokenrhythm:glm-5.1']);

const SMALL_CONTEXT_TOOL_NAMES = new Set([
  'read_timeline',
  'search_media',
  'manage_timelines',
  'view_asset_frames',
  'analyze_asset',
  'assemble_rough_cut',
  'render_rough_cut_voiceover',
  'prepare_rough_cut_captions',
  'place_rough_cut_bgm',
  'check_rough_cut_ready',
  'view_timeline_frames',
  'list_audio',
  'track_progress',
]);

export function usesSmallContextMode(choice: AgentModelChoice): boolean {
  return choice.backend === 'api'
    && (choice.capabilities.contextWindowTokens.value < SMALL_CONTEXT_WINDOW_TOKENS
      || COMPACT_TOOL_CATALOG_MODELS.has(`${choice.provider}:${choice.model}`));
}

export function toolSchemasForChoice(choice: AgentModelChoice): readonly AgentToolSchema[] {
  if (!usesSmallContextMode(choice)) return TOOL_SCHEMAS;
  return TOOL_SCHEMAS.filter((schema) => SMALL_CONTEXT_TOOL_NAMES.has(schema.name));
}

export function smallContextToolNames(): readonly string[] {
  return [...SMALL_CONTEXT_TOOL_NAMES];
}
