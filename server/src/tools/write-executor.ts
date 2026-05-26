import type { MetaAdsConfig } from '../config.js';
import type { PendingMutation } from '../confirm.js';
import { recordSuccess } from '../history.js';
import {
  updateCampaign,
  createCampaign,
  updateAdSet,
  createAdSet,
  createAd,
  createAdCreative,
  uploadImage,
  MetaApiError,
} from '../client.js';

export async function executeMutation(cfg: MetaAdsConfig, mutation: PendingMutation, batchId?: string): Promise<string> {
  const p = mutation.params as Record<string, any>;

  const ok = (result?: unknown): string => {
    recordSuccess(mutation.action, p, mutation.preview, result, batchId);
    if (result) return `OK: ${mutation.preview}\n${JSON.stringify(result, null, 2)}`;
    return `OK: ${mutation.preview}`;
  };

  if (mutation.action === 'campaign_status') {
    const result = await updateCampaign(cfg, p.campaign_id, { status: p.status });
    return ok(result);
  }

  if (mutation.action === 'budget_change') {
    const params: Record<string, unknown> = {};
    if (p.daily_budget) params['daily_budget'] = p.daily_budget;
    if (p.lifetime_budget) params['lifetime_budget'] = p.lifetime_budget;
    if (p.object_type === 'campaign') {
      const result = await updateCampaign(cfg, p.object_id, params);
      return ok(result);
    }
    const result = await updateAdSet(cfg, p.object_id, params);
    return ok(result);
  }

  if (mutation.action === 'campaign_create') {
    const result = await createCampaign(cfg, p.ad_account_id, {
      name: p.name,
      objective: p.objective,
      status: p.status,
      special_ad_categories: p.special_ad_categories,
      daily_budget: p.daily_budget,
      lifetime_budget: p.lifetime_budget,
      bid_strategy: p.bid_strategy,
    });
    return ok(result);
  }

  if (mutation.action === 'ad_set_create') {
    const result = await createAdSet(cfg, p.ad_account_id, {
      name: p.name,
      campaign_id: p.campaign_id,
      status: p.status,
      daily_budget: p.daily_budget,
      lifetime_budget: p.lifetime_budget,
      billing_event: p.billing_event,
      optimization_goal: p.optimization_goal,
      targeting: p.targeting,
      start_time: p.start_time,
      end_time: p.end_time,
      bid_amount: p.bid_amount,
    });
    return ok(result);
  }

  if (mutation.action === 'ad_create') {
    const result = await createAd(cfg, p.ad_account_id, {
      name: p.name,
      adset_id: p.ad_set_id,
      creative: { creative_id: p.creative_id },
      status: p.status,
    });
    return ok(result);
  }

  if (mutation.action === 'ad_creative_create') {
    const result = await createAdCreative(cfg, p.ad_account_id, {
      name: p.name,
      object_story_spec: {
        page_id: p.page_id,
        link_data: {
          link: p.link_url,
          message: p.message,
          name: p.headline,
          description: p.description,
          image_hash: p.image_hash,
          call_to_action: { type: p.call_to_action_type, value: { link: p.link_url } },
        },
      },
    });
    return ok(result);
  }

  if (mutation.action === 'image_upload') {
    const source = p.source_type === 'url'
      ? { url: p.source_value }
      : { filePath: p.source_value };
    const result = await uploadImage(cfg, p.ad_account_id, source);
    return ok(result);
  }

  throw new Error(`Unknown mutation action: ${mutation.action}`);
}

export function formatMutationError(err: unknown): string {
  if (err instanceof MetaApiError) {
    const parts = [err.message];
    if (err.graphError.error_user_title) parts.unshift(err.graphError.error_user_title + ':');
    if (err.graphError.error_subcode) parts.push(`(subcode: ${err.graphError.error_subcode})`);
    return parts.join(' ');
  }
  if (err instanceof Error) return err.message;
  return typeof err === 'string' ? err : JSON.stringify(err);
}
