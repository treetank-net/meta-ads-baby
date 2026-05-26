import type { MetaAdsConfig } from '../config.js';
import { get, getAll, post } from './core.js';

export interface Campaign {
  id: string;
  name: string;
  objective: string;
  status: string;
  configured_status: string;
  effective_status: string;
  daily_budget?: string;
  lifetime_budget?: string;
  budget_remaining?: string;
  bid_strategy?: string;
  buying_type?: string;
  special_ad_categories?: string[];
  spend_cap?: string;
  start_time?: string;
  stop_time?: string;
  created_time?: string;
  updated_time?: string;
}

const CAMPAIGN_FIELDS = [
  'id', 'name', 'objective', 'status', 'configured_status', 'effective_status',
  'daily_budget', 'lifetime_budget', 'budget_remaining', 'bid_strategy',
  'buying_type', 'special_ad_categories', 'spend_cap',
  'start_time', 'stop_time', 'created_time', 'updated_time',
].join(',');

export async function getCampaigns(cfg: MetaAdsConfig, adAccountId: string, statusFilter?: string[]): Promise<Campaign[]> {
  const params: Record<string, unknown> = { fields: CAMPAIGN_FIELDS, limit: '200' };
  if (statusFilter?.length) {
    params['filtering'] = [{ field: 'effective_status', operator: 'IN', value: statusFilter }];
  }
  return getAll<Campaign>(cfg, `/act_${adAccountId}/campaigns`, params);
}

export async function getCampaign(cfg: MetaAdsConfig, campaignId: string): Promise<Campaign> {
  return get<Campaign>(cfg, `/${campaignId}`, { fields: CAMPAIGN_FIELDS });
}

export interface CreateCampaignParams {
  name: string;
  objective: string;
  status?: string;
  special_ad_categories?: string[];
  daily_budget?: string;
  lifetime_budget?: string;
  bid_strategy?: string;
  spend_cap?: string;
  start_time?: string;
  stop_time?: string;
}

export async function createCampaign(cfg: MetaAdsConfig, adAccountId: string, params: CreateCampaignParams): Promise<{ id: string }> {
  return post<{ id: string }>(cfg, `/act_${adAccountId}/campaigns`, {
    ...params,
    status: params.status || 'PAUSED',
    special_ad_categories: params.special_ad_categories || ['NONE'],
  });
}

export async function updateCampaign(cfg: MetaAdsConfig, campaignId: string, params: Record<string, unknown>): Promise<{ success: boolean }> {
  return post<{ success: boolean }>(cfg, `/${campaignId}`, params);
}

export async function cloneCampaign(cfg: MetaAdsConfig, sourceCampaignId: string, nameOverride?: string): Promise<{ copied_campaign_id: string }> {
  const params: Record<string, unknown> = { status_option: 'PAUSED' };
  if (nameOverride) params['rename_options'] = { rename_suffix: ` - ${nameOverride}` };
  return post<{ copied_campaign_id: string }>(cfg, `/${sourceCampaignId}/copies`, params);
}
