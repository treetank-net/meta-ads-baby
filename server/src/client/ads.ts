import type { MetaAdsConfig } from '../config.js';
import { get, getAll, post } from './core.js';

export interface Ad {
  id: string;
  name: string;
  adset_id: string;
  campaign_id: string;
  status: string;
  configured_status: string;
  effective_status: string;
  creative?: { creative_id: string };
  created_time?: string;
  updated_time?: string;
}

const AD_FIELDS = [
  'id', 'name', 'adset_id', 'campaign_id', 'status', 'configured_status',
  'effective_status', 'creative', 'created_time', 'updated_time',
].join(',');

export async function getAds(cfg: MetaAdsConfig, adAccountId: string, adSetId?: string): Promise<Ad[]> {
  const params: Record<string, unknown> = { fields: AD_FIELDS, limit: '200' };
  if (adSetId) {
    params['filtering'] = [{ field: 'adset_id', operator: 'EQUAL', value: adSetId }];
  }
  return getAll<Ad>(cfg, `/act_${adAccountId}/ads`, params);
}

export async function getAd(cfg: MetaAdsConfig, adId: string): Promise<Ad> {
  return get<Ad>(cfg, `/${adId}`, { fields: AD_FIELDS });
}

export interface CreateAdParams {
  name: string;
  adset_id: string;
  creative: { creative_id: string };
  status?: string;
  tracking_specs?: Array<Record<string, unknown>>;
}

export async function createAd(cfg: MetaAdsConfig, adAccountId: string, params: CreateAdParams): Promise<{ id: string }> {
  return post<{ id: string }>(cfg, `/act_${adAccountId}/ads`, {
    ...params,
    status: params.status || 'PAUSED',
  });
}

export async function updateAd(cfg: MetaAdsConfig, adId: string, params: Record<string, unknown>): Promise<{ success: boolean }> {
  return post<{ success: boolean }>(cfg, `/${adId}`, params);
}

export async function cloneAd(cfg: MetaAdsConfig, sourceAdId: string, adSetId: string, nameOverride?: string): Promise<{ copied_ad_id: string }> {
  const params: Record<string, unknown> = { adset_id: adSetId, status_option: 'PAUSED' };
  if (nameOverride) params['rename_options'] = { rename_suffix: ` - ${nameOverride}` };
  return post<{ copied_ad_id: string }>(cfg, `/${sourceAdId}/copies`, params);
}
