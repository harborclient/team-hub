import { describe, expect, it } from 'vitest';
import {
  canExecuteHubDocsSearch,
  filterClientToolsForHub,
  isHubNativeToolName
} from '#/server/llm/hubNativeTools.js';

describe('hubNativeTools', () => {
  it('identifies search_docs as a hub-native tool', () => {
    expect(isHubNativeToolName('search_docs')).toBe(true);
    expect(isHubNativeToolName('list_collections')).toBe(false);
  });

  it('strips search_docs from client tools when docs search is unavailable', () => {
    const tools = [
      {
        type: 'function',
        function: {
          name: 'search_docs',
          parameters: { type: 'object', properties: {} }
        }
      },
      {
        type: 'function',
        function: {
          name: 'list_collections',
          parameters: { type: 'object', properties: {} }
        }
      }
    ];

    const filtered = filterClientToolsForHub(tools, { providers: {} }, null);

    expect(filtered).toHaveLength(1);
    expect((filtered?.[0] as { function: { name: string } }).function.name).toBe(
      'list_collections'
    );
  });

  it('reports docs search unavailable without an OpenAI provider key', () => {
    expect(
      canExecuteHubDocsSearch({ providers: { claude: { apiKey: 'sk-ant-test' } } }, null)
    ).toBe(false);
  });
});
