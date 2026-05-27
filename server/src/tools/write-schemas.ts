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

export const promotedObjectSchema = z.object({
  pixel_id: z.string().describe('Facebook Pixel ID'),
  custom_event_type: z.string().optional().describe('Conversion event type, e.g. PURCHASE, LEAD, COMPLETE_REGISTRATION, ADD_TO_CART, INITIATED_CHECKOUT, SEARCH, CONTENT_VIEW, ADD_PAYMENT_INFO, ADD_TO_WISHLIST, OTHER'),
  pixel_rule: z.record(z.unknown()).optional().describe('Optional pixel rule for custom conversions'),
}).describe('Promoted object with pixel tracking configuration');

export const trackingSpecSchema = z.object({
  'action.type': z.array(z.string()).describe('Action types to track, e.g. ["offsite_conversion"]'),
  fb_pixel: z.array(z.string()).optional().describe('Pixel IDs to track'),
  'fb_pixel_event': z.array(z.string()).optional().describe('Pixel event names, e.g. ["fb_pixel_purchase"]'),
}).describe('Tracking spec for conversion tracking on ads');

export const adUpdateSchema = z.object({
  ad_account_id: adAccountIdSchema,
  ad_id: z.string().describe('Ad ID to update'),
  name: z.string().min(1).optional().describe('New ad name'),
  status: entityStatusSchema.optional().describe('New ad status'),
  creative_id: z.string().optional().describe('New ad creative ID'),
  tracking_specs: z.array(trackingSpecSchema).optional().describe('Tracking specs for conversion tracking (pixel events)'),
  multi_advertiser_enabled: z.boolean().optional().describe('Enable/disable multi-advertiser ads'),
  safe_word: safeWordSchema,
  temp_id: tempIdSchema,
});

export const assetFeedImageSchema = z.object({
  hash: z.string().describe('Image hash from prepare_image_upload'),
  image_crops: z.record(z.array(z.array(z.number()))).optional().describe('Crop specs per placement, e.g. {"100x100": [[0,0],[100,100]]}'),
});

export const assetFeedBodySchema = z.object({
  text: z.string().min(1).describe('Body text variant'),
});

export const assetFeedTitleSchema = z.object({
  text: z.string().min(1).describe('Headline variant'),
});

export const assetFeedDescriptionSchema = z.object({
  text: z.string().min(1).describe('Description variant'),
});

export const assetFeedVideoSchema = z.object({
  video_id: z.string().describe('Video ID from prepare_video_upload'),
  thumbnail_hash: z.string().optional().describe('Thumbnail image hash'),
});

export const assetFeedSpecSchema = z.object({
  images: z.array(assetFeedImageSchema).optional().describe('Multiple image variants (different formats: 1200x628, 1080x1080, 1080x1920)'),
  videos: z.array(assetFeedVideoSchema).optional().describe('Multiple video variants'),
  bodies: z.array(assetFeedBodySchema).min(1).describe('Body text variants (up to 5)'),
  titles: z.array(assetFeedTitleSchema).optional().describe('Headline variants (up to 5)'),
  descriptions: z.array(assetFeedDescriptionSchema).optional().describe('Description variants'),
  call_to_action_types: z.array(z.string()).optional().describe('CTA types, e.g. ["LEARN_MORE", "SHOP_NOW"]'),
  link_urls: z.array(z.object({ website_url: z.string().url() })).optional().describe('Link URL variants'),
  ad_formats: z.array(z.string()).optional().describe('Ad formats, e.g. ["SINGLE_IMAGE", "CAROUSEL"]'),
}).describe('Asset feed spec for Advantage+ Creative with multiple image/text/headline variants');

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
