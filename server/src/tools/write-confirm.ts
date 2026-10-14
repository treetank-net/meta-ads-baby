import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MetaAdsConfig } from '../config.js';
import type { PendingMutation } from '../confirm.js';
import { confirmPendingSafeWord, consumeConfirmState, consumeToken, getPendingToken, getTokenTtlSeconds, listPending } from '../confirm.js';
import { recordFailure } from '../history.js';
import { CODEX_HOOK_INSTALL_COMMAND } from './write-schemas.js';
import { pendingTable } from './write-helpers.js';
import { executeMutation, formatMutationError } from './write-executor.js';

function resolveParams<T>(value: T, resolvedIds: Map<string, string>): T {
  if (typeof value === 'string') {
    if (value.startsWith('$')) {
      const resolved = resolvedIds.get(value);
      if (resolved === undefined) throw new Error(`Unresolved temp ID reference: ${value}`);
      return resolved as unknown as T;
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(item => resolveParams(item, resolvedIds)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = resolveParams(v, resolvedIds);
    }
    return out as unknown as T;
  }
  return value;
}

function extractResolvedId(action: string, rawResult: unknown): string | undefined {
  if (!rawResult || typeof rawResult !== 'object') return undefined;
  const r = rawResult as Record<string, unknown>;
  if (typeof r['id'] === 'string') return r['id'];
  if (typeof r['hash'] === 'string') return r['hash'];
  if (typeof r['copied_campaign_id'] === 'string') return r['copied_campaign_id'];
  if (typeof r['copied_adset_id'] === 'string') return r['copied_adset_id'];
  if (typeof r['copied_ad_id'] === 'string') return r['copied_ad_id'];
  return undefined;
}

export function registerConfirmTools(server: McpServer, cfg: MetaAdsConfig): void {
  server.tool(
    'get_safety_setup',
    'Explain the mutation safety model and hook installation.',
    {},
    async () => {
      const manual = process.env['META_ADS_ENABLE_MANUAL_CONFIRM'] === '1';
      const lines = [
        `Safety level: ${cfg.safetyLevel}. Mutation tokens are server-side, one-shot, and expire after ${getTokenTtlSeconds()}s.`,
        cfg.safetyLevel === 'off'
          ? 'Client hook gate: disabled (safety level off); the prepare token is still required.'
          : 'Client hook gate: required. A hook records the safe word on prepare_* and lets confirm_* through only after a user message containing it.',
        'Claude Code activates the plugin hooks automatically. Codex may show "No plugin hooks": it loads the MCP server but not plugin-local hooks.',
        `Codex fix: ${CODEX_HOOK_INSTALL_COMMAND}, then restart Codex and check the hooks are active before confirming.`,
        `Manual confirmation (confirm_safe_word, test only): ${manual ? 'enabled' : 'disabled'} via META_ADS_ENABLE_MANUAL_CONFIRM.`,
      ];
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
  );

  server.tool(
    'confirm_safe_word',
    'Test-only: confirm a safe word when META_ADS_ENABLE_MANUAL_CONFIRM=1.',
    {
      token: z.string(),
      safe_word: z.string().min(1),
    },
    async ({ token, safe_word }) => {
      const result = confirmPendingSafeWord(token, safe_word);
      if (!result.ok) {
        return { content: [{ type: 'text', text: `Error: ${result.error}` }] };
      }
      return { content: [{ type: 'text', text: 'OK: Safe word confirmed for this token. You can now call confirm_mutation.' }] };
    },
  );

  server.tool(
    'confirm_mutation',
    'Execute a prepared mutation after the user replied with its safe word.',
    {
      token: z.string(),
    },
    async ({ token }) => {
      const pendingMutation = getPendingToken(token);
      if (!pendingMutation) {
        return {
          content: [{ type: 'text', text: 'Error: Token is invalid or expired. Prepare the operation again using prepare_*.' }],
        };
      }

      const confirmState = consumeConfirmState(pendingMutation);
      if (!confirmState.ok) {
        return {
          content: [{ type: 'text', text: `Error: ${confirmState.error}` }],
        };
      }

      const mutation = consumeToken(token);
      if (!mutation) {
        return {
          content: [{ type: 'text', text: 'Error: Token is invalid or expired. Prepare the operation again using prepare_*.' }],
        };
      }

      try {
        const result = await executeMutation(cfg, mutation);
        return { content: [{ type: 'text', text: result.text }] };
      } catch (err: any) {
        const errMsg = formatMutationError(err);
        recordFailure(mutation.action, mutation.params as Record<string, any>, mutation.preview, errMsg);
        return { content: [{ type: 'text', text: `Error: ${errMsg}` }] };
      }
    },
  );

  server.tool(
    'confirm_all_mutations',
    'Execute several prepared mutations that share one confirmed safe word, in order.',
    {
      tokens: z.array(z.string()).min(1).max(50).describe('In run order'),
    },
    async ({ tokens }) => {
      const validated: PendingMutation[] = [];
      for (const token of tokens) {
        const m = getPendingToken(token);
        if (!m) {
          return { content: [{ type: 'text', text: `Error: Token ${token} is invalid or expired. Prepare the operations again using prepare_*.` }] };
        }
        validated.push(m);
      }

      const latest = validated.reduce((a, b) => a.createdAt > b.createdAt ? a : b);
      const confirmState = consumeConfirmState(latest);
      if (!confirmState.ok) {
        return { content: [{ type: 'text', text: `Error: ${confirmState.error}` }] };
      }

      const batchId = `batch-${Date.now()}`;
      const results: string[] = [];
      const resolvedIds = new Map<string, string>();
      let succeeded = 0;
      let failed = 0;
      for (let i = 0; i < tokens.length; i++) {
        const mutation = consumeToken(tokens[i]);
        if (!mutation) {
          results.push(`[${i + 1}/${tokens.length}] Error: Token expired during batch execution.`);
          failed++;
          continue;
        }
        try {
          mutation.params = resolveParams(mutation.params, resolvedIds);
        } catch (err: any) {
          const errMsg = err instanceof Error ? err.message : String(err);
          recordFailure(mutation.action, mutation.params as Record<string, any>, mutation.preview, errMsg, batchId);
          results.push(`[${i + 1}/${tokens.length}] Error [${mutation.action}]: ${errMsg}`);
          failed++;
          continue;
        }
        try {
          const result = await executeMutation(cfg, mutation, batchId);
          if (mutation.tempId) {
            const realId = extractResolvedId(mutation.action, result.rawResult);
            if (realId) resolvedIds.set(mutation.tempId, realId);
          }
          results.push(`[${i + 1}/${tokens.length}] ${result.text}`);
          succeeded++;
        } catch (err: any) {
          const errMsg = formatMutationError(err);
          recordFailure(mutation.action, mutation.params as Record<string, any>, mutation.preview, errMsg, batchId);
          results.push(`[${i + 1}/${tokens.length}] Error [${mutation.action}]: ${errMsg}`);
          failed++;
        }
      }

      const summary = `Batch complete: ${succeeded} succeeded, ${failed} failed out of ${tokens.length} operations.`;
      return { content: [{ type: 'text', text: `${summary}\n${results.join('\n')}` }] };
    },
  );

  server.tool(
    'list_pending_mutations',
    'List pending (unconfirmed) mutations.',
    {},
    async () => {
      const items = listPending();
      if (!items.length) {
        return { content: [{ type: 'text', text: 'No pending operations.' }] };
      }
      return { content: [{ type: 'text', text: pendingTable(items) }] };
    },
  );
}
