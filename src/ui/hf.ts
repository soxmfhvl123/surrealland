/** Browser-side client for the local Higgsfield proxy (server/higgsfield.ts). */

const CRED_KEY = 'surreal-land/hf-credentials';

export function getCreds(): string {
  try {
    return localStorage.getItem(CRED_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setCreds(v: string) {
  try {
    if (v) localStorage.setItem(CRED_KEY, v);
    else localStorage.removeItem(CRED_KEY);
  } catch {
    // storage unavailable: the key then only lasts for this page session
  }
}

const authHeaders = (): Record<string, string> => {
  const c = getCreds();
  return c ? { 'x-hf-credentials': c } : {};
};

async function parse(res: Response) {
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { error: text.slice(0, 200) };
  }
  if (!res.ok) {
    const msg = (json.error ?? json.detail ?? json.message ?? `HTTP ${res.status}`) as unknown;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return json;
}

export async function hfConfig(): Promise<{ env: boolean; reachable: boolean }> {
  try {
    const res = await fetch('/api/hf/config');
    const j = (await res.json()) as { env: boolean };
    return { env: !!j.env, reachable: true };
  } catch {
    return { env: false, reachable: false };
  }
}

export interface HfRequest {
  request_id: string;
  status: string;
  [k: string]: unknown;
}

export async function submit(model: string, input: Record<string, unknown>): Promise<HfRequest> {
  const res = await fetch('/api/hf/submit', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ model, input }),
  });
  const j = await parse(res);
  const id = (j.request_id ?? j.id) as string | undefined;
  if (!id) throw new Error('request_id 가 없는 응답이에요.');
  return { ...j, request_id: id, status: String(j.status ?? 'queued') };
}

export async function status(id: string): Promise<Record<string, unknown>> {
  return parse(await fetch(`/api/hf/status?id=${encodeURIComponent(id)}`, { headers: authHeaders() }));
}

export async function cancel(id: string) {
  return parse(await fetch(`/api/hf/cancel?id=${encodeURIComponent(id)}`, { method: 'POST', headers: authHeaders() }));
}

export async function upload(blob: Blob): Promise<string> {
  const res = await fetch('/api/hf/upload', {
    method: 'POST',
    headers: { 'content-type': blob.type || 'image/png', ...authHeaders() },
    body: blob,
  });
  const j = await parse(res);
  return j.url as string;
}

export const TERMINAL = ['completed', 'failed', 'nsfw', 'canceled', 'cancelled'];

/** Collect every media URL in a status payload (images[].url, video.url, …). */
export function extractMedia(json: unknown): string[] {
  const out = new Set<string>();
  const walk = (v: unknown, key = '') => {
    if (typeof v === 'string') {
      if (/^https:\/\//.test(v) && (key === 'url' || key === 'raw' || /\.(png|jpe?g|webp|mp4|mov)(\?|$)/i.test(v))) out.add(v);
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (k.endsWith('_url') && k !== 'url') continue; // status_url, cancel_url
        walk(x, k);
      }
    }
  };
  walk(json);
  return [...out];
}

export async function fetchMedia(url: string): Promise<Blob> {
  const res = await fetch(`/api/hf/fetch?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`결과를 가져오지 못했어요 (${res.status})`);
  return res.blob();
}
