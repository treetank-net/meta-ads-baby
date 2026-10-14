import type { AdAccount, Campaign, AdSet, Ad, AdCreative, CustomAudience, InsightRow, ActionStat } from '../client.js';
import { ACCOUNT_STATUS_LABELS } from '../client.js';
import { type Row, type Cell, count, money, percent, ratio, text, joinList, toNumber, roundTo } from './table.js';

const OFFSET_ONE_CURRENCIES = new Set(['CLP', 'COP', 'CRC', 'HUF', 'ISK', 'IDR', 'JPY', 'KRW', 'PYG', 'TWD', 'VND']);

export function currencyOffset(currency: string | undefined): number {
  return currency && OFFSET_ONE_CURRENCIES.has(currency.toUpperCase()) ? 1 : 100;
}

export function minorToMajor(value: unknown, currency: string | undefined): number | undefined {
  const n = toNumber(value);
  if (n === undefined) return undefined;
  return roundTo(n / currencyOffset(currency), 2);
}

function positiveMinor(value: unknown, currency: string | undefined): number | undefined {
  const amount = minorToMajor(value, currency);
  return amount ? amount : undefined;
}

export function isoTime(value: unknown): string | undefined {
  if (typeof value === 'number' || (typeof value === 'string' && /^\d{9,11}$/.test(value))) {
    const seconds = Number(value);
    if (!seconds) return undefined;
    return new Date(seconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  }
  const s = text(value);
  if (!s) return undefined;
  return s.replace(/^(\d{4}-\d{2}-\d{2})T00:00:00(?:[+-]\d{4}|Z)?$/, '$1');
}

function compactJson(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.stringify(value);
}

export const ACCOUNT_COLUMNS = ['account_id', 'account', 'status', 'currency', 'timezone', 'business', 'country', 'amount_spent', 'balance', 'spend_cap', 'min_daily_budget', 'created_time'];
export const ACCOUNT_DEFAULT = ['account_id', 'account', 'status', 'currency', 'timezone', 'business', 'amount_spent', 'balance', 'spend_cap'];

export function accountRow(a: AdAccount): Row {
  return {
    account_id: text(a.account_id) ?? text(a.id)?.replace(/^act_/, ''),
    account: text(a.name),
    status: ACCOUNT_STATUS_LABELS[a.account_status] ?? `UNKNOWN(${a.account_status})`,
    currency: text(a.currency),
    timezone: text(a.timezone_name),
    business: text(a.business_name),
    country: text(a.business_country_code),
    amount_spent: minorToMajor(a.amount_spent, a.currency),
    balance: minorToMajor(a.balance, a.currency),
    spend_cap: positiveMinor(a.spend_cap, a.currency),
    min_daily_budget: minorToMajor(a.min_daily_budget, a.currency),
    created_time: isoTime(a.created_time),
  };
}

export const CAMPAIGN_COLUMNS = ['campaign_id', 'campaign', 'status', 'objective', 'daily_budget', 'lifetime_budget', 'budget_remaining', 'spend_cap', 'bid_strategy', 'buying_type', 'special_ad_categories', 'start_time', 'stop_time', 'configured_status', 'status_setting', 'created_time', 'updated_time'];
export const CAMPAIGN_DEFAULT = ['campaign_id', 'campaign', 'status', 'objective', 'daily_budget', 'lifetime_budget', 'budget_remaining', 'spend_cap', 'bid_strategy', 'special_ad_categories', 'start_time', 'stop_time'];

export function campaignRow(c: Campaign, currency: string | undefined): Row {
  return {
    campaign_id: text(c.id),
    campaign: text(c.name),
    status: text(c.effective_status),
    objective: text(c.objective),
    daily_budget: positiveMinor(c.daily_budget, currency),
    lifetime_budget: positiveMinor(c.lifetime_budget, currency),
    budget_remaining: positiveMinor(c.budget_remaining, currency),
    spend_cap: positiveMinor(c.spend_cap, currency),
    bid_strategy: text(c.bid_strategy),
    buying_type: text(c.buying_type),
    special_ad_categories: joinList(c.special_ad_categories),
    start_time: isoTime(c.start_time),
    stop_time: isoTime(c.stop_time),
    configured_status: text(c.configured_status),
    status_setting: text(c.status),
    created_time: isoTime(c.created_time),
    updated_time: isoTime(c.updated_time),
  };
}

const GENDERS: Record<number, string> = { 1: 'male', 2: 'female' };

function ageRange(min: number | undefined, max: number | undefined): string | undefined {
  if (min === undefined && max === undefined) return undefined;
  return `${min ?? ''}-${max ?? ''}`;
}

function interestNames(targeting: AdSet['targeting']): string | undefined {
  const names = (targeting?.flexible_spec ?? []).flatMap((spec) => (spec.interests ?? []).map((i) => i.name));
  return joinList(names);
}

export const AD_SET_COLUMNS = ['adset_id', 'adset', 'campaign_id', 'status', 'daily_budget', 'lifetime_budget', 'budget_remaining', 'bid_amount', 'bid_strategy', 'billing_event', 'optimization_goal', 'conversion_event', 'pixel_id', 'destination_type', 'countries', 'regions', 'cities', 'age', 'genders', 'platforms', 'interests', 'custom_audiences', 'excluded_audiences', 'start_time', 'end_time', 'configured_status', 'created_time', 'updated_time', 'targeting'];
export const AD_SET_DEFAULT = ['adset_id', 'adset', 'campaign_id', 'status', 'daily_budget', 'lifetime_budget', 'budget_remaining', 'bid_amount', 'bid_strategy', 'billing_event', 'optimization_goal', 'conversion_event', 'countries', 'age', 'genders', 'platforms', 'interests', 'custom_audiences', 'excluded_audiences', 'start_time', 'end_time'];

export function adSetRow(s: AdSet, currency: string | undefined): Row {
  const t = s.targeting;
  const promoted = (s.promoted_object ?? {}) as Record<string, unknown>;
  return {
    adset_id: text(s.id),
    adset: text(s.name),
    campaign_id: text(s.campaign_id),
    status: text(s.effective_status),
    daily_budget: positiveMinor(s.daily_budget, currency),
    lifetime_budget: positiveMinor(s.lifetime_budget, currency),
    budget_remaining: positiveMinor(s.budget_remaining, currency),
    bid_amount: positiveMinor(s.bid_amount, currency),
    bid_strategy: text(s.bid_strategy),
    billing_event: text(s.billing_event),
    optimization_goal: text(s.optimization_goal),
    conversion_event: text(promoted['custom_event_type']),
    pixel_id: text(promoted['pixel_id']),
    destination_type: text(s.destination_type),
    countries: joinList(t?.geo_locations?.countries),
    regions: t?.geo_locations?.regions?.length || undefined,
    cities: t?.geo_locations?.cities?.length || undefined,
    age: ageRange(t?.age_min, t?.age_max),
    genders: t ? (joinList((t.genders ?? []).map((g) => GENDERS[g] ?? `UNKNOWN(${g})`)) ?? 'all') : undefined,
    platforms: joinList(t?.publisher_platforms),
    interests: interestNames(t),
    custom_audiences: t?.custom_audiences?.length || undefined,
    excluded_audiences: t?.excluded_custom_audiences?.length || undefined,
    start_time: isoTime(s.start_time),
    end_time: isoTime(s.end_time),
    configured_status: text(s.configured_status),
    created_time: isoTime(s.created_time),
    updated_time: isoTime(s.updated_time),
    targeting: compactJson(t),
  };
}

export const AD_COLUMNS = ['ad_id', 'ad', 'adset_id', 'campaign_id', 'status', 'creative_id', 'configured_status', 'created_time', 'updated_time'];
export const AD_DEFAULT = ['ad_id', 'ad', 'adset_id', 'campaign_id', 'status', 'creative_id'];

export function adRow(a: Ad): Row {
  return {
    ad_id: text(a.id),
    ad: text(a.name),
    adset_id: text(a.adset_id),
    campaign_id: text(a.campaign_id),
    status: text(a.effective_status),
    creative_id: text(a.creative?.creative_id ?? (a.creative as { id?: string } | undefined)?.id),
    configured_status: text(a.configured_status),
    created_time: isoTime(a.created_time),
    updated_time: isoTime(a.updated_time),
  };
}

export const CREATIVE_COLUMNS = ['creative_id', 'creative', 'status', 'object_type', 'format', 'cards', 'page_id', 'headline', 'body', 'description', 'cta', 'image_hash', 'video_id', 'link', 'url_tags', 'image_url', 'thumbnail_url', 'story_spec'];
export const CREATIVE_DEFAULT = ['creative_id', 'creative', 'status', 'object_type', 'format', 'cards', 'page_id', 'headline', 'body', 'description', 'cta', 'image_hash', 'video_id'];

export function creativeRow(c: AdCreative): Row {
  const spec = c.object_story_spec;
  const link = spec?.link_data;
  const video = spec?.video_data;
  const cards = link?.child_attachments?.length;
  const format = video ? 'video' : cards ? 'carousel' : link ? 'link' : undefined;
  return {
    creative_id: text(c.id),
    creative: text(c.name),
    status: text(c.status),
    object_type: text(c.object_type),
    format,
    cards: cards || undefined,
    page_id: text(spec?.page_id),
    headline: text(c.title) ?? text(link?.name) ?? text(video?.title),
    body: text(c.body) ?? text(link?.message) ?? text(video?.message),
    description: text(link?.description),
    cta: text(c.call_to_action_type) ?? text(link?.call_to_action?.type) ?? text(video?.call_to_action?.type),
    image_hash: text(c.image_hash) ?? text(link?.image_hash) ?? text(video?.image_hash),
    video_id: text(video?.video_id),
    link: text(c.link_url) ?? text(link?.link) ?? text(video?.call_to_action?.value?.link),
    url_tags: text(c.url_tags),
    image_url: text(c.image_url),
    thumbnail_url: text(c.thumbnail_url),
    story_spec: compactJson(spec),
  };
}

export const AUDIENCE_COLUMNS = ['audience_id', 'audience', 'subtype', 'size_min', 'size_max', 'delivery', 'operation', 'description', 'created_time', 'updated_time'];
export const AUDIENCE_DEFAULT = ['audience_id', 'audience', 'subtype', 'size_min', 'size_max', 'delivery', 'description', 'created_time', 'updated_time'];

function statusText(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return text(value);
  const status = value as { description?: string; status?: unknown; code?: unknown };
  return text(status.description) ?? text(status.status) ?? text(status.code);
}

export function audienceRow(a: CustomAudience): Row {
  const lower = toNumber(a.approximate_count_lower_bound);
  const upper = toNumber(a.approximate_count_upper_bound);
  return {
    audience_id: text(a.id),
    audience: text(a.name),
    subtype: text(a.subtype),
    size_min: lower !== undefined && lower >= 0 ? lower : undefined,
    size_max: upper !== undefined && upper >= 0 ? upper : undefined,
    delivery: statusText(a.delivery_status),
    operation: statusText(a.operation_status),
    description: text(a.description),
    created_time: isoTime(a.time_created),
    updated_time: isoTime(a.time_updated),
  };
}

export const DEFAULT_ACTION_TYPES = ['omni_purchase', 'lead', 'omni_add_to_cart', 'landing_page_view', 'link_click'];
const CPA_BY_DEFAULT = new Set(['purchase', 'lead']);

export function actionColumn(actionType: string): string {
  return actionType
    .replace(/^omni_/, '')
    .replace(/^offsite_conversion\.fb_pixel_/, 'pixel_')
    .replace(/^offsite_conversion\./, 'offsite_')
    .replace(/^onsite_conversion\./, 'onsite_')
    .replace(/^onsite_web_/, 'web_')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .toLowerCase();
}

export function actionColumns(actionTypes: string[]): Map<string, string> {
  const names = new Map<string, string>();
  const taken = new Set<string>();
  for (const type of actionTypes) {
    let name = actionColumn(type);
    if (taken.has(name)) name = type.replace(/[^A-Za-z0-9_]+/g, '_').toLowerCase();
    taken.add(name);
    names.set(type, name);
  }
  return names;
}

export const LEVEL_COLUMNS: Record<string, string[]> = {
  account: [],
  campaign: ['campaign_id', 'campaign'],
  adset: ['adset_id', 'adset', 'campaign'],
  ad: ['ad_id', 'ad', 'adset'],
};

export const INSIGHT_FIELD_MAP: Record<string, string> = {
  account_id: 'account_id',
  account: 'account_name',
  campaign_id: 'campaign_id',
  campaign: 'campaign_name',
  adset_id: 'adset_id',
  adset: 'adset_name',
  ad_id: 'ad_id',
  ad: 'ad_name',
  objective: 'objective',
  spend: 'spend',
  impressions: 'impressions',
  reach: 'reach',
  frequency: 'frequency',
  clicks: 'clicks',
  unique_clicks: 'unique_clicks',
  ctr_pct: 'ctr',
  cpc: 'cpc',
  cpm: 'cpm',
  cpp: 'cpp',
  link_clicks: 'inline_link_clicks',
  link_ctr_pct: 'inline_link_click_ctr',
  cost_per_link_click: 'cost_per_inline_link_click',
  quality_ranking: 'quality_ranking',
  engagement_rate_ranking: 'engagement_rate_ranking',
  conversion_rate_ranking: 'conversion_rate_ranking',
};

const INSIGHT_MONEY = new Set(['spend', 'cpc', 'cpm', 'cpp', 'cost_per_link_click']);
const INSIGHT_PERCENT = new Set(['ctr_pct', 'link_ctr_pct']);
const INSIGHT_COUNT = new Set(['impressions', 'reach', 'frequency', 'clicks', 'unique_clicks', 'link_clicks']);

export const CORE_INSIGHT_FIELDS = ['spend', 'impressions', 'reach', 'frequency', 'clicks', 'ctr', 'cpc', 'cpm', 'actions', 'action_values', 'account_currency', 'date_start', 'date_stop'];
export const BASE_INSIGHT_COLUMNS = ['spend', 'impressions', 'reach', 'frequency', 'clicks', 'ctr_pct', 'cpc', 'cpm'];

export interface InsightPlan {
  level: string;
  actionTypes: string[] | 'all';
  timeSeries: boolean;
  passThrough: string[];
}

function actionMap(stats: ActionStat[] | undefined): Map<string, number> {
  const map = new Map<string, number>();
  for (const stat of stats ?? []) {
    const value = toNumber(stat.value);
    if (value !== undefined) map.set(stat.action_type, value);
  }
  return map;
}

export function insightActionTypes(rows: InsightRow[], requested: string[] | 'all'): string[] {
  if (requested !== 'all') return requested;
  const seen = new Set<string>();
  for (const row of rows) for (const stat of row.actions ?? []) seen.add(stat.action_type);
  return [...seen];
}

function scalarCell(column: string, value: unknown): Cell {
  if (INSIGHT_MONEY.has(column)) return money(value);
  if (INSIGHT_PERCENT.has(column)) return percent(value);
  if (INSIGHT_COUNT.has(column)) return count(value);
  if (value && typeof value === 'object') {
    if (Array.isArray(value) && value.every((item) => item && typeof item === 'object' && 'value' in item)) {
      const total = value.reduce((sum, item) => sum + (toNumber((item as ActionStat).value) ?? 0), 0);
      return count(total);
    }
    return compactJson(value);
  }
  const n = toNumber(value);
  if (n !== undefined && !/(_id|^id)$/.test(column)) return count(n);
  return text(value);
}

export function insightRow(raw: InsightRow, plan: InsightPlan, actionTypes: string[]): Row {
  const source = raw as unknown as Record<string, unknown>;
  const row: Row = {};
  for (const column of LEVEL_COLUMNS[plan.level] ?? []) row[column] = text(source[INSIGHT_FIELD_MAP[column]]);
  if (plan.timeSeries) row['date'] = text(raw.date_start);
  for (const [column, field] of Object.entries(INSIGHT_FIELD_MAP)) {
    if (column in row || !(field in source)) continue;
    row[column] = scalarCell(column, source[field]);
  }
  for (const field of plan.passThrough) {
    if (!(field in source)) continue;
    row[field] = scalarCell(field, source[field]);
  }
  const spend = toNumber(raw.spend);
  const counts = actionMap(raw.actions);
  const values = actionMap(raw.action_values);
  for (const [type, name] of actionColumns(actionTypes)) {
    const n = counts.get(type);
    const v = values.get(type);
    row[name] = n === undefined ? undefined : count(n);
    row[`${name}_value`] = v === undefined ? undefined : money(v);
    row[`${name}_cpa`] = ratio(spend, n);
    if (name === 'purchase') row['roas'] = ratio(v, spend);
  }
  return row;
}

export function insightDefaultColumns(plan: InsightPlan, actionTypes: string[]): string[] {
  const columns = [...(LEVEL_COLUMNS[plan.level] ?? [])];
  if (plan.level === 'campaign') columns.push('objective');
  if (plan.timeSeries) columns.push('date');
  columns.push(...BASE_INSIGHT_COLUMNS);
  for (const name of actionColumns(actionTypes).values()) {
    columns.push(name, `${name}_value`);
    if (CPA_BY_DEFAULT.has(name)) columns.push(`${name}_cpa`);
    if (name === 'purchase') columns.push('roas');
  }
  return columns;
}

export function insightKnownColumns(plan: InsightPlan, actionTypes: string[]): string[] {
  const columns = [...Object.keys(INSIGHT_FIELD_MAP), 'date', ...plan.passThrough];
  for (const name of actionColumns(actionTypes).values()) columns.push(name, `${name}_value`, `${name}_cpa`);
  if ([...actionColumns(actionTypes).values()].includes('purchase')) columns.push('roas');
  return columns;
}

export function insightSummable(actionTypes: string[]): (column: string) => boolean {
  const actionNames = new Set(actionColumns(actionTypes).values());
  const fixed = new Set(['spend', 'impressions', 'clicks', 'unique_clicks', 'link_clicks']);
  return (column) => fixed.has(column) || actionNames.has(column) || (column.endsWith('_value') && actionNames.has(column.slice(0, -6)));
}

export function insightDerivedTotals(actionTypes: string[]): (totals: Row) => Row {
  const names = [...actionColumns(actionTypes).values()];
  return (totals) => {
    const num = (column: string) => (typeof totals[column] === 'number' ? totals[column] as number : undefined);
    const spend = num('spend');
    const derived: Row = {
      ctr_pct: ratio(num('clicks'), num('impressions'), 100),
      cpc: ratio(spend, num('clicks')),
      cpm: ratio(spend, num('impressions'), 1000),
    };
    for (const name of names) {
      derived[`${name}_cpa`] = ratio(spend, num(name));
      if (name === 'purchase') derived['roas'] = ratio(num('purchase_value'), spend);
    }
    return Object.fromEntries(Object.entries(derived).filter(([, value]) => value !== undefined));
  };
}

export function insightApiFields(plan: InsightPlan, requested: string[] | undefined): string[] {
  const fields = new Set(CORE_INSIGHT_FIELDS);
  for (const column of LEVEL_COLUMNS[plan.level] ?? []) fields.add(INSIGHT_FIELD_MAP[column]);
  if (plan.level === 'campaign') fields.add('objective');
  for (const column of requested ?? []) {
    if (INSIGHT_FIELD_MAP[column]) fields.add(INSIGHT_FIELD_MAP[column]);
  }
  for (const field of plan.passThrough) fields.add(field);
  return [...fields];
}

export function insightPassThrough(requested: string[] | undefined, actionTypes: string[] | 'all'): string[] {
  if (actionTypes === 'all') return [];
  const actionNames = new Set(actionColumns(actionTypes).values());
  return (requested ?? []).filter((column) => !INSIGHT_FIELD_MAP[column]
    && column !== 'date' && column !== 'roas'
    && !actionNames.has(column) && !actionNames.has(column.replace(/_(value|cpa)$/, '')));
}

export function insightWindow(rows: InsightRow[]): string | undefined {
  const starts = rows.map((r) => r.date_start).filter((d): d is string => !!d).sort();
  const stops = rows.map((r) => r.date_stop).filter((d): d is string => !!d).sort();
  if (!starts.length || !stops.length) return undefined;
  return `${starts[0]}..${stops[stops.length - 1]}`;
}
