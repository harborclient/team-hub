import { describe, expect, it } from 'vitest';
import { normalizeHubMcpHeaders } from '#/config/llmConfig.js';

describe('normalizeHubMcpHeaders', () => {
  it('returns an empty array when headers are omitted', () => {
    expect(normalizeHubMcpHeaders(undefined)).toEqual([]);
  });

  it('normalizes an object map', () => {
    expect(normalizeHubMcpHeaders({ 'x-api-key': 'abc', Authorization: 'Bearer token' })).toEqual([
      { key: 'x-api-key', value: 'abc' },
      { key: 'Authorization', value: 'Bearer token' }
    ]);
  });

  it('normalizes an array of single-key objects', () => {
    expect(
      normalizeHubMcpHeaders([{ 'x-api-key': 'abc' }, { Authorization: 'Bearer token' }])
    ).toEqual([
      { key: 'x-api-key', value: 'abc' },
      { key: 'Authorization', value: 'Bearer token' }
    ]);
  });

  it('normalizes one nested array level from server.yaml', () => {
    expect(
      normalizeHubMcpHeaders([[{ 'x-api-key': '4fbd5841-94f6-43f1-87c3-f3b09cf855a8' }]])
    ).toEqual([{ key: 'x-api-key', value: '4fbd5841-94f6-43f1-87c3-f3b09cf855a8' }]);
  });
});
