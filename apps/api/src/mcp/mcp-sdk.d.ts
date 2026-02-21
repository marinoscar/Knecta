/**
 * Type declarations for MCP SDK modules
 *
 * The SDK uses package.json exports that are not resolved by TypeScript's
 * "node" moduleResolution. This file provides module declarations that
 * re-export types from the actual CJS distribution.
 */

declare module '@modelcontextprotocol/sdk/server/mcp.js' {
  export { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/dist/cjs/server/mcp';
}

declare module '@modelcontextprotocol/sdk/server/streamableHttp.js' {
  export { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/dist/cjs/server/streamableHttp';
}
