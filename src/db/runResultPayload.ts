import type { RunResultKind, RunResultSummaryCounts } from '#/db/types.js';

/**
 * Parsed metadata extracted from a HarborClient run-results export payload.
 */
export interface ParsedRunResultPayload {
  /**
   * Export discriminator for collection-wide or single-request runs.
   */
  kind: RunResultKind;

  /**
   * Collection display name captured in the export, when present.
   */
  collectionName: string | null;

  /**
   * Request display name captured in the export, when present.
   */
  requestName: string | null;

  /**
   * Pass/fail/skip counts derived from export result rows.
   */
  summary: RunResultSummaryCounts;
}

/**
 * Returns whether a value is a plain object record.
 *
 * @param value - Candidate payload fragment.
 * @returns True when the value is a non-null object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Derives pass/fail/skip counts from HarborClient runner result rows.
 *
 * @param results - Result rows from the export payload.
 * @returns Summary counts for persistence and list views.
 */
function summarizeResultRows(results: unknown[]): RunResultSummaryCounts {
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of results) {
    if (!isRecord(row)) {
      continue;
    }
    const status = row.status;
    if (status === 'passed') {
      passed += 1;
    } else if (status === 'failed') {
      failed += 1;
    } else if (status === 'skipped') {
      skipped += 1;
    }
  }

  return { passed, failed, skipped };
}

/**
 * Builds a default label from parsed run-result metadata.
 *
 * @param metadata - Parsed payload metadata.
 * @returns Short human-readable label for list rows.
 */
export function buildDefaultRunResultLabel(metadata: ParsedRunResultPayload): string {
  const target = metadata.requestName ?? metadata.collectionName ?? 'Run';
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  return `${target} — ${timestamp}`;
}

/**
 * Validates and extracts metadata from a HarborClient run-results export payload.
 *
 * @param payload - Raw JSON payload submitted by HarborClient.
 * @returns Parsed kind, names, and summary counts.
 * @throws {Error} When required export fields are missing or invalid.
 */
export function parseRunResultPayload(payload: Record<string, unknown>): ParsedRunResultPayload {
  const kind = payload.harborclientExport;
  if (kind !== 'collection-run-results' && kind !== 'request-run-results') {
    throw new Error('Invalid run result payload: harborclientExport is required');
  }

  const results = payload.results;
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error('Invalid run result payload: results are required');
  }

  const collection = isRecord(payload.collection) ? payload.collection : undefined;
  const request = isRecord(payload.request) ? payload.request : undefined;

  return {
    kind,
    collectionName: typeof collection?.name === 'string' ? collection.name : null,
    requestName: typeof request?.name === 'string' ? request.name : null,
    summary: summarizeResultRows(results)
  };
}
