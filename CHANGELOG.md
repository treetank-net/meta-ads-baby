# Changelog

## 0.14.2

### Fixed
- **The local OAuth server no longer collides with `google-ads-baby`.** Both plugins listened on port 9876, so authorizing Google Ads and Meta Ads at the same time meant one flow hijacked the other's callback. Meta Ads now uses **9878** (9876 = google-ads-baby, 9877 = google-analytics-baby). The GitHub Pages callback bridge reads the port from the `state` param, so older installs that still listen on 9876 keep working.

## 0.14.1

### Fixed
- **The MCP server reported `version: 0.13.0`** — hard-coded in `index.ts`, so clients saw a stale version regardless of the release. It now comes from `PLUGIN_VERSION` in `src/constants.ts`, and a test compares that constant against `package.json` so the drift cannot come back. (Same defect was found and fixed in `google-ads-baby` 0.19.0.)

## 0.14.0

Read tools returned pretty-printed JSON with no upper bound on rows. `getAll` follows
pagination cursors up to 20 pages of 200, so a single `get_ads` call on a large account
could return 4000 objects — measured at **440 000 tokens**, more than twice a 200k context
window, in one tool result. Read tools now return tab-separated tables and are paginated
by response size.

### Changed
- **All seven list read tools return TSV instead of pretty JSON** (`list_ad_accounts`, `get_campaigns`, `get_ad_sets`, `get_ads`, `get_insights`, `get_ad_creatives`, `get_audiences`). Measured on synthetic rows built from the exact field lists these tools request:

  | Tool | Rows | Before | After | |
  | --- | --- | --- | --- | --- |
  | `get_insights` (level=ad) | 90 | 35 848 tok | 6 346 tok | −82% |
  | `get_ad_sets` | 120 | 22 601 tok | 7 380 tok | −67% |
  | `get_campaigns` | 60 | 9 084 tok | 3 742 tok | −59% |
  | `get_ads` | 400 | 44 001 tok | 18 030 tok | −59% |
  | `get_ad_creatives` | 150 | 33 667 tok | 23 656 tok | −30% |

- **Action-keyed insight metrics become one column per action type.** `actions`, `action_values`, `cost_per_action_type`, `purchase_roas`, the `video_*_watched_actions` family and friends were arrays of `{action_type, value}` objects, so a name like `offsite_conversion.fb_pixel_purchase` was repeated once per row per metric. It is now a column header, and rows carry only the numbers. This is where most of the 82% on insights comes from.
- **Every list read tool is paginated by response size, not by a row count.** Pages are cut so that each one fits ~40 000 characters of rendered table, which means a page holds 246 ads or 70 creatives — the split follows how wide the rows actually are. `page` selects the slice, `page_chars` overrides the budget. The response states which page, how many pages, which rows, and how to ask for the next one. Nothing is dropped: 4000 ads become 17 retrievable pages of ~11 100 tokens instead of one unusable 440 000-token result.
- Non-integer metrics are printed to 6 significant digits. Meta returns `frequency: "1.4293877551020408"` and `ctr: "1.5000000000000002"`; ID-like digit strings and short decimals are left alone.
- `get_mutation_history` and `get_mutation_stats` stay JSON — `params` has a different shape per action, so a table would be mostly empty columns.

### Fixed
- **Amount caps are enforced in one place.** `daily_budget`, `lifetime_budget`, `bid_amount` and `spend_cap` were checked by six hand-copied `if` blocks across the prepare tools, and `bid_amount` / `spend_cap` had no cap at all before this release. All four now go through `amountFieldLimitError`, which also walks nested payloads, and a test sweep calls every money field of every registered prepare tool with ten times its cap — so a new field without a limit fails the suite.
- Array-valued schema fields (`tracking_specs`, asset-feed images/videos/bodies/titles/descriptions/CTAs/link URLs/ad formats, `special_ad_categories`) had no length bounds and could be sent arbitrarily large.

### Security
- `npm audit --omit=dev` reported five production advisories that postdate 0.13.1 (`hono`, `@hono/node-server`, `fast-uri`, `ip-address` — all transitive through the MCP SDK). They are bundled into `bundle.cjs` and therefore shipped, so the lockfile was updated and the bundle rebuilt: `found 0 vulnerabilities`.

### Added
- **`npm test` in `server/`** — 85 assertions: flattening, TSV rendering, precision trimming, pagination (page arithmetic, size budget, clamping, and that every row appears on exactly one page), amount limits, the cap sweep, and a tool contract check. The suite writes to a temp config directory and aborts if it resolves the real one.

## 0.13.1 - 2026-07-21

- Updated transitive server dependencies to remediate Hono, qs, body-parser,
  and fast-uri security advisories without changing the direct MCP SDK version.

## 0.13.0 - 2026-07-01

- Renamed the update MCP tool from `check_update` to `update_plugin`.
- Updated plugin release metadata for the new version.
