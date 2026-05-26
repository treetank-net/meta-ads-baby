import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MetaAdsConfig } from '../config.js';
import { readHistory, getHistoryStats } from '../history.js';

export function registerHistoryReadTools(server: McpServer, cfg: MetaAdsConfig) {
  server.tool(
    'get_mutation_history',
    'Browse past mutation operations. Shows what was done, when, with what params (including asset IDs, image URLs, headlines, etc.). Use to replicate previous campaigns or find previously used assets/logos.',
    {
      ad_account_id: z.string().optional().describe('Filter by ad account ID'),
      action: z.string().optional().describe('Filter by action type, e.g. campaign_create, adset_create, ad_create'),
      since: z.string().optional().describe('ISO date/time lower bound, e.g. 2025-01-01'),
      until: z.string().optional().describe('ISO date/time upper bound'),
      success_only: z.boolean().optional().default(false).describe('Only show successful operations'),
      limit: z.number().optional().default(20).describe('Max entries to return (default 20, max 200)'),
    },
    async ({ ad_account_id, action, since, until, success_only, limit }) => {
      const entries = readHistory({
        adAccountId: ad_account_id,
        action,
        since,
        until,
        successOnly: success_only,
        limit: Math.min(limit ?? 20, 200),
      });
      if (!entries.length) {
        return { content: [{ type: 'text', text: 'No mutation history found matching the filters.' }] };
      }
      const formatted = entries.map((e) => ({
        timestamp: e.timestamp,
        action: e.action,
        adAccountId: e.adAccountId,
        success: e.success,
        preview: e.preview,
        params: e.params,
        ...(e.assetIds?.length ? { assetIds: e.assetIds } : {}),
        ...(e.error ? { error: e.error } : {}),
        ...(e.batchId ? { batchId: e.batchId } : {}),
      }));
      return { content: [{ type: 'text', text: JSON.stringify(formatted, null, 2) }] };
    },
  );

  server.tool(
    'get_mutation_stats',
    'Get summary statistics of past mutations: total count, success/fail rate, breakdown by action type, recently used asset IDs.',
    {
      ad_account_id: z.string().optional().describe('Filter stats by ad account ID'),
    },
    async ({ ad_account_id }) => {
      const stats = getHistoryStats(ad_account_id);
      if (stats.total === 0) {
        return { content: [{ type: 'text', text: 'No mutation history yet.' }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }] };
    },
  );
}
