import { z } from 'zod';

export const MAX_DAILY_BUDGET_CENTS = 50000_00;
export const MAX_LIFETIME_BUDGET_CENTS = 500000_00;
export const BUDGET_WARNING_CENTS = 500_00;

export const CODEX_HOOK_INSTALL_COMMAND = 'npx codex-marketplace add treetank-net/meta-ads-baby/hooks/meta-ads-baby-safety --hook --global';

export const adAccountIdSchema = z.string().describe('Meta ad account ID (digits only or act_XXXX format) from list_ad_accounts');
export const safeWordSchema = z.string().min(3).max(32).describe('Short random ASCII safe word for user confirmation. The LLM must invent this and include it in the preview shown to the user.');
export const campaignStatusSchema = z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']);
export const entityStatusSchema = z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']);
export const entityTypeSchema = z.enum(['campaign', 'ad_set', 'ad']);
export const objectiveSchema = z.enum([
  'OUTCOME_APP_PROMOTION', 'OUTCOME_AWARENESS', 'OUTCOME_ENGAGEMENT',
  'OUTCOME_LEADS', 'OUTCOME_SALES', 'OUTCOME_TRAFFIC',
]);
export const billingEventSchema = z.enum(['IMPRESSIONS', 'LINK_CLICKS', 'THRUPLAY', 'APP_INSTALLS']);
export const optimizationGoalSchema = z.enum([
  'LINK_CLICKS', 'LANDING_PAGE_VIEWS', 'IMPRESSIONS', 'REACH',
  'OFFSITE_CONVERSIONS', 'LEAD_GENERATION', 'APP_INSTALLS', 'THRUPLAY', 'VALUE',
]);

export const ctaTypeSchema = z.string().describe('Call to action type, e.g. LEARN_MORE, SHOP_NOW, SIGN_UP, DOWNLOAD, CONTACT_US, BOOK_TRAVEL, LISTEN_NOW, WATCH_MORE');

export const childAttachmentSchema = z.object({
  image_hash: z.string().describe('Image hash from prepare_image_upload'),
  link: z.string().url().describe('Destination URL for this carousel card'),
  name: z.string().min(1).describe('Headline for this carousel card'),
  description: z.string().optional().describe('Description text for this carousel card'),
  call_to_action: z.object({
    type: ctaTypeSchema,
    value: z.object({ link: z.string().url() }).optional(),
  }).optional().describe('Optional per-card CTA override'),
});

export const carouselCreativeSchema = z.object({
  ad_account_id: adAccountIdSchema,
  name: z.string().min(1).describe('Creative name'),
  page_id: z.string().describe('Facebook Page ID to publish the ad from'),
  message: z.string().min(1).describe('Post text shown above the carousel'),
  link: z.string().url().describe('Default destination URL for the carousel'),
  child_attachments: z.array(childAttachmentSchema).min(2).max(10).describe('Carousel cards (2-10 items)'),
  call_to_action_type: ctaTypeSchema.optional().describe('CTA button type for the whole carousel'),
  safe_word: safeWordSchema,
});

export const videoCreativeSchema = z.object({
  ad_account_id: adAccountIdSchema,
  name: z.string().min(1).describe('Creative name'),
  page_id: z.string().describe('Facebook Page ID to publish the ad from'),
  video_id: z.string().describe('Uploaded video ID from prepare_video_upload'),
  message: z.string().optional().describe('Post text shown above the video'),
  title: z.string().optional().describe('Video title'),
  image_hash: z.string().optional().describe('Custom thumbnail image hash from prepare_image_upload'),
  call_to_action_type: ctaTypeSchema.optional().describe('CTA button type'),
  call_to_action_link: z.string().url().optional().describe('CTA destination URL'),
  safe_word: safeWordSchema,
});

export const videoUploadSchema = z.object({
  ad_account_id: adAccountIdSchema,
  file_url: z.string().url().optional().describe('URL of the video to upload'),
  file_path: z.string().optional().describe('Absolute local file path of the video to upload'),
  title: z.string().optional().describe('Video title'),
  safe_word: safeWordSchema,
});
