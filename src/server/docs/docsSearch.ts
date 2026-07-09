import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { create, load, search, type AnyOrama } from '@orama/orama';
import OpenAI from 'openai';
import {
  DEFAULT_DOCS_SEARCH_INDEX_PATH,
  resolveDocsSearchIndexPath,
  type DocsConfig
} from '#/config/docsConfig.js';
import type { LlmConfig } from '#/config/llmConfig.js';

/**
 * Embedding model used for docs search queries. Must match harborclient scripts/index-docs.mjs.
 */
export const DOCS_EMBEDDING_MODEL = 'text-embedding-3-small';

/**
 * Embedding vector size for the docs index. Must match harborclient scripts/index-docs.mjs.
 */
export const DOCS_EMBEDDING_DIMENSIONS = 1536;

const DEFAULT_RESULT_LIMIT = 5;
const MAX_RESULT_LIMIT = 10;
const DEFAULT_SIMILARITY = 0.5;
const SNIPPET_MAX_CHARS = 600;

const DOCS_SEARCH_SCHEMA = {
  id: 'string',
  source: 'string',
  path: 'string',
  url: 'string',
  title: 'string',
  heading: 'string',
  content: 'string',
  embedding: `vector[${DOCS_EMBEDDING_DIMENSIONS}]`
} as const;

/**
 * Arguments accepted by the hub-native search_docs tool.
 */
export interface SearchDocsToolArgs {
  /**
   * Natural-language query describing what to find in HarborClient or SDK docs.
   */
  query: string;

  /**
   * Maximum number of documentation passages to return; defaults to 5.
   */
  limit?: number;

  /**
   * Restrict results to site user docs or SDK plugin docs.
   */
  source?: 'site' | 'sdk';
}

/**
 * One ranked documentation hit returned to the AI assistant.
 */
export interface DocsSearchHit {
  /** Page title from the indexed document. */
  title: string;
  /** Section heading within the page. */
  heading: string;
  /** Public documentation URL. */
  url: string;
  /** Documentation source repository: site or sdk. */
  source: string;
  /** Repo-relative markdown path. */
  path: string;
  /** Orama vector similarity score. */
  score: number;
  /** Truncated passage text from the matched chunk. */
  snippet: string;
}

type DocsSearchDocument = {
  id: string;
  source: string;
  path: string;
  url: string;
  title: string;
  heading: string;
  content: string;
  embedding: number[];
};

let cachedDb: AnyOrama | null = null;
let indexUnavailable = false;

/**
 * Candidate filesystem paths for the bundled documentation search index.
 *
 * @param docsConfig - Optional docs section from server.yaml.
 * @returns Absolute paths to try in priority order.
 */
export function getDocsSearchIndexPaths(docsConfig: DocsConfig | null): string[] {
  const paths = new Set<string>();

  if (docsConfig?.searchIndexPath) {
    paths.add(resolveDocsSearchIndexPath(docsConfig.searchIndexPath));
  }

  paths.add(DEFAULT_DOCS_SEARCH_INDEX_PATH);
  paths.add(path.resolve(process.cwd(), 'data/docsSearchIndex.json'));

  return [...paths];
}

/**
 * Clears the lazy-loaded docs search index cache (for tests).
 */
export function resetDocsSearchCache(): void {
  cachedDb = null;
  indexUnavailable = false;
}

/**
 * Returns whether the docs search index file exists on disk.
 *
 * @param docsConfig - Optional docs section from server.yaml.
 */
export function isDocsSearchIndexAvailable(docsConfig: DocsConfig | null): boolean {
  return getDocsSearchIndexPaths(docsConfig).some((candidate) => existsSync(candidate));
}

/**
 * Truncates long passage text for compact tool responses.
 *
 * @param content - Full chunk content from the index.
 * @param maxChars - Maximum characters to retain.
 */
function truncateSnippet(content: string, maxChars = SNIPPET_MAX_CHARS): string {
  if (content.length <= maxChars) {
    return content;
  }
  return `${content.slice(0, maxChars)}...`;
}

/**
 * Clamps the requested result limit to a safe default and maximum.
 *
 * @param limit - Optional limit from tool arguments.
 */
function clampResultLimit(limit: number | undefined): number {
  if (limit == null || !Number.isFinite(limit)) {
    return DEFAULT_RESULT_LIMIT;
  }
  return Math.min(Math.max(1, Math.floor(limit)), MAX_RESULT_LIMIT);
}

/**
 * Loads and caches the serialized Orama documentation index.
 *
 * @param docsConfig - Optional docs section from server.yaml.
 * @param paths - Optional path override list for tests.
 */
function loadDocsSearchIndex(docsConfig: DocsConfig | null, paths?: string[]): AnyOrama {
  if (cachedDb != null) {
    return cachedDb;
  }

  if (indexUnavailable) {
    throw new Error(
      'Documentation search index is not available. Deploy docsSearchIndex.json to the Team Hub server.'
    );
  }

  const candidates = paths ?? getDocsSearchIndexPaths(docsConfig);
  const catalogPath = candidates.find((candidate) => existsSync(candidate));
  if (catalogPath == null) {
    indexUnavailable = true;
    throw new Error(
      'Documentation search index is not available. Deploy docsSearchIndex.json to the Team Hub server.'
    );
  }

  const raw = JSON.parse(readFileSync(catalogPath, 'utf8')) as Parameters<typeof load>[1];
  const db = create({ schema: DOCS_SEARCH_SCHEMA });
  load(db, raw);
  cachedDb = db;
  return db;
}

/**
 * Embeds a user query with the same model used to build the docs index.
 *
 * @param query - Raw search text from the AI tool.
 * @param apiKey - OpenAI API key from server.yaml llm.providers.openai.
 */
async function embedDocsQuery(query: string, apiKey: string): Promise<number[]> {
  const client = new OpenAI({ apiKey });
  const response = await client.embeddings.create({
    model: DOCS_EMBEDDING_MODEL,
    input: query
  });

  const embedding = response.data[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length !== DOCS_EMBEDDING_DIMENSIONS) {
    throw new Error('Unexpected embedding size from OpenAI.');
  }

  return embedding;
}

/**
 * Runs vector search over the bundled documentation index using the hub OpenAI key.
 *
 * @param llmConfig - Hub LLM configuration with provider API keys.
 * @param docsConfig - Optional docs section with index path overrides.
 * @param args - Tool arguments with query text and optional limit/source filter.
 * @returns Ranked documentation hits for the assistant.
 */
export async function searchDocs(
  llmConfig: LlmConfig,
  docsConfig: DocsConfig | null,
  args: SearchDocsToolArgs
): Promise<DocsSearchHit[]> {
  const query = args.query?.trim();
  if (!query) {
    throw new Error('query is required.');
  }

  const apiKey = llmConfig.providers.openai?.apiKey.trim();
  if (!apiKey) {
    throw new Error(
      'OpenAI provider is not configured on this Team Hub. Documentation search requires an OpenAI API key.'
    );
  }

  const db = loadDocsSearchIndex(docsConfig);
  const embedding = await embedDocsQuery(query, apiKey);
  const limit = clampResultLimit(args.limit);

  const results = search(db, {
    mode: 'vector',
    vector: {
      value: embedding,
      property: 'embedding'
    },
    similarity: DEFAULT_SIMILARITY,
    limit,
    ...(args.source != null ? { where: { source: args.source } } : {})
  });

  const resolved = results instanceof Promise ? await results : results;

  return resolved.hits.map((hit) => {
    const document = hit.document as DocsSearchDocument;
    return {
      title: document.title,
      heading: document.heading,
      url: document.url,
      source: document.source,
      path: document.path,
      score: hit.score,
      snippet: truncateSnippet(document.content)
    };
  });
}
