import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { configFromEnv } from './config.js';
import { registerReadTools } from './tools/read.js';
import { registerWriteTools } from './tools/write.js';
import { registerAuthTools } from './tools/auth.js';
import { withProfile } from './tools/profile.js';
import { serverInstructions } from './tools/instructions.js';
import { compactToolListing } from './tools/compact-listing.js';
import { PLUGIN_VERSION } from './constants.js';

async function main() {
  const cfg = await configFromEnv();
  const server = new McpServer({
    name: 'meta-ads-baby',
    version: PLUGIN_VERSION,
  }, {
    instructions: serverInstructions(cfg),
  });

  const target = withProfile(server, cfg.toolProfile);

  registerAuthTools(target, cfg);
  registerReadTools(target, cfg);
  registerWriteTools(target, cfg);
  compactToolListing(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();
