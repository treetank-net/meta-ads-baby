import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MetaAdsConfig } from '../config.js';
import { normalizeAdAccountId } from '../validation.js';
import { createToken } from '../confirm.js';
import { validateAdAccount, validationResult, prepareResponse } from './write-helpers.js';
import { adAccountIdSchema, safeWordSchema, tempIdSchema, carouselCreativeSchema, videoCreativeSchema, videoUploadSchema, leadCreativeSchema } from './write-schemas.js';

export function registerAssetPrepareTools(server: McpServer, cfg: MetaAdsConfig): void {
  server.tool(
    'prepare_lookalike_audience',
    'Create a lookalike audience from a custom audience.',
    {
      ad_account_id: adAccountIdSchema,
      name: z.string().min(1),
      origin_audience_id: z.string(),
      country: z.string().length(2).describe('ISO country code'),
      ratio: z.number().min(0.01).max(0.20).describe('0.01 = top 1% most similar'),
      safe_word: safeWordSchema,
      temp_id: tempIdSchema,
    },
    async ({ ad_account_id, name, origin_audience_id, country, ratio, safe_word, temp_id }) => {
      const accountError = validateAdAccount(ad_account_id);
      if (accountError) return accountError;
      const normalizedAccountId = normalizeAdAccountId(ad_account_id);
      const lines = [
        `Create lookalike audience "${name}" on account ${normalizedAccountId}`,
        `Source audience: ${origin_audience_id}`,
        `Country: ${country}`,
        `Ratio: ${(ratio * 100).toFixed(0)}% (top ${(ratio * 100).toFixed(0)}% similarity)`,
      ];
      const preview = lines.join('\n');
      const mutation = createToken('lookalike_audience_create', {
        ad_account_id: normalizedAccountId,
        name,
        origin_audience_id,
        country,
        ratio,
      }, preview, safe_word.trim(), temp_id);
      return prepareResponse(cfg, mutation, preview);
    },
  );

  server.tool(
    'prepare_carousel_creative',
    'Create a carousel creative with 2-10 image cards.',
    carouselCreativeSchema.shape,
    async ({ ad_account_id, name, page_id, message, link, child_attachments, call_to_action_type, safe_word, temp_id }) => {
      const accountError = validateAdAccount(ad_account_id);
      if (accountError) return accountError;
      const normalizedAccountId = normalizeAdAccountId(ad_account_id);
      const lines = [
        `Create carousel ad creative "${name}" on account ${normalizedAccountId}`,
        `Page: ${page_id}`,
        `Message: ${message}`,
        `Default link: ${link}`,
        `Cards (${child_attachments.length}):`,
      ];
      for (let i = 0; i < child_attachments.length; i++) {
        const card = child_attachments[i];
        lines.push(`  ${i + 1}. "${card.name}" → ${card.link} (image: ${card.image_hash})`);
        if (card.description) lines.push(`     Description: ${card.description}`);
      }
      if (call_to_action_type) lines.push(`CTA: ${call_to_action_type}`);
      const preview = lines.join('\n');

      const callToAction = call_to_action_type
        ? { type: call_to_action_type, value: { link } }
        : undefined;

      const mutation = createToken('carousel_creative_create', {
        ad_account_id: normalizedAccountId,
        name,
        page_id,
        message,
        link,
        child_attachments,
        call_to_action: callToAction,
      }, preview, safe_word.trim(), temp_id);
      return prepareResponse(cfg, mutation, preview);
    },
  );

  server.tool(
    'prepare_video_creative',
    'Create a video ad creative from an uploaded video.',
    videoCreativeSchema.shape,
    async ({ ad_account_id, name, page_id, video_id, message, title, image_hash, call_to_action_type, call_to_action_link, safe_word, temp_id }) => {
      const accountError = validateAdAccount(ad_account_id);
      if (accountError) return accountError;
      const normalizedAccountId = normalizeAdAccountId(ad_account_id);
      const lines = [
        `Create video ad creative "${name}" on account ${normalizedAccountId}`,
        `Page: ${page_id}`,
        `Video ID: ${video_id}`,
      ];
      if (message) lines.push(`Message: ${message}`);
      if (title) lines.push(`Title: ${title}`);
      if (image_hash) lines.push(`Thumbnail image hash: ${image_hash}`);
      if (call_to_action_type) lines.push(`CTA: ${call_to_action_type}`);
      if (call_to_action_link) lines.push(`CTA link: ${call_to_action_link}`);
      const preview = lines.join('\n');

      const callToAction = call_to_action_type
        ? { type: call_to_action_type, value: call_to_action_link ? { link: call_to_action_link } : undefined }
        : undefined;

      const mutation = createToken('video_creative_create', {
        ad_account_id: normalizedAccountId,
        name,
        page_id,
        video_id,
        message,
        title,
        image_hash,
        call_to_action: callToAction,
      }, preview, safe_word.trim(), temp_id);
      return prepareResponse(cfg, mutation, preview);
    },
  );

  server.tool(
    'prepare_video_upload',
    'Upload an ad video from a URL or local file; the result carries its video id.',
    videoUploadSchema.shape,
    async ({ ad_account_id, file_url, file_path, title, safe_word, temp_id }) => {
      const accountError = validateAdAccount(ad_account_id);
      if (accountError) return accountError;
      if (!file_url && !file_path) return validationResult('Either file_url or file_path must be provided');
      const normalizedAccountId = normalizeAdAccountId(ad_account_id);
      const source = file_url ? `URL: ${file_url}` : `File: ${file_path}`;
      const lines = [
        `Upload video to account ${normalizedAccountId}`,
        `Source: ${source}`,
      ];
      if (title) lines.push(`Title: ${title}`);
      const preview = lines.join('\n');
      const mutation = createToken('video_upload', {
        ad_account_id: normalizedAccountId,
        source_type: file_url ? 'url' : 'file',
        source_value: file_url || file_path,
        title,
      }, preview, safe_word.trim(), temp_id);
      return prepareResponse(cfg, mutation, preview);
    },
  );

  server.tool(
    'prepare_lead_creative',
    'Create a lead ad creative: image, text and an instant form.',
    leadCreativeSchema.shape,
    async ({ ad_account_id, name, page_id, message, link, image_hash, headline, description, lead_gen_form_id, call_to_action_type, safe_word, temp_id }) => {
      const accountError = validateAdAccount(ad_account_id);
      if (accountError) return accountError;
      const normalizedAccountId = normalizeAdAccountId(ad_account_id);
      const lines = [
        `Create lead generation ad creative "${name}" on account ${normalizedAccountId}`,
        `Page: ${page_id}`,
        `Message: ${message}`,
        `Link: ${link}`,
        `Image hash: ${image_hash}`,
        `Headline: ${headline}`,
        `Description: ${description}`,
        `Lead form: ${lead_gen_form_id}`,
        `CTA: ${call_to_action_type}`,
      ];
      const preview = lines.join('\n');
      const mutation = createToken('lead_creative_create', {
        ad_account_id: normalizedAccountId,
        name,
        page_id,
        message,
        link,
        image_hash,
        headline,
        description,
        lead_gen_form_id,
        call_to_action_type,
      }, preview, safe_word.trim(), temp_id);
      return prepareResponse(cfg, mutation, preview);
    },
  );
}
