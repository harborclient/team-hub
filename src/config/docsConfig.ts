import path from 'node:path';
import type { DocsSection } from '#/config/serverConfig.schema.js';

/**
 * Default filesystem path for the bundled documentation search index in Docker.
 */
export const DEFAULT_DOCS_SEARCH_INDEX_PATH = '/app/data/docsSearchIndex.json';

/**
 * Normalized documentation search settings loaded from server.yaml.
 */
export interface DocsConfig {
  /**
   * Absolute or cwd-relative path to the serialized Orama docs index JSON file.
   */
  searchIndexPath: string;
}

/**
 * Resolves a docs index path relative to the process working directory when needed.
 *
 * @param searchIndexPath - Path from server.yaml or the default.
 * @returns Absolute filesystem path to the index file.
 */
export function resolveDocsSearchIndexPath(searchIndexPath: string): string {
  return path.isAbsolute(searchIndexPath)
    ? searchIndexPath
    : path.resolve(process.cwd(), searchIndexPath);
}

/**
 * Converts a validated YAML docs section into normalized runtime config.
 *
 * @param section - Parsed docs section from server.yaml.
 * @returns Normalized docs search settings for route handlers and tools.
 */
export function normalizeDocsConfig(section: DocsSection): DocsConfig {
  const trimmed = section.searchIndexPath?.trim();
  return {
    searchIndexPath: trimmed && trimmed.length > 0 ? trimmed : DEFAULT_DOCS_SEARCH_INDEX_PATH
  };
}
