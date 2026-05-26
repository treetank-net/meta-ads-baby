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
