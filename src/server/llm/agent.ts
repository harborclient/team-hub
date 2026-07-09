import type { DocsConfig } from '#/config/docsConfig.js';
import type { LlmConfig } from '#/config/llmConfig.js';
import {
  runLlmCompletion,
  type LlmChatMessage,
  type LlmCompletionResult,
  type LlmCompletionUsage,
  type LlmToolCall,
  type LlmToolDefinition
} from '#/server/llm/client.js';
import {
  callHubNativeTool,
  filterClientToolsForHub,
  isHubNativeToolName,
  type HubNativeToolName
} from '#/server/llm/hubNativeTools.js';
import { isHubMcpToolName } from '#/server/llm/hubMcpToolNames.js';
import {
  callHubMcpTool,
  ensureHubMcpConnections,
  listHubMcpTools,
  type HubMcpOpenAiTool
} from '#/server/llm/mcpClient.js';

/**
 * Maximum server-side tool iterations per chat step.
 */
export const HUB_CHAT_STEP_MAX_ITERATIONS = 8;

/**
 * Input for one hub chat step, including client tools and conversation history.
 */
export interface HubChatStepInput {
  model: string;
  messages: LlmChatMessage[];
  systemPrompt?: string;
  tools?: LlmToolDefinition[];
}

/**
 * Result of one hub chat step after optional server-side tool execution.
 */
export interface HubChatStepResult {
  content: string | null;
  toolCalls?: LlmToolCall[];
  usage: LlmCompletionUsage;
}

/**
 * Injectable dependencies for {@link runHubChatStep} in tests.
 */
export interface HubChatStepDeps {
  runCompletion: (
    config: LlmConfig,
    input: {
      model: string;
      messages: LlmChatMessage[];
      systemPrompt?: string;
      tools?: HubChatStepInput['tools'];
    }
  ) => Promise<LlmCompletionResult>;
  ensureConnections: (config: LlmConfig) => Promise<void>;
  listTools: () => HubMcpOpenAiTool[];
  callTool: (prefixedName: string, args: unknown) => Promise<string>;
  callNativeTool: (
    name: HubNativeToolName,
    args: unknown,
    config: LlmConfig,
    docsConfig: DocsConfig | null
  ) => Promise<string>;
}

/**
 * Sums token usage across multiple provider completions.
 *
 * @param current - Accumulated usage so far.
 * @param next - Usage from the latest completion.
 */
function addUsage(current: LlmCompletionUsage, next: LlmCompletionUsage): LlmCompletionUsage {
  return {
    promptTokens: current.promptTokens + next.promptTokens,
    completionTokens: current.completionTokens + next.completionTokens,
    totalTokens: current.totalTokens + next.totalTokens
  };
}

/**
 * Parses tool call arguments from the provider into a JSON value.
 *
 * @param raw - Raw arguments string from the model.
 */
function parseToolArguments(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return {};
  }
}

/**
 * Runs one hub chat step, executing hub-native and hub MCP tools server-side until a
 * client tool call or final text response is reached.
 *
 * @param config - Hub LLM configuration including optional MCP servers.
 * @param input - Model, messages, system prompt, and client tools.
 * @param deps - Optional overrides for completion and tool helpers (tests).
 * @param docsConfig - Optional docs search configuration from server.yaml.
 */
export async function runHubChatStep(
  config: LlmConfig,
  input: HubChatStepInput,
  deps: Partial<HubChatStepDeps> = {},
  docsConfig: DocsConfig | null = null
): Promise<HubChatStepResult> {
  const runCompletion = deps.runCompletion ?? runLlmCompletion;
  const ensureConnections = deps.ensureConnections ?? ensureHubMcpConnections;
  const listTools = deps.listTools ?? listHubMcpTools;
  const callTool = deps.callTool ?? callHubMcpTool;
  const callNativeTool = deps.callNativeTool ?? callHubNativeTool;

  await ensureConnections(config);

  const hubTools = listTools();
  const clientTools = filterClientToolsForHub(input.tools, config, docsConfig);
  const mergedTools: LlmToolDefinition[] | undefined =
    hubTools.length > 0 || (clientTools?.length ?? 0) > 0
      ? [...hubTools, ...(clientTools ?? [])]
      : undefined;

  let messages = [...input.messages];
  let usage: LlmCompletionUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let lastContent: string | null = null;

  for (let iteration = 0; iteration < HUB_CHAT_STEP_MAX_ITERATIONS; iteration += 1) {
    const result = await runCompletion(config, {
      model: input.model,
      messages,
      systemPrompt: input.systemPrompt,
      tools: mergedTools
    });

    usage = addUsage(usage, result.usage);
    lastContent = result.content;

    const toolCalls = result.toolCalls ?? [];
    if (toolCalls.length === 0) {
      return {
        content: result.content,
        usage
      };
    }

    const nativeCalls = toolCalls.filter((call) => isHubNativeToolName(call.name));
    const hubCalls = toolCalls.filter((call) => isHubMcpToolName(call.name));
    const passthroughCalls = toolCalls.filter(
      (call) => !isHubNativeToolName(call.name) && !isHubMcpToolName(call.name)
    );

    if (passthroughCalls.length > 0) {
      return {
        content: result.content,
        toolCalls: passthroughCalls,
        usage
      };
    }

    const serverCalls = [...nativeCalls, ...hubCalls];

    messages = [
      ...messages,
      {
        role: 'assistant',
        content: result.content,
        tool_calls: serverCalls
      }
    ];

    for (const call of nativeCalls) {
      const toolResult = await callNativeTool(
        call.name as HubNativeToolName,
        parseToolArguments(call.arguments),
        config,
        docsConfig
      );
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: toolResult
      });
    }

    for (const call of hubCalls) {
      const toolResult = await callTool(call.name, parseToolArguments(call.arguments));
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: toolResult
      });
    }
  }

  return {
    content: lastContent,
    usage
  };
}
