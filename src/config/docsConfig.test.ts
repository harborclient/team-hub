import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DOCS_SEARCH_INDEX_PATH,
  normalizeDocsConfig,
  resolveDocsSearchIndexPath
} from '#/config/docsConfig.js';

describe('docsConfig', () => {
  it('defaults to the Docker index path when searchIndexPath is omitted', () => {
    expect(normalizeDocsConfig({})).toEqual({
      searchIndexPath: DEFAULT_DOCS_SEARCH_INDEX_PATH
    });
  });

  it('normalizes a configured search index path', () => {
    expect(normalizeDocsConfig({ searchIndexPath: '/custom/docsSearchIndex.json' })).toEqual({
      searchIndexPath: '/custom/docsSearchIndex.json'
    });
  });

  it('resolves relative paths against the process cwd', () => {
    const resolved = resolveDocsSearchIndexPath('data/docsSearchIndex.json');
    expect(resolved.endsWith('data/docsSearchIndex.json')).toBe(true);
  });

  it('exposes the default Docker index path', () => {
    expect(DEFAULT_DOCS_SEARCH_INDEX_PATH).toBe('/app/data/docsSearchIndex.json');
  });
});
