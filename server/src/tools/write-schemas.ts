import { z } from 'zod';

export const MAX_DAILY_BUDGET_CENTS = 50000_00;
export const MAX_LIFETIME_BUDGET_CENTS = 500000_00;
export const BUDGET_WARNING_CENTS = 500_00;

export const CODEX_HOOK_INSTALL_COMMAND = 'npx codex-marketplace add treetank-net/meta-ads-baby/hooks/meta-ads-baby-safety --hook --global';

export const adAccountIdSchema = z.string().describe('Meta ad account ID (digits only or act_XXXX format) from list_ad_accounts');
export const safeWordSchema = z.string().min(3).max(32).describe('Short random ASCII safe word for user confirmation. The LLM must invent this and include it in the preview shown to the user.');
export const tempIdSchema = z.string().startsWith('$').optional().describe('Optional temp ID (must start with $) for batch dependency resolution. Other prepare_* calls can reference this temp ID in their params, and confirm_all_mutations will resolve it to the real ID after execution.');
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
  temp_id: tempIdSchema,
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
  temp_id: tempIdSchema,
});

export const videoUploadSchema = z.object({
  ad_account_id: adAccountIdSchema,
  file_url: z.string().url().optional().describe('URL of the video to upload'),
  file_path: z.string().optional().describe('Absolute local file path of the video to upload'),
  title: z.string().optional().describe('Video title'),
  safe_word: safeWordSchema,
  temp_id: tempIdSchema,
});

export const campaignUpdateSchema = z.object({
  ad_account_id: adAccountIdSchema,
  campaign_id: z.string().describe('Campaign ID to update'),
  name: z.string().min(1).optional().describe('New campaign name'),
  spend_cap: z.number().positive().optional().describe('New spend cap in cents (currency minor units)'),
  bid_strategy: z.string().optional().describe('New bid strategy, e.g. LOWEST_COST_WITHOUT_CAP, LOWEST_COST_WITH_BID_CAP, COST_CAP'),
  daily_budget: z.number().positive().optional().describe('New daily budget in cents'),
  status: campaignStatusSchema.optional().describe('New campaign status'),
  safe_word: safeWordSchema,
  temp_id: tempIdSchema,
});

export const adUpdateSchema = z.object({
  ad_account_id: adAccountIdSchema,
  ad_id: z.string().describe('Ad ID to update'),
  name: z.string().min(1).optional().describe('New ad name'),
  status: entityStatusSchema.optional().describe('New ad status'),
  creative_id: z.string().optional().describe('New ad creative ID'),
  safe_word: safeWordSchema,
  temp_id: tempIdSchema,
});

export const cloneEntitySchema = z.object({
  ad_account_id: adAccountIdSchema,
  entity_type: entityTypeSchema.describe('Type of entity to clone: campaign, ad_set, or ad'),
  source_id: z.string().describe('ID of the source entity to clone'),
  parent_id: z.string().optional().describe('Parent entity ID. Required for ad_set (campaign_id) and ad (adset_id).'),
  name_override: z.string().optional().describe('Optional name for the cloned entity. Defaults to source name with " - Copy" suffix.'),
  safe_word: safeWordSchema,
  temp_id: tempIdSchema,
});

export const leadCreativeSchema = z.object({
  ad_account_id: adAccountIdSchema,
  name: z.string().min(1).describe('Creative name'),
  page_id: z.string().describe('Facebook Page ID to publish the ad from'),
  message: z.string().min(1).describe('Post text shown above the ad'),
  link: z.string().url().describe('Destination URL for the ad'),
  image_hash: z.string().describe('Image hash from prepare_image_upload'),
  headline: z.string().min(1).describe('Link headline shown below the image'),
  description: z.string().min(1).describe('Link description shown below the headline'),
  lead_gen_form_id: z.string().describe('Lead generation form ID'),
  call_to_action_type: ctaTypeSchema.default('SIGN_UP').describe('CTA button type (default: SIGN_UP)'),
  safe_word: safeWordSchema,
  temp_id: tempIdSchema,
});
