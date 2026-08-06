import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MetaAdsConfig } from '../config.js';
import { normalizeAdAccountId, requireAdAccountId } from '../validation.js';
import { listAdAccounts, ACCOUNT_STATUS_LABELS, getCampaigns, getAdSets, getAds, getInsights, getAdCreatives, getCustomAudiences } from '../client.js';
import { formatError } from '../errors.js';
import { tsvDocument, paginate, pageNote } from './format.js';
import { pageSchema, pageCharsSchema } from './read-helpers.js';

function tsvResult(label: string, rows: unknown[], what: string, page?: number, maxChars?: number) {
  const slice = paginate(rows, page ?? 1, maxChars);
  const note = pageNote(slice, what);
  return {
    content: [{
      type: 'text' as const,
      text: tsvDocument(label, slice.rows, note ? [note] : []),
    }],
  };
}

export function registerAccountReadTools(server: McpServer, cfg: MetaAdsConfig) {
  server.tool(
    'list_ad_accounts',
    'List all Meta Ad Accounts accessible to the authenticated user. Returns a tab-separated table.',
    {
      page: pageSchema,
      page_chars: pageCharsSchema,
    },
    async ({ page, page_chars }) => {
      if (!cfg.accessToken) {
        return { content: [{ type: 'text' as const, text: 'Error: Missing access token. Run setup_meta_auth first.' }] };
      }
      try {
        const accounts = await listAdAccounts(cfg);
        const formatted = accounts.map((a) => ({
          id: a.id,
          account_id: a.account_id,
          name: a.name,
          status: ACCOUNT_STATUS_LABELS[a.account_status] || String(a.account_status),
          currency: a.currency,
          timezone: a.timezone_name,
          business_name: a.business_name,
          amount_spent: a.amount_spent,
          balance: a.balance,
        }));
        return tsvResult('ad_accounts', formatted, 'accounts', page, page_chars);
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }] };
      }
    },
  );

  server.tool(
    'get_campaigns',
    'Get campaigns for a Meta Ad Account, optionally filtered by status. Returns a tab-separated table.',
    {
      ad_account_id: z.string().describe('Meta Ad Account ID (e.g. "act_123456" or "123456")'),
      status_filter: z.array(z.string()).optional().describe('Filter by effective status: ACTIVE, PAUSED, ARCHIVED'),
      page: pageSchema,
      page_chars: pageCharsSchema,
    },
    async ({ ad_account_id, status_filter, page, page_chars }) => {
      const validationError = requireAdAccountId(ad_account_id);
      if (validationError) {
        return { content: [{ type: 'text' as const, text: `Error: ${validationError}` }] };
      }
      try {
        const campaigns = await getCampaigns(cfg, normalizeAdAccountId(ad_account_id), status_filter);
        return tsvResult('campaigns', campaigns, 'campaigns', page, page_chars);
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }] };
      }
    },
  );

  server.tool(
    'get_ad_sets',
    'Get ad sets for a Meta Ad Account, optionally filtered by campaign. Returns a tab-separated table.',
    {
      ad_account_id: z.string().describe('Meta Ad Account ID (e.g. "act_123456" or "123456")'),
      campaign_id: z.string().optional().describe('Filter ad sets by campaign ID'),
      page: pageSchema,
      page_chars: pageCharsSchema,
    },
    async ({ ad_account_id, campaign_id, page, page_chars }) => {
      const validationError = requireAdAccountId(ad_account_id);
      if (validationError) {
        return { content: [{ type: 'text' as const, text: `Error: ${validationError}` }] };
      }
      try {
        const adSets = await getAdSets(cfg, normalizeAdAccountId(ad_account_id), campaign_id);
        const formatted = adSets.map((s) => ({
          id: s.id,
          name: s.name,
          campaign_id: s.campaign_id,
          status: s.effective_status,
          configured_status: s.configured_status,
          daily_budget: s.daily_budget,
          lifetime_budget: s.lifetime_budget,
          budget_remaining: s.budget_remaining,
          optimization_goal: s.optimization_goal,
          billing_event: s.billing_event,
          bid_strategy: s.bid_strategy,
          targeting_summary: s.targeting ? {
            age_min: s.targeting.age_min,
            age_max: s.targeting.age_max,
            genders: s.targeting.genders,
            countries: s.targeting.geo_locations?.countries,
            publisher_platforms: s.targeting.publisher_platforms,
            custom_audiences_count: s.targeting.custom_audiences?.length,
          } : undefined,
          start_time: s.start_time,
          end_time: s.end_time,
        }));
        return tsvResult('ad_sets', formatted, 'ad sets', page, page_chars);
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }] };
      }
    },
  );

  server.tool(
    'get_ads',
    'Get ads for a Meta Ad Account, optionally filtered by ad set. Returns a tab-separated table. Filter by ad_set_id on large accounts.',
    {
      ad_account_id: z.string().describe('Meta Ad Account ID (e.g. "act_123456" or "123456")'),
      ad_set_id: z.string().optional().describe('Filter ads by ad set ID'),
      page: pageSchema,
      page_chars: pageCharsSchema,
    },
    async ({ ad_account_id, ad_set_id, page, page_chars }) => {
      const validationError = requireAdAccountId(ad_account_id);
      if (validationError) {
        return { content: [{ type: 'text' as const, text: `Error: ${validationError}` }] };
      }
      try {
        const ads = await getAds(cfg, normalizeAdAccountId(ad_account_id), ad_set_id);
        return tsvResult('ads', ads, 'ads', page, page_chars);
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }] };
      }
    },
  );

  server.tool(
    'get_insights',
    'Get performance insights for a Meta Ads object (account, campaign, ad set, or ad). The object_id can be act_{id} for accounts, or a numeric ID for campaigns/adsets/ads. Returns a tab-separated table; action-keyed metrics (actions, cost_per_action_type, purchase_roas) become one column per action_type.',
    {
      object_id: z.string().describe('Object ID: act_{id} for accounts, or campaign/adset/ad numeric ID'),
      date_preset: z.string().optional().describe('Date preset: today, yesterday, last_7d, last_14d, last_28d, last_30d, last_90d, this_month, last_month, this_quarter, last_quarter, this_year, last_year, maximum'),
      level: z.string().optional().describe('Aggregation level: account, campaign, adset, ad'),
      time_increment: z.string().optional().describe('Time granularity: 1 (daily), 7 (weekly), monthly, all_days'),
      page: pageSchema,
      page_chars: pageCharsSchema,
    },
    async ({ object_id, date_preset, level, time_increment, page, page_chars }) => {
      try {
        const insights = await getInsights(cfg, object_id, {
          datePreset: (date_preset || 'last_30d') as any,
          level: level as any,
          timeIncrement: time_increment,
        });
        return tsvResult('insights', insights, 'insight rows', page, page_chars);
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }] };
      }
    },
  );

  server.tool(
    'get_ad_creatives',
    'Get ad creatives for a Meta Ad Account. Returns a tab-separated table.',
    {
      ad_account_id: z.string().describe('Meta Ad Account ID (e.g. "act_123456" or "123456")'),
      page: pageSchema,
      page_chars: pageCharsSchema,
    },
    async ({ ad_account_id, page, page_chars }) => {
      const validationError = requireAdAccountId(ad_account_id);
      if (validationError) {
        return { content: [{ type: 'text' as const, text: `Error: ${validationError}` }] };
      }
      try {
        const creatives = await getAdCreatives(cfg, normalizeAdAccountId(ad_account_id));
        return tsvResult('ad_creatives', creatives, 'creatives', page, page_chars);
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }] };
      }
    },
  );

  server.tool(
    'get_audiences',
    'Get custom audiences for a Meta Ad Account. Returns a tab-separated table.',
    {
      ad_account_id: z.string().describe('Meta Ad Account ID (e.g. "act_123456" or "123456")'),
      page: pageSchema,
      page_chars: pageCharsSchema,
    },
    async ({ ad_account_id, page, page_chars }) => {
      const validationError = requireAdAccountId(ad_account_id);
      if (validationError) {
        return { content: [{ type: 'text' as const, text: `Error: ${validationError}` }] };
      }
      try {
        const audiences = await getCustomAudiences(cfg, normalizeAdAccountId(ad_account_id));
        return tsvResult('audiences', audiences, 'audiences', page, page_chars);
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }] };
      }
    },
  );
}
