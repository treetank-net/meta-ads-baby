import { z } from 'zod';

export const MAX_DAILY_BUDGET_CENTS = 50000_00;
export const MAX_LIFETIME_BUDGET_CENTS = 500000_00;
export const MAX_BID_AMOUNT_CENTS = 5000_00;
export const MAX_SPEND_CAP_CENTS = 500000_00;
export const BUDGET_WARNING_CENTS = 500_00;

export const AMOUNT_FIELD_LIMITS: Record<string, { max: number; label: string }> = {
  daily_budget: { max: MAX_DAILY_BUDGET_CENTS, label: 'Daily budget' },
  lifetime_budget: { max: MAX_LIFETIME_BUDGET_CENTS, label: 'Lifetime budget' },
  bid_amount: { max: MAX_BID_AMOUNT_CENTS, label: 'Bid amount' },
  spend_cap: { max: MAX_SPEND_CAP_CENTS, label: 'Spend cap' },
};

export const MAX_SPECIAL_AD_CATEGORIES_PER_MUTATION = 6;
export const MAX_TRACKING_SPECS_PER_MUTATION = 10;
export const MAX_TRACKING_SPEC_VALUES_PER_MUTATION = 20;
export const MAX_ASSET_FEED_MEDIA_PER_MUTATION = 10;
export const MAX_ASSET_FEED_TEXTS_PER_MUTATION = 5;
export const MAX_ASSET_FEED_CTA_TYPES_PER_MUTATION = 5;
export const MAX_ASSET_FEED_LINK_URLS_PER_MUTATION = 10;
export const MAX_ASSET_FEED_AD_FORMATS_PER_MUTATION = 5;

export const CODEX_HOOK_INSTALL_COMMAND = 'npx codex-marketplace add treetank-net/meta-ads-baby/hooks/meta-ads-baby-safety --hook --global';

export const adAccountIdSchema = z.string();
export const safeWordSchema = z.string().min(3).max(32);
export const tempIdSchema = z.string().startsWith('$').optional();
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

export const ctaTypeSchema = z.string().describe('CTA, e.g. LEARN_MORE, SHOP_NOW, SIGN_UP, CONTACT_US');

export const childAttachmentSchema = z.object({
  image_hash: z.string(),
  link: z.string().url(),
  name: z.string().min(1).describe('Card headline'),
  description: z.string().optional(),
  call_to_action: z.object({
    type: ctaTypeSchema,
    value: z.object({ link: z.string().url() }).optional(),
  }).optional(),
});

export const carouselCreativeSchema = z.object({
  ad_account_id: adAccountIdSchema,
  name: z.string().min(1),
  page_id: z.string(),
  message: z.string().min(1).describe('Primary text above the cards'),
  link: z.string().url(),
  child_attachments: z.array(childAttachmentSchema).min(2).max(10),
  call_to_action_type: ctaTypeSchema.optional(),
  safe_word: safeWordSchema,
  temp_id: tempIdSchema,
});

export const videoCreativeSchema = z.object({
  ad_account_id: adAccountIdSchema,
  name: z.string().min(1),
  page_id: z.string(),
  video_id: z.string(),
  message: z.string().optional().describe('Primary text above the video'),
  title: z.string().optional(),
  image_hash: z.string().optional().describe('Custom thumbnail'),
  call_to_action_type: ctaTypeSchema.optional(),
  call_to_action_link: z.string().url().optional(),
  safe_word: safeWordSchema,
  temp_id: tempIdSchema,
});

export const videoUploadSchema = z.object({
  ad_account_id: adAccountIdSchema,
  file_url: z.string().url().optional().describe('This or file_path'),
  file_path: z.string().optional().describe('Absolute path'),
  title: z.string().optional(),
  safe_word: safeWordSchema,
  temp_id: tempIdSchema,
});

export const campaignUpdateSchema = z.object({
  ad_account_id: adAccountIdSchema,
  campaign_id: z.string(),
  name: z.string().min(1).optional(),
  spend_cap: z.number().positive().optional(),
  bid_strategy: z.string().optional().describe('e.g. LOWEST_COST_WITHOUT_CAP, LOWEST_COST_WITH_BID_CAP, COST_CAP'),
  daily_budget: z.number().positive().optional(),
  status: campaignStatusSchema.optional(),
  safe_word: safeWordSchema,
  temp_id: tempIdSchema,
});

export const promotedObjectSchema = z.object({
  pixel_id: z.string(),
  custom_event_type: z.string().optional().describe('e.g. PURCHASE, LEAD, COMPLETE_REGISTRATION, ADD_TO_CART'),
  pixel_rule: z.record(z.unknown()).optional().describe('Custom conversion rule'),
});

export const trackingSpecSchema = z.object({
  'action.type': z.array(z.string()).max(MAX_TRACKING_SPEC_VALUES_PER_MUTATION).describe('e.g. ["offsite_conversion"]'),
  fb_pixel: z.array(z.string()).max(MAX_TRACKING_SPEC_VALUES_PER_MUTATION).optional(),
  'fb_pixel_event': z.array(z.string()).max(MAX_TRACKING_SPEC_VALUES_PER_MUTATION).optional().describe('e.g. ["fb_pixel_purchase"]'),
});

export const adUpdateSchema = z.object({
  ad_account_id: adAccountIdSchema,
  ad_id: z.string(),
  name: z.string().min(1).optional(),
  status: entityStatusSchema.optional(),
  creative_id: z.string().optional(),
  tracking_specs: z.array(trackingSpecSchema).max(MAX_TRACKING_SPECS_PER_MUTATION).optional().describe('Pixel conversion tracking'),
  multi_advertiser_enabled: z.boolean().optional(),
  safe_word: safeWordSchema,
  temp_id: tempIdSchema,
});

export const assetFeedImageSchema = z.object({
  hash: z.string(),
  image_crops: z.record(z.array(z.array(z.number()))).optional().describe('Per aspect ratio, e.g. {"100x100": [[0,0],[100,100]]}'),
});

export const assetFeedBodySchema = z.object({
  text: z.string().min(1),
});

export const assetFeedTitleSchema = z.object({
  text: z.string().min(1),
});

export const assetFeedDescriptionSchema = z.object({
  text: z.string().min(1),
});

export const assetFeedVideoSchema = z.object({
  video_id: z.string(),
  thumbnail_hash: z.string().optional(),
});

export const assetFeedSpecSchema = z.object({
  images: z.array(assetFeedImageSchema).max(MAX_ASSET_FEED_MEDIA_PER_MUTATION).optional().describe('Variants such as 1200x628, 1080x1080, 1080x1920'),
  videos: z.array(assetFeedVideoSchema).max(MAX_ASSET_FEED_MEDIA_PER_MUTATION).optional(),
  bodies: z.array(assetFeedBodySchema).min(1).max(MAX_ASSET_FEED_TEXTS_PER_MUTATION),
  titles: z.array(assetFeedTitleSchema).max(MAX_ASSET_FEED_TEXTS_PER_MUTATION).optional(),
  descriptions: z.array(assetFeedDescriptionSchema).max(MAX_ASSET_FEED_TEXTS_PER_MUTATION).optional(),
  call_to_action_types: z.array(z.string()).max(MAX_ASSET_FEED_CTA_TYPES_PER_MUTATION).optional().describe('e.g. ["LEARN_MORE", "SHOP_NOW"]'),
  link_urls: z.array(z.object({ website_url: z.string().url() })).max(MAX_ASSET_FEED_LINK_URLS_PER_MUTATION).optional(),
  ad_formats: z.array(z.string()).max(MAX_ASSET_FEED_AD_FORMATS_PER_MUTATION).optional().describe('e.g. ["SINGLE_IMAGE", "CAROUSEL"]'),
});

export const cloneEntitySchema = z.object({
  ad_account_id: adAccountIdSchema,
  entity_type: entityTypeSchema,
  source_id: z.string(),
  parent_id: z.string().optional().describe('Target campaign id for ad_set, target ad set id for ad'),
  name_override: z.string().optional().describe('Appended to the copy name as " - <value>"'),
  safe_word: safeWordSchema,
  temp_id: tempIdSchema,
});

export const leadCreativeSchema = z.object({
  ad_account_id: adAccountIdSchema,
  name: z.string().min(1),
  page_id: z.string(),
  message: z.string().min(1).describe('Primary text above the image'),
  link: z.string().url(),
  image_hash: z.string(),
  headline: z.string().min(1),
  description: z.string().min(1),
  lead_gen_form_id: z.string(),
  call_to_action_type: ctaTypeSchema.default('SIGN_UP'),
  safe_word: safeWordSchema,
  temp_id: tempIdSchema,
});
