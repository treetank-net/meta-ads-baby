import { z } from 'zod';
import type { MetaAdsConfig } from '../config.js';

export const pageSchema = z.number().int().positive().optional();

export const pageCharsSchema = z.number().int().min(4_000).max(200_000).optional();

export function formatCurrency(amountInCents: string | number, currency: string): string {
  const cents = typeof amountInCents === 'string' ? parseInt(amountInCents, 10) : amountInCents;
  if (isNaN(cents)) return '?';
  return `${(cents / 100).toFixed(2)} ${currency}`;
}
