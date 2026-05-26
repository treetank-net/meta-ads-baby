import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MetaAdsConfig } from '../config.js';
import { normalizeAdAccountId } from '../validation.js';
import { createToken } from '../confirm.js';
import { validateAdAccount, validationResult, prepareResponse, budgetWarning, formatBudget } from './write-helpers.js';
import {
  adAccountIdSchema,
  safeWordSchema,
  tempIdSchema,
  campaignStatusSchema,
  entityStatusSchema,
  objectiveSchema,
  billingEventSchema,
  optimizationGoalSchema,
  campaignUpdateSchema,
  MAX_DAILY_BUDGET_CENTS,
  MAX_LIFETIME_BUDGET_CENTS,
} from './write-schemas.js';

export function registerCampaignPrepareTools(server: McpServer, cfg: MetaAdsConfig): void {
  server.tool(
    'prepare_campaign_status',
    'Prepare a Meta Ads campaign status change (activate/pause/archive). Returns a preview and confirmation token. The user MUST confirm before the change is applied.',
    {
      ad_account_id: adAccountIdSchema,
      campaign_id: z.string().describe('Campaign ID'),
      status: campaignStatusSchema.describe('Target status'),
      safe_word: safeWordSchema,
      temp_id: tempIdSchema,
    },
    async ({ ad_account_id, campaign_id, status, safe_word, temp_id }) => {
      const accountError = validateAdAccount(ad_account_id);
      if (accountError) return accountError;
      const normalizedAccountId = normalizeAdAccountId(ad_account_id);
      const preview = `Change campaign ${campaign_id} status to ${status} on account ${normalizedAccountId}`;
      const warning = status === 'ARCHIVED' ? '\nWarning: Archiving a campaign is irreversible.' : '';
      const mutation = createToken('campaign_status', {
        ad_account_id: normalizedAccountId,
        campaign_id,
        status,
      }, preview + warning, safe_word.trim(), temp_id);
      return prepareResponse(cfg, mutation, preview + warning);
    },
  );

  server.tool(
    'prepare_budget_change',
    'Prepare a budget change for a Meta Ads campaign or ad set. Returns a preview and confirmation token. The user MUST confirm before the change is applied.',
    {
      ad_account_id: adAccountIdSchema,
      object_id: z.string().describe('Campaign ID or ad set ID to update'),
      object_type: z.enum(['campaign', 'ad_set']).describe('Whether object_id is a campaign or ad set'),
      daily_budget: z.number().positive().optional().describe('New daily budget in cents (currency minor units). Provide this or lifetime_budget.'),
      lifetime_budget: z.number().positive().optional().describe('New lifetime budget in cents (currency minor units). Provide this or daily_budget.'),
      safe_word: safeWordSchema,
      temp_id: tempIdSchema,
    },
    async ({ ad_account_id, object_id, object_type, daily_budget, lifetime_budget, safe_word, temp_id }) => {
      const accountError = validateAdAccount(ad_account_id);
      if (accountError) return accountError;
      if (!daily_budget && !lifetime_budget) {
        return validationResult('Provide daily_budget or lifetime_budget (in cents).');
      }
      if (daily_budget && daily_budget > MAX_DAILY_BUDGET_CENTS) {
        return validationResult(`Daily budget ${formatBudget(daily_budget)} exceeds safety limit of ${formatBudget(MAX_DAILY_BUDGET_CENTS)}.`);
      }
      if (lifetime_budget && lifetime_budget > MAX_LIFETIME_BUDGET_CENTS) {
        return validationResult(`Lifetime budget ${formatBudget(lifetime_budget)} exceeds safety limit of ${formatBudget(MAX_LIFETIME_BUDGET_CENTS)}.`);
      }
      const normalizedAccountId = normalizeAdAccountId(ad_account_id);
      const budgetDesc = daily_budget
        ? `daily budget to ${formatBudget(daily_budget)}`
        : `lifetime budget to ${formatBudget(lifetime_budget!)}`;
      const preview = `Change ${object_type} ${object_id} ${budgetDesc} on account ${normalizedAccountId}`;
      const warning = daily_budget ? budgetWarning(daily_budget) : '';
      const mutation = createToken('budget_change', {
        ad_account_id: normalizedAccountId,
        object_id,
        object_type,
        daily_budget: daily_budget ? String(daily_budget) : undefined,
        lifetime_budget: lifetime_budget ? String(lifetime_budget) : undefined,
      }, warning ? `${preview}\n${warning}` : preview, safe_word.trim(), temp_id);
      return prepareResponse(cfg, mutation, warning ? `${preview}\n${warning}` : preview);
    },
  );

  server.tool(
    'prepare_campaign_create',
    'Prepare creation of a Meta Ads campaign. Returns a preview and confirmation token. The user MUST confirm before the campaign is created.',
    {
      ad_account_id: adAccountIdSchema,
      name: z.string().min(1).describe('Campaign name'),
      objective: objectiveSchema.describe('Campaign objective'),
      status: campaignStatusSchema.default('PAUSED').describe('Initial campaign status'),
      special_ad_categories: z.array(z.string()).default(['NONE']).describe('Special ad categories, e.g. HOUSING, EMPLOYMENT, CREDIT, or NONE'),
      daily_budget: z.number().positive().optional().describe('Daily budget in cents (currency minor units)'),
      lifetime_budget: z.number().positive().optional().describe('Lifetime budget in cents (currency minor units)'),
      bid_strategy: z.string().optional().describe('Bid strategy, e.g. LOWEST_COST_WITHOUT_CAP, LOWEST_COST_WITH_BID_CAP, COST_CAP'),
      safe_word: safeWordSchema,
      temp_id: tempIdSchema,
    },
    async ({ ad_account_id, name, objective, status, special_ad_categories, daily_budget, lifetime_budget, bid_strategy, safe_word, temp_id }) => {
      const accountError = validateAdAccount(ad_account_id);
      if (accountError) return accountError;
      if (daily_budget && daily_budget > MAX_DAILY_BUDGET_CENTS) {
        return validationResult(`Daily budget ${formatBudget(daily_budget)} exceeds safety limit of ${formatBudget(MAX_DAILY_BUDGET_CENTS)}.`);
      }
      if (lifetime_budget && lifetime_budget > MAX_LIFETIME_BUDGET_CENTS) {
        return validationResult(`Lifetime budget ${formatBudget(lifetime_budget)} exceeds safety limit of ${formatBudget(MAX_LIFETIME_BUDGET_CENTS)}.`);
      }
      const normalizedAccountId = normalizeAdAccountId(ad_account_id);
      const budgetLine = daily_budget
        ? `Daily budget: ${formatBudget(daily_budget)}`
        : lifetime_budget
          ? `Lifetime budget: ${formatBudget(lifetime_budget)}`
          : 'Budget: not set (will use ad set budgets)';
      const lines = [
        `Create ${status} campaign "${name}" with objective ${objective} on account ${normalizedAccountId}`,
        budgetLine,
        `Special ad categories: ${special_ad_categories.join(', ')}`,
      ];
      if (bid_strategy) lines.push(`Bid strategy: ${bid_strategy}`);
      const warning = daily_budget ? budgetWarning(daily_budget) : '';
      if (warning) lines.push(warning);
      const preview = lines.join('\n');
      const mutation = createToken('campaign_create', {
        ad_account_id: normalizedAccountId,
        name,
        objective,
        status,
        special_ad_categories,
        daily_budget: daily_budget ? String(daily_budget) : undefined,
        lifetime_budget: lifetime_budget ? String(lifetime_budget) : undefined,
        bid_strategy,
      }, preview, safe_word.trim(), temp_id);
      return prepareResponse(cfg, mutation, preview);
    },
  );

  server.tool(
    'prepare_ad_set_create',
    'Prepare creation of a Meta Ads ad set under an existing campaign. Returns a preview and confirmation token. The user MUST confirm before the ad set is created.',
    {
      ad_account_id: adAccountIdSchema,
      campaign_id: z.string().describe('Existing campaign ID'),
      name: z.string().min(1).describe('Ad set name'),
      daily_budget: z.number().positive().optional().describe('Daily budget in cents. Provide this or lifetime_budget.'),
      lifetime_budget: z.number().positive().optional().describe('Lifetime budget in cents. Provide this or daily_budget.'),
      billing_event: billingEventSchema.describe('Billing event'),
      optimization_goal: optimizationGoalSchema.describe('Optimization goal'),
      targeting: z.record(z.unknown()).describe('Targeting spec object (geo_locations, age_min, age_max, genders, interests, etc.)'),
      start_time: z.string().optional().describe('Start time in ISO 8601 format'),
      end_time: z.string().optional().describe('End time in ISO 8601 format (required for lifetime budgets)'),
      status: campaignStatusSchema.default('PAUSED').describe('Initial ad set status'),
      bid_amount: z.number().positive().optional().describe('Bid amount in cents for manual bidding'),
      safe_word: safeWordSchema,
      temp_id: tempIdSchema,
    },
    async ({ ad_account_id, campaign_id, name, daily_budget, lifetime_budget, billing_event, optimization_goal, targeting, start_time, end_time, status, bid_amount, safe_word, temp_id }) => {
      const accountError = validateAdAccount(ad_account_id);
      if (accountError) return accountError;
      if (!daily_budget && !lifetime_budget) {
        return validationResult('Provide daily_budget or lifetime_budget (in cents).');
      }
      if (daily_budget && daily_budget > MAX_DAILY_BUDGET_CENTS) {
        return validationResult(`Daily budget ${formatBudget(daily_budget)} exceeds safety limit of ${formatBudget(MAX_DAILY_BUDGET_CENTS)}.`);
      }
      if (lifetime_budget && lifetime_budget > MAX_LIFETIME_BUDGET_CENTS) {
        return validationResult(`Lifetime budget ${formatBudget(lifetime_budget)} exceeds safety limit of ${formatBudget(MAX_LIFETIME_BUDGET_CENTS)}.`);
      }
      if (lifetime_budget && !end_time) {
        return validationResult('end_time is required when using lifetime_budget.');
      }
      const normalizedAccountId = normalizeAdAccountId(ad_account_id);
      const budgetLine = daily_budget
        ? `Daily budget: ${formatBudget(daily_budget)}`
        : `Lifetime budget: ${formatBudget(lifetime_budget!)}`;
      const lines = [
        `Create ${status} ad set "${name}" in campaign ${campaign_id} on account ${normalizedAccountId}`,
        budgetLine,
        `Billing event: ${billing_event}`,
        `Optimization goal: ${optimization_goal}`,
        `Targeting: ${JSON.stringify(targeting)}`,
      ];
      if (start_time) lines.push(`Start: ${start_time}`);
      if (end_time) lines.push(`End: ${end_time}`);
      if (bid_amount) lines.push(`Bid amount: ${formatBudget(bid_amount)}`);
      const warning = daily_budget ? budgetWarning(daily_budget) : '';
      if (warning) lines.push(warning);
      const preview = lines.join('\n');
      const mutation = createToken('ad_set_create', {
        ad_account_id: normalizedAccountId,
        campaign_id,
        name,
        daily_budget: daily_budget ? String(daily_budget) : undefined,
        lifetime_budget: lifetime_budget ? String(lifetime_budget) : undefined,
        billing_event,
        optimization_goal,
        targeting,
        start_time,
        end_time,
        status,
        bid_amount: bid_amount ? String(bid_amount) : undefined,
      }, preview, safe_word.trim(), temp_id);
      return prepareResponse(cfg, mutation, preview);
    },
  );

  server.tool(
    'prepare_ad_set_status',
    'Prepare a Meta Ads ad set status change (activate/pause/archive). Returns a preview and confirmation token. The user MUST confirm before the change is applied.',
    {
      ad_account_id: adAccountIdSchema,
      ad_set_id: z.string().describe('Ad set ID'),
      status: entityStatusSchema.describe('Target status'),
      safe_word: safeWordSchema,
      temp_id: tempIdSchema,
    },
    async ({ ad_account_id, ad_set_id, status, safe_word, temp_id }) => {
      const accountError = validateAdAccount(ad_account_id);
      if (accountError) return accountError;
      const normalizedAccountId = normalizeAdAccountId(ad_account_id);
      const preview = `Change ad set ${ad_set_id} status to ${status} on account ${normalizedAccountId}`;
      const warning = status === 'ARCHIVED' ? '\nWarning: Archiving an ad set is irreversible.' : '';
      const mutation = createToken('ad_set_status', {
        ad_account_id: normalizedAccountId,
        ad_set_id,
        status,
      }, preview + warning, safe_word.trim(), temp_id);
      return prepareResponse(cfg, mutation, preview + warning);
    },
  );

  server.tool(
    'prepare_ad_set_update',
    'Prepare an update to an existing Meta Ads ad set (targeting, budget, optimization, bid, end time). Returns a preview and confirmation token. The user MUST confirm before the change is applied.',
    {
      ad_account_id: adAccountIdSchema,
      ad_set_id: z.string().describe('Ad set ID to update'),
      targeting: z.record(z.unknown()).optional().describe('New targeting spec object'),
      daily_budget: z.number().positive().optional().describe('New daily budget in cents'),
      lifetime_budget: z.number().positive().optional().describe('New lifetime budget in cents'),
      optimization_goal: optimizationGoalSchema.optional().describe('New optimization goal'),
      bid_amount: z.number().positive().optional().describe('New bid amount in cents'),
      end_time: z.string().optional().describe('New end time in ISO 8601 format'),
      safe_word: safeWordSchema,
      temp_id: tempIdSchema,
    },
    async ({ ad_account_id, ad_set_id, targeting, daily_budget, lifetime_budget, optimization_goal, bid_amount, end_time, safe_word, temp_id }) => {
      const accountError = validateAdAccount(ad_account_id);
      if (accountError) return accountError;
      if (!targeting && !daily_budget && !lifetime_budget && !optimization_goal && !bid_amount && !end_time) {
        return validationResult('Provide at least one field to update.');
      }
      if (daily_budget && daily_budget > MAX_DAILY_BUDGET_CENTS) {
        return validationResult(`Daily budget ${formatBudget(daily_budget)} exceeds safety limit of ${formatBudget(MAX_DAILY_BUDGET_CENTS)}.`);
      }
      if (lifetime_budget && lifetime_budget > MAX_LIFETIME_BUDGET_CENTS) {
        return validationResult(`Lifetime budget ${formatBudget(lifetime_budget)} exceeds safety limit of ${formatBudget(MAX_LIFETIME_BUDGET_CENTS)}.`);
      }
      const normalizedAccountId = normalizeAdAccountId(ad_account_id);
      const lines = [`Update ad set ${ad_set_id} on account ${normalizedAccountId}`];
      if (targeting) lines.push(`Targeting: ${JSON.stringify(targeting)}`);
      if (daily_budget) lines.push(`Daily budget: ${formatBudget(daily_budget)}`);
      if (lifetime_budget) lines.push(`Lifetime budget: ${formatBudget(lifetime_budget)}`);
      if (optimization_goal) lines.push(`Optimization goal: ${optimization_goal}`);
      if (bid_amount) lines.push(`Bid amount: ${formatBudget(bid_amount)}`);
      if (end_time) lines.push(`End time: ${end_time}`);
      const warning = daily_budget ? budgetWarning(daily_budget) : '';
      if (warning) lines.push(warning);
      const preview = lines.join('\n');
      const mutation = createToken('ad_set_update', {
        ad_account_id: normalizedAccountId,
        ad_set_id,
        targeting,
        daily_budget: daily_budget ? String(daily_budget) : undefined,
        lifetime_budget: lifetime_budget ? String(lifetime_budget) : undefined,
        optimization_goal,
        bid_amount: bid_amount ? String(bid_amount) : undefined,
        end_time,
      }, preview, safe_word.trim(), temp_id);
      return prepareResponse(cfg, mutation, preview);
    },
  );

  server.tool(
    'prepare_campaign_removal',
    'Prepare deletion of a Meta Ads campaign (sets status to DELETED). This is irreversible. Returns a preview and confirmation token. The user MUST confirm before the deletion.',
    {
      ad_account_id: adAccountIdSchema,
      campaign_id: z.string().describe('Campaign ID to delete'),
      safe_word: safeWordSchema,
      temp_id: tempIdSchema,
    },
    async ({ ad_account_id, campaign_id, safe_word, temp_id }) => {
      const accountError = validateAdAccount(ad_account_id);
      if (accountError) return accountError;
      const normalizedAccountId = normalizeAdAccountId(ad_account_id);
      const preview = `DELETE campaign ${campaign_id} on account ${normalizedAccountId}\nWarning: This is irreversible. The campaign and all its ad sets and ads will be deleted.`;
      const mutation = createToken('campaign_removal', {
        ad_account_id: normalizedAccountId,
        campaign_id,
      }, preview, safe_word.trim(), temp_id);
      return prepareResponse(cfg, mutation, preview);
    },
  );

  server.tool(
    'prepare_ad_set_removal',
    'Prepare deletion of a Meta Ads ad set (sets status to DELETED). This is irreversible. Returns a preview and confirmation token. The user MUST confirm before the deletion.',
    {
      ad_account_id: adAccountIdSchema,
      ad_set_id: z.string().describe('Ad set ID to delete'),
      safe_word: safeWordSchema,
      temp_id: tempIdSchema,
    },
    async ({ ad_account_id, ad_set_id, safe_word, temp_id }) => {
      const accountError = validateAdAccount(ad_account_id);
      if (accountError) return accountError;
      const normalizedAccountId = normalizeAdAccountId(ad_account_id);
      const preview = `DELETE ad set ${ad_set_id} on account ${normalizedAccountId}\nWarning: This is irreversible. The ad set and all its ads will be deleted.`;
      const mutation = createToken('ad_set_removal', {
        ad_account_id: normalizedAccountId,
        ad_set_id,
      }, preview, safe_word.trim(), temp_id);
      return prepareResponse(cfg, mutation, preview);
    },
  );

  server.tool(
    'prepare_campaign_update',
    'Prepare an update to an existing Meta Ads campaign (name, spend_cap, bid_strategy, daily_budget, status). Returns a preview and confirmation token. The user MUST confirm before the change is applied.',
    campaignUpdateSchema.shape,
    async ({ ad_account_id, campaign_id, name, spend_cap, bid_strategy, daily_budget, status, safe_word, temp_id }) => {
      const accountError = validateAdAccount(ad_account_id);
      if (accountError) return accountError;
      if (!name && !spend_cap && !bid_strategy && !daily_budget && !status) {
        return validationResult('Provide at least one field to update.');
      }
      if (daily_budget && daily_budget > MAX_DAILY_BUDGET_CENTS) {
        return validationResult(`Daily budget ${formatBudget(daily_budget)} exceeds safety limit of ${formatBudget(MAX_DAILY_BUDGET_CENTS)}.`);
      }
      const normalizedAccountId = normalizeAdAccountId(ad_account_id);
      const lines = [`Update campaign ${campaign_id} on account ${normalizedAccountId}`];
      if (name) lines.push(`Name: ${name}`);
      if (spend_cap) lines.push(`Spend cap: ${formatBudget(spend_cap)}`);
      if (bid_strategy) lines.push(`Bid strategy: ${bid_strategy}`);
      if (daily_budget) lines.push(`Daily budget: ${formatBudget(daily_budget)}`);
      if (status) lines.push(`Status: ${status}`);
      const warning = daily_budget ? budgetWarning(daily_budget) : '';
      if (warning) lines.push(warning);
      const preview = lines.join('\n');
      const mutation = createToken('campaign_update', {
        ad_account_id: normalizedAccountId,
        campaign_id,
        name,
        spend_cap: spend_cap ? String(spend_cap) : undefined,
        bid_strategy,
        daily_budget: daily_budget ? String(daily_budget) : undefined,
        status,
      }, preview, safe_word.trim(), temp_id);
      return prepareResponse(cfg, mutation, preview);
    },
  );
}
