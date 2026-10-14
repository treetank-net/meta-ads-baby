import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MetaAdsConfig } from '../config.js';
import { normalizeAdAccountId } from '../validation.js';
import { createToken } from '../confirm.js';
import { getAdAccount } from '../client.js';
import { validateAdAccount, validationResult, prepareResponse, budgetWarning, formatBudget, amountFieldLimitError } from './write-helpers.js';
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
  promotedObjectSchema,
  MAX_SPECIAL_AD_CATEGORIES_PER_MUTATION,
} from './write-schemas.js';

export function registerCampaignPrepareTools(server: McpServer, cfg: MetaAdsConfig): void {
  server.tool(
    'prepare_campaign_status',
    'Pause, activate or archive a campaign.',
    {
      ad_account_id: adAccountIdSchema,
      campaign_id: z.string(),
      status: campaignStatusSchema,
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
    'Change the daily or lifetime budget of a campaign or ad set.',
    {
      ad_account_id: adAccountIdSchema,
      object_id: z.string(),
      object_type: z.enum(['campaign', 'ad_set']),
      daily_budget: z.number().positive().optional(),
      lifetime_budget: z.number().positive().optional(),
      safe_word: safeWordSchema,
      temp_id: tempIdSchema,
    },
    async ({ ad_account_id, object_id, object_type, daily_budget, lifetime_budget, safe_word, temp_id }) => {
      const accountError = validateAdAccount(ad_account_id);
      if (accountError) return accountError;
      if (!daily_budget && !lifetime_budget) {
        return validationResult('Provide daily_budget or lifetime_budget (in cents).');
      }
      const amountError = amountFieldLimitError({ daily_budget, lifetime_budget });
      if (amountError) return validationResult(amountError);
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
    'Create a campaign, PAUSED by default.',
    {
      ad_account_id: adAccountIdSchema,
      name: z.string().min(1),
      objective: objectiveSchema,
      status: campaignStatusSchema.default('PAUSED'),
      special_ad_categories: z.array(z.string()).max(MAX_SPECIAL_AD_CATEGORIES_PER_MUTATION).default(['NONE']).describe('HOUSING, EMPLOYMENT, CREDIT, ISSUES_ELECTIONS_POLITICS or NONE'),
      daily_budget: z.number().positive().optional(),
      lifetime_budget: z.number().positive().optional(),
      bid_strategy: z.string().optional().describe('e.g. LOWEST_COST_WITHOUT_CAP, LOWEST_COST_WITH_BID_CAP, COST_CAP'),
      safe_word: safeWordSchema,
      temp_id: tempIdSchema,
    },
    async ({ ad_account_id, name, objective, status, special_ad_categories, daily_budget, lifetime_budget, bid_strategy, safe_word, temp_id }) => {
      const accountError = validateAdAccount(ad_account_id);
      if (accountError) return accountError;
      const amountError = amountFieldLimitError({ daily_budget, lifetime_budget });
      if (amountError) return validationResult(amountError);
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
    'Create an ad set under an existing campaign, PAUSED by default.',
    {
      ad_account_id: adAccountIdSchema,
      campaign_id: z.string(),
      name: z.string().min(1),
      daily_budget: z.number().positive().optional(),
      lifetime_budget: z.number().positive().optional(),
      billing_event: billingEventSchema,
      optimization_goal: optimizationGoalSchema,
      targeting: z.record(z.unknown()).describe('Graph targeting spec: geo_locations, age_min, age_max, genders, flexible_spec, ...'),
      start_time: z.string().optional().describe('ISO 8601'),
      end_time: z.string().optional().describe('ISO 8601; required with lifetime_budget'),
      status: campaignStatusSchema.default('PAUSED'),
      bid_amount: z.number().positive().optional(),
      promoted_object: promotedObjectSchema.optional().describe('Required for OFFSITE_CONVERSIONS'),
      dsa_beneficiary: z.string().optional().describe('EU DSA; defaults to the ad account setting'),
      dsa_payor: z.string().optional().describe('EU DSA; defaults to the ad account setting'),
      safe_word: safeWordSchema,
      temp_id: tempIdSchema,
    },
    async ({ ad_account_id, campaign_id, name, daily_budget, lifetime_budget, billing_event, optimization_goal, targeting, start_time, end_time, status, bid_amount, promoted_object, dsa_beneficiary, dsa_payor, safe_word, temp_id }) => {
      const accountError = validateAdAccount(ad_account_id);
      if (accountError) return accountError;
      if (!daily_budget && !lifetime_budget) {
        return validationResult('Provide daily_budget or lifetime_budget (in cents).');
      }
      const amountError = amountFieldLimitError({ daily_budget, lifetime_budget, bid_amount });
      if (amountError) return validationResult(amountError);
      if (lifetime_budget && !end_time) {
        return validationResult('end_time is required when using lifetime_budget.');
      }
      const normalizedAccountId = normalizeAdAccountId(ad_account_id);

      let resolvedDsaBeneficiary = dsa_beneficiary;
      let resolvedDsaPayor = dsa_payor;
      if (!resolvedDsaBeneficiary || !resolvedDsaPayor) {
        try {
          const account = await getAdAccount(cfg, normalizedAccountId);
          resolvedDsaBeneficiary ||= account.default_dsa_beneficiary;
          resolvedDsaPayor ||= account.default_dsa_payor;
        } catch { /* non-fatal */ }
      }

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
      if (promoted_object) lines.push(`Promoted object: ${JSON.stringify(promoted_object)}`);
      if (resolvedDsaBeneficiary) lines.push(`DSA beneficiary: ${resolvedDsaBeneficiary}`);
      if (resolvedDsaPayor) lines.push(`DSA payor: ${resolvedDsaPayor}`);
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
        promoted_object,
        dsa_beneficiary: resolvedDsaBeneficiary,
        dsa_payor: resolvedDsaPayor,
      }, preview, safe_word.trim(), temp_id);
      return prepareResponse(cfg, mutation, preview);
    },
  );

  server.tool(
    'prepare_ad_set_status',
    'Pause, activate or archive an ad set.',
    {
      ad_account_id: adAccountIdSchema,
      ad_set_id: z.string(),
      status: entityStatusSchema,
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
    'Update an ad set: targeting, budget, optimization goal, bid, end time or promoted object.',
    {
      ad_account_id: adAccountIdSchema,
      ad_set_id: z.string(),
      targeting: z.record(z.unknown()).optional().describe('Full targeting spec'),
      daily_budget: z.number().positive().optional(),
      lifetime_budget: z.number().positive().optional(),
      optimization_goal: optimizationGoalSchema.optional(),
      bid_amount: z.number().positive().optional(),
      end_time: z.string().optional().describe('ISO 8601'),
      promoted_object: promotedObjectSchema.optional(),
      safe_word: safeWordSchema,
      temp_id: tempIdSchema,
    },
    async ({ ad_account_id, ad_set_id, targeting, daily_budget, lifetime_budget, optimization_goal, bid_amount, end_time, promoted_object, safe_word, temp_id }) => {
      const accountError = validateAdAccount(ad_account_id);
      if (accountError) return accountError;
      if (!targeting && !daily_budget && !lifetime_budget && !optimization_goal && !bid_amount && !end_time && !promoted_object) {
        return validationResult('Provide at least one field to update.');
      }
      const amountError = amountFieldLimitError({ daily_budget, lifetime_budget, bid_amount });
      if (amountError) return validationResult(amountError);
      const normalizedAccountId = normalizeAdAccountId(ad_account_id);
      const lines = [`Update ad set ${ad_set_id} on account ${normalizedAccountId}`];
      if (targeting) lines.push(`Targeting: ${JSON.stringify(targeting)}`);
      if (daily_budget) lines.push(`Daily budget: ${formatBudget(daily_budget)}`);
      if (lifetime_budget) lines.push(`Lifetime budget: ${formatBudget(lifetime_budget)}`);
      if (optimization_goal) lines.push(`Optimization goal: ${optimization_goal}`);
      if (bid_amount) lines.push(`Bid amount: ${formatBudget(bid_amount)}`);
      if (end_time) lines.push(`End time: ${end_time}`);
      if (promoted_object) lines.push(`Promoted object: ${JSON.stringify(promoted_object)}`);
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
        promoted_object,
      }, preview, safe_word.trim(), temp_id);
      return prepareResponse(cfg, mutation, preview);
    },
  );

  server.tool(
    'prepare_campaign_removal',
    'Delete a campaign with its ad sets and ads (irreversible).',
    {
      ad_account_id: adAccountIdSchema,
      campaign_id: z.string(),
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
    'Delete an ad set with its ads (irreversible).',
    {
      ad_account_id: adAccountIdSchema,
      ad_set_id: z.string(),
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
    'Update a campaign: name, spend cap, bid strategy, daily budget or status.',
    campaignUpdateSchema.shape,
    async ({ ad_account_id, campaign_id, name, spend_cap, bid_strategy, daily_budget, status, safe_word, temp_id }) => {
      const accountError = validateAdAccount(ad_account_id);
      if (accountError) return accountError;
      if (!name && !spend_cap && !bid_strategy && !daily_budget && !status) {
        return validationResult('Provide at least one field to update.');
      }
      const amountError = amountFieldLimitError({ daily_budget, spend_cap });
      if (amountError) return validationResult(amountError);
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
