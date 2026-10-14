import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MetaAdsConfig } from '../config.js';
import { normalizeAdAccountId, requireAdAccountId } from '../validation.js';
import { listAdAccounts, getAccountCurrency, getCampaigns, getAdSets, getAds, getInsights, getAdCreatives, getCustomAudiences } from '../client.js';
import { formatError } from '../errors.js';
import { DEFAULT_MAX_PAGES, FILE_MAX_PAGES } from '../client/core.js';
import { tableDocument, tableError, shapeSchemas, listShapeSchemas, type Row, type Shape } from './table.js';
import {
  accountRow, ACCOUNT_COLUMNS, ACCOUNT_DEFAULT,
  campaignRow, CAMPAIGN_COLUMNS, CAMPAIGN_DEFAULT,
  adSetRow, AD_SET_COLUMNS, AD_SET_DEFAULT,
  adRow, AD_COLUMNS, AD_DEFAULT,
  creativeRow, CREATIVE_COLUMNS, CREATIVE_DEFAULT,
  audienceRow, AUDIENCE_COLUMNS, AUDIENCE_DEFAULT,
} from './graph-rows.js';
import { tokenError, textResult, cappedNote, buildInsightQuery, insightsDocument, type InsightArgs } from './read-helpers.js';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function accountGuard(cfg: MetaAdsConfig, adAccountId: string) {
  const missing = tokenError(cfg);
  if (missing) return missing;
  const validationError = requireAdAccountId(adAccountId);
  return validationError ? textResult(`Error: ${validationError}`) : null;
}

function maxPages(shape: Shape): number {
  return shape.output === 'file' ? FILE_MAX_PAGES : DEFAULT_MAX_PAGES;
}

function failure(err: unknown) {
  return textResult(tableError(err) ?? formatError(err));
}

interface ListSpec {
  title: string;
  scope: string[];
  currency?: string;
  rows: Row[];
  known: string[];
  defaults: string[];
  shape: Shape;
  notes: string[];
}

function listDocument(spec: ListSpec) {
  return textResult(tableDocument({
    title: spec.title,
    scope: spec.scope,
    currency: spec.currency,
    rows: spec.rows,
    shape: spec.shape,
    known: spec.known,
    defaultFields: spec.defaults,
    extraNotes: spec.notes,
  }));
}

export function registerAccountReadTools(server: McpServer, cfg: MetaAdsConfig) {
  server.tool(
    'list_ad_accounts',
    'Ad accounts the user can access, with currency, timezone and amount spent.',
    { ...listShapeSchemas },
    async (shape) => {
      const missing = tokenError(cfg);
      if (missing) return missing;
      try {
        const accounts = await listAdAccounts(cfg, maxPages(shape));
        return listDocument({ title: 'ad_accounts', scope: [], rows: accounts.map(accountRow), known: ACCOUNT_COLUMNS, defaults: ACCOUNT_DEFAULT, shape, notes: cappedNote(accounts) });
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.tool(
    'get_campaigns',
    'Campaigns of an ad account with effective status, objective and budgets.',
    {
      ad_account_id: z.string(),
      status_filter: z.array(z.string()).optional().describe('Effective statuses, e.g. ACTIVE, PAUSED'),
      ...listShapeSchemas,
    },
    async ({ ad_account_id, status_filter, ...shape }) => {
      const guard = accountGuard(cfg, ad_account_id);
      if (guard) return guard;
      try {
        const id = normalizeAdAccountId(ad_account_id);
        const [campaigns, currency] = await Promise.all([getCampaigns(cfg, id, status_filter, maxPages(shape)), getAccountCurrency(cfg, id)]);
        const scope = [`act_${id}`, ...(status_filter?.length ? [`status in ${status_filter.join(',')}`] : [])];
        return listDocument({ title: 'campaigns', scope, currency, rows: campaigns.map((c) => campaignRow(c, currency)), known: CAMPAIGN_COLUMNS, defaults: CAMPAIGN_DEFAULT, shape, notes: cappedNote(campaigns) });
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.tool(
    'get_ad_sets',
    'Ad sets of an account or campaign with budget, optimization goal and targeting summary.',
    {
      ad_account_id: z.string(),
      campaign_id: z.string().optional(),
      ...listShapeSchemas,
    },
    async ({ ad_account_id, campaign_id, ...shape }) => {
      const guard = accountGuard(cfg, ad_account_id);
      if (guard) return guard;
      try {
        const id = normalizeAdAccountId(ad_account_id);
        const [adSets, currency] = await Promise.all([getAdSets(cfg, id, campaign_id, maxPages(shape)), getAccountCurrency(cfg, id)]);
        const scope = [`act_${id}`, ...(campaign_id ? [`campaign ${campaign_id}`] : [])];
        return listDocument({ title: 'ad_sets', scope, currency, rows: adSets.map((s) => adSetRow(s, currency)), known: AD_SET_COLUMNS, defaults: AD_SET_DEFAULT, shape, notes: cappedNote(adSets) });
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.tool(
    'get_ads',
    'Ads of an account or ad set with effective status and creative id.',
    {
      ad_account_id: z.string(),
      ad_set_id: z.string().optional(),
      ...listShapeSchemas,
    },
    async ({ ad_account_id, ad_set_id, ...shape }) => {
      const guard = accountGuard(cfg, ad_account_id);
      if (guard) return guard;
      try {
        const id = normalizeAdAccountId(ad_account_id);
        const ads = await getAds(cfg, id, ad_set_id, maxPages(shape));
        const scope = [`act_${id}`, ...(ad_set_id ? [`ad set ${ad_set_id}`] : [])];
        return listDocument({ title: 'ads', scope, rows: ads.map(adRow), known: AD_COLUMNS, defaults: AD_DEFAULT, shape, notes: cappedNote(ads) });
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.tool(
    'get_insights',
    'Performance of an account, campaign, ad set or ad: spend, delivery, clicks and selected conversions, with totals.',
    {
      object_id: z.string().describe('act_<id> for an account, or a campaign, ad set or ad id'),
      date_preset: z.string().optional().describe('Default last_30d; e.g. last_7d, this_month, last_month, maximum'),
      time_range: z.object({ since: dateSchema, until: dateSchema }).optional().describe('YYYY-MM-DD; overrides date_preset'),
      level: z.enum(['account', 'campaign', 'adset', 'ad']).optional().describe('One row per entity at this level'),
      time_increment: z.string().optional().describe('1 = daily, 7 = weekly, monthly'),
      action_types: z.array(z.string()).optional().describe('Default omni_purchase, lead, omni_add_to_cart, landing_page_view, link_click; ["all"] for every'),
      ...shapeSchemas,
    },
    async (args) => {
      const missing = tokenError(cfg);
      if (missing) return missing;
      const query = buildInsightQuery(args as InsightArgs);
      if (typeof query === 'string') return textResult(`Error: ${query}`);
      try {
        const raw = await getInsights(cfg, args.object_id.trim(), {
          datePreset: query.datePreset as never,
          timeRange: query.timeRange,
          level: args.level,
          timeIncrement: args.time_increment,
          fields: query.apiFields,
          limit: 500,
          maxPages: maxPages(args),
        });
        return textResult(insightsDocument(args as InsightArgs, query, raw));
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.tool(
    'get_ad_creatives',
    'Ad creatives of an ad account: format, copy, CTA and media ids.',
    {
      ad_account_id: z.string(),
      ...listShapeSchemas,
    },
    async ({ ad_account_id, ...shape }) => {
      const guard = accountGuard(cfg, ad_account_id);
      if (guard) return guard;
      try {
        const id = normalizeAdAccountId(ad_account_id);
        const creatives = await getAdCreatives(cfg, id, maxPages(shape));
        return listDocument({ title: 'ad_creatives', scope: [`act_${id}`], rows: creatives.map(creativeRow), known: CREATIVE_COLUMNS, defaults: CREATIVE_DEFAULT, shape, notes: cappedNote(creatives) });
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.tool(
    'get_audiences',
    'Custom and lookalike audiences of an ad account with size estimates.',
    {
      ad_account_id: z.string(),
      ...listShapeSchemas,
    },
    async ({ ad_account_id, ...shape }) => {
      const guard = accountGuard(cfg, ad_account_id);
      if (guard) return guard;
      try {
        const id = normalizeAdAccountId(ad_account_id);
        const audiences = await getCustomAudiences(cfg, id, maxPages(shape));
        return listDocument({ title: 'audiences', scope: [`act_${id}`], rows: audiences.map(audienceRow), known: AUDIENCE_COLUMNS, defaults: AUDIENCE_DEFAULT, shape, notes: cappedNote(audiences) });
      } catch (err) {
        return failure(err);
      }
    },
  );
}
