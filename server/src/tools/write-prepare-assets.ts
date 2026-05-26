import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MetaAdsConfig } from '../config.js';
import { normalizeAdAccountId } from '../validation.js';
import { createToken } from '../confirm.js';
import { validateAdAccount, prepareResponse } from './write-helpers.js';
import { adAccountIdSchema, safeWordSchema } from './write-schemas.js';

export function registerAssetPrepareTools(server: McpServer, cfg: MetaAdsConfig): void {
  server.tool(
    'prepare_lookalike_audience',
    'Prepare creation of a Meta lookalike audience from an existing custom audience. Returns a preview and confirmation token. The user MUST confirm before the audience is created.',
    {
      ad_account_id: adAccountIdSchema,
      name: z.string().min(1).describe('Lookalike audience name'),
      origin_audience_id: z.string().describe('Source custom audience ID to base the lookalike on'),
      country: z.string().length(2).describe('Two-letter country code for the lookalike audience (e.g. US, PL, DE)'),
      ratio: z.number().min(0.01).max(0.20).describe('Lookalike ratio (0.01 = top 1%, 0.20 = top 20%)'),
      safe_word: safeWordSchema,
    },
    async ({ ad_account_id, name, origin_audience_id, country, ratio, safe_word }) => {
      const accountError = validateAdAccount(ad_account_id);
      if (accountError) return accountError;
      const normalizedAccountId = normalizeAdAccountId(ad_account_id);
      const lines = [
        `Create lookalike audience "${name}" on account ${normalizedAccountId}`,
        `Source audience: ${origin_audience_id}`,
        `Country: ${country}`,
        `Ratio: ${(ratio * 100).toFixed(0)}% (top ${(ratio * 100).toFixed(0)}% similarity)`,
      ];
      const preview = lines.join('\n');
      const mutation = createToken('lookalike_audience_create', {
        ad_account_id: normalizedAccountId,
        name,
        origin_audience_id,
        country,
        ratio,
      }, preview, safe_word.trim());
      return prepareResponse(cfg, mutation, preview);
    },
  );
}
