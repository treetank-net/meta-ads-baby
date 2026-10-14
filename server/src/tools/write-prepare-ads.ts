import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MetaAdsConfig } from '../config.js';
import { normalizeAdAccountId } from '../validation.js';
import { createToken } from '../confirm.js';
import { validateAdAccount, validationResult, prepareResponse } from './write-helpers.js';
import { adAccountIdSchema, safeWordSchema, tempIdSchema, campaignStatusSchema, entityStatusSchema, adUpdateSchema, cloneEntitySchema, trackingSpecSchema, assetFeedSpecSchema, ctaTypeSchema, MAX_TRACKING_SPECS_PER_MUTATION } from './write-schemas.js';

export function registerAdPrepareTools(server: McpServer, cfg: MetaAdsConfig): void {
  server.tool(
    'prepare_ad_create',
    'Create an ad in an ad set from an existing creative, PAUSED by default.',
    {
      ad_account_id: adAccountIdSchema,
      ad_set_id: z.string(),
      name: z.string().min(1),
      creative_id: z.string(),
      status: campaignStatusSchema.default('PAUSED'),
      tracking_specs: z.array(trackingSpecSchema).max(MAX_TRACKING_SPECS_PER_MUTATION).optional().describe('Pixel conversion tracking'),
      multi_advertiser_enabled: z.boolean().optional(),
      safe_word: safeWordSchema,
      temp_id: tempIdSchema,
    },
    async ({ ad_account_id, ad_set_id, name, creative_id, status, tracking_specs, multi_advertiser_enabled, safe_word, temp_id }) => {
      const accountError = validateAdAccount(ad_account_id);
      if (accountError) return accountError;
      const normalizedAccountId = normalizeAdAccountId(ad_account_id);
      const lines = [`Create ${status} ad "${name}" in ad set ${ad_set_id} with creative ${creative_id} on account ${normalizedAccountId}`];
      if (tracking_specs) lines.push(`Tracking specs: ${JSON.stringify(tracking_specs)}`);
      if (multi_advertiser_enabled !== undefined) lines.push(`Multi-advertiser: ${multi_advertiser_enabled}`);
      const preview = lines.join('\n');
      const mutation = createToken('ad_create', {
        ad_account_id: normalizedAccountId,
        ad_set_id,
        name,
        creative_id,
        status,
        tracking_specs,
        multi_advertiser_enabled,
      }, preview, safe_word.trim(), temp_id);
      return prepareResponse(cfg, mutation, preview);
    },
  );

  server.tool(
    'prepare_ad_creative',
    'Create a single-image link ad creative.',
    {
      ad_account_id: adAccountIdSchema,
      name: z.string().min(1),
      page_id: z.string(),
      link_url: z.string().url(),
      message: z.string().min(1).describe('Primary text above the image'),
      headline: z.string().optional().describe('Shown below the image'),
      description: z.string().optional().describe('Shown below the headline'),
      image_hash: z.string().optional().describe('From prepare_image_upload'),
      call_to_action_type: ctaTypeSchema.default('LEARN_MORE'),
      safe_word: safeWordSchema,
      temp_id: tempIdSchema,
    },
    async ({ ad_account_id, name, page_id, link_url, message, headline, description, image_hash, call_to_action_type, safe_word, temp_id }) => {
      const accountError = validateAdAccount(ad_account_id);
      if (accountError) return accountError;
      const normalizedAccountId = normalizeAdAccountId(ad_account_id);
      const lines = [
        `Create ad creative "${name}" on account ${normalizedAccountId}`,
        `Page: ${page_id}`,
        `Link: ${link_url}`,
        `Message: ${message}`,
      ];
      if (headline) lines.push(`Headline: ${headline}`);
      if (description) lines.push(`Description: ${description}`);
      if (image_hash) lines.push(`Image hash: ${image_hash}`);
      lines.push(`CTA: ${call_to_action_type}`);
      const preview = lines.join('\n');
      const mutation = createToken('ad_creative_create', {
        ad_account_id: normalizedAccountId,
        name,
        page_id,
        link_url,
        message,
        headline,
        description,
        image_hash,
        call_to_action_type,
      }, preview, safe_word.trim(), temp_id);
      return prepareResponse(cfg, mutation, preview);
    },
  );

  server.tool(
    'prepare_image_upload',
    'Upload an ad image from a URL or local file; the result carries its image hash.',
    {
      ad_account_id: adAccountIdSchema,
      source_type: z.enum(['url', 'file']),
      source_value: z.string().min(1).describe('URL or absolute file path'),
      safe_word: safeWordSchema,
      temp_id: tempIdSchema,
    },
    async ({ ad_account_id, source_type, source_value, safe_word, temp_id }) => {
      const accountError = validateAdAccount(ad_account_id);
      if (accountError) return accountError;
      const normalizedAccountId = normalizeAdAccountId(ad_account_id);
      const preview = `Upload image from ${source_type}: ${source_value} to account ${normalizedAccountId}`;
      const mutation = createToken('image_upload', {
        ad_account_id: normalizedAccountId,
        source_type,
        source_value,
      }, preview, safe_word.trim(), temp_id);
      return prepareResponse(cfg, mutation, preview);
    },
  );

  server.tool(
    'prepare_ad_status',
    'Pause, activate or archive an ad.',
    {
      ad_account_id: adAccountIdSchema,
      ad_id: z.string(),
      status: entityStatusSchema,
      safe_word: safeWordSchema,
      temp_id: tempIdSchema,
    },
    async ({ ad_account_id, ad_id, status, safe_word, temp_id }) => {
      const accountError = validateAdAccount(ad_account_id);
      if (accountError) return accountError;
      const normalizedAccountId = normalizeAdAccountId(ad_account_id);
      const preview = `Change ad ${ad_id} status to ${status} on account ${normalizedAccountId}`;
      const warning = status === 'ARCHIVED' ? '\nWarning: Archiving an ad is irreversible.' : '';
      const mutation = createToken('ad_status', {
        ad_account_id: normalizedAccountId,
        ad_id,
        status,
      }, preview + warning, safe_word.trim(), temp_id);
      return prepareResponse(cfg, mutation, preview + warning);
    },
  );

  server.tool(
    'prepare_ad_removal',
    'Delete an ad (irreversible).',
    {
      ad_account_id: adAccountIdSchema,
      ad_id: z.string(),
      safe_word: safeWordSchema,
      temp_id: tempIdSchema,
    },
    async ({ ad_account_id, ad_id, safe_word, temp_id }) => {
      const accountError = validateAdAccount(ad_account_id);
      if (accountError) return accountError;
      const normalizedAccountId = normalizeAdAccountId(ad_account_id);
      const preview = `DELETE ad ${ad_id} on account ${normalizedAccountId}\nWarning: This is irreversible.`;
      const mutation = createToken('ad_removal', {
        ad_account_id: normalizedAccountId,
        ad_id,
      }, preview, safe_word.trim(), temp_id);
      return prepareResponse(cfg, mutation, preview);
    },
  );

  server.tool(
    'prepare_ad_update',
    'Update an ad: name, status, creative or tracking specs.',
    adUpdateSchema.shape,
    async ({ ad_account_id, ad_id, name, status, creative_id, tracking_specs, multi_advertiser_enabled, safe_word, temp_id }) => {
      const accountError = validateAdAccount(ad_account_id);
      if (accountError) return accountError;
      if (!name && !status && !creative_id && !tracking_specs && multi_advertiser_enabled === undefined) {
        return validationResult('Provide at least one field to update.');
      }
      const normalizedAccountId = normalizeAdAccountId(ad_account_id);
      const lines = [`Update ad ${ad_id} on account ${normalizedAccountId}`];
      if (name) lines.push(`Name: ${name}`);
      if (status) lines.push(`Status: ${status}`);
      if (creative_id) lines.push(`Creative: ${creative_id}`);
      if (tracking_specs) lines.push(`Tracking specs: ${JSON.stringify(tracking_specs)}`);
      if (multi_advertiser_enabled !== undefined) lines.push(`Multi-advertiser: ${multi_advertiser_enabled}`);
      const preview = lines.join('\n');
      const mutation = createToken('ad_update', {
        ad_account_id: normalizedAccountId,
        ad_id,
        name,
        status,
        creative_id,
        tracking_specs,
        multi_advertiser_enabled,
      }, preview, safe_word.trim(), temp_id);
      return prepareResponse(cfg, mutation, preview);
    },
  );

  server.tool(
    'prepare_advantage_creative',
    'Create an Advantage+ creative with several image/video, text and headline variants.',
    {
      ad_account_id: adAccountIdSchema,
      name: z.string().min(1),
      page_id: z.string(),
      link_url: z.string().url(),
      asset_feed_spec: assetFeedSpecSchema,
      safe_word: safeWordSchema,
      temp_id: tempIdSchema,
    },
    async ({ ad_account_id, name, page_id, link_url, asset_feed_spec, safe_word, temp_id }) => {
      const accountError = validateAdAccount(ad_account_id);
      if (accountError) return accountError;
      if (!asset_feed_spec.images?.length && !asset_feed_spec.videos?.length) {
        return validationResult('Provide at least one image or video in asset_feed_spec.');
      }
      const normalizedAccountId = normalizeAdAccountId(ad_account_id);
      const lines = [
        `Create Advantage+ creative "${name}" on account ${normalizedAccountId}`,
        `Page: ${page_id}`,
        `Link: ${link_url}`,
      ];
      if (asset_feed_spec.images?.length) lines.push(`Images: ${asset_feed_spec.images.length} variant(s)`);
      if (asset_feed_spec.videos?.length) lines.push(`Videos: ${asset_feed_spec.videos.length} variant(s)`);
      lines.push(`Body texts: ${asset_feed_spec.bodies.length} variant(s)`);
      if (asset_feed_spec.titles?.length) lines.push(`Headlines: ${asset_feed_spec.titles.length} variant(s)`);
      if (asset_feed_spec.descriptions?.length) lines.push(`Descriptions: ${asset_feed_spec.descriptions.length} variant(s)`);
      const preview = lines.join('\n');
      const mutation = createToken('advantage_creative_create', {
        ad_account_id: normalizedAccountId,
        name,
        page_id,
        link_url,
        asset_feed_spec,
      }, preview, safe_word.trim(), temp_id);
      return prepareResponse(cfg, mutation, preview);
    },
  );

  server.tool(
    'prepare_clone_entity',
    'Copy a campaign, ad set or ad; the copy starts PAUSED.',
    cloneEntitySchema.shape,
    async ({ ad_account_id, entity_type, source_id, parent_id, name_override, safe_word, temp_id }) => {
      const accountError = validateAdAccount(ad_account_id);
      if (accountError) return accountError;
      if (entity_type === 'ad_set' && !parent_id) {
        return validationResult('parent_id (campaign_id) is required when cloning an ad set.');
      }
      if (entity_type === 'ad' && !parent_id) {
        return validationResult('parent_id (adset_id) is required when cloning an ad.');
      }
      const normalizedAccountId = normalizeAdAccountId(ad_account_id);
      const lines = [`Clone ${entity_type} ${source_id} on account ${normalizedAccountId}`];
      if (parent_id) lines.push(`Parent: ${parent_id}`);
      if (name_override) lines.push(`Name override: ${name_override}`);
      const preview = lines.join('\n');
      const mutation = createToken('clone_entity', {
        ad_account_id: normalizedAccountId,
        entity_type,
        source_id,
        parent_id,
        name_override,
      }, preview, safe_word.trim(), temp_id);
      return prepareResponse(cfg, mutation, preview);
    },
  );
}
