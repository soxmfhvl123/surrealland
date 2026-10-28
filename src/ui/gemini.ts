/** Browser-side client for the local Gemini / Nano Banana proxy (server/gemini.ts). */

const KEY = 'surreal-land/gemini-key';

export function getKey(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function setKey(v: string) {
  try {
    if (v) localStorage.setItem(KEY, v);
    else localStorage.removeItem(KEY);
  } catch {
    // storage unavailable: the key then only lasts for this page session
  }
}

export async function geminiConfig(): Promise<{ env: boolean; reachable: boolean }> {
  try {
    const res = await fetch('/api/gemini/config');
    const j = (await res.json()) as { env: boolean };
    return { env: !!j.env, reachable: true };
  } catch {
    return { env: false, reachable: false };
  }
}

export interface NanoModel {
  id: string;
  label: string;
  note: string;
  sizes: string[];
}

/** Model ids from ai.google.dev/gemini-api/docs/image-generation (Oct 2026). */
export const NANO_MODELS: NanoModel[] = [
  { id: 'gemini-nano-banana-2.1', label: 'Nano Banana 2.1 (최신)', note: '가장 최신. 참고 사진 여러 장으로 고치기에 강해요.', sizes: ['1K', '2K', '4K', '512px'] },
  { id: 'gemini-3.1-flash-image', label: 'Nano Banana 2', note: '빠르고 품질 좋은 기본 모델.', sizes: ['1K', '2K', '4K', '512px'] },
  { id: 'gemini-3-pro-image', label: 'Nano Banana Pro', note: '가장 꼼꼼하고 사실적. 느리고 비싸요. 참고 사진 최대 6장.', sizes: ['1K', '2K', '4K'] },
  { id: 'gemini-3.1-flash-lite-image', label: 'Nano Banana 2 Lite', note: '싸고 빠름. 1K만.', sizes: ['1K'] },
  { id: 'gemini-2.5-flash-image', label: 'Nano Banana (구버전)', note: '처음 나온 모델. 해상도 선택 없음.', sizes: [] },
];

export const NANO_ASPECTS = ['4:5', '3:4', '1:1', '9:16', '16:9', '2:3', '3:2', '4:3', '5:4', '21:9'];

export interface NanoImage {
  mime: string;
  data: string;
}

export async function nanoGenerate(req: { model: string; prompt: string; images: NanoImage[]; aspect?: string; size?: string }, signal?: AbortSignal): Promise<{ images: NanoImage[]; text?: string }> {
  const key = getKey();
  const res = await fetch('/api/gemini/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { 'x-gemini-key': key } : {}) },
    body: JSON.stringify(req),
    signal,
  });
  const text = await res.text();
  let json: { error?: string; images?: NanoImage[]; text?: string } = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { error: text.slice(0, 200) };
  }
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return { images: json.images ?? [], text: json.text };
}

/** A canvas source as base64 JPEG for the request (long side capped to keep uploads small). */
export function toNanoImage(src: CanvasImageSource, w: number, h: number, maxSide = 1600): NanoImage {
  const k = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
  return { mime: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.9).split(',')[1] };
}

export function base64ToBlob(img: NanoImage): Blob {
  const bin = atob(img.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: img.mime });
}
