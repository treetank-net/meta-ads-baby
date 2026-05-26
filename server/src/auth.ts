import http from 'http';
import { randomBytes } from 'crypto';
import { exec } from 'child_process';
import { saveConfig } from './config.js';
import type { MetaAdsConfig } from './config.js';

function openBrowser(url: string) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${cmd} "${url}"`);
}

const SCOPES = 'ads_management,ads_read,business_management';
const GRAPH_API_VERSION = 'v25.0';

interface OAuthState {
  server: http.Server | null;
  port: number;
  stateParam: string;
  authUrl: string;
  resolved: boolean;
  cfg: MetaAdsConfig;
}

let oauthState: OAuthState | null = null;

async function exchangeCodeForShortLivedToken(
  code: string, appId: string, appSecret: string, redirectUri: string,
): Promise<string> {
  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  });
  const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token?${params.toString()}`);
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  const data = await res.json() as { access_token?: string };
  if (!data.access_token) throw new Error('No access_token in response.');
  return data.access_token;
}

async function exchangeForLongLivedToken(
  shortLivedToken: string, appId: string, appSecret: string,
): Promise<string> {
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLivedToken,
  });
  const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token?${params.toString()}`);
  if (!res.ok) throw new Error(`Long-lived token exchange failed: ${await res.text()}`);
  const data = await res.json() as { access_token?: string };
  if (!data.access_token) throw new Error('No access_token in long-lived token response.');
  return data.access_token;
}

async function listAdAccounts(accessToken: string): Promise<Array<{ id: string; account_id: string; name: string; account_status: number; currency: string }>> {
  const params = new URLSearchParams({
    fields: 'id,account_id,name,account_status,currency',
    access_token: accessToken,
    limit: '100',
  });
  const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/me/adaccounts?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to list ad accounts: ${await res.text()}`);
  const data = await res.json() as { data?: Array<{ id: string; account_id: string; name: string; account_status: number; currency: string }> };
  return data.data || [];
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c: Buffer) => data += c.toString());
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function accountStatusLabel(status: number): string {
  const labels: Record<number, string> = {
    1: 'Active',
    2: 'Disabled',
    3: 'Unsettled',
    7: 'Pending Risk Review',
    8: 'Pending Settlement',
    9: 'In Grace Period',
    100: 'Pending Closure',
    101: 'Closed',
    201: 'Any Active',
    202: 'Any Closed',
  };
  return labels[status] || `Unknown (${status})`;
}

function buildAuthUrl(appId: string, stateParam: string, port: number): string {
  const authUrl = new URL(`https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth`);
  authUrl.searchParams.set('client_id', appId);
  authUrl.searchParams.set('redirect_uri', `http://localhost:${port}/callback`);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('state', stateParam);
  return authUrl.toString();
}

const OPEN_PAGE = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body { font-family: system-ui; display:flex; justify-content:center; align-items:center;
         min-height:100vh; margin:0; background:#f0f4f8; }
  .card { background:white; padding:2.5rem; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,.1);
          max-width:520px; width:100%; }
  h1 { color:#1877F2; margin:0 0 .5rem; font-size:1.5rem; }
  p { color:#444; line-height:1.5; }
  label { display:block; font-weight:600; margin-bottom:.25rem; margin-top:.75rem; }
  .hint { font-size:.85rem; color:#666; margin-bottom:.5rem; }
  input { width:100%; padding:.6rem; border:1px solid #ddd; border-radius:6px; font-size:1rem; }
  .buttons { margin-top:1.5rem; display:flex; gap:.75rem; flex-wrap:wrap; }
  button { border:none; padding:.7rem 1.5rem; border-radius:6px; font-size:1rem; cursor:pointer; }
  .btn-primary { background:#1877F2; color:white; }
  .btn-primary:hover { background:#1466D8; }
  button:disabled { opacity:.5; cursor:wait; }
  .error { color:#dc2626; font-size:.9rem; margin-top:.5rem; }
  .saved { color:#16a34a; font-size:.85rem; font-style:italic; margin-top:.25rem; }
</style></head><body><div class="card">
  <h1>Meta Ads — Authorize</h1>
  <p>Enter your Meta App credentials and sign in with Facebook to grant access to your ad accounts.</p>
  <p class="hint">Create an app at <a href="https://developers.facebook.com/apps/" target="_blank">Meta for Developers &rarr; My Apps</a>.
  Required permissions: <strong>ads_management</strong>, <strong>ads_read</strong>, <strong>business_management</strong>.</p>
  <div>
    <label>App ID</label>
    <input id="app-id" placeholder="123456789012345">
    <div id="id-saved" class="saved"></div>
    <label>App Secret</label>
    <input id="app-secret" placeholder="abc123def456..." type="password">
    <div id="secret-saved" class="saved"></div>
  </div>
  <div class="buttons">
    <button class="btn-primary" id="btn-go">Sign in with Facebook</button>
  </div>
  <div id="open-error" class="error"></div>
</div>
<script>
(async () => {
  try {
    const res = await fetch('/saved-credentials');
    const data = await res.json();
    if (data.app_id) {
      document.getElementById('app-id').value = data.app_id;
      document.getElementById('id-saved').textContent = 'Loaded from saved config';
    }
    if (data.has_secret) {
      document.getElementById('app-secret').placeholder = String.fromCharCode(8226).repeat(8) + '  (saved — leave empty to keep)';
      document.getElementById('secret-saved').textContent = 'Saved secret will be used if left empty';
    }
  } catch {}
})();

document.getElementById('btn-go').onclick = async () => {
  const btn = document.getElementById('btn-go');
  const errEl = document.getElementById('open-error');
  errEl.textContent = '';
  const appId = document.getElementById('app-id').value.trim();
  const appSecret = document.getElementById('app-secret').value.trim();
  if (!appId) {
    errEl.textContent = 'App ID is required. Get it from Meta for Developers > My Apps.';
    return;
  }
  btn.disabled = true;
  try {
    const res = await fetch('/start-oauth', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ app_id: appId, app_secret: appSecret || undefined })
    });
    const data = await res.json();
    if (data.error) { errEl.textContent = data.error; btn.disabled = false; return; }
    window.location.href = data.url;
  } catch (e) { errEl.textContent = 'Connection error: ' + e.message; btn.disabled = false; }
};
</script></body></html>`;

const SETUP_PAGE = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body { font-family: system-ui; display:flex; justify-content:center; align-items:center;
         min-height:100vh; margin:0; background:#f0f4f8; }
  .card { background:white; padding:2.5rem; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,.1);
          max-width:480px; width:100%; }
  h1 { color:#16a34a; margin:0 0 .5rem; font-size:1.5rem; }
  .step { margin:1.5rem 0; }
  label { display:block; font-weight:600; margin-bottom:.25rem; }
  .hint { font-size:.85rem; color:#666; margin-bottom:.5rem; }
  input, select { width:100%; padding:.6rem; border:1px solid #ddd; border-radius:6px; font-size:1rem; }
  button { background:#1877F2; color:white; border:none; padding:.7rem 1.5rem; border-radius:6px;
           font-size:1rem; cursor:pointer; margin-top:.5rem; }
  button:hover { background:#1466D8; }
  button:disabled { background:#94a3b8; cursor:wait; }
  .error { color:#dc2626; font-size:.9rem; margin-top:.5rem; }
  .done { text-align:center; }
  .done h1 { font-size:2rem; color:#16a34a; }
  .loading { color:#666; font-style:italic; }
  #accounts-step { display:none; }
  #done-step { display:none; }
</style></head><body><div class="card">
  <div id="loading-step">
    <h1>Meta Ads Setup</h1>
    <p class="loading">Loading your ad accounts...</p>
  </div>
  <div id="accounts-step">
    <h1>Meta Ads Setup</h1>
    <p>Authorization complete. Select a default ad account and configure safety settings.</p>
    <div class="step">
      <label>Initial Ad Account</label>
      <div class="hint">This is just the initial default. You can switch accounts anytime in the chat using the available tools.</div>
      <select id="account-select"></select>
    </div>
    <div class="step">
      <label>Safety level</label>
      <select id="safety-level">
        <option value="standard" selected>standard - safe word, 1h TTL</option>
        <option value="strict">strict - safe word, 5 min TTL</option>
        <option value="off">off - no Claude hook gate</option>
      </select>
    </div>
    <div class="step">
      <label>Mutation token TTL (seconds)</label>
      <div class="hint">Optional. Leave empty to use the default for the selected level.</div>
      <input id="mutation-ttl" type="number" min="1" step="1" placeholder="e.g. 3600">
    </div>
    <div class="step">
      <label>Confirmation state TTL (seconds)</label>
      <div class="hint">Optional for the Claude Code hook. Leave empty to use the default for the selected level.</div>
      <input id="confirm-ttl" type="number" min="1" step="1" placeholder="e.g. 3600">
    </div>
    <button id="btn-save">Save and finish</button>
    <div id="accounts-error" class="error"></div>
  </div>
  <div id="done-step" class="done">
    <h1>Done!</h1>
    <p>Configuration saved.<br>Close this tab and return to the chat.</p>
  </div>
</div>
<script>
(async () => {
  try {
    const res = await fetch('/list-accounts', { method: 'POST', headers: {'Content-Type':'application/json'}, body: '{}' });
    const data = await res.json();
    if (data.error) {
      document.getElementById('loading-step').innerHTML = '<h1 style="color:#dc2626">Error</h1><p>' + data.error + '</p>';
      return;
    }
    if (!data.accounts || data.accounts.length === 0) {
      document.getElementById('loading-step').innerHTML = '<h1 style="color:#dc2626">No accounts</h1><p>No accessible Meta ad accounts found for this user.</p>';
      return;
    }
    const sel = document.getElementById('account-select');
    sel.innerHTML = '';
    data.accounts.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.account_id;
      opt.textContent = a.name + ' (' + a.account_id + ') [' + a.currency + '] ' + a.status_label;
      sel.appendChild(opt);
    });
    document.getElementById('loading-step').style.display = 'none';
    document.getElementById('accounts-step').style.display = 'block';
  } catch (e) {
    document.getElementById('loading-step').innerHTML = '<h1 style="color:#dc2626">Error</h1><p>Connection error: ' + e.message + '</p>';
  }
})();

document.getElementById('btn-save').onclick = async () => {
  const accountId = document.getElementById('account-select').value;
  const safetyLevel = document.getElementById('safety-level').value;
  const mutationTtl = document.getElementById('mutation-ttl').value.trim();
  const confirmTtl = document.getElementById('confirm-ttl').value.trim();
  const errEl = document.getElementById('accounts-error');
  errEl.textContent = '';
  if (!accountId) { errEl.textContent = 'Select an account from the list.'; return; }
  if (!['strict', 'standard', 'off'].includes(safetyLevel)) { errEl.textContent = 'Invalid safety level.'; return; }
  if (mutationTtl && !/^\\d+$/.test(mutationTtl)) { errEl.textContent = 'Mutation token TTL must be a number of seconds.'; return; }
  if (confirmTtl && !/^\\d+$/.test(confirmTtl)) { errEl.textContent = 'Confirmation state TTL must be a number of seconds.'; return; }
  const btn = document.getElementById('btn-save');
  btn.disabled = true;
  try {
    const res = await fetch('/save-config', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        account_id: accountId,
        safety_level: safetyLevel,
        mutation_token_ttl_seconds: mutationTtl,
        confirm_state_ttl_seconds: confirmTtl
      })
    });
    const data = await res.json();
    if (data.error) { errEl.textContent = data.error; btn.disabled = false; return; }
    document.getElementById('accounts-step').style.display = 'none';
    document.getElementById('done-step').style.display = 'block';
  } catch (e) { errEl.textContent = 'Error: ' + e.message; btn.disabled = false; }
};
</script></body></html>`;

export function startAuthFlow(cfg: MetaAdsConfig): { url: string; shortUrl: string; port: number } {
  if (oauthState?.server) oauthState.server.close();

  const stateParam = randomBytes(16).toString('hex');
  const port = 9876;
  const redirectUri = `http://localhost:${port}/callback`;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`);
    const json = (status: number, data: object) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(data));
    };
    const html = (status: number, body: string) => {
      res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(body);
    };

    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');
      const errorDescription = url.searchParams.get('error_description');
      if (error) { html(200, `<h1>Authorization error</h1><p>${errorDescription || error}</p>`); return; }
      if (state !== stateParam || !code) { html(400, '<h1>Invalid request</h1>'); return; }
      try {
        const shortLivedToken = await exchangeCodeForShortLivedToken(code, cfg.appId, cfg.appSecret, redirectUri);
        const longLivedToken = await exchangeForLongLivedToken(shortLivedToken, cfg.appId, cfg.appSecret);
        await saveConfig({ accessToken: longLivedToken });
        cfg.accessToken = longLivedToken;
        html(200, SETUP_PAGE);
      } catch (err: any) {
        html(500, `<h1>Error</h1><p>${err.message}</p>`);
      }
      return;
    }

    if (url.pathname === '/open') {
      if (!oauthState) { html(404, '<h1>Authorization flow not active</h1>'); return; }
      html(200, OPEN_PAGE);
      return;
    }

    if (url.pathname === '/saved-credentials' && req.method === 'GET') {
      json(200, {
        app_id: cfg.appId || '',
        has_secret: !!cfg.appSecret,
      });
      return;
    }

    if (url.pathname === '/start-oauth' && req.method === 'POST') {
      if (!oauthState) { json(404, { error: 'Authorization flow not active' }); return; }
      try {
        const body = JSON.parse(await readBody(req));
        const newId = (body.app_id || '').trim();
        const newSecret = (body.app_secret || '').trim();
        if (!newId) { json(400, { error: 'App ID is required.' }); return; }
        const effectiveSecret = newSecret || cfg.appSecret;
        if (!effectiveSecret) { json(400, { error: 'App Secret is required. Enter it in the form above.' }); return; }
        cfg.appId = newId;
        cfg.appSecret = effectiveSecret;
        const toSave: Record<string, string> = { appId: newId };
        if (newSecret) toSave['appSecret'] = newSecret;
        await saveConfig(toSave);
        const authUrl = buildAuthUrl(cfg.appId, oauthState.stateParam, oauthState.port);
        oauthState.authUrl = authUrl;
        json(200, { url: authUrl });
      } catch (err: any) {
        json(500, { error: err.message || String(err) });
      }
      return;
    }

    if (url.pathname === '/list-accounts' && req.method === 'POST') {
      try {
        const accounts = await listAdAccounts(cfg.accessToken);
        const mapped = accounts.map(a => ({
          id: a.id,
          account_id: a.account_id,
          name: a.name || a.account_id,
          currency: a.currency || '',
          account_status: a.account_status,
          status_label: accountStatusLabel(a.account_status),
        }));
        mapped.sort((a, b) => a.name.localeCompare(b.name));
        json(200, { accounts: mapped });
      } catch (err: any) {
        const msg = typeof err.message === 'string' ? err.message : JSON.stringify(err.message ?? err);
        json(500, { error: msg });
      }
      return;
    }

    if (url.pathname === '/save-config' && req.method === 'POST') {
      try {
        const body = JSON.parse(await readBody(req));
        const safetyLevel = ['strict', 'standard', 'off'].includes(body.safety_level) ? body.safety_level : 'standard';
        const mutationTokenTtlSeconds = /^\d+$/.test(String(body.mutation_token_ttl_seconds || '')) ? String(body.mutation_token_ttl_seconds) : '';
        const confirmStateTtlSeconds = /^\d+$/.test(String(body.confirm_state_ttl_seconds || '')) ? String(body.confirm_state_ttl_seconds) : '';
        await saveConfig({
          safetyLevel,
          mutationTokenTtlSeconds,
          confirmStateTtlSeconds,
        });
        cfg.safetyLevel = safetyLevel;
        cfg.mutationTokenTtlSeconds = mutationTokenTtlSeconds;
        cfg.confirmStateTtlSeconds = confirmStateTtlSeconds;
        process.env['META_ADS_SAFETY_LEVEL'] = safetyLevel;
        if (mutationTokenTtlSeconds) process.env['META_ADS_MUTATION_TOKEN_TTL_SECONDS'] = mutationTokenTtlSeconds;
        else delete process.env['META_ADS_MUTATION_TOKEN_TTL_SECONDS'];
        if (confirmStateTtlSeconds) process.env['META_ADS_CONFIRM_STATE_TTL_SECONDS'] = confirmStateTtlSeconds;
        else delete process.env['META_ADS_CONFIRM_STATE_TTL_SECONDS'];
        oauthState!.resolved = true;
        json(200, { ok: true });
        cleanup();
      } catch (err: any) {
        json(500, { error: err.message || String(err) });
      }
      return;
    }

    res.writeHead(404); res.end('Not found');
  });

  server.listen(port, '127.0.0.1');

  const authUrl = buildAuthUrl(cfg.appId, stateParam, port);
  oauthState = { server, port, stateParam, authUrl, resolved: false, cfg };

  openBrowser(`http://127.0.0.1:${port}/open`);

  return { url: authUrl, shortUrl: `http://127.0.0.1:${port}/open`, port };
}

export function checkAuthStatus(): { done: boolean } {
  return { done: oauthState?.resolved ?? false };
}

function cleanup() {
  if (oauthState?.server) {
    setTimeout(() => { oauthState?.server?.close(); oauthState!.server = null; }, 2000);
  }
}
