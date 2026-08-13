import type { CodexAgentModel, CodexAgentStatus } from '../../shared/codex-agent';
import {
  LLM_PROVIDER_PRESETS,
  defaultModelForProvider,
  isLocalLlmProvider,
  llmProviderConfigNames,
  normalizeLlmProvider,
  type LlmProvider,
  type OpenAiApiMode,
} from '../../shared/llm-providers';
import {
  MODEL_CAPABILITY_OVERRIDES_KEY,
  parseModelCapabilityOverrides,
  resolveModelCapabilities,
  type ModelCapabilities,
  type ModelCapabilityOverride,
  type ModelIdentity,
} from '../../shared/model-capabilities';
import { setLlmConfig } from './providerConfig';

interface KeyStateLike {
  readonly configured: boolean;
}

export interface AgentModelChoice {
  readonly id: string;
  readonly backend: 'api' | 'codex';
  readonly provider: LlmProvider;
  readonly providerLabel: string;
  readonly model: string;
  readonly requestModel?: string;
  readonly openAiApiMode?: OpenAiApiMode;
  readonly reasoningEffort?: string;
  readonly capabilities: ModelCapabilities;
}

export interface AgentModelSnapshot {
  readonly choices: readonly AgentModelChoice[];
  readonly activeId: string;
  readonly loaded: boolean;
}

const MAX_AUTOMATIC_AGENT_MODELS = 3;
const VIDEO_UNDERSTANDING_PROVIDER: LlmProvider = 'gemini';

/** Gemini is reserved for the source-video analysis tool, never chat orchestration. */
function isChatAgentProvider(provider: LlmProvider): boolean {
  return provider !== VIDEO_UNDERSTANDING_PROVIDER;
}

/** Only chat-capable providers may take over a failed chat request. */
function isAutomaticChatFallbackProvider(provider: LlmProvider): boolean {
  return isChatAgentProvider(provider);
}

let snapshot: AgentModelSnapshot = { choices: [], activeId: '', loaded: false };
let apiModelChoices: readonly AgentModelChoice[] = [];
let codexModelChoices: readonly AgentModelChoice[] = [];
let capabilityOverrides: readonly ModelCapabilityOverride[] = [];
let codexStatus: CodexAgentStatus | null = null;
let codexSavedModel = '';
let codexSavedReasoningEffort = '';
let codexDiscoveredModels: readonly CodexAgentModel[] = [];
let fallbackProviderOrder: readonly LlmProvider[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function commit(choices: readonly AgentModelChoice[], activeId: string, loaded = snapshot.loaded): void {
  snapshot = { choices, activeId, loaded };
  emit();
}

function commitChoices(
  choices: readonly AgentModelChoice[],
  activeId: string,
  loaded = snapshot.loaded,
  fallbackApi?: AgentModelChoice,
): void {
  const active = choices.find((choice) => choice.id === activeId);
  const runtimeApi = active?.backend === 'api' ? active : fallbackApi;
  if (runtimeApi) {
    setLlmConfig(runtimeApi.provider, runtimeApi.model, runtimeApi.openAiApiMode);
  }
  commit(choices, activeId, loaded);
}

function safeOverrides(raw: unknown): readonly ModelCapabilityOverride[] {
  try { return parseModelCapabilityOverrides(raw); } catch { return []; }
}

function modelCapabilities(identity: ModelIdentity): ModelCapabilities {
  return resolveModelCapabilities(identity, capabilityOverrides);
}

function apiChoices(
  keys: Record<string, KeyStateLike>,
  models: Record<string, string>,
): readonly AgentModelChoice[] {
  return LLM_PROVIDER_PRESETS.flatMap((preset): AgentModelChoice[] => {
    if (!isChatAgentProvider(preset.id)) return [];
    const names = llmProviderConfigNames(preset.id);
    const savedModel = models[names.model]?.trim() ?? '';
    if (isLocalLlmProvider(preset.id) ? !savedModel : !keys[names.apiKey]?.configured) return [];
    const model = savedModel || defaultModelForProvider(preset.id);
    const identity: ModelIdentity = { backend: 'api', provider: preset.id, modelId: model };
    return [{
      id: `${preset.id}:${model}`,
      backend: 'api',
      provider: preset.id,
      providerLabel: preset.label,
      model,
      ...(preset.id === 'openai'
        ? { openAiApiMode: models.LLM_OPENAI_API_MODE === 'chat' ? 'chat' : 'responses' }
        : {}),
      capabilities: modelCapabilities(identity),
    }];
  });
}

function chooseInitialApiId(
  choices: readonly AgentModelChoice[],
  models: Record<string, string>,
): string {
  const preferred = normalizeLlmProvider(models.LLM_PROVIDER);
  return choices.find((choice) => choice.provider === preferred)?.id ?? choices[0]?.id ?? '';
}

function configuredFallbackProviders(raw: unknown): readonly LlmProvider[] {
  if (typeof raw !== 'string') return [];
  const available = new Set<string>(LLM_PROVIDER_PRESETS.map((preset) => preset.id));
  const seen = new Set<LlmProvider>();
  return raw.split(',').flatMap((part): LlmProvider[] => {
    const candidate = part.trim().toLowerCase();
    if (!available.has(candidate)) return [];
    const provider = candidate as LlmProvider;
    if (!isAutomaticChatFallbackProvider(provider)) return [];
    if (seen.has(provider)) return [];
    seen.add(provider);
    return [provider];
  });
}

function allChoices(): readonly AgentModelChoice[] {
  return [...apiModelChoices, ...codexModelChoices];
}
function rebuildCodexChoices(): void {
  const requestedModel = codexSavedModel.trim();
  const discoveredModel = requestedModel
    ? codexDiscoveredModels.find((model) => model.id === requestedModel)
    : codexDiscoveredModels.find((model) => model.isDefault);
  const model = requestedModel || discoveredModel?.id || '';
  if (!codexStatus?.installed || codexStatus.account?.type !== 'chatgpt' || !model) {
    codexModelChoices = [];
    return;
  }
  const identity: ModelIdentity = { backend: 'codex', provider: 'openai', modelId: model };
  const capabilities = modelCapabilities(identity);
  codexModelChoices = [{
    id: `codex:${model}`,
    backend: 'codex',
    provider: 'openai',
    providerLabel: 'OpenAI Codex',
    model,
    ...(requestedModel ? { requestModel: requestedModel } : {}),
    reasoningEffort: selectedReasoningEffort(codexSavedReasoningEffort, capabilities),
    capabilities,
  }];
}



export function applyAgentModelStatus(
  keys: Record<string, KeyStateLike>,
  models: Record<string, string>,
  selectDefaultProvider = false,
): void {
  capabilityOverrides = safeOverrides(models[MODEL_CAPABILITY_OVERRIDES_KEY]);
  fallbackProviderOrder = configuredFallbackProviders(models.LLM_AGENT_FALLBACK_ORDER);
  apiModelChoices = apiChoices(keys, models);
  codexSavedModel = models.CODEX_MODEL?.trim() ?? codexSavedModel;
  codexSavedReasoningEffort = models.CODEX_REASONING_EFFORT?.trim() ?? codexSavedReasoningEffort;
  rebuildCodexChoices();
  const choices = allChoices();
  const initialApiId = chooseInitialApiId(apiModelChoices, models);
  // A saved administrator default is an explicit routing decision. Refreshes and
  // manual model picks still retain the active choice unless this flag is set.
  const preserved = selectDefaultProvider
    ? ''
    : choices.some((choice) => choice.id === snapshot.activeId) ? snapshot.activeId : '';
  commitChoices(choices, preserved || initialApiId || choices[0]?.id || '', true,
    apiModelChoices.find((choice) => choice.id === initialApiId));
}

function selectedReasoningEffort(requested: string | undefined, capabilities: ModelCapabilities): string {
  const effort = requested?.trim() ?? '';
  if (!effort) return '';
  if (!capabilities.supportsReasoning.estimated && !capabilities.supportsReasoning.value) return '';
  const supported = capabilities.reasoningEfforts.value;
  return supported.length === 0 || supported.includes(effort)
    ? effort
    : capabilities.defaultReasoningEffort?.value ?? '';
}


export function applyCodexAgentStatus(
  status: CodexAgentStatus,
  savedModel?: string,
  savedReasoningEffort?: string,
  discoveredModels?: readonly CodexAgentModel[],
): void {
  codexStatus = status;
  codexSavedModel = savedModel?.trim() ?? codexSavedModel;
  codexSavedReasoningEffort = savedReasoningEffort?.trim() ?? codexSavedReasoningEffort;
  if (discoveredModels) codexDiscoveredModels = discoveredModels;
  rebuildCodexChoices();
  const choices = allChoices();
  const preserved = choices.some((choice) => choice.id === snapshot.activeId) ? snapshot.activeId : '';
  commitChoices(choices, preserved || choices[0]?.id || '', true);
}

export function getAgentModelSnapshot(): AgentModelSnapshot {
  return snapshot;
}

export function subscribeAgentModels(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isAgentModelReady(state: AgentModelSnapshot = snapshot): boolean {
  return state.loaded
    && Boolean(state.activeId)
    && state.choices.some((choice) => choice.id === state.activeId);
}

export function getActiveAgentModelChoice(): AgentModelChoice | undefined {
  return snapshot.choices.find((choice) => choice.id === snapshot.activeId);
}

/** Retry only pre-output API failures; Codex has a separate account-backed runtime. */
export function getAutomaticAgentFallbackChoices(): readonly AgentModelChoice[] {
  const active = getActiveAgentModelChoice();
  if (!active || active.backend !== 'api') return active ? [active] : [];
  const configured = apiModelChoices.filter((choice) =>
    choice.id !== active.id && isAutomaticChatFallbackProvider(choice.provider));
  const ordered = fallbackProviderOrder.length
    ? fallbackProviderOrder.flatMap((provider) => configured.filter((choice) => choice.provider === provider))
    : configured;
  return [active, ...ordered].slice(0, MAX_AUTOMATIC_AGENT_MODELS);
}

export function selectAgentModel(id: string): void {
  const choice = snapshot.choices.find((candidate) => candidate.id === id);
  if (!choice) return;
  commitChoices(snapshot.choices, choice.id);
}
