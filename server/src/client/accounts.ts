import type { MetaAdsConfig } from '../config.js';
import { get, getAll, type PaginatedResponse } from './core.js';

export interface AdAccount {
  id: string;
  account_id: string;
  name: string;
  account_status: number;
  currency: string;
  timezone_name: string;
  amount_spent: string;
  balance: string;
  spend_cap: string;
  business_name?: string;
  business_country_code?: string;
  min_daily_budget?: number;
  created_time?: string;
  default_dsa_beneficiary?: string;
  default_dsa_payor?: string;
}

const AD_ACCOUNT_FIELDS = [
  'id', 'account_id', 'name', 'account_status', 'currency',
  'timezone_name', 'amount_spent', 'balance', 'spend_cap',
  'business_name', 'business_country_code', 'min_daily_budget', 'created_time',
  'default_dsa_beneficiary', 'default_dsa_payor',
].join(',');

export const ACCOUNT_STATUS_LABELS: Record<number, string> = {
  1: 'ACTIVE',
  2: 'DISABLED',
  3: 'UNSETTLED',
  7: 'PENDING_RISK_REVIEW',
  8: 'PENDING_SETTLEMENT',
  9: 'IN_GRACE_PERIOD',
  100: 'PENDING_CLOSURE',
  101: 'CLOSED',
};

export async function listAdAccounts(cfg: MetaAdsConfig): Promise<AdAccount[]> {
  return getAll<AdAccount>(cfg, '/me/adaccounts', { fields: AD_ACCOUNT_FIELDS, limit: '100' });
}

export async function getAdAccount(cfg: MetaAdsConfig, adAccountId: string): Promise<AdAccount> {
  return get<AdAccount>(cfg, `/act_${adAccountId}`, { fields: AD_ACCOUNT_FIELDS });
}
