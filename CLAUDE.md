# meta-ads-baby

Claude Code plugin: MCP server for Meta (Facebook) Ads campaign management with two-phase mutation safety.

## Architecture

Plugin = MCP server (stdio) + Claude Code/Codex hooks (safety enforcement).

Siostrzany projekt: `../google-ads-baby/` — identyczna architektura, plugin do Google Ads.

### MCP Server (`server/`)
- TypeScript source in `server/src/`, compiled with `tsc`, bundled with `esbuild` into single `server/bundle.cjs`
- Raw `fetch()` to Meta Graph API v25.0 (no SDK), `@modelcontextprotocol/sdk` (stdio), `zod`
- All dependencies bundled — no `node_modules` needed at runtime, cold start fast (~380 KB bundle vs 25 MB in google-ads-baby)
- Token store: in-memory, one-shot, 1h TTL

#### Source layout (`server/src/`)
```
index.ts                  — entrypoint: tworzy McpServer, rejestruje toole, startuje stdio
config.ts                 — MetaAdsConfig, configFromEnv(), getConfigDir()
auth.ts                   — Facebook Login OAuth2 flow, landing page, token exchange
confirm.ts                — token store (in-memory Map), safe word / confirm state (pliki)
history.ts                — audit log JSONL (~/.meta-ads-baby/mutation-history.jsonl)
errors.ts                 — formatError()
validation.ts             — normalizeAdAccountId(), requireAdAccountId()
client.ts                 — barrel re-export z client/

client/
  core.ts                 — get(), post(), del(), getAll() (paginacja), uploadImage(), MetaApiError
  accounts.ts             — getAdAccounts(), getAdAccount()
  campaigns.ts            — getCampaigns(), getCampaign(), createCampaign(), updateCampaign()
  adsets.ts               — getAdSets(), getAdSet(), createAdSet(), updateAdSet()
  ads.ts                  — getAds(), getAd(), createAd(), updateAd()
  creatives.ts            — getAdCreatives(), getAdCreative(), createAdCreative()
  insights.ts             — getInsights(), getAccountInsights()
  audiences.ts            — getCustomAudiences(), getCustomAudience(), createLookalikeAudience()
  index.ts                — barrel re-export

tools/
  auth.ts                 — setup_meta_auth, check_update
  read.ts                 — orchestrator: registerReadTools()
  read-helpers.ts         — schemas, query builders, pure functions
  read-accounts.ts        — list_ad_accounts, get_campaigns, get_ad_sets, get_ads, get_insights, get_ad_creatives, get_audiences
  read-history.ts         — get_mutation_history, get_mutation_stats
  write.ts                — orchestrator: registerWriteTools()
  write-schemas.ts        — Zod schemas, safety constants (budget caps, limits)
  write-helpers.ts        — validation, preview formatting
  write-executor.ts       — executeMutation() dispatcher, formatMutationError()
  write-prepare-campaigns.ts — prepare_campaign_status, prepare_budget_change, prepare_campaign_create
  write-prepare-assets.ts — prepare_image_upload, prepare_ad_creative
  write-prepare-ads.ts    — prepare_ad_set_create, prepare_ad_create
  write-confirm.ts        — get_safety_setup, confirm_safe_word, confirm_mutation, confirm_all_mutations, list_pending_mutations
```

#### Jak dodawać nowe rzeczy

**Nowy write tool (prepare_*):**
1. Schemat Zod → `write-schemas.ts`
2. Handler `server.tool('prepare_...')` → do odpowiedniego `write-prepare-*.ts` wg domeny:
   - kampanie/budżety → `write-prepare-campaigns.ts`
   - obrazki/creative → `write-prepare-assets.ts`
   - ad sety/reklamy → `write-prepare-ads.ts`
3. Dispatch w `executeMutation()` → `write-executor.ts` (dodaj `if (mutation.action === '...')`)
4. Jeśli potrzeba nowej funkcji API → `client/` (odpowiedni plik wg domeny), auto-eksportuje się przez barrel
5. Helpery (walidacja, formatowanie preview) → `write-helpers.ts`
6. **`npm run build`** po każdej zmianie w `src/` — bundle.cjs musi być aktualny

**Nowy read tool:**
1. Handler → `read-accounts.ts` (dane z Meta API) lub `read-history.ts` (lokalne dane)
2. Query buildery / helpery → `read-helpers.ts`

**Nowa funkcja client (Meta Graph API):**
1. Dobierz plik wg domeny: `client/campaigns.ts`, `client/adsets.ts`, `client/ads.ts`, `client/creatives.ts`, `client/insights.ts`, `client/audiences.ts`
2. Eksportuj funkcję — barrel `client/index.ts` + `client.ts` propaguje automatycznie
3. Sygnatura: `(cfg: MetaAdsConfig, adAccountId: string, ...params) => Promise<unknown>`

**Konwencje:**
- Każdy prepare tool tworzy token przez `createToken()` i zwraca przez `prepareResponse()`
- Budget walidacja przez stałe z `write-schemas.ts`
- Ad Account ID normalizacja: `normalizeAdAccountId()` na początku każdego handlera (obsługa `act_` prefix)
- Nie dodawaj komentarzy w kodzie — nazwy funkcji/zmiennych muszą być samodokumentujące

### Safety Hooks (`hooks/` + `scripts/`)
- `PreToolUse` on `prepare_*` → sets state to "pending"
- `UserPromptSubmit` → if pending and user message contains the LLM-selected safe word, sets state to "user-confirmed"
- `PreToolUse` on `confirm_mutation` → blocks unless "user-confirmed"
- Effect: LLM cannot call prepare + confirm in sequence without user message between them
- Hooks written in pure JS (`scripts/safety-hook.js`) — cross-platform (Windows/macOS/Linux)

### Two-Phase Mutation Flow
1. LLM invents a short random ASCII safe word and calls `prepare_*` with `safe_word`
2. LLM shows preview + safe word to user, asks for confirmation using that word
3. User types response containing the safe word → hook marks as confirmed
4. LLM calls `confirm_mutation(token)` → hook allows → server executes

#### Batch Mode
Multiple `prepare_*` calls can share the same `safe_word`. After one user confirmation:
- `confirm_all_mutations(tokens: [...])` executes all pending mutations sequentially
- Confirm state is consumed once for the entire batch
- Results are returned per-operation with success/failure status

### Meta Ads — hierarchia obiektów
```
Business Manager (Meta Business Suite)
  └── Ad Account (act_XXXXXXXXX)
       └── Campaign (cel: conversions, traffic, leads, awareness, app_installs, etc.)
            └── Ad Set (audience, placement, budget, schedule, bidding)
                 └── Ad (creative: image/video + copy + CTA)
                      └── Ad Creative (standalone object, reusable across ads)
```

### OAuth Flow
1. LLM calls `setup_meta_auth` → starts local HTTP server on port 9876
2. Browser opens `http://127.0.0.1:9876/open` → landing page with **required** App ID + App Secret fields
3. Saved credentials auto-loaded from `~/.meta-ads-baby/config.json`
4. User clicks "Sign in with Facebook" → Facebook OAuth consent → callback
5. Server exchanges code → short-lived token → long-lived token (60 days)
6. Setup page: select initial ad account + safety settings → config saved

App ID + App Secret are **always required** (Meta treats App Secret as a real secret, unlike Google).
No default/built-in credentials. User must create their own Meta App at developers.facebook.com.

### Meta Marketing API specifics
- Base URL: `https://graph.facebook.com/v25.0/`
- Auth: `Authorization: Bearer {access_token}` header
- Rate limiting: Read=1pt, Write=3pt, dev tier max 60pt/300s, standard tier 9000pt/300s
- Budgets in cents of account currency (daily_budget=1000 = 10.00 PLN)
- **No test mode** — all mutations are live, making safety layer critical
- Ad account ID format: `act_123456789` (numeric with prefix)

## Repo & CI
- GitLab: `treetank/meta-ads-baby` (origin, primary)
- GitHub: `treetank-net/meta-ads-baby` (mirror, remote `gh`)
- `.gitlab-ci.yml`: mirror job pushuje `master` + tagi do GitHuba przy każdym pushu (runner tag: `vps`, wymaga `GITHUB_TREETANK_TOKEN` w CI/CD variables)

## Commands
- `cd server && npm install && npm run build` — zainstaluj zależności, skompiluj TS i zbuduj bundle
- `cd server && npm run dev` — watch mode (rebuild TS przy zmianach, bundle trzeba przebudować ręcznie)
- `cd server && npm start` — uruchom MCP server z bundle.cjs

## Build
1. `cd server && npm install` — zainstaluj zależności (tylko do developmentu)
2. `npm run build` — kompilacja TS + esbuild bundle → `server/bundle.cjs`

### Co jest w git, a co nie
- `server/src/` — źródła TypeScript ✓
- `server/bundle.cjs` — zbundlowany runtime (~380 KB) ✓
- `server/dist/` — intermediate output z tsc ✗ (w .gitignore)
- `server/node_modules/` — zależności dev ✗ (w .gitignore)

## Config
Env vars (set in plugin.json, sourced from user's environment) OR saved in `config.json` via OAuth flow:
- `META_ADS_APP_ID` / `META_ADS_APP_SECRET` — Facebook App credentials (**required**, no defaults)
- `META_ADS_ACCESS_TOKEN` — long-lived user access token
- `META_ADS_SAFETY_LEVEL` — `standard` (default), `strict`, or `off`
- `META_ADS_MUTATION_TOKEN_TTL_SECONDS` — optional server-side mutation token TTL override
- `META_ADS_CONFIRM_STATE_TTL_SECONDS` — optional Claude hook confirmation-state TTL override

## Safety Guardrails
- Budget cap: configurable in `tools/write-schemas.ts`
- Token: one-shot, 1h expiry by default, server-side only
- Safety level:
  - `standard`: requires the LLM-selected safe word in a real user message between `prepare_*` and `confirm_mutation`; 1h token/state TTL
  - `strict`: same flow, but 5 min token/state TTL
  - `off`: disables the Claude hook gate; server-side prepare token is still required
- Hook: requires real user message between prepare and confirm
- **No test mode in Meta API** — all mutations are live
- Mutation history: every executed mutation logged to `~/.meta-ads-baby/mutation-history.jsonl`

## Background — dlaczego tak, a nie inaczej

Fork z `google-ads-baby` — działający plugin do Google Ads z two-phase mutation safety.
Architektura, safety hooks i confirm flow przeniesione 1:1. Klient API, toole i auth przepisane
od zera pod Meta Marketing API (Graph API v25.0, REST zamiast gRPC).

### Dlaczego raw fetch() zamiast facebook-nodejs-business-sdk
- SDK laguje (v24 vs API v25), plain JS, słabe typy
- Graph API to prosty REST — nie potrzeba SDK jak w gRPC (Google Ads)
- Mniejszy bundle (~380 KB vs potencjalne megabajty z SDK)
- Pełna kontrola nad typami i error handling

### Dlaczego App Secret nie jest wbudowany
- Meta traktuje App Secret jako prawdziwy sekret (w przeciwieństwie do Google OAuth desktop client)
- Wyciek App Secret = dostęp do Graph API w imieniu appki
- Landing page prowadzi usera za rękę: wymaga podania App ID + Secret, zapisuje do lokalnego configa

### Konkurencja
1. **Oficjalny Meta Ads MCP** (`mcp.facebook.com/ads`) — hosted, brak safety hooks
2. **pipeboard-co/meta-ads-mcp** (791 stars) — proste confirm prompts, brak prawdziwego safety
3. **serkanhaslak/meta-mcp** — 77 narzędzi, brak safety
4. **DatalisHQ/zuckerbot** — 50 narzędzi, brak safety

**Nasz differentiator: two-phase mutation safety z hookami** — jedyni na rynku.

## Kolejne kroki

### Natychmiastowe
- [ ] Testowanie end-to-end write tools z prawdziwym kontem Meta Ads
- [ ] Marketplace repo (`ads-ads-baby`) — setup jak google-ads-baby

### Krótkoterminowe
- [ ] Lepsze error handling (Meta API errors → czytelne komunikaty)
- [ ] Rate limiting — respektowanie Meta API rate limits (60pt/300s dev tier)
- [ ] Tool do zmiany aktywnego ad account w trakcie sesji

### Średnioterminowe
- [ ] OS dialog fallback (`zenity`/`osascript`) dla klientów bez hooków
- [ ] Konfigurowalny budget cap per-account
- [ ] System User token support (never-expiring, lepszy do automatyzacji)
- [ ] App Review guide (do produkcji — udostępnienie innym userom)
