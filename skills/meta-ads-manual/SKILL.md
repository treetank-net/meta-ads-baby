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
