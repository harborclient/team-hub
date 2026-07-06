import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { HubMcpHeader, LlmConfig } from '#/config/llmConfig.js';
import type { LlmToolDefinition } from '#/server/llm/client.js';
import { decodeHubMcpToolName, encodeHubMcpToolName } from '#/server/llm/hubMcpToolNames.js';

/**
 * OpenAI-compatible tool definition returned to the LLM provider.
 */
export interface HubMcpOpenAiTool extends LlmToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

interface ConnectedHubMcpClient {
  serverIndex: number;
  client: Client;
  remoteTools: Tool[];
}

const connectedClients = new Map<number, ConnectedHubMcpClient>();
let activeConfigSignature = '';

/**
 * Builds HTTP headers for one hub MCP connection.
 *
 * @param headers - Normalized header rows from config.
 */
function buildRequestHeaders(headers: HubMcpHeader[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const row of headers) {
    if (row.key.trim()) {
      result[row.key.trim()] = row.value;
    }
  }
  return result;
}

/**
 * Serializes llm.mcp for connection cache comparisons.
 *
 * @param config - Hub LLM configuration.
 */
function buildMcpConfigSignature(config: LlmConfig): string {
  return JSON.stringify(config.mcp ?? []);
}

/**
 * Flattens MCP callTool content into a JSON string for the agent loop.
 *
 * @param content - MCP tool result content array.
 */
function flattenMcpToolContent(content: unknown): string {
  if (!Array.isArray(content)) {
    return JSON.stringify(content ?? null);
  }

  const parts = content.map((item) => {
    if (!item || typeof item !== 'object') {
      return String(item);
    }

    const record = item as { type?: string; text?: string; uri?: string };
    if (record.type === 'text' && typeof record.text === 'string') {
      return record.text;
    }

    if (record.type === 'resource' && typeof record.uri === 'string') {
      return record.uri;
    }

    return JSON.stringify(record);
  });

  return parts.join('\n');
}

/**
 * Converts remote MCP tool metadata into an OpenAI function tool definition.
 *
 * @param serverIndex - Zero-based index in llm.mcp.
 * @param tool - Tool metadata from tools/list.
 */
function toOpenAiTool(serverIndex: number, tool: Tool): HubMcpOpenAiTool {
  return {
    type: 'function',
    function: {
      name: encodeHubMcpToolName(serverIndex, tool.name),
      description: tool.description ?? `MCP tool ${tool.name}`,
      parameters: (tool.inputSchema as Record<string, unknown> | undefined) ?? {
        type: 'object',
        properties: {},
        additionalProperties: true
      }
    }
  };
}

/**
 * Connects to one configured hub MCP server and caches its tools.
 *
 * @param serverIndex - Zero-based index in llm.mcp.
 * @param server - MCP server configuration entry.
 */
async function connectHubMcpServer(
  serverIndex: number,
  server: NonNullable<LlmConfig['mcp']>[number]
): Promise<ConnectedHubMcpClient> {
  const headers = buildRequestHeaders(server.headers);
  const url = new URL(server.url);

  const client = new Client(
    {
      name: 'team-hub',
      version: '1.0.0'
    },
    {}
  );

  let transport: StreamableHTTPClientTransport | SSEClientTransport;
  try {
    transport = new StreamableHTTPClientTransport(url, {
      requestInit: { headers }
    });
    await client.connect(transport);
  } catch {
    transport = new SSEClientTransport(url, {
      requestInit: { headers }
    });
    await client.connect(transport);
  }

  const { tools } = await client.listTools();

  return {
    serverIndex,
    client,
    remoteTools: tools
  };
}

/**
 * Reconciles cached MCP connections with the current llm.mcp configuration.
 *
 * @param config - Hub LLM configuration.
 */
export async function ensureHubMcpConnections(config: LlmConfig): Promise<void> {
  const servers = config.mcp ?? [];
  const signature = buildMcpConfigSignature(config);

  if (signature !== activeConfigSignature) {
    await disposeHubMcpConnections();
    activeConfigSignature = signature;
  }

  if (servers.length === 0) {
    return;
  }

  for (const [index, server] of servers.entries()) {
    if (connectedClients.has(index)) {
      continue;
    }

    try {
      const connected = await connectHubMcpServer(index, server);
      connectedClients.set(index, connected);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      console.warn(`Hub MCP server "${server.name}" failed to connect: ${message}`);
    }
  }
}

/**
 * Lists hub MCP tools in OpenAI chat completion format.
 *
 * Call {@link ensureHubMcpConnections} first so the connection cache is populated.
 */
export function listHubMcpTools(): HubMcpOpenAiTool[] {
  const tools: HubMcpOpenAiTool[] = [];

  for (const entry of connectedClients.values()) {
    for (const tool of entry.remoteTools) {
      tools.push(toOpenAiTool(entry.serverIndex, tool));
    }
  }

  return tools;
}

/**
 * Invokes one prefixed hub MCP tool on the matching remote server.
 *
 * @param prefixedName - Tool name with hubmcp__ prefix from the model.
 * @param args - Parsed tool arguments object.
 */
export async function callHubMcpTool(prefixedName: string, args: unknown): Promise<string> {
  const decoded = decodeHubMcpToolName(prefixedName);
  if (!decoded) {
    return JSON.stringify({ error: `Unknown hub MCP tool: ${prefixedName}` });
  }

  const entry = connectedClients.get(decoded.serverIndex);
  if (!entry) {
    return JSON.stringify({ error: `Hub MCP server ${decoded.serverIndex} is not connected.` });
  }

  try {
    const result = await entry.client.callTool({
      name: decoded.toolName,
      arguments: (args ?? {}) as Record<string, unknown>
    });

    if (result.isError) {
      return JSON.stringify({
        error: flattenMcpToolContent(result.content)
      });
    }

    return flattenMcpToolContent(result.content);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'MCP tool execution failed.';
    return JSON.stringify({ error: message });
  }
}

/**
 * Closes all hub MCP client connections.
 */
export async function disposeHubMcpConnections(): Promise<void> {
  const closePromises = [...connectedClients.values()].map(async (entry) => {
    try {
      await entry.client.close();
    } catch {
      // Ignore close errors during teardown.
    }
  });

  connectedClients.clear();
  activeConfigSignature = '';
  await Promise.allSettled(closePromises);
}
