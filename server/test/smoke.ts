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
import { amountFieldLimitError, formatBudget } from '../src/tools/write-helpers.js';
import { toTsv, tsvDocument, flattenRow, trimPrecision, paginate, pageNote, DEFAULT_PAGE_CHARS } from '../src/tools/format.js';
import { PLUGIN_VERSION } from '../src/constants.js';
import { readFileSync } from 'fs';

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

function testFlatten() {
  console.log('\n--- flattenRow ---');

  const actionRow = {
    impressions: '1000',
    actions: [
      { action_type: 'link_click', value: '210' },
      { action_type: 'offsite_conversion.fb_pixel_purchase', value: '6' },
    ],
    purchase_roas: [{ action_type: 'omni_purchase', value: '3.4' }],
  };
  const flat = flattenRow(actionRow);
  assert('action-keyed array becomes one column per action_type', flat['actions.link_click'] === '210' && flat['actions.offsite_conversion.fb_pixel_purchase'] === '6');
  assert('purchase_roas is action-keyed too', flat['purchase_roas.omni_purchase'] === '3.4');
  assert('no raw JSON left for action arrays', !('actions' in flat));

  const scalarArray = flattenRow({ platforms: ['facebook', 'instagram'] });
  assert('scalar array joins with " ~ "', scalarArray['platforms'] === 'facebook ~ instagram');

  const nested = flattenRow({ targeting_summary: { age_min: 18, countries: ['PL'] } });
  assert('nested object flattens with dotted key', nested['targeting_summary.age_min'] === 18 && nested['targeting_summary.countries'] === 'PL');

  const absent = flattenRow({ a: 1, b: undefined, c: null });
  assert('undefined and null fields are dropped, not printed', !('b' in absent) && !('c' in absent));

  const emptyArray = flattenRow({ special_ad_categories: [] });
  assert('empty array yields no column', !('special_ad_categories' in emptyArray));

  const opaque = flattenRow({ specs: [{ a: 1 }, { b: 2 }] });
  assert('array of non-action objects falls back to JSON', typeof opaque['specs'] === 'string' && String(opaque['specs']).startsWith('['));

  const nonAction = flattenRow({ items: [{ action_type: 'x', value: '1' }] });
  assert('action_type shape outside a known metric field is not split', typeof nonAction['items'] === 'string');
}

function testTrimPrecision() {
  console.log('\n--- trimPrecision ---');

  assert('long float string is trimmed to 6 significant digits', trimPrecision('1.4293877551020408') === 1.42939);
  assert('numeric float is trimmed', trimPrecision(0.5735238095238095) === 0.573524);
  assert('integer number is untouched', trimPrecision(14000) === 14000);
  assert('integer-looking string is untouched', trimPrecision('14000') === '14000');
  assert('short decimal string is untouched', trimPrecision('120.44') === '120.44');
  assert('id-like long digit string is untouched', trimPrecision('120210400000137') === '120210400000137');
  assert('non-numeric string is untouched', trimPrecision('OUTCOME_SALES') === 'OUTCOME_SALES');
}

function testTsv() {
  console.log('\n--- TSV output ---');

  const rows = [
    { id: '1', name: 'PL | TFC | SALES', status: 'ACTIVE' },
    { id: '2', name: 'PL | TFC | TRAFFIC', status: 'PAUSED' },
  ];
  const tsv = toTsv(rows);
  const lines = tsv.split('\n');
  assert('header row lists columns once', lines[0] === 'id\tname\tstatus');
  assert('one line per row plus header', lines.length === 3);
  assert('pipe characters in names survive (pipe is not the separator)', lines[1].includes('PL | TFC | SALES'));

  const ragged = toTsv([{ a: 1 }, { a: 2, b: 3 }]);
  assert('columns are the union across rows', ragged.split('\n')[0] === 'a\tb');
  assert('missing value renders as empty cell', ragged.split('\n')[1] === '1\t');

  const dirty = toTsv([{ body: 'line one\nline two\twith tab' }]);
  assert('tabs and newlines inside values are escaped to spaces', dirty.split('\n').length === 2 && !dirty.split('\n')[1].includes('\t'));

  assert('empty row set yields empty string', toTsv([]) === '');

  const doc = tsvDocument('campaigns', rows);
  assert('document has a labelled section with a count', doc.includes('## campaigns (2)'));
  assert('document carries the legend', doc.includes('tab-separated'));
  assert('zero rows says so without a table', tsvDocument('campaigns', []).includes('## campaigns (0)'));

  const withNote = tsvDocument('campaigns', rows, ['NOTE HERE']);
  assert('header note is placed before the table', withNote.indexOf('NOTE HERE') < withNote.indexOf('## campaigns'));

  const jsonSize = JSON.stringify(rows, null, 2).length;
  assert('TSV is smaller than pretty JSON for the same rows', tsv.length < jsonSize, `tsv=${tsv.length} json=${jsonSize}`);
}

function testPagination() {
  console.log('\n--- Pagination by response size ---');

  const small = Array.from({ length: 5 }, (_, i) => ({ id: String(i), name: 'x' }));
  const onePage = paginate(small, 1);
  assert('small result is a single page', onePage.pages === 1 && onePage.rows.length === 5);
  assert('single page emits no page note', pageNote(onePage, 'rows') === undefined);

  const wide = Array.from({ length: 400 }, (_, i) => ({ id: String(i), blob: 'x'.repeat(500) }));
  const p1 = paginate(wide, 1);
  const rendered = toTsv(p1.rows);
  assert('oversized result is split into several pages', p1.pages > 2, `pages=${p1.pages}`);
  assert('page respects the character budget', rendered.length <= DEFAULT_PAGE_CHARS, `chars=${rendered.length}`);
  assert('first page starts at row 1', p1.from === 1);
  assert('total is the full row count, not the page size', p1.total === 400);

  const p2 = paginate(wide, 2);
  assert('second page continues where the first ended', p2.from === p1.to + 1);
  assert('pages do not overlap', p2.rows[0] !== p1.rows[0]);

  const last = paginate(wide, p1.pages);
  assert('last page ends at the last row', last.to === 400);
  assert('page beyond the end clamps to the last page', paginate(wide, 999).page === p1.pages);
  assert('page zero or negative clamps to the first page', paginate(wide, 0).page === 1 && paginate(wide, -3).page === 1);

  const allRows = new Set<string>();
  for (let i = 1; i <= p1.pages; i++) for (const r of paginate(wide, i).rows) allRows.add(r.id);
  assert('every row appears on exactly one page (no data lost)', allRows.size === 400);

  const note = pageNote(p1, 'ads');
  assert('page note states position and total', !!note && note.includes(`of ${p1.pages}`) && note.includes('of 400'));
  assert('page note tells the caller how to get the next slice', !!note && note.includes('page: 2'));
  assert('last page note says it is the last', String(pageNote(last, 'ads')).includes('last page'));

  const denser = paginate(wide, 1, 8_000);
  assert('a smaller character budget yields more pages', denser.pages > p1.pages);

  const narrow = Array.from({ length: 400 }, (_, i) => ({ id: String(i) }));
  assert('narrow rows fit in fewer pages than wide ones at the same budget', paginate(narrow, 1).pages < p1.pages);

  assert('empty result set is one empty page', paginate([], 1).pages === 1 && paginate([], 1).total === 0);
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

const LISTING_BUDGET_CHARS: Record<ToolProfile, number> = { read: 6_000, manage: 15_000, full: 26_000 };
const INSTRUCTIONS_BUDGET = 2_500;
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

async function main() {
  guardConfigDir();
  console.log(`Config dir under test: ${getConfigDir()}`);

  testFlatten();
  testTrimPrecision();
  testTsv();
  testPagination();
  testAmountLimits();
  await testCapSweep();
  testToolContract();
  testProfiles();
  await testToolListingBudget();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();
