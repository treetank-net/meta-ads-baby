# Privacy Policy — Ads Ads Baby (Meta Ads MCP Server)

**Last updated:** 2026-05-26

## What this software does

Ads Ads Baby is a local MCP (Model Context Protocol) server that runs entirely on your computer. It connects to the Meta (Facebook) Graph API on your behalf to manage ad accounts and campaigns.

## Data we collect

**None.** We do not collect, store, transmit, or process any of your data on any external server. There is no backend, no analytics, no telemetry.

## Data that stays on your computer

When you authorize the app through Facebook OAuth, the following data is stored **locally on your machine** (in `~/.meta-ads-baby/config.json`):

- Facebook App ID (yours or the built-in default)
- Facebook App Secret (only if you provide your own)
- OAuth access token
- Safety and configuration preferences

Ad account data (account names, campaign structures, performance metrics) is fetched from the Meta Graph API directly to your local MCP server and is not persisted beyond the current session, except for a local mutation audit log (`~/.meta-ads-baby/mutation-history.jsonl`).

## Facebook's data

By using this software, you interact with Meta's Graph API, which is subject to [Meta's Privacy Policy](https://www.facebook.com/privacy/policy/). Facebook may log API requests made through your access token according to their own policies.

## Third-party access

No third party has access to your credentials or ad account data through this software. The access token never leaves your machine.

## Your rights

You can revoke access at any time by:
1. Removing the app from your Facebook settings: [Facebook App Settings](https://www.facebook.com/settings?tab=applications)
2. Deleting the local config: `rm -rf ~/.meta-ads-baby`

## Contact

For questions about this privacy policy, open an issue at the project repository.
