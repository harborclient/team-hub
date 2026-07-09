import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create, insertMultiple, save } from '@orama/orama';
import { DOCS_EMBEDDING_DIMENSIONS } from '#/server/docs/docsSearch.js';

let tempIndexPath = '';
let tempRoot = '';

const indexedEmbedding = Array.from({ length: DOCS_EMBEDDING_DIMENSIONS }, (_, index) =>
  index === 0 ? 1 : 0
);

vi.mock('openai', () => ({
  default: class OpenAIMock {
    embeddings = {
      create: vi.fn().mockResolvedValue({
        data: [
          {
            embedding: Array.from({ length: DOCS_EMBEDDING_DIMENSIONS }, (_, index) =>
              index === 0 ? 1 : 0
            )
          }
        ]
      })
    };
  }
}));

/**
 * Builds a tiny serialized docs index for tests.
 */
function buildSampleDocsIndex(): ReturnType<typeof save> {
  const db = create({
    schema: {
      id: 'string',
      source: 'string',
      path: 'string',
      url: 'string',
      title: 'string',
      heading: 'string',
      content: 'string',
      embedding: `vector[${DOCS_EMBEDDING_DIMENSIONS}]`
    }
  });

  insertMultiple(db, [
    {
      id: 'site:features.md#0',
      source: 'site',
      path: 'features.md',
      url: 'https://harborclient.com/features',
      title: 'Features',
      heading: 'Overview',
      content: 'HarborClient supports collections, environments, and scripting.',
      embedding: indexedEmbedding
    }
  ]);

  return save(db);
}

describe('searchDocs', () => {
  beforeEach(async () => {
    vi.resetModules();
    tempRoot = mkdtempSync(join(tmpdir(), 'team-hub-docs-search-'));
    tempIndexPath = join(tempRoot, 'docsSearchIndex.json');
    writeFileSync(tempIndexPath, `${JSON.stringify(buildSampleDocsIndex())}\n`, 'utf8');
    const docsSearch = await import('#/server/docs/docsSearch.js');
    docsSearch.resetDocsSearchCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (tempRoot) {
      rmSync(tempRoot, { recursive: true, force: true });
      tempRoot = '';
    }
  });

  it('returns ranked documentation hits using the hub OpenAI key', async () => {
    const { searchDocs } = await import('#/server/docs/docsSearch.js');

    const hits = await searchDocs(
      { providers: { openai: { apiKey: 'sk-test' } } },
      { searchIndexPath: tempIndexPath },
      { query: 'HarborClient features' }
    );

    expect(hits).toHaveLength(1);
    expect(hits[0]?.title).toBe('Features');
    expect(hits[0]?.url).toBe('https://harborclient.com/features');
  });

  it('throws when the hub has no OpenAI provider key', async () => {
    const { searchDocs } = await import('#/server/docs/docsSearch.js');

    await expect(
      searchDocs({ providers: { claude: { apiKey: 'sk-ant-test' } } }, null, {
        query: 'features'
      })
    ).rejects.toThrow('OpenAI provider is not configured');
  });
});
