import { liveCanvas, maskFor } from './masks';
import type { Project, Selection } from './types';
import { clipTime } from './video';

/**
 * Per-frame masks for selections tracked through a video (rotoscoping).
 * Frames are kept as raw alpha bytes (one byte per pixel) to stay small in memory;
 * the canvas for the current moment is built on demand and cached.
 */
export interface TrackData {
  fps: number;
  w: number;
  h: number;
  /** frame i covers clip time i / fps */
  frames: Uint8Array[];
}

const store = new Map<string, TrackData>();
const built = new Map<string, { key: string; canvas: HTMLCanvasElement }>();
const listeners = new Set<() => void>();

export const getTrack = (id: string) => store.get(id) ?? null;

export function setTrack(id: string, data: TrackData | null) {
  if (data) store.set(id, data);
  else store.delete(id);
  built.delete(id);
  listeners.forEach((fn) => fn());
}

export function onTracksChanged(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** The tracked mask at clip time `t`, blending the two nearest frames so motion stays smooth. */
export function trackedFrame(id: string, t: number): { canvas: HTMLCanvasElement; key: string } | null {
  const tr = store.get(id);
  if (!tr || !tr.frames.length) return null;
  const n = tr.frames.length;
  const f = Math.max(0, Math.min(n - 1, t * tr.fps));
  const i0 = Math.floor(f);
  const i1 = Math.min(n - 1, i0 + 1);
  const k = Math.round((f - i0) * 8) / 8;
  const key = `${i0}|${k}`;
  let b = built.get(id);
  if (b && b.key === key) return b;
  if (!b) {
    const canvas = document.createElement('canvas');
    canvas.width = tr.w;
    canvas.height = tr.h;
    b = { key: '', canvas };
    built.set(id, b);
  }
  const ctx = b.canvas.getContext('2d')!;
  const img = ctx.createImageData(tr.w, tr.h);
  const d = img.data;
  const a = tr.frames[i0];
  const c = tr.frames[i1];
  for (let j = 0, p = 0; j < a.length; j++, p += 4) {
    d[p] = d[p + 1] = d[p + 2] = 255;
    d[p + 3] = k === 0 ? a[j] : a[j] + (c[j] - a[j]) * k;
  }
  ctx.putImageData(img, 0, 0);
  b.key = key;
  return b;
}

/** Whether a selection currently follows a video (tracked, data present, and its video is the base). */
export function trackSource(sel: Selection, project: Project) {
  if (!sel.track || !store.has(sel.id) || project.baseImageId !== sel.track.sourceId) return null;
  return project.images.find((i) => i.id === sel.track!.sourceId && i.video) ?? null;
}

/**
 * The mask a selection uses at project time `time`: the tracked frame when it follows a
 * video, otherwise its single painted mask. While the mask is being brushed the live copy wins.
 */
export function selectionMaskAt(sel: Selection, project: Project, time: number): { canvas: HTMLCanvasElement; key: string } | null {
  const live = liveCanvas(sel.id);
  if (live) return { canvas: live, key: `live${Math.random()}` };
  const src = trackSource(sel, project);
  if (src) {
    const f = trackedFrame(sel.id, clipTime(src, time));
    if (f) return { canvas: f.canvas, key: `track:${f.key}` };
  }
  const m = maskFor(sel.id, sel.paint);
  return m ? { canvas: m, key: `paint:${sel.paint.length}:${sel.paint.slice(-24)}` } : null;
}

/** Project-file form: every frame as a small grayscale JPEG. */
export interface SavedTrack {
  fps: number;
  w: number;
  h: number;
  frames: string[];
}

export function encodeTrack(t: TrackData): SavedTrack {
  const c = document.createElement('canvas');
  c.width = t.w;
  c.height = t.h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(t.w, t.h);
  const frames = t.frames.map((a) => {
    for (let j = 0, p = 0; j < a.length; j++, p += 4) {
      img.data[p] = img.data[p + 1] = img.data[p + 2] = a[j];
      img.data[p + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL('image/jpeg', 0.85);
  });
  return { fps: t.fps, w: t.w, h: t.h, frames };
}

export async function decodeTrack(s: SavedTrack): Promise<TrackData> {
  const c = document.createElement('canvas');
  c.width = s.w;
  c.height = s.h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const frames: Uint8Array[] = [];
  for (const url of s.frames) {
    const im = new Image();
    im.src = url;
    await im.decode();
    ctx.clearRect(0, 0, s.w, s.h);
    ctx.drawImage(im, 0, 0, s.w, s.h);
    const d = ctx.getImageData(0, 0, s.w, s.h).data;
    const a = new Uint8Array(s.w * s.h);
    for (let j = 0; j < a.length; j++) a[j] = d[j * 4];
    frames.push(a);
  }
  return { fps: s.fps, w: s.w, h: s.h, frames };
}
