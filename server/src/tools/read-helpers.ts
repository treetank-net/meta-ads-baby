import type { MetaAdsConfig } from '../config.js';
import type { Fetched, InsightRow } from '../client.js';
import { tableDocument, type Row, type Shape } from './table.js';
import {
  DEFAULT_ACTION_TYPES,
  type InsightPlan,
  insightActionTypes,
  insightApiFields,
  insightDefaultColumns,
  insightDerivedTotals,
  insightKnownColumns,
  insightPassThrough,
  insightRow,
  insightSummable,
  insightWindow,
} from './graph-rows.js';

export const MISSING_TOKEN = 'Error: Missing access token. Run setup_meta_auth first.';

export function tokenError(cfg: MetaAdsConfig) {
  return cfg.accessToken ? null : { content: [{ type: 'text' as const, text: MISSING_TOKEN }] };
}

export function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

export function cappedNote(rows: Fetched<unknown>): string[] {
  return rows.capped ? [`capped at ${rows.capped} rows by API paging; narrow the filter or date range`] : [];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface InsightArgs extends Shape {
  object_id: string;
  date_preset?: string;
  time_range?: { since: string; until: string };
  level?: 'account' | 'campaign' | 'adset' | 'ad';
  time_increment?: string;
  action_types?: string[];
}

export interface InsightQuery {
  plan: InsightPlan;
  apiFields: string[];
  datePreset?: string;
  timeRange?: { since: string; until: string };
}

export function insightLevel(args: InsightArgs): string {
  if (args.level) return args.level;
  return args.object_id.trim().startsWith('act_') ? 'account' : 'object';
}

export function buildInsightQuery(args: InsightArgs): InsightQuery | string {
  if (args.time_range) {
    const { since, until } = args.time_range;
    if (!ISO_DATE.test(since) || !ISO_DATE.test(until)) return 'time_range needs since and until as YYYY-MM-DD.';
    if (since > until) return 'time_range.since is after time_range.until.';
  }
  const requested = args.action_types?.length ? args.action_types : DEFAULT_ACTION_TYPES;
  const actionTypes = requested.length === 1 && requested[0] === 'all' ? 'all' : requested;
  const timeSeries = !!args.time_increment && args.time_increment !== 'all_days';
  const plan: InsightPlan = { level: insightLevel(args), actionTypes, timeSeries, passThrough: [] };
  plan.passThrough = insightPassThrough(args.fields, actionTypes);
  return {
    plan,
    apiFields: insightApiFields(plan, args.fields),
    datePreset: args.time_range ? undefined : (args.date_preset || 'last_30d'),
    timeRange: args.time_range,
  };
}

export function insightsDocument(args: InsightArgs, query: InsightQuery, raw: Fetched<InsightRow>): string {
  const { plan } = query;
  const actionTypes = insightActionTypes(raw, plan.actionTypes);
  const rows: Row[] = raw.map((item) => insightRow(item, plan, actionTypes));
  const currency = raw.find((r) => r.account_currency)?.account_currency;
  const window = query.timeRange ? `${query.timeRange.since}..${query.timeRange.until}` : [query.datePreset, insightWindow(raw)].filter(Boolean).join(' ');
  const scope = [args.object_id.trim(), ...(args.level ? [`level=${args.level}`] : []), window, ...(plan.timeSeries ? [`time_increment=${args.time_increment}`] : [])];
  const { object_id, date_preset, time_range, level, time_increment, action_types, ...shape } = args;
  return tableDocument({
    title: 'insights',
    scope,
    currency,
    rows,
    shape,
    known: insightKnownColumns(plan, actionTypes),
    defaultFields: insightDefaultColumns(plan, actionTypes),
    defaultOrder: plan.timeSeries ? 'date' : '-spend',
    defaultLimit: plan.timeSeries ? undefined : 50,
    summable: insightSummable(actionTypes),
    deriveTotals: insightDerivedTotals(actionTypes),
    extraNotes: cappedNote(raw),
  });
}
