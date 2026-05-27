import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MetaAdsConfig } from '../config.js';
import { normalizeAdAccountId } from '../validation.js';
import { createToken } from '../confirm.js';
import { validateAdAccount, validationResult, prepareResponse } from './write-helpers.js';
import { adAccountIdSchema, safeWordSchema, tempIdSchema, campaignStatusSchema, entityStatusSchema, adUpdateSchema, cloneEntitySchema, trackingSpecSchema } from './write-schemas.js';

export function registerAdPrepareTools(server: McpServer, cfg: MetaAdsConfig): void {
  server.tool(
    'prepare_ad_create',
    'Prepare creation of a Meta ad under an existing ad set, linking it to an existing ad creative. Returns a preview and confirmation token. The user MUST confirm before the ad is created.',
    {
      ad_account_id: adAccountIdSchema,
      ad_set_id: z.string().describe('Existing ad set ID'),
      name: z.string().min(1).describe('Ad name'),
      creative_id: z.string().describe('Existing ad creative ID'),
      status: campaignStatusSchema.default('PAUSED').describe('Initial ad status'),
      tracking_specs: z.array(trackingSpecSchema).optional().describe('Tracking specs for conversion tracking (pixel events)'),
      safe_word: safeWordSchema,
      temp_id: tempIdSchema,
    },
    async ({ ad_account_id, ad_set_id, name, creative_id, status, tracking_specs, safe_word, temp_id }) => {
      const accountError = validateAdAccount(ad_account_id);
      if (accountError) return accountError;
      const normalizedAccountId = normalizeAdAccountId(ad_account_id);
      const lines = [`Create ${status} ad "${name}" in ad set ${ad_set_id} with creative ${creative_id} on account ${normalizedAccountId}`];
      if (tracking_specs) lines.push(`Tracking specs: ${JSON.stringify(tracking_specs)}`);
      const preview = lines.join('\n');
      const mutation = createToken('ad_create', {
        ad_account_id: normalizedAccountId,
        ad_set_id,
        name,
        creative_id,
        status,
        tracking_specs,
      }, preview, safe_word.trim(), temp_id);
      return prepareResponse(cfg, mutation, preview);
    },
  );

  server.tool(
    'prepare_ad_creative',
    'Prepare creation of a Meta ad creative (link ad with image). Returns a preview and confirmation token. The user MUST confirm before the creative is created.',
    {
      ad_account_id: adAccountIdSchema,
      name: z.string().min(1).describe('Creative name'),
      page_id: z.string().describe('Facebook Page ID to publish the ad from'),
      link_url: z.string().url().describe('Destination URL for the ad'),
      message: z.string().min(1).describe('Ad body text (post text above the image)'),
      headline: z.string().optional().describe('Link headline shown below the image'),
      description: z.string().optional().describe('Link description shown below the headline'),
      image_hash: z.string().optional().describe('Image hash from a previously uploaded ad image'),
      call_to_action_type: z.string().default('LEARN_MORE').describe('CTA button type, e.g. LEARN_MORE, SHOP_NOW, SIGN_UP, DOWNLOAD, CONTACT_US'),
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
    'Prepare upload of an ad image to a Meta ad account from a URL or local file. Returns a preview and confirmation token. The user MUST confirm before the upload.',
    {
      ad_account_id: adAccountIdSchema,
      source_type: z.enum(['url', 'file']).describe('Whether to upload from a URL or a local file path'),
      source_value: z.string().min(1).describe('The URL or absolute file path of the image'),
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
    'Prepare a Meta Ads ad status change (activate/pause/archive). Returns a preview and confirmation token. The user MUST confirm before the change is applied.',
    {
      ad_account_id: adAccountIdSchema,
      ad_id: z.string().describe('Ad ID'),
      status: entityStatusSchema.describe('Target status'),
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
    'Prepare deletion of a Meta ad (sets status to DELETED). This is irreversible. Returns a preview and confirmation token. The user MUST confirm before the deletion.',
    {
      ad_account_id: adAccountIdSchema,
      ad_id: z.string().describe('Ad ID to delete'),
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
    'Prepare an update to an existing Meta ad (name, status, creative, tracking_specs). Returns a preview and confirmation token. The user MUST confirm before the change is applied.',
    adUpdateSchema.shape,
    async ({ ad_account_id, ad_id, name, status, creative_id, tracking_specs, safe_word, temp_id }) => {
      const accountError = validateAdAccount(ad_account_id);
      if (accountError) return accountError;
      if (!name && !status && !creative_id && !tracking_specs) {
        return validationResult('Provide at least one field to update.');
      }
      const normalizedAccountId = normalizeAdAccountId(ad_account_id);
      const lines = [`Update ad ${ad_id} on account ${normalizedAccountId}`];
      if (name) lines.push(`Name: ${name}`);
      if (status) lines.push(`Status: ${status}`);
      if (creative_id) lines.push(`Creative: ${creative_id}`);
      if (tracking_specs) lines.push(`Tracking specs: ${JSON.stringify(tracking_specs)}`);
      const preview = lines.join('\n');
      const mutation = createToken('ad_update', {
        ad_account_id: normalizedAccountId,
        ad_id,
        name,
        status,
        creative_id,
        tracking_specs,
      }, preview, safe_word.trim(), temp_id);
      return prepareResponse(cfg, mutation, preview);
    },
  );

  server.tool(
    'prepare_clone_entity',
    'Prepare cloning/duplicating a Meta Ads campaign, ad set, or ad. Returns a preview and confirmation token. The user MUST confirm before the clone is executed.',
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
