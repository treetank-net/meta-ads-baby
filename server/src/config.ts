import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export interface MetaAdsConfig {
  appId: string;
  appSecret: string;
  accessToken: string;
  safetyLevel: 'strict' | 'standard' | 'off';
  mutationTokenTtlSeconds: string;
  confirmStateTtlSeconds: string;
}

interface SavedConfig {
  appId?: string;
  appSecret?: string;
  accessToken?: string;
  safetyLevel?: 'strict' | 'standard' | 'off';
  mutationTokenTtlSeconds?: string;
  confirmStateTtlSeconds?: string;
  savedAt?: string;
}

function isValidEnv(val: string | undefined): val is string {
  return !!val && !val.includes('${');
}

function env(name: string): string {
  const v = process.env[name];
  return isValidEnv(v) ? v : '';
}

export function getConfigDir(): string {
  const explicit = env('META_ADS_BABY_DATA');
  if (explicit) return explicit;
  const home = process.env['HOME'] || process.env['USERPROFILE'] || process.env['APPDATA'];
  if (home) return join(home, '.meta-ads-baby');
  return join(process.platform === 'win32' ? (process.env['TEMP'] || 'C:\\Temp') : '/tmp', '.meta-ads-baby');
}

export function getConfigPath(): string {
  return join(getConfigDir(), 'config.json');
}

export async function loadSavedConfig(): Promise<SavedConfig> {
  try {
    const data = await readFile(getConfigPath(), 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

export async function saveConfig(config: Partial<SavedConfig>): Promise<string> {
  const existing = await loadSavedConfig();
  const merged = { ...existing, ...config, savedAt: new Date().toISOString() };
  const dir = getConfigDir();
  await mkdir(dir, { recursive: true });
  const path = getConfigPath();
  await writeFile(path, JSON.stringify(merged, null, 2));
  return path;
}

export async function configFromEnv(): Promise<MetaAdsConfig> {
  const saved = await loadSavedConfig();
  const safetyLevel = env('META_ADS_SAFETY_LEVEL') || saved.safetyLevel || 'standard';
  const mutationTokenTtlSeconds = env('META_ADS_MUTATION_TOKEN_TTL_SECONDS') || saved.mutationTokenTtlSeconds || '';
  const confirmStateTtlSeconds = env('META_ADS_CONFIRM_STATE_TTL_SECONDS') || saved.confirmStateTtlSeconds || '';

  process.env['META_ADS_SAFETY_LEVEL'] ||= safetyLevel;
  if (mutationTokenTtlSeconds) process.env['META_ADS_MUTATION_TOKEN_TTL_SECONDS'] ||= mutationTokenTtlSeconds;
  if (confirmStateTtlSeconds) process.env['META_ADS_CONFIRM_STATE_TTL_SECONDS'] ||= confirmStateTtlSeconds;

  return {
    appId: env('META_ADS_APP_ID') || saved.appId || '',
    appSecret: env('META_ADS_APP_SECRET') || saved.appSecret || '',
    accessToken: env('META_ADS_ACCESS_TOKEN') || saved.accessToken || '',
    safetyLevel: safetyLevel as MetaAdsConfig['safetyLevel'],
    mutationTokenTtlSeconds,
    confirmStateTtlSeconds,
  };
}
