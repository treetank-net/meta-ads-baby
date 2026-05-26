import type { MetaAdsConfig } from '../config.js';
import { normalizeAdAccountId, requireAdAccountId } from '../validation.js';
import { createToken, getTokenTtlSeconds } from '../confirm.js';
import { BUDGET_WARNING_CENTS, CODEX_HOOK_INSTALL_COMMAND } from './write-schemas.js';

export function validateAdAccount(adAccountId: string) {
  const error = requireAdAccountId(adAccountId);
  if (error) return { content: [{ type: 'text' as const, text: error }] };
  return null;
}

export function validationResult(message: string) {
  return { content: [{ type: 'text' as const, text: `Error: ${message}` }] };
}

export function formatBudget(cents: number, currency = 'PLN'): string {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

export function budgetWarning(dailyCents: number): string {
  if (dailyCents > BUDGET_WARNING_CENTS) {
    return `Warning: Daily budget ${formatBudget(dailyCents)} exceeds warning threshold of ${formatBudget(BUDGET_WARNING_CENTS)}`;
  }
  return '';
}

export function safetyHookNotice(cfg: MetaAdsConfig, safeWord?: string) {
  if (cfg.safetyLevel === 'off') {
    return {
      clientHookGate: 'disabled',
      note: 'Safety level is off. Server-side one-shot mutation tokens are still required, but the client hook gate is disabled.',
    };
  }

  return {
    clientHookGate: 'required',
    codexStatus: 'Codex currently does not reliably activate plugin-local hooks. If Codex UI says "No plugin hooks", treat hooks as not installed.',
    codexHookInstall: CODEX_HOOK_INSTALL_COMMAND,
    llmInstruction: [
      'Before calling confirm_mutation, ensure the user has installed/enabled the Meta Ads Baby safety hooks.',
      'In Codex, plugin installation alone may only enable MCP. Ask the user to install the hook package if hooks are missing.',
      safeWord ? `Then show the preview and ask the user to reply with the safe word "${safeWord}".` : 'Then show the preview and ask the user to reply with the safe word.',
      'Do not call confirm_mutation in the same assistant turn as prepare_*.',
    ].join(' '),
  };
}

export function prepareResponse(cfg: MetaAdsConfig, mutation: { token: string; safeWord: string }, preview: string) {
  const ttl = getTokenTtlSeconds();
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        status: 'pending_confirmation',
        token: mutation.token,
        safe_word: mutation.safeWord,
        expires_at: expiresAt,
        ttl_seconds: ttl,
        preview,
        instruction: `Show the user the preview and ask them to reply with the word "${mutation.safeWord}". Only after such a reply, call confirm_mutation with the token.`,
        safety: safetyHookNotice(cfg, mutation.safeWord),
      }, null, 2),
    }],
  };
}
