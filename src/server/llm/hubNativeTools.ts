import type { DocsConfig } from '#/config/docsConfig.js';
import type { LlmConfig } from '#/config/llmConfig.js';
import { hasHubOpenAiProvider } from '#/server/llm/models.js';
import {
  isDocsSearchIndexAvailable,
  searchDocs,
  type SearchDocsToolArgs
} from '#/server/docs/docsSearch.js';
import type { LlmToolDefinition } from '#/server/llm/client.js';

/**
 * Hub-native tool names executed server-side during chat steps.
 */
export const HUB_NATIVE_TOOL_NAMES = ['search_docs'] as const;

/**
 * Union of hub-native tool names.
 */
export type HubNativeToolName = (typeof HUB_NATIVE_TOOL_NAMES)[number];

/**
 * Returns whether a tool name is a hub-native built-in tool.
 *
 * @param name - Tool name from the model.
 */
export function isHubNativeToolName(name: string): name is HubNativeToolName {
  return (HUB_NATIVE_TOOL_NAMES as readonly string[]).includes(name);
}

/**
 * Returns whether the hub can execute hub-native documentation search.
 *
 * Requires an OpenAI provider key and a readable docs search index file.
 *
 * @param llmConfig - Hub LLM configuration.
 * @param docsConfig - Optional docs section from server.yaml.
 */
export function canExecuteHubDocsSearch(
  llmConfig: LlmConfig | null,
  docsConfig: DocsConfig | null
): boolean {
  if (!llmConfig || !hasHubOpenAiProvider(llmConfig)) {
    return false;
  }

  return isDocsSearchIndexAvailable(docsConfig);
}

/**
 * Removes hub-native tools the server cannot execute from client tool definitions.
 *
 * @param tools - Tool definitions forwarded from HarborClient.
 * @param llmConfig - Hub LLM configuration.
 * @param docsConfig - Optional docs section from server.yaml.
 */
export function filterClientToolsForHub(
  tools: LlmToolDefinition[] | undefined,
  llmConfig: LlmConfig | null,
  docsConfig: DocsConfig | null
): LlmToolDefinition[] | undefined {
  if (!tools || tools.length === 0) {
    return tools;
  }

  if (canExecuteHubDocsSearch(llmConfig, docsConfig)) {
    return tools;
  }

  const filtered = tools.filter((tool) => {
    const name = (tool as { function?: { name?: string } }).function?.name;
    return name !== 'search_docs';
  });

  return filtered.length > 0 ? filtered : undefined;
}

/**
 * Invokes one hub-native tool and returns a JSON string for the agent loop.
 *
 * @param name - Tool name from the model.
 * @param args - Parsed tool arguments object.
 * @param llmConfig - Hub LLM configuration.
 * @param docsConfig - Optional docs section from server.yaml.
 */
export async function callHubNativeTool(
  name: HubNativeToolName,
  args: unknown,
  llmConfig: LlmConfig,
  docsConfig: DocsConfig | null
): Promise<string> {
  if (name !== 'search_docs') {
    return JSON.stringify({ error: `Unknown hub-native tool: ${name}` });
  }

  try {
    const parsed = args as SearchDocsToolArgs;
    const hits = await searchDocs(llmConfig, docsConfig, parsed);
    return JSON.stringify(hits);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Documentation search failed.';
    return JSON.stringify({ error: message });
  }
}
