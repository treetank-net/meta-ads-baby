import type { MetaAdsConfig } from '../config.js';
import { requireAdAccountId } from '../validation.js';
import { getTokenTtlSeconds, listPending, type PendingMutation } from '../confirm.js';
import { BUDGET_WARNING_CENTS, AMOUNT_FIELD_LIMITS } from './write-schemas.js';
import { currencyOffset } from './graph-rows.js';

export function validateAdAccount(adAccountId: string) {
  const error = requireAdAccountId(adAccountId);
  if (error) return { content: [{ type: 'text' as const, text: error }] };
  return null;
}

export function validationResult(message: string) {
  return { content: [{ type: 'text' as const, text: `Error: ${message}` }] };
}

export function formatBudget(minorUnits: number, currency?: string): string {
  if (!currency) return `${minorUnits} (minor units)`;
  const offset = currencyOffset(currency);
  return `${(minorUnits / offset).toFixed(offset === 1 ? 0 : 2)} ${currency}`;
}

export function amountFieldLimitError(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const nested = amountFieldLimitError(item);
      if (nested) return nested;
    }
    return null;
  }
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    const limit = AMOUNT_FIELD_LIMITS[key];
    if (limit) {
      const amount = typeof value === 'string' ? Number(value) : value;
      if (typeof amount === 'number' && Number.isFinite(amount) && amount > limit.max) {
        return `${limit.label} ${formatBudget(amount)} exceeds safety limit of ${formatBudget(limit.max)}.`;
      }
      continue;
    }
    if (value && typeof value === 'object') {
      const nested = amountFieldLimitError(value);
      if (nested) return nested;
    }
  }
  return null;
}

export function budgetWarning(dailyMinorUnits: number, currency?: string): string {
  if (dailyMinorUnits > BUDGET_WARNING_CENTS) {
    return `Warning: daily budget ${formatBudget(dailyMinorUnits, currency)} is above the ${formatBudget(BUDGET_WARNING_CENTS, currency)} warning threshold.`;
  }
  return '';
}

function ageSeconds(createdAt: number, now: number): string {
  return `${Math.max(0, Math.round((now - createdAt) / 1000))}s`;
}

export function pendingTable(items: PendingMutation[], now = Date.now()): string {
  return ['token\taction\tsafe_word\tage\tpreview', ...items.map((item) => [
    item.token,
    item.action,
    item.safeWord,
    ageSeconds(item.createdAt, now),
    item.preview.split('\n')[0],
  ].join('\t'))].join('\n');
}

export function prepareResponse(cfg: MetaAdsConfig, mutation: { token: string; safeWord: string }, preview: string) {
  const others = listPending().filter((item) => item.token !== mutation.token);
  const lines = [
    preview,
    '',
    `token: ${mutation.token} · safe word: "${mutation.safeWord}" · expires in ${getTokenTtlSeconds()}s`,
    `Ask the user to reply with "${mutation.safeWord}"; call confirm_mutation only after that reply.`,
  ];
  if (cfg.safetyLevel === 'off') lines.push('Safety level off: the client hook gate is disabled.');
  if (others.length) {
    const sameWord = others.filter((item) => item.safeWord === mutation.safeWord).length;
    lines.push(`Also pending (${others.length}${sameWord ? `, ${sameWord} under the same safe word: one reply covers them via confirm_all_mutations` : ''}):`);
    lines.push(pendingTable(others));
  }
  return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
}
