import type { MetaAdsConfig } from '../config.js';
import { get, getAll, post } from './core.js';

export interface Targeting {
  age_min?: number;
  age_max?: number;
  genders?: number[];
  geo_locations?: {
    countries?: string[];
    regions?: Array<{ key: string }>;
    cities?: Array<{ key: string; radius: number; distance_unit: string }>;
    location_types?: string[];
  };
  publisher_platforms?: string[];
  facebook_positions?: string[];
  instagram_positions?: string[];
  device_platforms?: string[];
  flexible_spec?: Array<{ interests?: Array<{ id: string; name: string }> }>;
  custom_audiences?: Array<{ id: string }>;
  excluded_custom_audiences?: Array<{ id: string }>;
  locales?: number[];
}

export interface AdSet {
  id: string;
  name: string;
  campaign_id: string;
  status: string;
  configured_status: string;
  effective_status: string;
  daily_budget?: string;
  lifetime_budget?: string;
  budget_remaining?: string;
  bid_amount?: string;
  bid_strategy?: string;
  billing_event?: string;
  optimization_goal?: string;
  targeting?: Targeting;
  start_time?: string;
  end_time?: string;
  promoted_object?: Record<string, unknown>;
  created_time?: string;
  updated_time?: string;
  destination_type?: string;
}

const AD_SET_FIELDS = [
  'id', 'name', 'campaign_id', 'status', 'configured_status', 'effective_status',
  'daily_budget', 'lifetime_budget', 'budget_remaining', 'bid_amount', 'bid_strategy',
  'billing_event', 'optimization_goal', 'targeting', 'start_time', 'end_time',
  'promoted_object', 'created_time', 'updated_time', 'destination_type',
].join(',');

export async function getAdSets(cfg: MetaAdsConfig, adAccountId: string, campaignId?: string): Promise<AdSet[]> {
  const params: Record<string, unknown> = { fields: AD_SET_FIELDS, limit: '200' };
  if (campaignId) {
    params['filtering'] = [{ field: 'campaign_id', operator: 'EQUAL', value: campaignId }];
  }
  return getAll<AdSet>(cfg, `/act_${adAccountId}/adsets`, params);
}

export async function getAdSet(cfg: MetaAdsConfig, adSetId: string): Promise<AdSet> {
  return get<AdSet>(cfg, `/${adSetId}`, { fields: AD_SET_FIELDS });
}

export interface CreateAdSetParams {
  name: string;
  campaign_id: string;
  status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  bid_amount?: string;
  bid_strategy?: string;
  billing_event: string;
  optimization_goal: string;
  targeting: Targeting;
  start_time?: string;
  end_time?: string;
  promoted_object?: Record<string, unknown>;
  destination_type?: string;
}

export async function createAdSet(cfg: MetaAdsConfig, adAccountId: string, params: CreateAdSetParams): Promise<{ id: string }> {
  return post<{ id: string }>(cfg, `/act_${adAccountId}/adsets`, {
    ...params,
    status: params.status || 'PAUSED',
  });
}

export async function updateAdSet(cfg: MetaAdsConfig, adSetId: string, params: Record<string, unknown>): Promise<{ success: boolean }> {
  return post<{ success: boolean }>(cfg, `/${adSetId}`, params);
}

export async function cloneAdSet(cfg: MetaAdsConfig, sourceAdSetId: string, campaignId: string, nameOverride?: string): Promise<{ copied_adset_id: string }> {
  const params: Record<string, unknown> = { campaign_id: campaignId, status_option: 'PAUSED' };
  if (nameOverride) params['rename_options'] = { rename_suffix: ` - ${nameOverride}` };
  return post<{ copied_adset_id: string }>(cfg, `/${sourceAdSetId}/copies`, params);
}
