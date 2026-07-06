import type { LlmSection } from '#/config/serverConfig.schema.js';

/**
 * Raw MCP headers value from server.yaml before normalization.
 */
type HubMcpHeadersInput = NonNullable<NonNullable<LlmSection['mcp']>[number]['headers']>;

/**
 * Supported LLM providers exposed by Team Hub.
 */
export type LlmProvider = 'openai' | 'claude' | 'gemini';

/**
 * HTTP header row for hub MCP server connections.
 */
export interface HubMcpHeader {
  /**
   * Header name.
   */
  key: string;

  /**
   * Header value.
   */
  value: string;
}

/**
 * One MCP server configured under llm.mcp in server.yaml.
 */
export interface HubMcpServerConfig {
  /**
   * Display name for logs and diagnostics.
   */
  name: string;

  /**
   * MCP server URL (Streamable HTTP or legacy SSE endpoint).
   */
  url: string;

  /**
   * Optional HTTP headers sent with MCP client requests.
   */
  headers: HubMcpHeader[];
}

/**
 * Normalized LLM configuration loaded from server.yaml.
 */
export interface LlmConfig {
  /**
   * Provider API keys configured on the hub.
   */
  providers: Partial<Record<LlmProvider, { apiKey: string }>>;

  /**
   * Optional allow-list of model ids the hub offers; when omitted, all catalog
   * models whose provider has a key are offered.
   */
  models?: string[];

  /**
   * Optional MCP servers the hub agent may call during chat steps.
   */
  mcp?: HubMcpServerConfig[];
}

/**
 * Converts one header object with a single key into a normalized header row.
 *
 * @param record - Object whose keys are header names.
 */
function headerRowsFromSingleKeyObject(record: Record<string, string>): HubMcpHeader[] {
  const rows: HubMcpHeader[] = [];
  for (const [key, value] of Object.entries(record)) {
    const trimmedKey = key.trim();
    if (trimmedKey.length > 0) {
      rows.push({ key: trimmedKey, value: String(value) });
    }
  }
  return rows;
}

/**
 * Normalizes MCP server headers from flexible YAML shapes into key/value rows.
 *
 * @param headers - Raw headers from server.yaml.
 */
export function normalizeHubMcpHeaders(headers: HubMcpHeadersInput | undefined): HubMcpHeader[] {
  if (!headers) {
    return [];
  }

  if (!Array.isArray(headers)) {
    return headerRowsFromSingleKeyObject(headers);
  }

  const rows: HubMcpHeader[] = [];
  for (const item of headers) {
    if (Array.isArray(item)) {
      for (const nested of item) {
        rows.push(...headerRowsFromSingleKeyObject(nested));
      }
      continue;
    }

    rows.push(...headerRowsFromSingleKeyObject(item));
  }

  return rows;
}

/**
 * Converts a validated YAML llm section into normalized runtime config.
 *
 * @param section - Parsed llm section from server.yaml.
 * @returns Normalized LLM config for route handlers and the provider client.
 */
export function normalizeLlmConfig(section: LlmSection): LlmConfig {
  const providers: LlmConfig['providers'] = {};

  if (section.providers.openai?.apiKey) {
    providers.openai = { apiKey: section.providers.openai.apiKey };
  }
  if (section.providers.claude?.apiKey) {
    providers.claude = { apiKey: section.providers.claude.apiKey };
  }
  if (section.providers.gemini?.apiKey) {
    providers.gemini = { apiKey: section.providers.gemini.apiKey };
  }

  const mcp =
    section.mcp && section.mcp.length > 0
      ? section.mcp.map((entry) => ({
          name: entry.name.trim(),
          url: entry.url.trim().replace(/\/+$/, ''),
          headers: normalizeHubMcpHeaders(entry.headers)
        }))
      : undefined;

  return {
    providers,
    ...(section.models && section.models.length > 0 ? { models: section.models } : {}),
    ...(mcp && mcp.length > 0 ? { mcp } : {})
  };
}
