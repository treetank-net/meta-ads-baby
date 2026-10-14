import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerWriteTools } from '../src/tools/write.js';
import { registerReadTools } from '../src/tools/read.js';
import { registerAuthTools } from '../src/tools/auth.js';
import { compactToolListing, compactSchema } from '../src/tools/compact-listing.js';
import { TOOL_PROFILE, normalizeProfile, isToolAllowed, withProfile, profileNotice, type ToolProfile } from '../src/tools/profile.js';
import { serverInstructions } from '../src/tools/instructions.js';
import { getConfigDir } from '../src/config.js';
import { homedir, tmpdir } from 'os';
import { join } from 'path';
import {
  AMOUNT_FIELD_LIMITS,
  MAX_DAILY_BUDGET_CENTS,
  MAX_LIFETIME_BUDGET_CENTS,
  MAX_BID_AMOUNT_CENTS,
  MAX_SPEND_CAP_CENTS,
} from '../src/tools/write-schemas.js';
import { amountFieldLimitError, formatBudget, prepareResponse } from '../src/tools/write-helpers.js';
import { createToken, listPending, consumeToken } from '../src/confirm.js';
import { recordSuccess, recordFailure } from '../src/history.js';
import { rememberAccountCurrency } from '../src/client.js';
import { tableDocument, tableError, layoutFor, significant, count, DEFAULT_TABLE_PAGE_CHARS, FILE_PREVIEW_ROWS } from '../src/tools/table.js';
import { DEFAULT_MAX_PAGES, FILE_MAX_PAGES } from '../src/client/core.js';
import { minorToMajor, campaignRow, accountRow, adSetRow, creativeRow, audienceRow, CAMPAIGN_COLUMNS, CAMPAIGN_DEFAULT, AD_SET_DEFAULT, CREATIVE_COLUMNS, CREATIVE_DEFAULT } from '../src/tools/graph-rows.js';
import { buildInsightQuery, insightsDocument, MISSING_TOKEN, type InsightArgs } from '../src/tools/read-helpers.js';
import { PLUGIN_VERSION } from '../src/constants.js';
import { readFileSync, mkdtempSync, rmSync } from 'fs';

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, detail = '') {
  if (condition) {
    console.log(`  OK  ${name}`);
    passed++;
  } else {
    console.log(`  FAIL  ${name}${detail ? ': ' + detail : ''}`);
    failed++;
  }
}

function guardConfigDir() {
  const real = join(homedir(), '.meta-ads-baby');
  const resolved = getConfigDir();
  if (resolved === real) {
    console.error(`\nAborting: tests resolved the real config directory (${resolved}). Set META_ADS_BABY_DATA to a temp path.`);
    process.exit(1);
  }
}

const TEST_CFG = {
  appId: '',
  appSecret: '',
  accessToken: 'test-token',
  safetyLevel: 'standard' as const,
  mutationTokenTtlSeconds: '',
  confirmStateTtlSeconds: '',
  toolProfile: 'full' as ToolProfile,
};

function registeredTools(): Record<string, any> {
  const server = new McpServer({ name: 'smoke', version: '0.0.0' });
  registerWriteTools(server, TEST_CFG);
  registerReadTools(server, TEST_CFG);
  return (server as any)._registeredTools as Record<string, any>;
}

function toolFieldNames(tool: any): string[] {
  return Object.keys(tool?.inputSchema?.shape ?? {});
}

function resultText(result: any): string {
  return String(result?.content?.[0]?.text ?? '');
}

const GRAPH_INSIGHTS_CAMPAIGN = [
  {
    campaign_id: '120210000000001', campaign_name: 'PL | Sales | Prospecting', objective: 'OUTCOME_SALES',
    spend: '1234.567', impressions: '120345', reach: '80211', frequency: '1.500374', clicks: '2410',
    ctr: '2.002576', cpc: '0.512269', cpm: '10.258569', account_currency: 'PLN',
    actions: [
      { action_type: 'link_click', value: '1980' },
      { action_type: 'landing_page_view', value: '1500' },
      { action_type: 'omni_add_to_cart', value: '210' },
      { action_type: 'add_to_cart', value: '210' },
      { action_type: 'offsite_conversion.fb_pixel_add_to_cart', value: '205' },
      { action_type: 'omni_purchase', value: '31' },
      { action_type: 'purchase', value: '31' },
      { action_type: 'offsite_conversion.fb_pixel_purchase', value: '30' },
      { action_type: 'onsite_web_purchase', value: '31' },
      { action_type: 'post_engagement', value: '4100' },
      { action_type: 'page_engagement', value: '4120' },
      { action_type: 'video_view', value: '3000' },
    ],
    action_values: [
      { action_type: 'omni_purchase', value: '6170.5' },
      { action_type: 'offsite_conversion.fb_pixel_purchase', value: '6000' },
    ],
    date_start: '2026-09-14', date_stop: '2026-10-13',
  },
  {
    campaign_id: '120210000000002', campaign_name: 'PL | Sales | Retargeting', objective: 'OUTCOME_SALES',
    spend: '410.2', impressions: '30100', reach: '9100', frequency: '3.307692', clicks: '1020',
    ctr: '3.388704', cpc: '0.402157', cpm: '13.627907', account_currency: 'PLN',
    actions: [
      { action_type: 'link_click', value: '900' },
      { action_type: 'landing_page_view', value: '700' },
      { action_type: 'omni_add_to_cart', value: '120' },
      { action_type: 'omni_purchase', value: '22' },
    ],
    action_values: [{ action_type: 'omni_purchase', value: '4400' }],
    date_start: '2026-09-14', date_stop: '2026-10-13',
  },
  {
    campaign_id: '120210000000003', campaign_name: 'PL | Sales | Test', objective: 'OUTCOME_SALES',
    spend: '3.1', impressions: '410', reach: '400', frequency: '1.025', clicks: '2',
    ctr: '0.487805', cpc: '1.55', cpm: '7.560976', account_currency: 'PLN',
    date_start: '2026-09-14', date_stop: '2026-10-13',
  },
];

function insightsText(args: Record<string, unknown>, raw: any[] = GRAPH_INSIGHTS_CAMPAIGN): string {
  const full = { object_id: 'act_123', level: 'campaign', ...args } as InsightArgs;
  const query = buildInsightQuery(full);
  if (typeof query === 'string') return `Error: ${query}`;
  return insightsDocument(full, query, raw as any);
}

function tableLines(text: string): { header: string[]; columns: string[]; rows: string[][] } {
  const lines = text.split('\n');
  const header = lines.filter((l) => l.startsWith('#'));
  const body = lines.filter((l) => !l.startsWith('#'));
  return { header, columns: body[0]?.split('\t') ?? [], rows: body.slice(1).map((l) => l.split('\t')) };
}

function testTableShaping() {
  console.log('\n--- Table shaping ---');

  assert('floats >= 1 keep 2 decimals', significant(12.34567) === 12.35);
  assert('floats < 1 keep 3 significant digits', significant(0.0123456) === 0.0123);
  assert('integers stay integers', significant(14000) === 14000);
  assert('numeric strings are parsed, ids are not touched by count()', count('120345') === 120345);

  const rows = [
    { id: '1', name: 'a', type: 'X', note: undefined, spend: 10, clicks: 3 },
    { id: '2', name: 'b', type: 'X', note: undefined, spend: 30, clicks: 1 },
    { id: '3', name: 'c', type: 'X', note: undefined, spend: 20, clicks: 0 },
  ];
  const layout = layoutFor(rows, ['id', 'name', 'type', 'note', 'spend']);
  assert('columns empty in every row are dropped', !layout.columns.includes('note'));
  assert('constant columns move to the header', layout.constants['type'] === 'X' && !layout.columns.includes('type'));

  const doc = tableDocument({ title: 't', rows, shape: { order_by: '-spend', limit: 1 }, summable: (c) => c === 'spend' || c === 'clicks' });
  const parsed = tableLines(doc);
  assert('limit keeps the top row by order_by', parsed.rows.length === 1 && parsed.rows[0][0] === '2');
  assert('truncation is declared in the header', doc.includes('showing top 1 of 3 by -spend'));
  assert('totals cover all matching rows, not just the shown ones', doc.includes('# totals (all 3): spend=60 clicks=4'));

  const filtered = tableDocument({ title: 't', rows, shape: { min_cost: 15 }, summable: (c) => c === 'spend' });
  assert('min_cost filters on spend and says so', filtered.includes('min_cost=15') && filtered.includes('2 of 3 match') && filtered.includes('spend=50'));

  const summary = tableDocument({ title: 't', rows, shape: { summary: true }, summable: (c) => c === 'spend' });
  assert('summary returns header and totals only', !summary.split('\n').some((l) => !l.startsWith('#')) && summary.includes('spend=60'));

  let error = '';
  try { tableDocument({ title: 't', rows, shape: { fields: ['nope'] } }); } catch (err) { error = tableError(err) ?? ''; }
  assert('unknown field is an actionable error listing the columns', error.startsWith('Error: fields: unknown column "nope"') && error.includes('spend'));

  const picked = tableLines(tableDocument({ title: 't', rows, shape: { fields: ['name', 'spend'] } }));
  assert('fields picks and orders columns', picked.columns.join(',') === 'name,spend');

  const known = tableDocument({ title: 't', rows, known: ['id', 'name', 'spend', 'budget'], shape: { fields: ['name', 'budget'] } });
  assert('a known column that is empty everywhere is not an error', !known.startsWith('Error') && known.includes('a'));

  const many = Array.from({ length: 3000 }, (_, i) => ({ id: String(i), term: `row number ${i} with some text` }));
  const page1 = tableDocument({ title: 'big', rows: many });
  assert('default page is about 12k chars', page1.length <= DEFAULT_TABLE_PAGE_CHARS + 400, `${page1.length}`);
  const note = page1.split('\n').pop() ?? '';
  assert('page note is one short line', note.startsWith('# page 1/') && note.length <= 120 && note.includes('page: 2'));
  const page2 = tableDocument({ title: 'big', rows: many, shape: { page: 2 } });
  assert('page 2 continues where page 1 stopped', page2.includes('# page 2/') && !page2.includes('row number 0 '));
  assert('no legend or footer on a single page', !tableDocument({ title: 't', rows }).toLowerCase().includes('tab-separated'));
}

function testCurrencyUnits() {
  console.log('\n--- Currency units ---');

  assert('minor units divide by 100 for PLN', minorToMajor('1000', 'PLN') === 10);
  assert('offset-1 currencies are whole units', minorToMajor('1000', 'JPY') === 1000 && minorToMajor('5000', 'HUF') === 5000);
  assert('unknown currency defaults to offset 100', minorToMajor(250, undefined) === 2.5);

  const campaign = campaignRow({
    id: '120210000000001', name: 'PL | Sales', objective: 'OUTCOME_SALES', status: 'ACTIVE', configured_status: 'ACTIVE', effective_status: 'ACTIVE',
    daily_budget: '15000', budget_remaining: '9050', spend_cap: '0', buying_type: 'AUCTION', special_ad_categories: [],
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP', start_time: '2026-01-05T10:00:00+0100', created_time: '2026-01-05T09:58:12+0100',
  } as any, 'PLN');
  assert('campaign budget converted from cents', campaign['daily_budget'] === 150 && campaign['budget_remaining'] === 90.5);
  assert('spend_cap 0 means no cap and renders empty', campaign['spend_cap'] === undefined);
  assert('empty special_ad_categories renders empty', campaign['special_ad_categories'] === undefined);

  const doc = tableDocument({ title: 'campaigns', currency: 'PLN', rows: [campaign, { ...campaign, campaign_id: '2', campaign: 'Other', status: 'PAUSED' }], known: CAMPAIGN_COLUMNS, defaultFields: CAMPAIGN_DEFAULT });
  const parsed = tableLines(doc);
  assert('campaign table keeps effective status as status', parsed.columns.includes('status'));
  assert('near-duplicate status columns are dropped by default', !doc.includes('configured_status') && !doc.includes('status_setting'));
  assert('created/updated times are not in the default set', !doc.includes('created_time'));
  assert('currency is in the header once', doc.split('\n')[0].includes('currency=PLN') && !parsed.rows.some((r) => r.join('\t').includes('PLN')));
  const asked = tableDocument({ title: 'campaigns', rows: [campaign], known: CAMPAIGN_COLUMNS, defaultFields: CAMPAIGN_DEFAULT, shape: { fields: ['campaign', 'configured_status'] } });
  assert('fields can bring back configured_status', asked.includes('configured_status') && asked.includes('ACTIVE'));

  const account = accountRow({ id: 'act_123', account_id: '123', name: 'Shop', account_status: 1, currency: 'JPY', timezone_name: 'Asia/Tokyo', amount_spent: '1234567', balance: '0', spend_cap: '0' } as any);
  assert('account amounts respect the account currency offset', account['amount_spent'] === 1234567 && account['status'] === 'ACTIVE');
  assert('unknown account status is named, not a bare number', accountRow({ account_status: 42 } as any)['status'] === 'UNKNOWN(42)');

  const adSet = adSetRow({
    id: '1', name: 'Women 25-45', campaign_id: '9', status: 'ACTIVE', configured_status: 'ACTIVE', effective_status: 'ACTIVE',
    daily_budget: '5000', bid_amount: '250', optimization_goal: 'OFFSITE_CONVERSIONS', billing_event: 'IMPRESSIONS',
    promoted_object: { pixel_id: '555', custom_event_type: 'PURCHASE' },
    targeting: { age_min: 25, age_max: 45, genders: [2], geo_locations: { countries: ['PL', 'CZ'] }, publisher_platforms: ['facebook', 'instagram'], flexible_spec: [{ interests: [{ id: '6003', name: 'Yoga' }, { id: '6004', name: 'Running' }] }], custom_audiences: [{ id: '1' }, { id: '2' }] },
  } as any, 'PLN');
  assert('ad set budget and bid converted', adSet['daily_budget'] === 50 && adSet['bid_amount'] === 2.5);
  assert('targeting is summarized, not JSON', adSet['age'] === '25-45' && adSet['genders'] === 'female' && adSet['countries'] === 'PL ~ CZ' && adSet['interests'] === 'Yoga ~ Running' && adSet['custom_audiences'] === 2);
  assert('promoted object becomes the conversion event', adSet['conversion_event'] === 'PURCHASE');
  assert('raw targeting JSON exists only as an opt-in column', !AD_SET_DEFAULT.includes('targeting') && String(adSet['targeting']).startsWith('{'));
}

function testInsightsShaping() {
  console.log('\n--- get_insights shaping ---');

  const text = insightsText({});
  const parsed = tableLines(text);
  assert('header names object, level, window and currency', parsed.header[0].startsWith('# insights · act_123 · level=campaign · last_30d 2026-09-14..2026-10-13 · currency=PLN'));
  assert('no dotted action columns', !parsed.columns.some((c) => c.includes('.')));
  assert('action arrays become a small fixed set of columns', parsed.columns.length <= 20, parsed.columns.join(','));
  assert('omni_purchase is named purchase', parsed.columns.includes('purchase') && parsed.columns.includes('purchase_value') && parsed.columns.includes('roas'));
  assert('non-selected action types do not appear', !text.includes('post_engagement') && !text.includes('video_view') && !text.includes('pixel_purchase'));
  assert('ranking fields are not requested by default', !text.includes('ranking'));
  assert('date_start/date_stop are not columns', !parsed.columns.includes('date_start') && !parsed.columns.includes('date_stop'));
  assert('constant objective is hoisted to a header line', parsed.header.some((h) => h === '# objective=OUTCOME_SALES'));
  const row = Object.fromEntries(parsed.columns.map((c, i) => [c, parsed.rows[0][i]]));
  assert('rows sorted by spend descending', row['campaign_id'] === '120210000000001');
  assert('ctr is already a percent and is not multiplied again', row['ctr_pct'] === '2' && parsed.columns.includes('ctr_pct'));
  assert('money rounded to 2 decimals', row['spend'] === '1234.57' && row['cpc'] === '0.51' && row['cpm'] === '10.26');
  assert('frequency rounded to 2 decimals', row['frequency'] === '1.5');
  assert('purchase cpa and roas are computed', row['purchase_cpa'] === '39.82' && row['roas'] === '5');
  assert('link clicks come from the link_click action', row['link_click'] === '1980');
  assert('totals sum spend and recompute ratios', /# totals: spend=1647.87 impressions=150855 clicks=3432 .*ctr_pct=2.28/.test(text), parsed.header.join(' | '));
  assert('reach is not summed (it is unique people)', !/totals:.*reach=/.test(text));
  assert('totals carry roas over all rows', /totals:.* roas=6.41/.test(text));

  const old = JSON.stringify(GRAPH_INSIGHTS_CAMPAIGN).length;
  assert('shaped output is far smaller than the raw Graph rows', text.length < old / 2, `shaped=${text.length} raw=${old}`);

  const filtered = insightsText({ min_cost: 100 });
  assert('min_cost drops low-spend rows and totals follow', filtered.includes('2 of 3 match') && !filtered.includes('Test'));

  const top = insightsText({ limit: 1 });
  assert('limit declares truncation, totals still cover all rows', top.includes('showing top 1 of 3 by -spend') && top.includes('totals (all 3)'));

  const custom = insightsText({ action_types: ['offsite_conversion.fb_pixel_purchase'] });
  assert('custom action_types get short names', custom.includes('pixel_purchase') && !/\tpurchase\t/.test(custom));

  const everything = insightsText({ action_types: ['all'] });
  assert('action_types ["all"] expands to every type present', everything.includes('post_engagement') && everything.includes('video_view'));

  const picked = tableLines(insightsText({ fields: ['campaign', 'spend', 'purchase', 'lead_cpa'] }));
  assert('fields picks insight columns including derived ones', picked.columns.join(',') === 'campaign,spend,purchase');

  const rankingQuery = buildInsightQuery({ object_id: '123', level: 'ad', fields: ['ad', 'quality_ranking'] } as InsightArgs);
  assert('ranking fields are requested only when asked for', typeof rankingQuery !== 'string' && rankingQuery.apiFields.includes('quality_ranking'));
  const defaultQuery = buildInsightQuery({ object_id: 'act_1' } as InsightArgs);
  assert('default query requests no ranking and no cost_per_action_type', typeof defaultQuery !== 'string' && !defaultQuery.apiFields.some((f) => f.includes('ranking') || f === 'cost_per_action_type'));
  assert('default date preset is last_30d', typeof defaultQuery !== 'string' && defaultQuery.datePreset === 'last_30d');
  const ranged = buildInsightQuery({ object_id: 'act_1', date_preset: 'last_7d', time_range: { since: '2026-09-01', until: '2026-09-30' } } as InsightArgs);
  assert('time_range overrides date_preset', typeof ranged !== 'string' && ranged.datePreset === undefined && ranged.timeRange?.since === '2026-09-01');
  assert('reversed time_range is rejected', typeof buildInsightQuery({ object_id: 'act_1', time_range: { since: '2026-10-01', until: '2026-09-01' } } as InsightArgs) === 'string');
  const passQuery = buildInsightQuery({ object_id: 'act_1', fields: ['spend', 'inline_post_engagement'] } as InsightArgs);
  assert('unknown fields pass through to Graph', typeof passQuery !== 'string' && passQuery.apiFields.includes('inline_post_engagement'));

  const daily = [1, 2, 3].map((d) => ({ spend: String(10 * d), impressions: String(1000 * d), clicks: String(10 * d), ctr: '1', account_currency: 'EUR', date_start: `2026-10-0${d}`, date_stop: `2026-10-0${d}` }));
  const series = insightsText({ level: undefined, time_increment: '1' }, daily);
  const seriesParsed = tableLines(series);
  assert('time series rows carry a date column, oldest first', seriesParsed.columns[0] === 'date' && seriesParsed.rows[0][0] === '2026-10-01');
  assert('time series is not cut by the default limit', seriesParsed.rows.length === 3 && !series.includes('showing top'));
  assert('constant ctr is hoisted in a time series', series.includes('# ctr_pct=1'));

  const one = insightsText({ level: undefined }, [GRAPH_INSIGHTS_CAMPAIGN[0]]);
  assert('account-level single row has no id columns', !tableLines(one).columns.includes('campaign_id'));

  const capped = Object.assign([...GRAPH_INSIGHTS_CAMPAIGN], { capped: 3 });
  assert('a paging cap is declared, never silent', insightsText({}, capped).includes('capped at 3 rows'));
}

function testCreativeAndAudienceRows() {
  console.log('\n--- Creatives and audiences ---');

  const carousel = creativeRow({
    id: '238', name: 'Autumn carousel', status: 'ACTIVE', object_type: 'SHARE',
    thumbnail_url: 'https://scontent.xx.fbcdn.net/v/t45.1600-4/123_n.png?stp=dst-png_p64x64&_nc_cat=1&ccb=1-7&_nc_sid=c2d1&oh=00_AYB&oe=670A',
    image_url: 'https://scontent.xx.fbcdn.net/v/t45.1600-4/456_n.jpg?_nc_cat=1&oh=00_AYC',
    object_story_spec: {
      page_id: '1010', link_data: {
        link: 'https://shop.example.com/?utm_source=facebook', message: 'New in: autumn collection',
        call_to_action: { type: 'SHOP_NOW' },
        child_attachments: [
          { image_hash: 'a1', link: 'https://shop.example.com/a', name: 'Coat' },
          { image_hash: 'b2', link: 'https://shop.example.com/b', name: 'Boots' },
          { image_hash: 'c3', link: 'https://shop.example.com/c', name: 'Scarf' },
        ],
      },
    },
  } as any);
  const doc = tableDocument({ title: 'ad_creatives', rows: [carousel, creativeRow({ id: '239', name: 'Plain', status: 'ACTIVE', body: 'Hi', image_hash: 'zz' } as any)], known: CREATIVE_COLUMNS, defaultFields: CREATIVE_DEFAULT });
  assert('carousel spec is summarized as format and card count', carousel['format'] === 'carousel' && carousel['cards'] === 3 && carousel['cta'] === 'SHOP_NOW');
  assert('no thumbnail or image URLs by default', !doc.includes('fbcdn'));
  assert('no JSON in cells by default', !doc.includes('{'));
  assert('copy and media ids are kept', doc.includes('New in: autumn collection') && doc.includes('zz'));
  const withUrls = tableDocument({ title: 'ad_creatives', rows: [carousel], known: CREATIVE_COLUMNS, defaultFields: CREATIVE_DEFAULT, shape: { fields: ['creative_id', 'thumbnail_url', 'story_spec'] } });
  assert('URLs and the raw spec come back when asked via fields', withUrls.includes('fbcdn') && withUrls.includes('"child_attachments"'));

  const audience = audienceRow({ id: '2384', name: 'Buyers 180d', subtype: 'WEBSITE', approximate_count_lower_bound: 12000, approximate_count_upper_bound: 14100, delivery_status: { code: 200, description: 'This audience is ready for use.' }, time_created: 1727700000 } as any);
  assert('epoch seconds become ISO timestamps', audience['created_time'] === '2024-09-30T12:40:00Z');
  assert('size bounds are numeric columns', audience['size_min'] === 12000 && audience['size_max'] === 14100);
  assert('delivery status object is summarized', audience['delivery'] === 'This audience is ready for use.');
}

async function testReadAuthChecks() {
  console.log('\n--- Read tools require a token ---');

  const server = new McpServer({ name: 'smoke', version: '0.0.0' });
  registerReadTools(server, { ...TEST_CFG, accessToken: '' });
  const tools = (server as any)._registeredTools as Record<string, any>;
  for (const name of ['list_ad_accounts', 'get_campaigns', 'get_ad_sets', 'get_ads', 'get_insights', 'get_ad_creatives', 'get_audiences']) {
    const result = await tools[name].handler({ ad_account_id: '123', object_id: 'act_123' }, {});
    assert(`${name} refuses without a token`, resultText(result) === MISSING_TOKEN, resultText(result).slice(0, 80));
  }
}

function testAmountLimits() {
  console.log('\n--- Amount limits (single enforcement point) ---');

  assert('daily_budget over the cap is rejected', !!amountFieldLimitError({ daily_budget: MAX_DAILY_BUDGET_CENTS + 1 }));
  assert('daily_budget at the cap is accepted', amountFieldLimitError({ daily_budget: MAX_DAILY_BUDGET_CENTS }) === null);
  assert('lifetime_budget over the cap is rejected', !!amountFieldLimitError({ lifetime_budget: MAX_LIFETIME_BUDGET_CENTS + 1 }));
  assert('bid_amount over the cap is rejected', !!amountFieldLimitError({ bid_amount: MAX_BID_AMOUNT_CENTS + 1 }));
  assert('spend_cap over the cap is rejected', !!amountFieldLimitError({ spend_cap: MAX_SPEND_CAP_CENTS + 1 }));
  assert('undefined amounts pass', amountFieldLimitError({ daily_budget: undefined, bid_amount: undefined }) === null);
  assert('numeric string amounts are checked too', !!amountFieldLimitError({ daily_budget: String(MAX_DAILY_BUDGET_CENTS + 1) }));
  assert('nested payload is checked recursively', !!amountFieldLimitError({ ad_set: { bid_amount: MAX_BID_AMOUNT_CENTS + 1 } }));
  assert('arrays of payloads are checked', !!amountFieldLimitError([{ daily_budget: MAX_DAILY_BUDGET_CENTS + 1 }]));
  assert('error message names the field and both amounts', String(amountFieldLimitError({ bid_amount: MAX_BID_AMOUNT_CENTS + 1 })).includes(formatBudget(MAX_BID_AMOUNT_CENTS)));
  assert('every capped field has a label', Object.values(AMOUNT_FIELD_LIMITS).every((l) => !!l.label));
}

async function testCapSweep() {
  console.log('\n--- Cap sweep across every registered money field ---');

  const tools = registeredTools();
  const safeAmounts: Record<string, number> = { daily_budget: 1_000, lifetime_budget: 10_000, bid_amount: 100, spend_cap: 10_000 };
  let checked = 0;

  for (const [name, tool] of Object.entries(tools)) {
    if (!name.startsWith('prepare_')) continue;
    const fields = toolFieldNames(tool).filter((f) => f in AMOUNT_FIELD_LIMITS);
    for (const field of fields) {
      const args: Record<string, unknown> = {
        ad_account_id: '1234567890',
        safe_word: 'smoke',
        object_id: '1',
        object_type: 'campaign',
        campaign_id: '1',
        ad_set_id: '1',
        ad_id: '1',
        name: 'smoke',
        objective: 'OUTCOME_SALES',
        status: 'PAUSED',
        special_ad_categories: ['NONE'],
        billing_event: 'IMPRESSIONS',
        optimization_goal: 'LINK_CLICKS',
        targeting: { geo_locations: { countries: ['PL'] } },
        creative_id: '1',
      };
      for (const other of Object.keys(AMOUNT_FIELD_LIMITS)) {
        if (toolFieldNames(tool).includes(other) && other !== field) args[other] = safeAmounts[other];
      }
      args[field] = AMOUNT_FIELD_LIMITS[field].max * 10;

      const result = await (tool.handler ?? tool.callback)(args, {});
      const text = resultText(result);
      assert(`${name}.${field} rejects 10x the cap`, text.includes('exceeds safety limit'), text.slice(0, 140));
      checked++;
    }
  }

  assert('sweep covered at least one money field per capped name', checked >= Object.keys(AMOUNT_FIELD_LIMITS).length, `checked=${checked}`);
  console.log(`  (swept ${checked} money fields)`);
}

function testToolContract() {
  console.log('\n--- Tool contract ---');

  const tools = registeredTools();
  for (const kernel of ['confirm_mutation', 'confirm_all_mutations', 'confirm_safe_word', 'get_safety_setup', 'list_pending_mutations', 'get_mutation_history', 'get_mutation_stats']) {
    assert(`${kernel} is registered`, kernel in tools);
  }

  const prepareTools = Object.keys(tools).filter((n) => n.startsWith('prepare_'));
  assert('every prepare tool takes a safe_word', prepareTools.every((n) => toolFieldNames(tools[n]).includes('safe_word')), prepareTools.filter((n) => !toolFieldNames(tools[n]).includes('safe_word')).join(', '));

  const pkgVersion = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
  assert('PLUGIN_VERSION matches package.json', PLUGIN_VERSION === pkgVersion, `constant=${PLUGIN_VERSION} package=${pkgVersion}`);

  const listReadTools = ['list_ad_accounts', 'get_campaigns', 'get_ad_sets', 'get_ads', 'get_insights', 'get_ad_creatives', 'get_audiences'];
  for (const name of listReadTools) {
    assert(`${name} exposes pagination`, name in tools && toolFieldNames(tools[name]).includes('page'));
  }
}

function registeredForProfile(profile: ToolProfile): Record<string, any> {
  const server = new McpServer({ name: 'smoke', version: '0.0.0' });
  const target = withProfile(server, profile);
  const cfg = { ...TEST_CFG, toolProfile: profile };
  registerAuthTools(target, cfg);
  registerReadTools(target, cfg);
  registerWriteTools(target, cfg);
  return (server as any)._registeredTools as Record<string, any>;
}

function testProfiles() {
  console.log('\n--- Tool profiles ---');

  assert('unset profile defaults to read', normalizeProfile(undefined) === 'read');
  assert('unknown profile value falls back to read', normalizeProfile('everything') === 'read');
  assert('full must be asked for explicitly', normalizeProfile('full') === 'full');
  assert('profile value is case- and space-insensitive', normalizeProfile('  Manage ') === 'manage');

  const full = registeredForProfile('full');
  const manage = registeredForProfile('manage');
  const read = registeredForProfile('read');

  const names = Object.keys(full);
  const unclassified = names.filter((n) => !(n in TOOL_PROFILE));
  assert('every registered tool is classified into a profile', unclassified.length === 0, unclassified.join(', '));
  const stale = Object.keys(TOOL_PROFILE).filter((n) => !names.includes(n));
  assert('the profile map has no entries for tools that no longer exist', stale.length === 0, stale.join(', '));

  assert('manage registers fewer tools than full', Object.keys(manage).length < names.length);
  assert('read registers fewer tools than manage', Object.keys(read).length < Object.keys(manage).length);
  assert('read exposes no prepare_* tool', !Object.keys(read).some((n) => n.startsWith('prepare_')));
  assert('read exposes no confirm_* tool', !Object.keys(read).some((n) => n.startsWith('confirm_')));
  assert('read keeps every list tool and insights', ['list_ad_accounts', 'get_campaigns', 'get_ad_sets', 'get_ads', 'get_insights', 'get_ad_creatives', 'get_audiences'].every((n) => n in read));
  assert('read keeps auth so the user can still connect', 'setup_meta_auth' in read);
  assert('read keeps mutation history for auditing', 'get_mutation_history' in read && 'get_mutation_stats' in read);

  assert('manage keeps status, budget and update tools', ['prepare_campaign_status', 'prepare_budget_change', 'prepare_ad_set_update', 'prepare_ad_update', 'prepare_campaign_update'].every((n) => n in manage));
  assert('manage keeps the confirm kernel', ['confirm_mutation', 'confirm_all_mutations', 'confirm_safe_word', 'get_safety_setup', 'list_pending_mutations'].every((n) => n in manage));
  assert('manage excludes creation tools', !Object.keys(manage).some((n) => n.endsWith('_create')));
  assert('manage excludes creatives and uploads', !Object.keys(manage).some((n) => n.endsWith('_creative') || n.endsWith('_upload')));
  assert('manage excludes cloning and audiences', !('prepare_clone_entity' in manage) && !('prepare_lookalike_audience' in manage));

  assert('a manage-level tool is allowed under full', isToolAllowed('prepare_budget_change', 'full'));
  assert('a full-level tool is refused under manage', !isToolAllowed('prepare_campaign_create', 'manage'));
  assert('an unknown tool name is allowed rather than silently hidden', isToolAllowed('some_future_tool', 'read'));

  assert('read profile states mutations are impossible', profileNotice('read').includes('mutations are impossible'));
  assert('manage profile names the env var needed to unlock creation', profileNotice('manage').includes('META_ADS_BABY_PROFILE=full'));
  assert('full profile adds no notice', profileNotice('full') === '');
}

const LISTING_BUDGET_CHARS: Record<ToolProfile, number> = { read: 6_700, manage: 13_500, full: 25_000 };
const INSTRUCTIONS_BUDGET = 2_500;
const PREPARE_OVERHEAD_BUDGET = 300;
const TOOL_DESCRIPTION_BUDGET = 200;
const PARAM_DESCRIPTION_BUDGET = 100;

async function listedTools(profile: ToolProfile): Promise<any[]> {
  const server = new McpServer({ name: 'smoke', version: '0.0.0' });
  const target = withProfile(server, profile);
  const cfg = { ...TEST_CFG, toolProfile: profile };
  registerAuthTools(target, cfg);
  registerReadTools(target, cfg);
  registerWriteTools(target, cfg);
  compactToolListing(server);
  const handler = (server.server as any)._requestHandlers.get('tools/list');
  const listing = await handler({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }, {});
  return listing.tools;
}

function paramDescriptions(schema: unknown, path: string, out: Array<[string, string]>): void {
  if (Array.isArray(schema)) return schema.forEach((item) => paramDescriptions(item, path, out));
  if (!schema || typeof schema !== 'object') return;
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (key === 'description' && typeof value === 'string') out.push([path, value]);
    else paramDescriptions(value, key === 'properties' || key === 'items' ? path : `${path}.${key}`, out);
  }
}

async function testToolListingBudget() {
  console.log('\n--- Tool listing budget ---');

  const compacted = compactSchema({ type: 'object', $schema: 'x', additionalProperties: false, properties: { pattern: { type: 'string', pattern: '^a$', minLength: 1, maxLength: 30 }, n: { type: 'number', exclusiveMinimum: 0 } } }) as any;
  assert('compaction drops validation-only keys', !('$schema' in compacted) && !('additionalProperties' in compacted) && !('pattern' in compacted.properties.pattern) && !('exclusiveMinimum' in compacted.properties.n));
  assert('compaction keeps a property that happens to be named like a dropped key', 'pattern' in compacted.properties);
  assert('compaction keeps limits the model writes against', compacted.properties.pattern.maxLength === 30 && !('minLength' in compacted.properties.pattern));

  for (const profile of ['read', 'manage', 'full'] as ToolProfile[]) {
    const tools = await listedTools(profile);
    const size = JSON.stringify(tools).length;
    assert(`${profile} tools/list stays within ${LISTING_BUDGET_CHARS[profile]} chars`, size <= LISTING_BUDGET_CHARS[profile], `${size} chars`);
    assert(`${profile} tools/list carries no taskSupport boilerplate`, !tools.some((t) => t.execution));
    assert(`${profile} tools/list carries no $schema or additionalProperties`, !JSON.stringify(tools).includes('"$schema"') && !JSON.stringify(tools).includes('"additionalProperties"'));
    const instructions = serverInstructions({ ...TEST_CFG, toolProfile: profile });
    assert(`${profile} server instructions stay within ${INSTRUCTIONS_BUDGET} chars`, instructions.length <= INSTRUCTIONS_BUDGET, `${instructions.length} chars`);
  }

  assert('read instructions do not explain the mutation protocol', !serverInstructions({ ...TEST_CFG, toolProfile: 'read' }).includes('safe_word'));
  assert('mutating instructions explain the safe word once', (serverInstructions({ ...TEST_CFG, toolProfile: 'full' }).match(/safe_word/g) ?? []).length === 1);

  const tools = await listedTools('full');
  const longTools = tools.filter((t) => (t.description ?? '').length > TOOL_DESCRIPTION_BUDGET).map((t) => `${t.name} (${t.description.length})`);
  assert(`every tool description is at most ${TOOL_DESCRIPTION_BUDGET} chars`, longTools.length === 0, longTools.join(', '));
  const params: Array<[string, string]> = [];
  for (const tool of tools) paramDescriptions(tool.inputSchema, tool.name, params);
  const longParams = params.filter(([, text]) => text.length > PARAM_DESCRIPTION_BUDGET).map(([path, text]) => `${path} (${text.length})`);
  assert(`every parameter description is at most ${PARAM_DESCRIPTION_BUDGET} chars`, longParams.length === 0, longParams.join(', '));
  const boilerplate = params.filter(([path]) => /\.(ad_account_id|safe_word|page|temp_id)$/.test(path));
  assert('shared params carry no description (server instructions explain them)', boilerplate.length === 0, boilerplate.map(([p]) => p).join(', '));
}

async function testMutationOutputs() {
  console.log('\n--- Mutation outputs ---');

  assert('formatBudget uses the account currency', formatBudget(1500, 'EUR') === '15.00 EUR' && formatBudget(1500, 'JPY') === '1500 JPY');
  assert('formatBudget without a currency never invents one', formatBudget(1500) === '1500 (minor units)');

  discardAll();
  const preview = 'Change campaign 1 status to PAUSED on account 1234567890';
  const first = createToken('campaign_status', { ad_account_id: '1234567890', campaign_id: '1', status: 'PAUSED' }, preview, 'kiwi');
  const text = resultText(prepareResponse(TEST_CFG, first, preview));
  assert('prepare response is plain text, not JSON', !text.trim().startsWith('{') && text.startsWith(preview));
  assert('prepare response carries token, safe word and expiry on one line', text.includes(`token: ${first.token} · safe word: "kiwi" · expires in`));
  assert('prepare response has one instruction line and no safety block', (text.match(/confirm_mutation/g) ?? []).length === 1 && !text.toLowerCase().includes('codex') && !text.includes('clientHookGate'));
  assert(`prepare overhead stays within ${PREPARE_OVERHEAD_BUDGET} chars`, text.length - preview.length <= PREPARE_OVERHEAD_BUDGET, `${text.length - preview.length}`);

  const second = createToken('ad_status', { ad_account_id: '1234567890', ad_id: '2', status: 'PAUSED' }, 'Change ad 2 status to PAUSED\nsecond line', 'kiwi');
  const queued = resultText(prepareResponse(TEST_CFG, second, 'Change ad 2 status to PAUSED\nsecond line'));
  assert('prepare lists the other pending operations as a table', queued.includes('Also pending (1, 1 under the same safe word') && queued.includes(`${first.token}\tcampaign_status\tkiwi\t`));
  assert('the queue shows only preview headlines', !queued.split('Also pending')[1].includes('second line'));

  const tools = registeredTools();
  const pending = resultText(await tools['list_pending_mutations'].handler({}, {}));
  assert('list_pending_mutations is a TSV table', pending.startsWith('token\taction\tsafe_word\tage\tpreview') && pending.includes(second.token));
  const setup = resultText(await tools['get_safety_setup'].handler({}, {}));
  assert('get_safety_setup is plain text', !setup.trim().startsWith('{') && setup.includes('Safety level: standard'));

  rememberAccountCurrency('1234567890', 'EUR');
  const budget = resultText(await tools['prepare_budget_change'].handler({ ad_account_id: 'act_1234567890', object_id: '5', object_type: 'campaign', daily_budget: 60000, safe_word: 'plum' }, {}));
  assert('budget preview is in the account currency', budget.startsWith('Change campaign 5 daily budget to 600.00 EUR') && !budget.includes('PLN'), budget.slice(0, 120));
  assert('budget warning uses the account currency too', budget.includes('above the 500.00 EUR warning threshold'));
  discardAll();
}

function discardAll() {
  for (const item of listPending()) consumeToken(item.token);
}

async function testHistoryOutput() {
  console.log('\n--- Mutation history output ---');

  recordSuccess('campaign_create', { ad_account_id: '1234567890', name: 'Autumn', objective: 'OUTCOME_SALES', daily_budget: '5000' }, 'Create PAUSED campaign "Autumn"\nDaily budget: 50.00 PLN', { id: '120210000000009' });
  recordFailure('ad_status', { ad_account_id: '1234567890', ad_id: '7', status: 'ACTIVE' }, 'Change ad 7 status to ACTIVE', 'Invalid parameter');
  const tools = registeredTools();
  const text = resultText(await tools['get_mutation_history'].handler({ limit: 2 }, {}));
  assert('history is a table with newest first', text.startsWith('# mutation_history') && text.indexOf('ad_status') < text.indexOf('campaign_create'));
  assert('history omits params by default', !text.includes('OUTCOME_SALES'));
  assert('multi-line previews stay on one row', text.includes('Create PAUSED campaign "Autumn" / Daily budget: 50.00 PLN'));
  assert('constant account id is hoisted', /^# .*account_id=1234567890/m.test(text));
  const withParams = resultText(await tools['get_mutation_history'].handler({ limit: 2, include_params: true }, {}));
  assert('include_params adds params as compact JSON lines', withParams.includes('"objective":"OUTCOME_SALES"') && !withParams.includes('\n  '));
  const stats = resultText(await tools['get_mutation_stats'].handler({}, {}));
  assert('stats are compact JSON', stats.startsWith('{"total":') && !stats.includes('\n'));
  const record = JSON.parse(readFileSync(join(getConfigDir(), 'mutation-history.jsonl'), 'utf8').trim().split('\n').pop()!);
  assert('history record keeps the contract fields', ['timestamp', 'action', 'adAccountId', 'preview', 'params', 'success', 'error'].every((k) => k in record));
}

async function testFileOutput() {
  console.log('\n--- output: "file" ---');

  const previousData = process.env.META_ADS_BABY_DATA;
  const dataDir = mkdtempSync(join(tmpdir(), 'mab-export-'));
  process.env.META_ADS_BABY_DATA = dataDir;
  const realFetch = globalThis.fetch;
  try {
    const many = Array.from({ length: 2000 }, (_, i) => ({ ad_id: String(i), ad: `ad number ${i} with some text`, type: 'X', note: undefined, spend: i % 7, clicks: i % 5 }));
    const exported = tableDocument({ title: 'ads', currency: 'PLN', rows: many, defaultOrder: '-spend', defaultLimit: 50, summable: (c) => c === 'spend' || c === 'clicks', shape: { output: 'file', min_clicks: 1 } });
    const fileMatch = exported.match(/file=(\S+\.tsv)/);
    const matching = many.filter((row) => row.clicks >= 1).length;
    assert('file mode names the written file under <data dir>/exports', Boolean(fileMatch) && fileMatch![1].startsWith(join(dataDir, 'exports', 'ads-')), exported.slice(0, 300));
    assert('the file name has no : or . in the timestamp', Boolean(fileMatch) && /ads-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.tsv$/.test(fileMatch![1]));
    assert('file mode lists the columns, constants included, empties dropped', exported.includes('# columns: ad_id ad type spend clicks'));
    const head = exported.split('\n')[0];
    assert('the header carries rows=N once, then file=', (head.match(/rows=/g) ?? []).length === 1 && head.includes(`rows=${matching} · file=`), head);
    assert('file mode keeps the totals line', exported.includes('# totals: spend='));
    const body = exported.split('\n').filter((line) => !line.startsWith('#'));
    assert(`file mode returns a short response with ${FILE_PREVIEW_ROWS} preview rows`, exported.length < 1500 && body.length === FILE_PREVIEW_ROWS + 1, `chars=${exported.length}`);
    const file = readFileSync(fileMatch![1], 'utf8').trimEnd().split('\n');
    assert('the file holds one header line plus every matching row, unpaged and not cut by the default limit', file.length === matching + 1 && file[0] === 'ad_id\tad\ttype\tspend\tclicks', `lines=${file.length}`);
    assert('the file has no comment lines', file.every((line) => !line.startsWith('#')));
    assert('every file row has the header width', file.every((line) => line.split('\t').length === 5));

    const limited = tableDocument({ title: 'ads', rows: many, defaultOrder: '-spend', shape: { output: 'file', limit: 30, fields: ['ad_id', 'spend'] } });
    const limitedFile = readFileSync(limited.match(/file=(\S+\.tsv)/)![1], 'utf8').trimEnd().split('\n');
    assert('an explicit limit and fields still apply to the file', limitedFile.length === 31 && limitedFile[0] === 'ad_id\tspend');

    const insights = insightsText({ output: 'file' });
    const insightsFile = readFileSync(insights.match(/file=(\S+\.tsv)/)![1], 'utf8').trimEnd().split('\n');
    assert('insights file uses Meta column names', insightsFile[0].split('\t').includes('purchase') && insightsFile[0].split('\t').includes('roas') && insightsFile.length === 4);
    assert('insights file keeps the constant objective as a column', insightsFile[0].split('\t').includes('objective') && !insights.includes('# objective='));

    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      const data = Array.from({ length: 2 }, (_, i) => ({ id: `${calls}${i}`, name: `Ad ${calls}-${i}`, effective_status: 'ACTIVE' }));
      return { status: 200, json: async () => ({ data, paging: { next: 'more', cursors: { after: `c${calls}` } } }) };
    }) as any;
    const tools = registeredTools();
    const inline = resultText(await tools['get_ads'].handler({ ad_account_id: 'act_1234567890' }, {}));
    assert(`inline reads stop at ${DEFAULT_MAX_PAGES} Graph pages and say so`, calls === DEFAULT_MAX_PAGES && inline.includes(`capped at ${DEFAULT_MAX_PAGES * 2} rows`), `calls=${calls}`);
    calls = 0;
    const fileAds = resultText(await tools['get_ads'].handler({ ad_account_id: 'act_1234567890', output: 'file' }, {}));
    assert(`file mode raises the paging cap to ${FILE_MAX_PAGES} pages and still reports the cap`, calls === FILE_MAX_PAGES && fileAds.includes(`capped at ${FILE_MAX_PAGES * 2} rows`) && fileAds.includes(`rows=${FILE_MAX_PAGES * 2} · file=`), `calls=${calls}`);
    const adsFile = readFileSync(fileAds.match(/file=(\S+\.tsv)/)![1], 'utf8').trimEnd().split('\n');
    assert('get_ads file holds every fetched ad', adsFile.length === FILE_MAX_PAGES * 2 + 1);
    const tableTools = ['list_ad_accounts', 'get_campaigns', 'get_ad_sets', 'get_ads', 'get_insights', 'get_ad_creatives', 'get_audiences'];
    assert('every shaped-table tool accepts output', tableTools.every((name) => toolFieldNames(tools[name]).includes('output')));
  } finally {
    globalThis.fetch = realFetch;
    if (previousData === undefined) delete process.env.META_ADS_BABY_DATA; else process.env.META_ADS_BABY_DATA = previousData;
    rmSync(dataDir, { recursive: true, force: true });
  }
}

async function main() {
  guardConfigDir();
  console.log(`Config dir under test: ${getConfigDir()}`);

  testTableShaping();
  testCurrencyUnits();
  testInsightsShaping();
  testCreativeAndAudienceRows();
  await testFileOutput();
  await testReadAuthChecks();
  await testMutationOutputs();
  await testHistoryOutput();
  testAmountLimits();
  await testCapSweep();
  testToolContract();
  testProfiles();
  await testToolListingBudget();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();
