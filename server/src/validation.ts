export function normalizeAdAccountId(adAccountId: string): string {
  return adAccountId.trim().replace(/^act_/, '').replace(/-/g, '');
}

export function requireAdAccountId(adAccountId: string): string | null {
  const normalized = normalizeAdAccountId(adAccountId);
  if (!normalized) return 'Missing ad_account_id. Call list_ad_accounts and use the ad account ID.';
  if (!/^\d+$/.test(normalized)) return `Invalid ad_account_id "${adAccountId}". Use digits only, with or without act_ prefix.`;
  return null;
}

export function normalizeResourceId(id: string): string {
  return id.trim().replace(/-/g, '');
}
