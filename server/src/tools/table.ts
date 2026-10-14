import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { getConfigDir } from '../config.js';

export type Cell = string | number | boolean | null | undefined;
export type Row = Record<string, Cell>;

export const DEFAULT_TABLE_PAGE_CHARS = 12_000;
export const MIN_TABLE_PAGE_CHARS = 2_000;
export const MAX_TABLE_PAGE_CHARS = 100_000;

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function significant(value: number): number {
  if (Number.isInteger(value) || !Number.isFinite(value)) return value;
  return Math.abs(value) >= 1 ? roundTo(value, 2) : Number(value.toPrecision(3));
}

export function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && /^-?\d+(\.\d+)?(e-?\d+)?$/i.test(value.trim())) return Number(value);
  return undefined;
}

export function count(value: unknown): number | undefined {
  const n = toNumber(value);
  return n === undefined ? undefined : significant(n);
}

export function money(value: unknown): number | undefined {
  const n = toNumber(value);
  return n === undefined ? undefined : roundTo(n, 2);
}

export function percent(value: unknown): number | undefined {
  const n = toNumber(value);
  return n === undefined ? undefined : roundTo(n, 2);
}

export function ratio(numerator: number | undefined, denominator: number | undefined, scale = 1, decimals = 2): number | undefined {
  if (numerator === undefined || !denominator) return undefined;
  return roundTo((numerator / denominator) * scale, decimals);
}

export function text(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  return s ? s : undefined;
}

export function joinList(values: unknown[] | undefined): string | undefined {
  if (!values?.length) return undefined;
  return values.map(String).join(' ~ ');
}

export const shapeSchemas = {
  fields: z.array(z.string()).optional(),
  order_by: z.string().optional().describe('e.g. -spend'),
  limit: z.number().int().positive().optional(),
  min_cost: z.number().optional().describe('Minimum spend'),
  min_impressions: z.number().optional(),
  min_clicks: z.number().optional(),
  summary: z.boolean().optional().describe('Totals only'),
  page: z.number().int().positive().optional(),
  page_chars: z.number().int().min(MIN_TABLE_PAGE_CHARS).max(MAX_TABLE_PAGE_CHARS).optional(),
  output: z.enum(['inline', 'file']).optional().describe('file: all rows to a TSV file; returns path, totals and 5 rows'),
};

export const listShapeSchemas = {
  fields: shapeSchemas.fields,
  order_by: shapeSchemas.order_by,
  limit: shapeSchemas.limit,
  summary: shapeSchemas.summary,
  page: shapeSchemas.page,
  page_chars: shapeSchemas.page_chars,
  output: shapeSchemas.output,
};

export interface Shape {
  fields?: string[];
  order_by?: string;
  limit?: number;
  min_cost?: number;
  min_impressions?: number;
  min_clicks?: number;
  summary?: boolean;
  page?: number;
  page_chars?: number;
  output?: 'inline' | 'file';
}

export interface Shaped {
  rows: Row[];
  total: number;
  matched: number;
  totals: Row;
  columns: string[];
  notes: string[];
}

export class ShapeError extends Error {}

export function columnsOf(rows: Row[]): string[] {
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }
  return columns;
}

function requireColumn(column: string, available: string[], param: string): void {
  if (!available.includes(column)) {
    throw new ShapeError(`${param}: unknown column "${column}". Available: ${available.join(', ')}`);
  }
}

function compareCells(a: Cell, b: Cell, descending: boolean): number {
  const aEmpty = a === undefined || a === null || a === '';
  const bEmpty = b === undefined || b === null || b === '';
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;
  const result = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b));
  return descending ? -result : result;
}

export function sumColumns(rows: Row[], columns: string[], summable: (column: string) => boolean): Row {
  const totals: Row = {};
  for (const column of columns) {
    if (!summable(column)) continue;
    let sum = 0;
    let seen = false;
    for (const row of rows) {
      const value = row[column];
      if (typeof value === 'number') {
        sum += value;
        seen = true;
      }
    }
    if (seen) totals[column] = roundTo(sum, 2);
  }
  return totals;
}

export interface TableSpec {
  title: string;
  scope?: string[];
  currency?: string;
  rows: Row[];
  shape?: Shape;
  known?: string[];
  defaultFields?: string[];
  defaultOrder?: string;
  defaultLimit?: number;
  summable?: (column: string) => boolean;
  deriveTotals?: (totals: Row) => Row;
  extraNotes?: string[];
}

const THRESHOLDS: Array<[keyof Shape, string, string]> = [
  ['min_cost', 'spend', 'min_cost'],
  ['min_impressions', 'impressions', 'min_impressions'],
  ['min_clicks', 'clicks', 'min_clicks'],
];

export function shapeRows(spec: TableSpec): Shaped {
  const shape = spec.shape ?? {};
  const all = spec.rows;
  const present = columnsOf(all);
  const available = [...new Set([...(spec.known ?? []), ...present])];
  const notes: string[] = [];
  let rows = all;

  for (const [key, column, label] of THRESHOLDS) {
    const minimum = shape[key] as number | undefined;
    if (minimum === undefined) continue;
    requireColumn(column, available, label);
    rows = rows.filter((row) => typeof row[column] === 'number' && (row[column] as number) >= minimum);
    notes.push(`${label}=${minimum}`);
  }
  const matched = rows.length;

  const order = shape.order_by ?? spec.defaultOrder;
  if (order) {
    const descending = order.startsWith('-');
    const column = descending ? order.slice(1) : order;
    requireColumn(column, available, 'order_by');
    rows = [...rows].sort((a, b) => compareCells(a[column], b[column], descending));
  }

  let totals = spec.summable ? sumColumns(rows, present, spec.summable) : {};
  if (spec.deriveTotals && Object.keys(totals).length) totals = { ...totals, ...spec.deriveTotals(totals) };

  // A default top-N would defeat output: "file"; only an explicit limit applies there.
  const limit = shape.limit ?? (shape.output === 'file' ? undefined : spec.defaultLimit);
  if (limit !== undefined && rows.length > limit) {
    rows = rows.slice(0, limit);
    notes.push(`showing top ${limit} of ${matched}${order ? ` by ${order}` : ''}`);
  } else if (order) {
    notes.push(`by ${order}`);
  }

  let columns = present;
  if (shape.fields?.length) {
    for (const field of shape.fields) requireColumn(field, available, 'fields');
    columns = shape.fields;
  } else if (spec.defaultFields) {
    columns = spec.defaultFields.filter((column) => present.includes(column));
  }
  rows = rows.map((row) => Object.fromEntries(columns.filter((c) => c in row).map((c) => [c, row[c]])));
  if (shape.fields?.length || spec.defaultFields) {
    totals = Object.fromEntries(Object.entries(totals).filter(([column]) => columns.includes(column)));
  }

  return { rows, total: all.length, matched, totals, columns, notes };
}

function escapeCell(value: Cell): string {
  if (value === undefined || value === null) return '';
  return String(value).replace(/[\t\r\n]+/g, ' ');
}

export interface Layout {
  columns: string[];
  constants: Row;
}

export function layoutFor(rows: Row[], columns: string[]): Layout {
  const present = columns.filter((column) => rows.some((row) => row[column] !== undefined && row[column] !== ''));
  const constants: Row = {};
  if (rows.length < 2) return { columns: present, constants };
  const varying = present.filter((column) => {
    const first = rows[0][column];
    const constant = first !== undefined && rows.every((row) => row[column] === first);
    if (constant) constants[column] = first;
    return !constant;
  });
  return { columns: varying.length ? varying : present, constants: varying.length ? constants : {} };
}

export function renderRows(rows: Row[], columns: string[]): string {
  if (!columns.length || !rows.length) return '';
  return [columns.join('\t'), ...rows.map((row) => columns.map((column) => escapeCell(row[column])).join('\t'))].join('\n');
}

export function formatPairs(row: Row): string {
  return Object.entries(row).map(([key, value]) => `${key}=${escapeCell(value)}`).join(' ');
}

function pageRows(rows: Row[], columns: string[], page: number, maxChars: number): { rows: Row[]; page: number; pages: number; from: number } {
  if (!rows.length) return { rows, page: 1, pages: 1, from: 0 };
  const full = renderRows(rows, columns).length;
  let perPage = rows.length;
  if (full > maxChars) {
    const header = columns.join('\t').length + 1;
    const perRow = Math.max(1, (full - header) / rows.length);
    perPage = Math.max(1, Math.floor((maxChars - header) / perRow));
  }
  const pages = Math.ceil(rows.length / perPage);
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const start = (current - 1) * perPage;
  return { rows: rows.slice(start, start + perPage), page: current, pages, from: start + 1 };
}

export function tableDocument(spec: TableSpec): string {
  const shape = spec.shape ?? {};
  const shaped = shapeRows(spec);
  const layout = layoutFor(shaped.rows, shaped.columns);
  const rowCount = shaped.notes.some((note) => note.startsWith('showing')) ? [] : [`rows=${shaped.rows.length}`];
  const filtered = shaped.matched !== shaped.total ? [`${shaped.matched} of ${shaped.total} match`] : [];
  const head = [spec.title, ...(spec.scope ?? []), ...(spec.currency ? [`currency=${spec.currency}`] : []), ...rowCount, ...filtered, ...shaped.notes];
  const lines = [`# ${head.join(' · ')}`];
  const file = shape.output === 'file' && !shape.summary;
  if (!file && Object.keys(layout.constants).length) lines.push(`# ${formatPairs(layout.constants)}`);
  if (Object.keys(shaped.totals).length && (shaped.matched > 1 || shape.summary)) {
    lines.push(`# totals${shaped.matched !== shaped.rows.length ? ` (all ${shaped.matched})` : ''}: ${formatPairs(shaped.totals)}`);
  }
  for (const note of spec.extraNotes ?? []) lines.push(`# ${note}`);
  if (shape.summary) return lines.join('\n');
  if (file) return fileDocument(spec.title, shaped, lines);

  const paged = pageRows(shaped.rows, layout.columns, shape.page ?? 1, shape.page_chars ?? DEFAULT_TABLE_PAGE_CHARS);
  const body = renderRows(paged.rows, layout.columns);
  if (body) lines.push(body);
  if (paged.pages > 1) {
    const to = paged.from + paged.rows.length - 1;
    lines.push(`# page ${paged.page}/${paged.pages}, rows ${paged.from}-${to} of ${shaped.rows.length}${paged.page < paged.pages ? `; page: ${paged.page + 1} for more` : ''}`);
  }
  return lines.join('\n');
}

export const FILE_PREVIEW_ROWS = 5;

/**
 * output: "file" — every shaped row (filters, order, limit and fields still apply,
 * paging does not) goes to a plain TSV file: one header line of column names,
 * then rows; no `#` lines, no hoisted columns, so any TSV reader parses it as is.
 */
function fileDocument(title: string, shaped: Shaped, head: string[]): string {
  const columns = shaped.columns.filter((column) => shaped.rows.some((row) => row[column] !== undefined && row[column] !== null && row[column] !== ''));
  const dir = join(getConfigDir(), 'exports');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${title.replace(/[^a-z0-9_-]+/gi, '_')}-${new Date().toISOString().replace(/[:.]/g, '-')}.tsv`);
  const body = renderRows(shaped.rows, columns);
  writeFileSync(path, body ? `${body}\n` : `${columns.join('\t')}\n`, 'utf8');
  const lines = [...head];
  lines[0] = `${lines[0].replace(/ · rows=\d+/, '')} · rows=${shaped.rows.length} · file=${path}`;
  lines.splice(1, 0, `# columns: ${columns.join(' ')}`);
  const preview = renderRows(shaped.rows.slice(0, FILE_PREVIEW_ROWS), columns);
  if (preview) lines.push(preview);
  return lines.join('\n');
}

export function tableError(err: unknown): string | undefined {
  return err instanceof ShapeError ? `Error: ${err.message}` : undefined;
}
