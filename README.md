# meta-ads-baby

Local MCP server and plugin for managing Meta (Facebook) Ads accounts with two-phase safety confirmation.

**Status: W budowie.** Sforkowane z [google-ads-baby](https://github.com/treetank-net/google-ads-baby), w trakcie adaptacji pod Meta Marketing API.

## Safety model

All write operations use a two-step flow:

1. The LLM calls a `prepare_*` tool with a short random `safe_word`.
2. The server returns a preview, one-shot token, expiry, and the safe word.
3. The user must reply with the safe word.
4. Only then can the LLM call `confirm_mutation`.

Claude Code and Codex hooks enforce the user-message gate. The MCP server also keeps mutation tokens server-side, one-shot, and time-limited.

## Tool profiles

`META_ADS_BABY_PROFILE` decides which tools the server registers:

- `read` (default) — accounts, campaigns, ad sets, ads, insights, creatives, audiences, mutation history. No mutations possible.
- `manage` — adds the confirm tools and edits of existing campaigns, ad sets and ads (status, budget, settings, removal).
- `full` — adds creation: campaigns, ad sets, ads, creatives, image/video uploads, copies, lookalike audiences.

An unknown value falls back to `read`. Restart the server after changing it. The `meta-ads-manual` skill documents the tools in detail.

## Requirements

- Node.js 18+
- Meta App with Marketing API access (App ID + App Secret)
- Access to at least one Meta Ad Account
- Claude Code or Codex with plugin/MCP support

## Build

```bash
cd server
npm install
npm run build
```

## Development

See `CLAUDE.md` for full architecture docs, migration plan, and contribution guide.
