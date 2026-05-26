import type { MetaAdsConfig } from '../config.js';
import { get, getAll, post } from './core.js';

export interface CustomAudience {
  id: string;
  name: string;
  description?: string;
  subtype?: string;
  approximate_count_lower_bound?: number;
  approximate_count_upper_bound?: number;
  delivery_status?: { status: string };
  operation_status?: { status: number };
  time_created?: string;
  time_updated?: string;
}

const AUDIENCE_FIELDS = [
  'id', 'name', 'description', 'subtype',
  'approximate_count_lower_bound', 'approximate_count_upper_bound',
  'delivery_status', 'operation_status', 'time_created', 'time_updated',
].join(',');

export async function getCustomAudiences(cfg: MetaAdsConfig, adAccountId: string): Promise<CustomAudience[]> {
  return getAll<CustomAudience>(cfg, `/act_${adAccountId}/customaudiences`, { fields: AUDIENCE_FIELDS, limit: '100' });
}

export async function getCustomAudience(cfg: MetaAdsConfig, audienceId: string): Promise<CustomAudience> {
  return get<CustomAudience>(cfg, `/${audienceId}`, { fields: AUDIENCE_FIELDS });
}

export interface CreateLookalikeParams {
  name: string;
  origin_audience_id: string;
  lookalike_spec: {
    country: string;
    ratio: number;
    type?: string;
  };
}

export async function createLookalikeAudience(cfg: MetaAdsConfig, adAccountId: string, params: CreateLookalikeParams): Promise<{ id: string }> {
  return post<{ id: string }>(cfg, `/act_${adAccountId}/customaudiences`, {
    name: params.name,
    subtype: 'LOOKALIKE',
    origin_audience_id: params.origin_audience_id,
    lookalike_spec: params.lookalike_spec,
  });
}
