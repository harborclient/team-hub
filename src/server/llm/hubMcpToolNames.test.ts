import { describe, expect, it } from 'vitest';
import {
  decodeHubMcpToolName,
  encodeHubMcpToolName,
  isHubMcpToolName
} from '#/server/llm/hubMcpToolNames.js';

describe('hubMcpToolNames', () => {
  it('encodes and decodes hub MCP tool names', () => {
    const encoded = encodeHubMcpToolName(0, 'web_search_exa');
    expect(encoded).toBe('hubmcp__0__web_search_exa');
    expect(decodeHubMcpToolName(encoded)).toEqual({
      serverIndex: 0,
      toolName: 'web_search_exa'
    });
  });

  it('returns null for invalid prefixed names', () => {
    expect(decodeHubMcpToolName('mcp__server__tool')).toBeNull();
    expect(decodeHubMcpToolName('hubmcp__not-a-number__tool')).toBeNull();
    expect(decodeHubMcpToolName('hubmcp__0__')).toBeNull();
  });

  it('detects hub MCP tool names', () => {
    expect(isHubMcpToolName('hubmcp__1__search')).toBe(true);
    expect(isHubMcpToolName('listCollections')).toBe(false);
  });
});
