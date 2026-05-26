import type { MetaAdsConfig } from '../config.js';
import { get, getAll } from './core.js';

export interface InsightRow {
  impressions?: string;
  clicks?: string;
  spend?: string;
  reach?: string;
  frequency?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  cpp?: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
  cost_per_action_type?: Array<{ action_type: string; value: string }>;
  purchase_roas?: Array<{ action_type: string; value: string }>;
  quality_ranking?: string;
  engagement_rate_ranking?: string;
  conversion_rate_ranking?: string;
  account_currency?: string;
  account_id?: string;
  account_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  date_start?: string;
  date_stop?: string;
  objective?: string;
}

const DEFAULT_INSIGHT_FIELDS = [
  'impressions', 'clicks', 'spend', 'reach', 'frequency',
  'ctr', 'cpc', 'cpm', 'actions', 'cost_per_action_type',
  'purchase_roas', 'quality_ranking', 'engagement_rate_ranking',
  'conversion_rate_ranking', 'campaign_id', 'campaign_name',
  'adset_id', 'adset_name', 'ad_id', 'ad_name',
  'date_start', 'date_stop', 'objective', 'account_currency',
].join(',');

export type DatePreset =
  | 'today' | 'yesterday' | 'last_3d' | 'last_7d' | 'last_14d'
  | 'last_28d' | 'last_30d' | 'last_90d'
  | 'this_week_mon_today' | 'this_week_sun_today'
  | 'last_week_mon_sun' | 'last_week_sun_sat'
  | 'this_month' | 'last_month'
  | 'this_quarter' | 'last_quarter'
  | 'this_year' | 'last_year'
  | 'maximum';

export type InsightLevel = 'account' | 'campaign' | 'adset' | 'ad';

export interface GetInsightsParams {
  datePreset?: DatePreset;
  timeRange?: { since: string; until: string };
  level?: InsightLevel;
  fields?: string;
  timeIncrement?: string;
  limit?: number;
}

export async function getInsights(
  cfg: MetaAdsConfig,
  objectId: string,
  params?: GetInsightsParams,
): Promise<InsightRow[]> {
  const reqParams: Record<string, unknown> = {
    fields: params?.fields || DEFAULT_INSIGHT_FIELDS,
    limit: String(params?.limit || 100),
  };

  if (params?.datePreset) reqParams['date_preset'] = params.datePreset;
  if (params?.timeRange) reqParams['time_range'] = params.timeRange;
  if (params?.level) reqParams['level'] = params.level;
  if (params?.timeIncrement) reqParams['time_increment'] = params.timeIncrement;

  return getAll<InsightRow>(cfg, `/${objectId}/insights`, reqParams);
}

export async function getAccountInsights(
  cfg: MetaAdsConfig,
  adAccountId: string,
  params?: GetInsightsParams,
): Promise<InsightRow[]> {
  return getInsights(cfg, `act_${adAccountId}`, params);
}
