const ACTION_KEYED_FIELDS = new Set([
  'actions',
  'action_values',
  'cost_per_action_type',
  'cost_per_unique_action_type',
  'purchase_roas',
  'website_purchase_roas',
  'conversions',
  'conversion_values',
  'video_p25_watched_actions',
  'video_p50_watched_actions',
  'video_p75_watched_actions',
  'video_p100_watched_actions',
  'video_thruplay_watched_actions',
  'outbound_clicks',
  'unique_actions',
]);

function isActionKeyedArray(key: string, value: unknown[]): boolean {
  if (!value.length) return false;
  const leaf = key.split('.').pop() ?? key;
  if (!ACTION_KEYED_FIELDS.has(leaf)) return false;
  return value.every((item) => item && typeof item === 'object' && 'action_type' in (item as object));
}

export function flattenRow(value: unknown, prefix = '', out: Record<string, unknown> = {}): Record<string, unknown> {
  if (value === undefined || value === null) return out;
  if (typeof value !== 'object') {
    if (prefix) out[prefix] = value;
    return out;
  }
  if (Array.isArray(value)) {
    if (!value.length) return out;
    if (isActionKeyedArray(prefix, value)) {
      for (const item of value as Array<{ action_type: string; value?: unknown }>) {
        out[`${prefix}.${item.action_type}`] = item.value;
      }
      return out;
    }
    const allScalar = value.every((item) => !item || typeof item !== 'object');
    if (allScalar) out[prefix] = value.join(' ~ ');
    else if (value.length) out[prefix] = JSON.stringify(value);
    return out;
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    flattenRow(item, prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
}

export function trimPrecision(value: unknown): unknown {
  const asNumber = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^-?\d+\.\d{8,}$/.test(value) ? Number(value) : undefined;
  if (asNumber === undefined || !Number.isFinite(asNumber) || Number.isInteger(asNumber)) return value;
  return Number(asNumber.toPrecision(6));
}

function escapeCell(value: unknown): string {
  if (value === undefined || value === null) return '';
  return String(value).replace(/[\t\r\n]+/g, ' ');
}

export function toTsv(rows: unknown[]): string {
  const flat = rows.map((row) => flattenRow(row));
  const columns: string[] = [];
  for (const row of flat) {
    for (const key of Object.keys(row)) if (!columns.includes(key)) columns.push(key);
  }
  if (!columns.length) return '';
  const lines = [columns.join('\t')];
  for (const row of flat) {
    lines.push(columns.map((column) => escapeCell(trimPrecision(row[column]))).join('\t'));
  }
  return lines.join('\n');
}

const TSV_LEGEND = 'Values are tab-separated; empty cell = field absent; repeated scalars are joined with " ~ "; action-keyed metrics are split into one column per action_type.';

export const DEFAULT_PAGE_CHARS = 40_000;

export interface Page<T> {
  rows: T[];
  page: number;
  pages: number;
  from: number;
  to: number;
  total: number;
}

function headerLength(rows: unknown[]): number {
  const first = rows.length ? toTsv([rows[0]]) : '';
  const newline = first.indexOf('\n');
  return newline < 0 ? first.length : newline + 1;
}

export function paginate<T>(rows: T[], page: number, maxChars = DEFAULT_PAGE_CHARS): Page<T> {
  const total = rows.length;
  if (!total) return { rows, page: 1, pages: 1, from: 0, to: 0, total: 0 };

  const rendered = toTsv(rows);
  const header = headerLength(rows);
  let perPage = total;
  if (rendered.length > maxChars) {
    const bodyChars = Math.max(1, rendered.length - header);
    const avgRow = bodyChars / total;
    const budget = Math.max(1, maxChars - header);
    perPage = Math.max(1, Math.floor(budget / avgRow));
  }

  const pages = Math.ceil(total / perPage);
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const start = (current - 1) * perPage;
  const slice = rows.slice(start, start + perPage);
  return { rows: slice, page: current, pages, from: start + 1, to: start + slice.length, total };
}

export function pageNote<T>(p: Page<T>, what: string): string | undefined {
  if (p.pages <= 1) return undefined;
  const more = p.page < p.pages ? ` Call again with page: ${p.page + 1} for the next slice.` : ' This is the last page.';
  return `Page ${p.page} of ${p.pages} — ${what} ${p.from}-${p.to} of ${p.total}. Split by response size, not by a fixed row count.${more}`;
}

export function tsvDocument(label: string, rows: unknown[], header: string[] = []): string {
  const parts = header.length ? [header.join('\n')] : [];
  if (!rows.length) {
    parts.push(`## ${label} (0)`);
    return parts.join('\n\n');
  }
  parts.push(`## ${label} (${rows.length})`, toTsv(rows), TSV_LEGEND);
  return parts.join('\n\n');
}
