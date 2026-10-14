import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MetaAdsConfig } from '../config.js';
import { readHistory, getHistoryStats } from '../history.js';
import { tableDocument, shapeSchemas, type Row } from './table.js';

export function registerHistoryReadTools(server: McpServer, cfg: MetaAdsConfig) {
  server.tool(
    'get_mutation_history',
    'Past mutations from the local audit log.',
    {
      ad_account_id: z.string().optional(),
      action: z.string().optional().describe('e.g. campaign_create'),
      since: z.string().optional().describe('ISO date'),
      until: z.string().optional().describe('ISO date'),
      success_only: z.boolean().optional().default(false),
      limit: z.number().optional().default(20).describe('Max 200'),
      include_params: z.boolean().optional().describe('Add the full call params, e.g. to replicate a campaign'),
      page: shapeSchemas.page,
    },
    async ({ ad_account_id, action, since, until, success_only, limit, include_params, page }) => {
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
      if (include_params) {
        const lines = entries.map((e) => JSON.stringify({
          timestamp: e.timestamp,
          action: e.action,
          adAccountId: e.adAccountId,
          success: e.success,
          preview: e.preview,
          params: e.params,
          ...(e.error ? { error: e.error } : {}),
          ...(e.batchId ? { batchId: e.batchId } : {}),
        }));
        return { content: [{ type: 'text', text: lines.join('\n') }] };
      }
      const rows: Row[] = entries.map((e) => ({
        time: e.timestamp.replace(/\.\d{3}Z$/, 'Z'),
        action: e.action,
        account_id: e.adAccountId || undefined,
        ok: e.success ? 'yes' : 'no',
        preview: e.preview.split('\n').join(' / '),
        error: e.error,
        batch_id: e.batchId,
        asset_ids: e.assetIds?.length ? e.assetIds.join(' ~ ') : undefined,
      }));
      return { content: [{ type: 'text', text: tableDocument({ title: 'mutation_history', scope: ['newest first'], rows, shape: { page } }) }] };
    },
  );

  server.tool(
    'get_mutation_stats',
    'Summary of past mutations: counts, success rate, per action, recent asset ids.',
    {
      ad_account_id: z.string().optional(),
    },
    async ({ ad_account_id }) => {
      const stats = getHistoryStats(ad_account_id);
      if (stats.total === 0) {
        return { content: [{ type: 'text', text: 'No mutation history yet.' }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(stats) }] };
    },
  );
}
