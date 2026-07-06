/**
 * Prefix for hub-configured MCP tools merged into chat completions.
 */
export const HUB_MCP_TOOL_PREFIX = 'hubmcp__';

/**
 * Builds a prefixed hub MCP tool name for LLM routing.
 *
 * @param serverIndex - Zero-based index in llm.mcp config.
 * @param toolName - Original tool name from the remote server.
 */
export function encodeHubMcpToolName(serverIndex: number, toolName: string): string {
  return `${HUB_MCP_TOOL_PREFIX}${serverIndex}__${toolName}`;
}

/**
 * Parses a prefixed hub MCP tool name into server index and original tool name.
 *
 * @param prefixed - Tool name from an assistant tool call.
 */
export function decodeHubMcpToolName(
  prefixed: string
): { serverIndex: number; toolName: string } | null {
  if (!prefixed.startsWith(HUB_MCP_TOOL_PREFIX)) {
    return null;
  }

  const rest = prefixed.slice(HUB_MCP_TOOL_PREFIX.length);
  const separatorIndex = rest.indexOf('__');
  if (separatorIndex <= 0) {
    return null;
  }

  const serverIndex = Number.parseInt(rest.slice(0, separatorIndex), 10);
  if (!Number.isInteger(serverIndex) || serverIndex < 0) {
    return null;
  }

  const toolName = rest.slice(separatorIndex + 2);
  if (!toolName) {
    return null;
  }

  return { serverIndex, toolName };
}

/**
 * Returns whether a tool name belongs to a hub-configured MCP server.
 *
 * @param name - Tool name from the model.
 */
export function isHubMcpToolName(name: string): boolean {
  return decodeHubMcpToolName(name) !== null;
}
