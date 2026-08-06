import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { configFromEnv } from './config.js';
import { registerReadTools } from './tools/read.js';
import { registerWriteTools } from './tools/write.js';
import { registerAuthTools } from './tools/auth.js';
import { PLUGIN_VERSION } from './constants.js';

async function main() {
  const server = new McpServer({
    name: 'meta-ads-baby',
    version: PLUGIN_VERSION,
  });

  const cfg = await configFromEnv();

  registerAuthTools(server, cfg);
  registerReadTools(server, cfg);
  registerWriteTools(server, cfg);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();
