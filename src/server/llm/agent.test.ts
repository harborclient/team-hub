import { describe, expect, it, vi } from 'vitest';
import type { LlmConfig } from '#/config/llmConfig.js';
import {
  HUB_CHAT_STEP_MAX_ITERATIONS,
  runHubChatStep,
  type HubChatStepDeps
} from '#/server/llm/agent.js';
import type { LlmCompletionResult } from '#/server/llm/client.js';
import { encodeHubMcpToolName } from '#/server/llm/hubMcpToolNames.js';
import type { HubMcpOpenAiTool } from '#/server/llm/mcpClient.js';

const sampleConfig: LlmConfig = {
  providers: { openai: { apiKey: 'sk-test' } },
  models: ['gpt-4o'],
  mcp: [{ name: 'Exa', url: 'https://mcp.exa.ai/mcp', headers: [] }]
};

/**
 * Builds fake hub chat step dependencies for agent loop tests.
 *
 * @param completionResults - Provider completions returned in order.
 * @param callTool - Optional MCP tool executor override.
 */
function createDeps(
  completionResults: LlmCompletionResult[],
  callTool?: HubChatStepDeps['callTool']
): HubChatStepDeps {
  const runCompletion = vi.fn(async () => {
    const next = completionResults.shift();
    if (!next) {
      throw new Error('No more fake completion results.');
    }
    return next;
  });

  return {
    runCompletion,
    ensureConnections: vi.fn(async () => undefined),
    listTools: vi.fn((): HubMcpOpenAiTool[] => [
      {
        type: 'function',
        function: {
          name: encodeHubMcpToolName(0, 'search'),
          description: 'Search the web',
          parameters: { type: 'object', properties: {} }
        }
      }
    ]),
    callTool: callTool ?? vi.fn(async () => JSON.stringify({ results: [{ title: 'Example' }] })),
    callNativeTool: vi.fn(async () =>
      JSON.stringify([{ title: 'Features', url: 'https://harborclient.com/features' }])
    )
  };
}

describe('runHubChatStep', () => {
  it('loops on hub MCP tool calls and returns final text with summed usage', async () => {
    const deps = createDeps([
      {
        content: null,
        toolCalls: [{ id: 'call-1', name: encodeHubMcpToolName(0, 'search'), arguments: '{}' }],
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
      },
      {
        content: 'Found results.',
        usage: { promptTokens: 20, completionTokens: 8, totalTokens: 28 }
      }
    ]);

    const result = await runHubChatStep(
      sampleConfig,
      {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Search for harborclient' }]
      },
      deps
    );

    expect(result.content).toBe('Found results.');
    expect(result.toolCalls).toBeUndefined();
    expect(result.usage).toEqual({
      promptTokens: 30,
      completionTokens: 13,
      totalTokens: 43
    });
    expect(deps.runCompletion).toHaveBeenCalledTimes(2);
    expect(deps.callTool).toHaveBeenCalledOnce();
  });

  it('returns passthrough tool calls immediately', async () => {
    const deps = createDeps([
      {
        content: null,
        toolCalls: [{ id: 'call-1', name: 'listCollections', arguments: '{}' }],
        usage: { promptTokens: 4, completionTokens: 2, totalTokens: 6 }
      }
    ]);

    const result = await runHubChatStep(
      sampleConfig,
      {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'List collections' }]
      },
      deps
    );

    expect(result.toolCalls).toEqual([{ id: 'call-1', name: 'listCollections', arguments: '{}' }]);
    expect(deps.callTool).not.toHaveBeenCalled();
  });

  it('returns only passthrough tool calls on a mixed turn', async () => {
    const deps = createDeps([
      {
        content: null,
        toolCalls: [
          { id: 'call-1', name: encodeHubMcpToolName(0, 'search'), arguments: '{}' },
          { id: 'call-2', name: 'listCollections', arguments: '{}' }
        ],
        usage: { promptTokens: 4, completionTokens: 2, totalTokens: 6 }
      }
    ]);

    const result = await runHubChatStep(
      sampleConfig,
      {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Do both' }]
      },
      deps
    );

    expect(result.toolCalls).toEqual([{ id: 'call-2', name: 'listCollections', arguments: '{}' }]);
    expect(deps.callTool).not.toHaveBeenCalled();
  });

  it('loops on hub-native search_docs and returns final text with summed usage', async () => {
    const deps = createDeps([
      {
        content: null,
        toolCalls: [{ id: 'call-1', name: 'search_docs', arguments: '{"query":"features"}' }],
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
      },
      {
        content: 'HarborClient supports collections.',
        usage: { promptTokens: 20, completionTokens: 8, totalTokens: 28 }
      }
    ]);

    const result = await runHubChatStep(
      sampleConfig,
      {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'What features does HarborClient have?' }]
      },
      deps,
      { searchIndexPath: '/app/data/docsSearchIndex.json' }
    );

    expect(result.content).toBe('HarborClient supports collections.');
    expect(result.toolCalls).toBeUndefined();
    expect(deps.callNativeTool).toHaveBeenCalledOnce();
    expect(deps.callTool).not.toHaveBeenCalled();
  });

  it('stops after the iteration cap', async () => {
    const repeatedMcpTurn: LlmCompletionResult = {
      content: null,
      toolCalls: [{ id: 'call-1', name: encodeHubMcpToolName(0, 'search'), arguments: '{}' }],
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
    };

    const deps = createDeps(
      Array.from({ length: HUB_CHAT_STEP_MAX_ITERATIONS }, () => repeatedMcpTurn)
    );

    const result = await runHubChatStep(
      sampleConfig,
      {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Loop forever' }]
      },
      deps
    );

    expect(result.content).toBeNull();
    expect(result.toolCalls).toBeUndefined();
    expect(deps.runCompletion).toHaveBeenCalledTimes(HUB_CHAT_STEP_MAX_ITERATIONS);
    expect(deps.callTool).toHaveBeenCalledTimes(HUB_CHAT_STEP_MAX_ITERATIONS);
    expect(result.usage.totalTokens).toBe(HUB_CHAT_STEP_MAX_ITERATIONS * 2);
  });
});
