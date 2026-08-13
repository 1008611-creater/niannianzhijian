import type { ModelMessage } from 'ai';
import type { AgentContext } from './context';
import { TOOL_SCHEMAS } from './tools';
import { ASK_MODE_TOOL_SCHEMAS } from './ask-mode-tools';
import { buildAgentSystemPrompt, buildCompactAgentSystemPrompt } from './systemPrompt';
import { normalizeLlmMessages } from './messages';
import { loadAgentSettings } from './settings/agentSettings';
import type { GuardDecision } from './skills/costGuard';
import {
  runtimeGuardForTool,
  type RuntimeGuardRequest,
} from './runtime-guard';
import {
  getActiveAgentModelChoice,
  getAutomaticAgentFallbackChoices,
  selectAgentModel,
  type AgentModelChoice,
} from './model-selection';
import { executeOpenChatCutTool, runCodexAgent } from './codex/runtime';
import { prepareAgentContext } from './context-management';
import type { AgentContextUsage } from './context-compaction';
import { AgentPreOutputFailure, runApiAgent } from './api-runtime';
import type { ToolFailureTracker } from './toolFailure';
import { toolSchemasForChoice, usesSmallContextMode } from './compact-tools';
import type { AgentToolSchema } from './tool-schema';

export {
  apiToolExecutionOutput,
  isCompatibleMediaFallbackError,
  shouldRetryCompatibleMediaRequest,
  shouldFallbackAgentModel,
  shouldRetryTransientAgentRequest,
  streamPartStartsCompatibleMediaOutput,
} from './api-runtime';
export { runtimeGuardForTool } from './runtime-guard';
export type { RuntimeGuardRequest } from './runtime-guard';
export type LLMMessage = ModelMessage;
export interface AgentRuntimeModule {
  runAgent: typeof runAgent;
}
export interface RunAgentOptions {
  /** Stable billing id for one user turn; retries must not charge twice. */
  readonly operationId?: string;
  readonly askOnly?: boolean;
  readonly signal?: AbortSignal;
  readonly onSkillGuard?: (info: RuntimeGuardRequest) => Promise<GuardDecision>;
  readonly previousContextUsage?: AgentContextUsage;
  readonly toolFailures?: ToolFailureTracker;
}

export type AgentEvent =
  | { type: 'text-start' }
  | { type: 'text-delta'; delta: string }
  | { type: 'thinking-delta'; delta: string }
  | { type: 'tool-input-start'; name: string }
  | { type: 'tool-input-delta'; delta: string }
  | { type: 'tool'; name: string; args: unknown; result: unknown }
  | { type: 'max-turns'; turns: number }
  | { type: 'context-usage'; usage: AgentContextUsage }
  | { type: 'model-fallback'; from: string; to: string }
  | { type: 'error'; message: string };

export function initialMessages(): LLMMessage[] {
  return [];
}


async function runCodexBackend(
  messages: LLMMessage[],
  ctx: AgentContext,
  onEvent: (event: AgentEvent) => void,
  choice: AgentModelChoice,
  system: string,
  contextWasCompacted: boolean,
  contextWindowTokens: number,
  contextWindowEstimated: boolean,
  maxOutputTokens: number,
  opts?: RunAgentOptions,
  toolSchemas: readonly AgentToolSchema[] = TOOL_SCHEMAS,
): Promise<LLMMessage[]> {
  const settings = loadAgentSettings();
  const tools = !choice.capabilities.supportsTools.value
    ? []
    : (opts?.askOnly ? ASK_MODE_TOOL_SCHEMAS : toolSchemas).map((schema) => ({
      name: schema.name,
      description: schema.description,
      inputSchema: schema.input_schema,
    }));
  return runCodexAgent(messages, ctx, onEvent, {
    askOnly: opts?.askOnly,
    signal: opts?.signal,
    model: choice.requestModel,
    reasoningEffort: choice.reasoningEffort,
    modelId: choice.id,
    contextWindowTokens,
    contextWindowEstimated,
    contextWindowOverride: choice.capabilities.contextWindowTokens.source === 'settings-override',
    maxOutputTokens,
    supportsImages: choice.capabilities.supportsImages.value,
    requestMessageCount: messages.length,
    system,
    contextWasCompacted,
    toolFailures: opts?.toolFailures,
    tools,
    executeTool: async (name, args) => {
      const schema = TOOL_SCHEMAS.find((candidate) => candidate.name === name);
      if (!schema) return { success: false, result: { error: `Unknown Codex tool: ${name}` } };
      return executeOpenChatCutTool(schema, args, {
        ctx,
        onEvent,
        settings,
        resolveGuard: runtimeGuardForTool,
        onSkillGuard: opts?.onSkillGuard,
      });
    },
  });
}

export async function runAgent(
  messages: LLMMessage[],
  ctx: AgentContext,
  onEvent: (event: AgentEvent) => void,
  opts?: RunAgentOptions,
): Promise<LLMMessage[]> {
  const conv = normalizeLlmMessages(messages);
  const active = getActiveAgentModelChoice();
  if (!active) {
    onEvent({ type: 'error', message: 'No Agent model is available.' });
    return conv;
  }
  const candidates = getAutomaticAgentFallbackChoices();
  for (const [index, choice] of candidates.entries()) {
    const compact = usesSmallContextMode(choice);
    const system = compact
      ? buildCompactAgentSystemPrompt(ctx)
      : buildAgentSystemPrompt(ctx);
    const availableToolSchemas = !choice.capabilities.supportsTools.value
      ? []
      : opts?.askOnly ? ASK_MODE_TOOL_SCHEMAS : toolSchemasForChoice(choice);
    try {
      const prepared = await prepareAgentContext({
        messages: conv,
        system,
        choice,
        ctx,
        tools: availableToolSchemas,
        previousUsage: opts?.previousContextUsage,
        signal: opts?.signal,
      });
      onEvent({ type: 'context-usage', usage: prepared.usage });
      return choice.backend === 'codex'
        ? runCodexBackend(
            prepared.messages,
            ctx,
            onEvent,
            choice,
            system,
            prepared.usage.compacted,
            prepared.usage.contextWindowTokens,
            prepared.usage.contextWindowEstimated,
            prepared.maxOutputTokens,
            opts,
            availableToolSchemas,
          )
        : runApiAgent(
            prepared.messages,
            ctx,
            onEvent,
            choice,
            system,
            prepared.usage.compacted,
            prepared.maxOutputTokens,
            opts,
            undefined,
            availableToolSchemas,
          );
    } catch (error) {
      if (opts?.signal?.aborted) return conv;
      const next = candidates[index + 1];
      if (error instanceof AgentPreOutputFailure && next) {
        selectAgentModel(next.id);
        onEvent({ type: 'model-fallback', from: choice.providerLabel, to: next.providerLabel });
        continue;
      }
      const message = error instanceof Error ? error.message : String(error);
      onEvent({ type: 'error', message: `Unable to prepare model context: ${message}` });
      return conv;
    }
  }
  return conv;
}

