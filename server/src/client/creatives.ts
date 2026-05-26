import type { MetaAdsConfig } from '../config.js';
import { get, getAll, post } from './core.js';

export interface CallToAction {
  type: string;
  value?: { link?: string };
}

export interface LinkData {
  image_hash?: string;
  link: string;
  message?: string;
  name?: string;
  description?: string;
  call_to_action?: CallToAction;
}

export interface VideoData {
  video_id: string;
  image_hash?: string;
  title?: string;
  message?: string;
  call_to_action?: CallToAction;
}

export interface ObjectStorySpec {
  page_id: string;
  instagram_user_id?: string;
  link_data?: LinkData;
  video_data?: VideoData;
}

export interface AdCreative {
  id: string;
  name?: string;
  status?: string;
  body?: string;
  title?: string;
  image_hash?: string;
  image_url?: string;
  thumbnail_url?: string;
  link_url?: string;
  call_to_action_type?: string;
  object_story_spec?: ObjectStorySpec;
  object_type?: string;
  url_tags?: string;
  account_id?: string;
}

const CREATIVE_FIELDS = [
  'id', 'name', 'status', 'body', 'title', 'image_hash', 'image_url',
  'thumbnail_url', 'link_url', 'call_to_action_type', 'object_story_spec',
  'object_type', 'url_tags', 'account_id',
].join(',');

export async function getAdCreatives(cfg: MetaAdsConfig, adAccountId: string): Promise<AdCreative[]> {
  return getAll<AdCreative>(cfg, `/act_${adAccountId}/adcreatives`, { fields: CREATIVE_FIELDS, limit: '100' });
}

export async function getAdCreative(cfg: MetaAdsConfig, creativeId: string): Promise<AdCreative> {
  return get<AdCreative>(cfg, `/${creativeId}`, { fields: CREATIVE_FIELDS });
}

export interface CreateAdCreativeParams {
  name: string;
  object_story_spec: ObjectStorySpec;
  url_tags?: string;
}

export async function createAdCreative(cfg: MetaAdsConfig, adAccountId: string, params: CreateAdCreativeParams): Promise<{ id: string }> {
  return post<{ id: string }>(cfg, `/act_${adAccountId}/adcreatives`, params as unknown as Record<string, unknown>);
}
