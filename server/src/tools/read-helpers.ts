import type { MetaAdsConfig } from '../config.js';

export function formatCurrency(amountInCents: string | number, currency: string): string {
  const cents = typeof amountInCents === 'string' ? parseInt(amountInCents, 10) : amountInCents;
  if (isNaN(cents)) return '?';
  return `${(cents / 100).toFixed(2)} ${currency}`;
}
