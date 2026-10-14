---
name: meta-ads-manual
description: Reference manual for the meta-ads-baby MCP tools - profiles, the safe-word mutation protocol, budget units and safety caps, batching with temp_id, and what each read and prepare_* tool needs. Use when a tool's one-line description is not enough, when choosing between tools, or when a prepare_* call is rejected.
---

# meta-ads-baby tool manual

Tool descriptions are intentionally one line long. This page holds the rest.

## Profiles

`META_ADS_BABY_PROFILE` decides which tools the server registers. It is read
once at start-up; changing it needs a server restart.

| Profile | Tools |
|---|---|
| `read` (default) | auth, `update_plugin`, every read tool, mutation history. No `prepare_*`, no `confirm_*`. |
| `manage` | `read` plus the confirm kernel and edits of existing entities: status, budget, update, removal of campaigns, ad sets and ads. |
| `full` | `manage` plus creation: campaigns, ad sets, ads, creatives (link, carousel, video, lead, Advantage+), image and video uploads, copies, lookalike audiences. |

An unknown value falls back to `read`. If the user asks for a change the
current profile cannot make, say which profile is needed; do not look for a
workaround.

## Reading the account

| Task | Tool |
|---|---|
| Accounts, currency, timezone | `list_ad_accounts` |
| Campaign structure and budgets | `get_campaigns` (`status_filter` on effective status) |
| Ad sets, optimization, targeting summary | `get_ad_sets` (`campaign_id` to narrow) |
| Ads and their creative ids | `get_ads` (`ad_set_id` to narrow; use it on large accounts) |
| Performance | `get_insights` |
| Creatives | `get_ad_creatives` |
| Custom and lookalike audiences | `get_audiences` |
| What this plugin changed before | `get_mutation_history`, `get_mutation_stats` |

`ad_account_id` accepts `act_123` or `123`. `get_insights.object_id` takes
`act_<id>` for an account or a bare campaign, ad set or ad id.

### Reading table output

Every list tool returns the same TSV layout:

```
# insights · act_123 · level=campaign · last_30d 2026-09-14..2026-10-13 · currency=PLN · rows=3 · by -spend
# objective=OUTCOME_SALES                <- columns constant across all rows
# totals: spend=1647.87 impressions=150855 clicks=3432 purchase=53 ... ctr_pct=2.28 cpc=0.48 roas=6.41
campaign_id	campaign	spend	impressions	reach	frequency	clicks	ctr_pct	cpc	cpm	purchase	...
```

- **Units.** Money is in the account currency with 2 decimals. Campaign and ad
  set budgets, `bid_amount`, `spend_cap`, and account `amount_spent` / `balance`
  arrive from Graph in minor units and are converted (offset-1 currencies are
  already whole units). Insights money (`spend`, `cpc`, `cpm`) is already in
  currency units. `ctr_pct` is Meta's `ctr`, which is already a percent
  (2.28 means 2.28%), never multiplied again. Other floats: 2 decimals when at
  least 1, otherwise 3 significant digits.
- **Header lines.** Columns empty in every row are dropped, columns with one
  value move to a `# k=v` line, and totals cover every row that passed the
  filters, including rows `limit` cut. Ratio totals (`ctr_pct`, `cpc`, `cpm`,
  `*_cpa`, `roas`) are recomputed from the summed metrics; `reach` and
  `frequency` are never summed because reach counts unique people.
- **Caps.** Graph pages are followed up to 20 pages; if more remain, the header
  says `capped at N rows` instead of silently dropping them.

### Shaping output (prefer this to paging)

| Param | Effect |
|---|---|
| `fields` | Only these columns, by the short names; also brings back opt-in columns |
| `order_by` | Sort column; `-spend` is descending |
| `limit` | Top-N after filtering and sorting |
| `min_cost` / `min_impressions` / `min_clicks` | `get_insights` only; `min_cost` filters on `spend` |
| `summary: true` | Header and totals only |
| `page` / `page_chars` | Next slice; default page is about 12k chars (2k-100k) |

Default and opt-in columns per tool:

| Tool | Default columns | Opt-in via `fields` |
|---|---|---|
| `list_ad_accounts` | account_id, account, status, currency, timezone, business, amount_spent, balance, spend_cap | country, min_daily_budget, created_time |
| `get_campaigns` | campaign_id, campaign, status (effective), objective, daily_budget, lifetime_budget, budget_remaining, spend_cap, bid_strategy, special_ad_categories, start_time, stop_time | configured_status, status_setting (the raw `status`), buying_type, created_time, updated_time |
| `get_ad_sets` | adset_id, adset, campaign_id, status, budgets, bid_amount, bid_strategy, billing_event, optimization_goal, conversion_event, countries, age, genders, platforms, interests, custom_audiences, excluded_audiences (counts), start_time, end_time | pixel_id, destination_type, regions, cities (counts), configured_status, created_time, updated_time, targeting (compact JSON) |
| `get_ads` | ad_id, ad, adset_id, campaign_id, status, creative_id | configured_status, created_time, updated_time |
| `get_ad_creatives` | creative_id, creative, status, object_type, format (link, carousel, video), cards, page_id, headline, body, description, cta, image_hash, video_id | link, url_tags, image_url, thumbnail_url, story_spec (compact JSON) |
| `get_audiences` | audience_id, audience, subtype, size_min, size_max, delivery, description, created_time, updated_time | operation |

### get_insights

- **Window.** `date_preset` (default `last_30d`) or `time_range: {since, until}`
  (YYYY-MM-DD, wins over the preset). The header shows the resolved dates.
- **level.** Without it you get one row for `object_id` itself. With it, one
  row per campaign, ad set or ad inside the object, sorted by `-spend`, top 50
  by default (`limit` to change). Rows carry `<level>_id` and name plus the
  parent name for ad sets (campaign) and ads (ad set).
- **time_increment.** `1` daily, `7` weekly, `monthly`; adds a `date` column
  (period start), sorted oldest first and not cut by the default limit.
- **Default metrics.** spend, impressions, reach, frequency, clicks, ctr_pct,
  cpc, cpm. Opt-in: `link_clicks`, `link_ctr_pct`, `cost_per_link_click`,
  `unique_clicks`, `cpp`, `objective` (default at campaign level) and the three
  ranking fields `quality_ranking`, `engagement_rate_ranking`,
  `conversion_rate_ranking` (ad level only). Any other Graph insights field
  name in `fields` is requested as-is; action arrays such as
  `video_p25_watched_actions` are summed into one number.
- **Actions.** Graph returns `actions` / `action_values` as 40-80 action types,
  most of them overlapping. Only `action_types` become columns. The default
  set is `omni_purchase`, `lead`, `omni_add_to_cart`, `landing_page_view`,
  `link_click`: the `omni_` types are Meta's deduplicated totals across
  website, app and offline events (what Ads Manager shows as Purchases / Adds
  to cart), so they do not double count with `purchase` or
  `offsite_conversion.fb_pixel_purchase`. `lead` is likewise the aggregate of
  pixel and on-Facebook leads. Column names drop the `omni_` prefix
  (`purchase`), `offsite_conversion.fb_pixel_` becomes `pixel_`,
  `onsite_conversion.` becomes `onsite_`.
- **Derived columns per action type:** `<name>` (count), `<name>_value`
  (from `action_values`, when Meta reports one), `<name>_cpa` = spend / count
  (shown by default for purchase and lead, opt-in for the others), and `roas`
  = purchase_value / spend.
- `action_types: ["all"]` turns every action type present into columns; use it
  to discover names, then ask for the ones you need.

## Mutations

### Protocol

1. Invent a short random ASCII safe word (3-32 chars, no spaces) and call a
   `prepare_*` tool with it. Nothing changes yet; the server returns a preview
   and a one-shot token.
2. Show the full preview and ask the user to reply with the safe word.
3. Only after a real user message containing the word, call
   `confirm_mutation(token)`. Never prepare and confirm in the same turn; the
   hook blocks it.

Tokens live in server memory: 1 hour by default, 5 minutes with
`META_ADS_SAFETY_LEVEL=strict`, and they die with the server process. Meta has
no test mode, so every confirmed mutation is live.

### Batching and temp_id

Prepare several changes with the same safe word, show the previews together,
get one reply, then run `confirm_all_mutations(tokens)` in the order given.
Pass `temp_id: "$campaign"` on a `prepare_*` that creates something and use
`"$campaign"` as an id in a later `prepare_*` of the same batch; the server
substitutes the real id after the first one runs. A failed operation does not
stop the rest; each result is reported separately.

`list_pending_mutations` shows the queue. If confirm is blocked because hooks
are not installed (Codex, Cursor without the hook package), `get_safety_setup`
explains how to install them.

### Amounts and caps

Budget, bid and spend-cap inputs are integers in the currency minor unit,
exactly as the Graph API takes them: `daily_budget: 5000` is 50.00 on a PLN or
EUR account. Currencies with a Meta offset of 1 (CLP, COP, CRC, HUF, ISK, IDR,
JPY, KRW, PYG, TWD, VND) have no minor unit, so `5000` is 5000 JPY. Previews
print the amount in the account currency.

Server-side caps (minor units, enforced in every `prepare_*` that takes the
field, including nested payloads):

| Field | Cap |
|---|---|
| `daily_budget` | 5,000,000 (50,000.00) |
| `lifetime_budget` | 50,000,000 (500,000.00) |
| `bid_amount` | 500,000 (5,000.00) |
| `spend_cap` | 50,000,000 (500,000.00) |

A daily budget above 50,000 (500.00) adds a warning line to the preview.

### Tool notes

- `prepare_budget_change`: pass `daily_budget` or `lifetime_budget`, and
  `object_type` `campaign` (CBO) or `ad_set`. Changing the budget type of a
  running entity is rejected by Meta.
- `prepare_campaign_create`: starts PAUSED. Without a campaign budget the ad
  sets carry their own budgets (`is_adset_budget_sharing_enabled=false` is
  sent automatically). `special_ad_categories` defaults to `["NONE"]`.
- `prepare_ad_set_create`: needs `daily_budget` or `lifetime_budget`;
  `lifetime_budget` needs `end_time`. `promoted_object` (pixel id and event) is
  required for `OFFSITE_CONVERSIONS`. EU DSA beneficiary and payor default to
  the ad account's `default_dsa_beneficiary` / `default_dsa_payor`.
- `prepare_ad_set_update.targeting` replaces the whole targeting spec; read the
  current one with `get_ad_sets` and send it complete.
- `prepare_*_status` with `ARCHIVED` and every `prepare_*_removal` are
  irreversible. Removing a campaign deletes its ad sets and ads.
- Creatives: upload media first (`prepare_image_upload` returns an image hash,
  `prepare_video_upload` a video id), then build the creative, then
  `prepare_ad_create` with its id. In one batch, link them with `temp_id`.
- `prepare_carousel_creative`: 2-10 cards, each with its own image hash, link
  and headline.
- `prepare_advantage_creative`: up to 10 images or videos, 5 bodies, titles
  and descriptions; at least one image or video.
- `prepare_clone_entity`: copies start PAUSED; `parent_id` is the target
  campaign for an ad set and the target ad set for an ad.
- `prepare_lookalike_audience`: `ratio` 0.01-0.20 (top 1%-20%), one country.

## History

`get_mutation_history` reads the local audit log
(`~/.meta-ads-baby/mutation-history.jsonl`), newest first, 20 entries by
default and 200 at most. `get_mutation_stats` summarizes it per action.
