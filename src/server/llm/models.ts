import type { LlmConfig, LlmProvider } from '#/config/llmConfig.js';

/**
 * Catalog entry for a hub-offered LLM model.
 */
export interface LlmModelCatalogEntry {
  /**
   * Provider-specific model id sent to the API.
   */
  id: string;

  /**
   * Human-readable label for listings.
   */
  label: string;

  /**
   * LLM provider that owns this model.
   */
  provider: LlmProvider;
}

/**
 * Full catalog of models Team Hub can offer when a provider key is configured.
 */
export const LLM_MODEL_CATALOG: LlmModelCatalogEntry[] = [
  { id: 'gpt-4o', label: 'GPT-4o', provider: 'openai' },
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'openai' },
  { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', provider: 'claude' },
  { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku', provider: 'claude' },
  { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', provider: 'gemini' },
  { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', provider: 'gemini' }
];

/**
 * Returns whether a provider has a configured API key on the hub.
 *
 * @param config - Normalized LLM config from server.yaml.
 * @param provider - Provider to check.
 */
function hasProviderKey(config: LlmConfig, provider: LlmProvider): boolean {
  return Boolean(config.providers[provider]?.apiKey.trim());
}

/**
 * Returns whether a provider has a configured API key on the hub.
 *
 * @param config - Normalized LLM config from server.yaml.
 * @param provider - Provider to check.
 */
export function hasHubOpenAiProvider(config: LlmConfig): boolean {
  return hasProviderKey(config, 'openai');
}

/**
 * Returns hub LLM capability flags advertised to HarborClient clients.
 *
 * @param config - Normalized LLM config from server.yaml.
 */
export function getHubLlmCapabilities(config: LlmConfig): { openai: boolean } {
  return {
    openai: hasProviderKey(config, 'openai')
  };
}

/**
 * Returns catalog models the hub offers based on configured keys and optional allow-list.
 *
 * @param config - Normalized LLM config from server.yaml.
 */
export function listHubOfferedModels(config: LlmConfig): LlmModelCatalogEntry[] {
  const allowList = config.models ? new Set(config.models) : null;

  return LLM_MODEL_CATALOG.filter((model) => {
    if (!hasProviderKey(config, model.provider)) {
      return false;
    }

    if (allowList && !allowList.has(model.id)) {
      return false;
    }

    return true;
  });
}

/**
 * Looks up a catalog model by id.
 *
 * @param modelId - Provider-specific model id.
 */
export function getHubModelById(modelId: string): LlmModelCatalogEntry | undefined {
  return LLM_MODEL_CATALOG.find((model) => model.id === modelId);
}

/**
 * Returns true when the hub is configured to offer the given model id.
 *
 * @param config - Normalized LLM config from server.yaml.
 * @param modelId - Provider-specific model id.
 */
export function isHubModelOffered(config: LlmConfig, modelId: string): boolean {
  return listHubOfferedModels(config).some((model) => model.id === modelId);
}

/**
 * Returns the current UTC usage period key (`YYYY-MM`).
 *
 * @param now - Reference time; defaults to the current instant.
 */
export function currentUsagePeriod(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}
