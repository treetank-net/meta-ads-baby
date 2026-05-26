import { z } from 'zod';

export const MAX_DAILY_BUDGET_CENTS = 50000_00;
export const MAX_LIFETIME_BUDGET_CENTS = 500000_00;
export const BUDGET_WARNING_CENTS = 500_00;

export const CODEX_HOOK_INSTALL_COMMAND = 'npx codex-marketplace add treetank-net/meta-ads-baby/hooks/meta-ads-baby-safety --hook --global';

export const adAccountIdSchema = z.string().describe('Meta ad account ID (digits only or act_XXXX format) from list_ad_accounts');
export const safeWordSchema = z.string().min(3).max(32).describe('Short random ASCII safe word for user confirmation. The LLM must invent this and include it in the preview shown to the user.');
export const campaignStatusSchema = z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']);
export const objectiveSchema = z.enum([
  'OUTCOME_APP_PROMOTION', 'OUTCOME_AWARENESS', 'OUTCOME_ENGAGEMENT',
  'OUTCOME_LEADS', 'OUTCOME_SALES', 'OUTCOME_TRAFFIC',
]);
export const billingEventSchema = z.enum(['IMPRESSIONS', 'LINK_CLICKS', 'THRUPLAY', 'APP_INSTALLS']);
export const optimizationGoalSchema = z.enum([
  'LINK_CLICKS', 'LANDING_PAGE_VIEWS', 'IMPRESSIONS', 'REACH',
  'OFFSITE_CONVERSIONS', 'LEAD_GENERATION', 'APP_INSTALLS', 'THRUPLAY', 'VALUE',
]);
