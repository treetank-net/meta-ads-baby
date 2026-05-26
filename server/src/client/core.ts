import type { MetaAdsConfig } from '../config.js';

const API_VERSION = 'v25.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

export interface GraphApiError {
  message: string;
  type: string;
  code: number;
  error_subcode?: number;
  error_user_title?: string;
  error_user_msg?: string;
  fbtrace_id?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  paging?: {
    cursors?: { before?: string; after?: string };
    next?: string;
    previous?: string;
  };
}

export class MetaApiError extends Error {
  constructor(
    public readonly graphError: GraphApiError,
    public readonly statusCode: number,
  ) {
    super(graphError.error_user_msg || graphError.message);
    this.name = 'MetaApiError';
  }

  get code() { return this.graphError.code; }
  get subcode() { return this.graphError.error_subcode; }
  get isRateLimit() { return this.graphError.code === 4 || this.graphError.code === 17; }
  get isAuthError() { return this.graphError.code === 190; }
  get isPermissionError() { return this.graphError.code >= 200 && this.graphError.code < 300; }
}

async function request<T>(accessToken: string, method: string, path: string, params?: Record<string, unknown>): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);

  const init: RequestInit = {
    method,
    headers: { 'Authorization': `Bearer ${accessToken}` },
  };

  if (method === 'GET' && params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') {
        url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
      }
    }
  } else if (params) {
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') {
        body.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
      }
    }
    init.body = body.toString();
    init.headers = { ...init.headers as Record<string, string>, 'Content-Type': 'application/x-www-form-urlencoded' };
  }

  const res = await fetch(url.toString(), init);
  const json = await res.json() as T & { error?: GraphApiError };

  if (json.error) {
    throw new MetaApiError(json.error, res.status);
  }

  return json;
}

export function get<T>(cfg: MetaAdsConfig, path: string, params?: Record<string, unknown>): Promise<T> {
  return request<T>(cfg.accessToken, 'GET', path, params);
}

export function post<T>(cfg: MetaAdsConfig, path: string, params?: Record<string, unknown>): Promise<T> {
  return request<T>(cfg.accessToken, 'POST', path, params);
}

export function del(cfg: MetaAdsConfig, path: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(cfg.accessToken, 'DELETE', path);
}

export async function getAll<T>(cfg: MetaAdsConfig, path: string, params?: Record<string, unknown>, maxPages = 20): Promise<T[]> {
  const allData: T[] = [];
  let afterCursor: string | undefined;
  let page = 0;

  while (page < maxPages) {
    const reqParams = { ...params, ...(afterCursor ? { after: afterCursor } : {}) };
    const res = await get<PaginatedResponse<T>>(cfg, path, reqParams);
    allData.push(...res.data);

    if (!res.paging?.next) break;
    afterCursor = res.paging.cursors?.after;
    if (!afterCursor) break;
    page++;
  }

  return allData;
}

export async function uploadImage(cfg: MetaAdsConfig, adAccountId: string, source: { filePath?: string; url?: string }): Promise<{ hash: string; url: string }> {
  const url = `${BASE_URL}/act_${adAccountId}/adimages`;

  if (source.url) {
    try {
      const res = await post<{ images: Record<string, { hash: string; url: string }> }>(cfg, `/act_${adAccountId}/adimages`, { url: source.url });
      const entry = Object.values(res.images)[0];
      return entry;
    } catch (err) {
      if (err instanceof MetaApiError && err.code === 3) {
        const imgRes = await fetch(source.url);
        if (!imgRes.ok) throw new Error(`Failed to download image from ${source.url}: ${imgRes.status}`);
        const bytes = Buffer.from(await imgRes.arrayBuffer()).toString('base64');
        const res = await post<{ images: Record<string, { hash: string; url: string }> }>(cfg, `/act_${adAccountId}/adimages`, { bytes });
        const entry = Object.values(res.images)[0];
        return entry;
      }
      throw err;
    }
  }

  if (source.filePath) {
    const { readFileSync } = await import('fs');
    const { basename } = await import('path');
    const fileData = readFileSync(source.filePath);
    const fileName = basename(source.filePath);

    const formData = new FormData();
    formData.append('filename', new Blob([fileData]), fileName);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${cfg.accessToken}` },
      body: formData,
    });

    const json = await res.json() as { images?: Record<string, { hash: string; url: string }>; error?: GraphApiError };
    if (json.error) throw new MetaApiError(json.error, res.status);
    const entry = Object.values(json.images!)[0];
    return entry;
  }

  throw new Error('Either filePath or url must be provided for image upload');
}
