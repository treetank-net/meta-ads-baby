import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MetaAdsConfig } from '../config.js';
import { registerAccountReadTools } from './read-accounts.js';
import { registerHistoryReadTools } from './read-history.js';

export function registerReadTools(server: McpServer, cfg: MetaAdsConfig) {
  registerAccountReadTools(server, cfg);
  registerHistoryReadTools(server, cfg);
}
