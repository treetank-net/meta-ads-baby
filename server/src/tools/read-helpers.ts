import { z } from 'zod';
import type { MetaAdsConfig } from '../config.js';

export const pageSchema = z.number().int().positive().optional()
  .describe('Page number (default 1). Results are split into pages by response size; the response says how many pages there are.');

export const pageCharsSchema = z.number().int().min(4_000).max(200_000).optional()
  .describe('Max characters per page (default 40000). Raise it only when you deliberately want a bigger single response.');

export function formatCurrency(amountInCents: string | number, currency: string): string {
  const cents = typeof amountInCents === 'string' ? parseInt(amountInCents, 10) : amountInCents;
  if (isNaN(cents)) return '?';
  return `${(cents / 100).toFixed(2)} ${currency}`;
}
