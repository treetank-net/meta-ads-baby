# meta-ads-baby

Claude Code plugin: MCP server for Meta (Facebook) Ads campaign management with two-phase mutation safety.

**Status: FORK z google-ads-baby — wymaga adaptacji. Pliki zawierają jeszcze referencje do Google Ads.**

## Geneza

Skopiowane z `../google-ads-baby/` (26.05.2026). Architektura, safety hooks i two-phase mutation flow
są generyczne i przenoszą się prawie 1:1. Klient API, toole i auth wymagają przepisania pod Meta Marketing API.

Siostrzany projekt: `../google-ads-baby/` — tam jest działający plugin do Google Ads, wzorzec architektury.

## TODO dla właściciela: panel deweloperski Meta

Zanim zaczniemy kodować klienta API, potrzebne są credentials z Meta:

### 1. Utwórz Meta App
- Wejdź na https://developers.facebook.com/apps/
- "Create App" → typ: **Business**
- Nazwa: np. "Meta Ads Baby" lub "Treetank Ads Manager"
- Business portfolio: wybierz swoje konto Business Manager

### 2. Dodaj produkt "Marketing API"
- W dashboardzie appki → "Add Products" → **Marketing API**
- To odblokuje dostęp do endpointów kampanii, ad setów, reklam

### 3. Skonfiguruj Facebook Login
- "Add Products" → **Facebook Login** → Settings
- Valid OAuth Redirect URIs: `http://127.0.0.1:9876/callback` (nasz lokalny serwer)
- Strict Mode: OFF (dla developmentu)

### 4. Uprawnienia (scopes)
- W "App Review" → "Permissions and Features" zamów:
  - `ads_read` — odczyt kont reklamowych, kampanii, raportów
  - `ads_management` — tworzenie/edycja kampanii, ad setów, reklam
  - `business_management` — dostęp do Business Manager
  - `pages_read_engagement` — jeśli chcemy zarządzać reklamami powiązanymi ze stronami
- Na etapie developmentu: wystarczy być adminem appki (scopes działają bez App Review dla adminów)

### 5. Pobierz credentials
- App ID — w "Settings" → "Basic" → App ID
- App Secret — tamże, "App Secret" (kliknij "Show")
- Access Token — wygeneruj w "Marketing API" → "Tools" → token z odpowiednimi scope'ami
  - Albo: zaimplementujemy OAuth flow, który sam wygeneruje long-lived token

### 6. (Opcjonalne) System User
- W Business Manager → "Business Settings" → "System Users"
- Utwórz System User z rolą Admin
- Wygeneruj token z scope'ami `ads_management,ads_read`
- System User token nigdy nie wygasa — najlepszy do automatyzacji

### 7. App Review (do produkcji)
- Gdy appka będzie gotowa do udostępnienia innym:
- "App Review" → "Requests" → zamów `ads_management` scope
- Wymaga screenshotów, opisu use case'u, privacy policy URL
- Recenzja trwa 1-5 dni roboczych

## Architektura (docelowa)

Plugin = MCP server (stdio) + Claude Code/Codex hooks (safety enforcement).
Identyczna architektura jak google-ads-baby.

### MCP Server (`server/`)
- TypeScript source w `server/src/`, kompilacja `tsc`, bundle `esbuild` → `server/bundle.cjs`
- Docelowe zależności: `@modelcontextprotocol/sdk` (stdio), `zod`, klient Meta Graph API (patrz niżej)
- All dependencies bundled — zero `node_modules` at runtime

### Kluczowe różnice vs Google Ads

| Aspekt | Google Ads (obecne pliki) | Meta Ads (docelowo) |
|---|---|---|
| API | gRPC (`google-ads-api` v23) | REST / Graph API v25 |
| SDK | `google-ads-api` (community, ~80MB) | `facebook-nodejs-business-sdk` v24 (oficjalny Meta) LUB bezpośrednie HTTP calls |
| Auth | OAuth2 + developer token + MCC ID | OAuth2 + App ID/Secret (bez developer token) |
| Hierarchia | Campaign → Ad Group → Ad + extensions, asset groups, keywords | Campaign → Ad Set → Ad (prostsza, bez keywords) |
| ID format | `customers/123/campaigns/456` (resource name) | numeryczne ID, ad account: `act_123456789` |
| Query language | GAQL (Google Ads Query Language) | Graph API endpoints + fields param |
| Targeting | keywords + audiences | audiences only (interests, behaviors, demographics, lookalikes) |
| Budget | campaign level (micros: 1000000 = 1 PLN) | ad set level LUB campaign level (CBO), wartości w centach waluty konta |
| Test mode | developer token w trybie testowym | brak — wszystkie mutacje są live |
| Bundle size | ~25MB (gRPC/protobuf ciężki) | znacznie mniejszy (REST) |

### Meta Ads — hierarchia obiektów
```
Business Manager (Meta Business Suite)
  └── Ad Account (act_XXXXXXXXX)
       └── Campaign (cel: conversions, traffic, leads, awareness, app_installs, etc.)
            └── Ad Set (audience, placement, budget, schedule, bidding)
                 └── Ad (creative: image/video + copy + CTA)
                      └── Ad Creative (standalone object, reusable across ads)
```

### Meta Marketing API — kluczowe endpointy
- `GET /act_{ad_account_id}/campaigns` — lista kampanii
- `POST /act_{ad_account_id}/campaigns` — nowa kampania
- `POST /{campaign_id}` — update kampanii
- `GET /act_{ad_account_id}/adsets` — lista ad setów
- `POST /act_{ad_account_id}/adsets` — nowy ad set
- `GET /act_{ad_account_id}/ads` — lista reklam
- `GET /act_{ad_account_id}/insights` — raporty/statystyki
- `POST /act_{ad_account_id}/adimages` — upload obrazków
- `GET /me/adaccounts` — lista kont reklamowych usera

### Rate limiting Meta API
- Read call = 1 punkt, Write call = 3 punkty
- Development tier: max 60 punktów, decay 300s
- Standard tier: max 9000 punktów, decay 300s
- Mutation endpoints: real-time rate limiting ~100 QPS per ad account

## Stan obecny — co wymaga zmiany

### Faza 1: Rename (mechaniczny find & replace)

Pliki z referencjami `google-ads` / `GOOGLE_ADS` które trzeba zmienić:

**Manifesty i konfiguracja:**
- `.claude-plugin/plugin.json` — name, description, env vars (`GOOGLE_ADS_*` → `META_ADS_*`)
- `.claude-plugin/marketplace.json` — name, description
- `.codex-plugin/plugin.json` — name, description, interface
- `.agents/plugins/marketplace.json` — name, displayName, source path
- `plugins/google-ads-baby/` → rename do `plugins/meta-ads-baby/` + edycja plików wewnątrz
- `hooks.json` (root) — matcher: `google-ads__` → `meta-ads__`
- `hooks/hooks.json` — j.w.
- `hooks/google-ads-baby-safety/` → rename do `hooks/meta-ads-baby-safety/` + edycja hooks.json
- `.mcp.json` — server name, package name, env vars
- `.gitlab-ci.yml` — GitHub mirror URL
- `package.json` (root) — name, description, repository
- `README.md` — cała treść

**Scripts:**
- `scripts/safety-hook.js` — env vars, state dir, state file names, tool name regex
- `scripts/start-mcp.js` — repo URL, nazwy w stderr

**Server source:**
- `server/package.json` — name, description, dependencies
- `server/src/index.ts` — server name
- `server/src/config.ts` — env vars, interface, config dir path
- `server/src/constants.ts` — OAuth credentials
- `server/src/confirm.ts` — env vars, state file names
- `server/src/validation.ts` — function names, error messages, ID format (act_XXX)
- `server/src/history.ts` — resource ID regex, config dir
- `server/src/errors.ts` — sprawdzić

#### Mapa rename env vars
```
GOOGLE_ADS_CLIENT_ID        → META_ADS_APP_ID
GOOGLE_ADS_CLIENT_SECRET     → META_ADS_APP_SECRET
GOOGLE_ADS_REFRESH_TOKEN     → META_ADS_ACCESS_TOKEN
GOOGLE_ADS_DEVELOPER_TOKEN   → (usunąć — Meta nie ma developer token)
GOOGLE_ADS_MCC_ID            → (usunąć — Meta używa Business Manager ID inaczej)
GOOGLE_ADS_SAFETY_LEVEL      → META_ADS_SAFETY_LEVEL
GOOGLE_ADS_MUTATION_TOKEN_TTL_SECONDS → META_ADS_MUTATION_TOKEN_TTL_SECONDS
GOOGLE_ADS_CONFIRM_STATE_TTL_SECONDS  → META_ADS_CONFIRM_STATE_TTL_SECONDS
GOOGLE_ADS_ENABLE_MANUAL_CONFIRM     → META_ADS_ENABLE_MANUAL_CONFIRM
GOOGLE_ADS_YOLO              → META_ADS_YOLO
GOOGLE_ADS_BABY_DATA         → META_ADS_BABY_DATA
```

#### Mapa rename state files
```
.google-ads-baby/     → .meta-ads-baby/
.gads-confirm-state   → .mads-confirm-state
.gads-safe-word       → .mads-safe-word
```

#### Mapa rename tool name prefix
```
google-ads__prepare_*    → meta-ads__prepare_*
google-ads__confirm_*    → meta-ads__confirm_*
google[-_]ads__          → meta[-_]ads__
```

### Faza 2: Przepisanie klienta API

Usunąć zawartość `server/src/client/` i napisać od nowa pod Meta Graph API:

```
client/
  core.ts       — MetaApiClient class, Graph API HTTP calls, token refresh
  accounts.ts   — listAdAccounts(), getAdAccount()
  campaigns.ts  — getCampaigns(), createCampaign(), updateCampaign()
  adsets.ts     — getAdSets(), createAdSet(), updateAdSet()
  ads.ts        — getAds(), createAd(), updateAd()
  creatives.ts  — getAdCreatives(), createAdCreative(), uploadImage()
  insights.ts   — getInsights() (raportowanie)
  audiences.ts  — getCustomAudiences(), createLookalikeAudience()
  index.ts      — barrel re-export
```

**Decyzja SDK vs raw HTTP:**
- `facebook-nodejs-business-sdk` v24 — oficjalny, ale laguje za API v25, plain JS, słabe typy
- Bezpośrednie `fetch()` do Graph API — prostsze, lepsze typy, mniejszy bundle, brak wersji lag
- **Rekomendacja: raw HTTP** z własnym typowanym klientem (wzorować się na `core.ts` z google-ads-baby)

### Faza 3: Przepisanie narzędzi MCP (tools/)

**Auth** (`tools/auth.ts`) — przepisać:
- OAuth flow: Facebook Login z scope `ads_management,ads_read`
- Redirect URI: `http://127.0.0.1:9876/callback`
- Exchange code → short-lived token → long-lived token (60 dni lub never-expiring ze Standard access)
- Zapis tokenu do `config.json`
- Landing page: formularz na App ID / App Secret (jak w google-ads-baby custom OAuth app)

**Read tools** (`tools/read*.ts`) — przepisać:
- `list_ad_accounts` — `GET /me/adaccounts` (zamiast `list_accounts`)
- `get_campaigns` — `GET /act_{id}/campaigns?fields=...`
- `get_ad_sets` — `GET /act_{id}/adsets?fields=...`
- `get_ads` — `GET /act_{id}/ads?fields=...`
- `get_insights` — `GET /act_{id}/insights?fields=...&date_preset=...` (zamiast `execute_gaql`)
- `list_ads_entities` — uogólniony listing z filtrowaniem
- `get_mutation_history` / `get_mutation_stats` — **zachować bez zmian** (generyczne)

**Write tools** (`tools/write*.ts`) — przepisać:
- `prepare_campaign_status` — pause/enable kampanii (`POST /{id}?status=PAUSED|ACTIVE`)
- `prepare_budget_change` — update budżetu (na ad set lub campaign level)
- `prepare_campaign_create` — nowa kampania z objective
- `prepare_ad_set_create` — nowy ad set z targetingiem, budżetem, schedule
- `prepare_ad_create` — nowa reklama z creative
- `prepare_ad_creative` — nowy creative (image + copy + CTA)
- `prepare_image_upload` — upload obrazka do ad account

**Confirm tools** (`tools/write-confirm.ts`) — **zachować prawie bez zmian** (generyczne):
- `get_safety_setup`, `confirm_safe_word`, `confirm_mutation`, `confirm_all_mutations`
- Tylko rename env vars

### Faza 4: Config interface (docelowa)

```typescript
export interface MetaAdsConfig {
  appId: string;
  appSecret: string;
  accessToken: string;        // long-lived user token lub system user token
  safetyLevel: 'strict' | 'standard' | 'off';
  mutationTokenTtlSeconds: string;
  confirmStateTtlSeconds: string;
}
```

Env vars:
- `META_ADS_APP_ID` / `META_ADS_APP_SECRET` — Facebook App (opcjonalnie, można podać w OAuth flow)
- `META_ADS_ACCESS_TOKEN` — long-lived access token
- `META_ADS_SAFETY_LEVEL` — `standard` (default), `strict`, or `off`
- `META_ADS_MUTATION_TOKEN_TTL_SECONDS` — optional server-side mutation token TTL override
- `META_ADS_CONFIRM_STATE_TTL_SECONDS` — optional Claude hook confirmation-state TTL override

## Pliki generyczne (zachować, tylko rename)

Te pliki przenoszą się z minimalnym nakładem (rename env vars / state files):

| Plik | Nakład |
|---|---|
| `server/src/confirm.ts` | rename env vars, state file paths |
| `server/src/history.ts` | rename resource ID regex |
| `server/src/errors.ts` | sprawdzić, prawdopodobnie bez zmian |
| `scripts/safety-hook.js` | rename env vars, state dir/files, tool regex |
| `scripts/start-mcp.js` | rename repo URL, stderr messages |
| `hooks.json` (all) | rename matcher regex |
| `server/tsconfig.json` | bez zmian |
| `.gitignore` | bez zmian |

## Pliki do przepisania od zera

| Plik | Powód |
|---|---|
| `server/src/client/*` | Inny API (Graph API REST vs gRPC) |
| `server/src/tools/auth.ts` | Inny OAuth flow (Facebook Login vs Google OAuth) |
| `server/src/tools/read*.ts` | Inne endpointy, inna struktura danych |
| `server/src/tools/write-prepare-*.ts` | Inna hierarchia (Ad Set zamiast Ad Group, brak keywords) |
| `server/src/tools/write-executor.ts` | Inne API calls |
| `server/src/tools/write-schemas.ts` | Inne limity, inne pola |
| `README.md` | Nowa dokumentacja |

## Konkurencja i differentiator

### Istniejące rozwiązania Meta Ads MCP (stan: maj 2026)

1. **Oficjalny Meta Ads MCP** (`mcp.facebook.com/ads`) — 29 narzędzi, read+write, darmowy w beta, zero konfiguracji.
   Ale: hosted (nie self-hosted), brak kontroli nad safety, brak two-phase flow.

2. **pipeboard-co/meta-ads-mcp** (GitHub, 791 stars) — 29 narzędzi, CRUD kampanii, proste confirm prompts.
   Brak prawdziwego safety — "confirm to proceed" staje się muscle memory.

3. **serkanhaslak/meta-mcp** — 77 narzędzi, rozbudowany.

4. **DatalisHQ/zuckerbot** — 50 narzędzi, CLI + MCP.

**Nasz differentiator: two-phase mutation safety z hookami** — jedyni na rynku. Brak test mode w Meta API
sprawia, że safety jest jeszcze ważniejszy niż w Google Ads.

## Commands
- `cd server && npm install && npm run build` — zainstaluj zależności, skompiluj TS i zbuduj bundle
- `cd server && npm run dev` — watch mode
- `cd server && npm start` — uruchom MCP server z bundle.cjs

## Build
1. `cd server && npm install`
2. `npm run build` (tsc + esbuild → bundle.cjs)

### Co jest w git, a co nie
- `server/src/` — źródła TypeScript YES
- `server/bundle.cjs` — zbundlowany runtime YES (po zbudowaniu)
- `server/dist/` — intermediate output z tsc NO (.gitignore)
- `server/node_modules/` — zależności dev NO (.gitignore)

## Repo & CI
- GitLab: `treetank/meta-ads-baby` (origin, primary) — do utworzenia
- GitHub: `treetank-net/meta-ads-baby` (mirror) — do utworzenia
- `.gitlab-ci.yml`: mirror job (wymaga `GITHUB_TREETANK_TOKEN`)

## Konwencje
- Każdy prepare tool tworzy token przez `createToken()` i zwraca przez `prepareResponse()`
- Budget walidacja przez stałe z `write-schemas.ts`
- Ad Account ID normalizacja: `normalizeAdAccountId()` na początku każdego handlera (obsługa `act_` prefix)
- Nie dodawaj komentarzy w kodzie — nazwy funkcji/zmiennych muszą być samodokumentujące
- `npm run build` po każdej zmianie w `src/`

## Decyzja: SDK vs raw HTTP

**Rekomendacja: raw HTTP (fetch) z własnym typowanym klientem.**

Powody:
- `facebook-nodejs-business-sdk` laguje (v24 vs API v25), plain JS, słabe typy
- Graph API to prosty REST — nie potrzeba SDK jak w gRPC (Google Ads)
- Mniejszy bundle (brak dodatkowej zależności)
- Pełna kontrola nad typami i error handling
- Łatwiejsze bundling (zero problemów z CJS/ESM)

Wzorzec:
```typescript
class MetaGraphClient {
  constructor(private accessToken: string, private apiVersion = 'v25.0') {}
  
  async get<T>(path: string, params?: Record<string, string>): Promise<T> { ... }
  async post<T>(path: string, body: Record<string, unknown>): Promise<T> { ... }
  async delete(path: string): Promise<void> { ... }
}
```
