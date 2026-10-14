import type { MetaAdsConfig } from '../config.js';
import { profileNotice } from './profile.js';

export function serverInstructions(cfg: MetaAdsConfig): string {
  const notice = profileNotice(cfg.toolProfile);
  return [
    ...(notice ? [notice] : []),
    ...(cfg.toolProfile === 'read' ? [] : [
      'Mutations: every prepare_* takes safe_word (a short random ASCII word you invent, 3-32 chars, no spaces) and returns a preview and token without changing anything.',
      'Show the full preview, ask the user to reply with the safe word, and only then call confirm_mutation, never in the same turn. Meta has no test mode: a confirmed mutation is live.',
      'Prepare several changes under one safe word and run them with confirm_all_mutations after one reply; temp_id ("$name") lets a later prepare_* reference what an earlier one creates.',
      'Budget, bid and spend_cap inputs are integers in the currency minor unit, as the Graph API takes them (1000 = 10.00 PLN; whole units for offset-1 currencies such as JPY, KRW, HUF).',
      'New campaigns, ad sets and ads start PAUSED. If confirm is blocked because safety hooks are missing (e.g. in Codex), call get_safety_setup.',
    ]),
    'ad_account_id takes act_<id> or bare digits, from list_ad_accounts.',
    'List tools return TSV: money in the account currency (never cents), *_pct are percents, "# k=v" header lines hold columns constant across rows, and totals cover every matching row even when limit cuts the list.',
    'Ask for less instead of paging: fields, order_by (-spend = descending), limit, min_cost (spend) / min_impressions / min_clicks, summary: true for totals only. page: N gets the next slice.',
    'The meta-ads-manual skill documents each tool in detail.',
  ].join(' ');
}
