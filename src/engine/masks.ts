import type { FormatDef, Layer, Selection } from './types';

/**
 * Painted / auto-selected layer masks.
 *
 * A mask is a grayscale image (white = effect on) at a small fixed resolution in frame
 * space. It is persisted on the layer as a JPEG data URL (compact enough for
 * localStorage) and decoded once into a white-with-alpha canvas for compositing.
 * While a brush stroke is in progress the layer's "live" canvas is used instead.
 */
export const MASK_WIDTH = 540;

export const maskSize = (fmt: FormatDef) => ({ w: MASK_WIDTH, h: Math.round((MASK_WIDTH * fmt.height) / fmt.width) });

export type MaskOp = 'replace' | 'add' | 'subtract' | 'intersect';

const decoded = new Map<string, HTMLCanvasElement>();
const pending = new Set<string>();
const live = new Map<string, HTMLCanvasElement>();
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((fn) => fn());

export function onMasksChanged(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function blankMask(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Grayscale JPEG pixels → white canvas whose alpha is the gray level. */
function toAlphaCanvas(img: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const c = blankMask(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    p[i + 3] = p[i];
    p[i] = p[i + 1] = p[i + 2] = 255;
  }
  ctx.putImageData(d, 0, 0);
  return c;
}

function decode(url: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(toAlphaCanvas(img, img.naturalWidth, img.naturalHeight));
    img.onerror = () => reject(new Error('mask decode failed'));
    img.src = url;
  });
}

/**
 * Mask canvas for an owner (a layer or a saved selection): the live editing copy if a
 * stroke is in progress, otherwise the decoded data URL, or null while it decodes.
 */
export function maskFor(ownerId: string, url: string | undefined): HTMLCanvasElement | null {
  const l = live.get(ownerId);
  if (l) return l;
  if (!url) return null;
  const hit = decoded.get(url);
  if (hit) return hit;
  if (!pending.has(url)) {
    pending.add(url);
    decode(url)
      .then((c) => decoded.set(url, c))
      .catch(() => decoded.set(url, blankMask(MASK_WIDTH, MASK_WIDTH)))
      .finally(() => {
        pending.delete(url);
        notify();
      });
  }
  return null;
}

/** Canvas for a layer's own painted mask. */
export const maskCanvas = (layer: Layer) => maskFor(layer.id, layer.mask?.paint);

/** Wait until these mask data URLs are decoded (export needs complete frames). */
export async function ensureUrls(urls: (string | undefined)[]) {
  const todo = urls.filter((u): u is string => !!u && !decoded.has(u));
  await Promise.all(
    todo.map((u) =>
      decode(u)
        .then((c) => decoded.set(u, c))
        .catch(() => decoded.set(u, blankMask(MASK_WIDTH, MASK_WIDTH))),
    ),
  );
}

export const ensureMasks = (layers: Layer[], selections: Selection[] = []) =>
  ensureUrls([...layers.map((l) => l.mask?.paint), ...selections.map((s) => s.paint)]);

/** Start editing: a private copy of the owner's mask that renders immediately. */
export function beginLive(ownerId: string, url: string | undefined, w: number, h: number): HTMLCanvasElement {
  const c = blankMask(w, h);
  const cur = maskFor(ownerId, url);
  if (cur) c.getContext('2d')!.drawImage(cur, 0, 0, w, h);
  live.set(ownerId, c);
  return c;
}

export const liveCanvas = (id: string) => live.get(id) ?? null;

/** Finish editing: encode to a data URL (stored on the owner) and keep the decoded copy cached. */
export function commitLive(id: string): string | null {
  const c = live.get(id);
  if (!c) return null;
  live.delete(id);
  return encode(c);
}

export function cancelLive(id: string) {
  live.delete(id);
  notify();
}

/** Encode a white-alpha mask canvas as a grayscale JPEG data URL and cache it. */
export function encode(mask: HTMLCanvasElement): string {
  const g = blankMask(mask.width, mask.height);
  const ctx = g.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, g.width, g.height);
  ctx.drawImage(mask, 0, 0);
  const url = g.toDataURL('image/jpeg', 0.88);
  const copy = blankMask(mask.width, mask.height);
  copy.getContext('2d')!.drawImage(mask, 0, 0);
  decoded.set(url, copy);
  return url;
}

/** Combine a new selection into an existing mask. */
export function combine(existing: HTMLCanvasElement | null, sel: HTMLCanvasElement, op: MaskOp): HTMLCanvasElement {
  const out = blankMask(sel.width, sel.height);
  const ctx = out.getContext('2d')!;
  if (op !== 'replace' && existing) ctx.drawImage(existing, 0, 0, out.width, out.height);
  ctx.globalCompositeOperation =
    op === 'subtract' ? 'destination-out' : op === 'intersect' ? 'destination-in' : 'source-over';
  if (op === 'intersect' && !existing) return out;
  ctx.drawImage(sel, 0, 0);
  return out;
}

/** Soft round brush stamp along a segment. */
export function strokeSegment(
  mask: HTMLCanvasElement,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
  softness: number,
  erase: boolean,
) {
  const ctx = mask.getContext('2d')!;
  ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const step = Math.max(1, radius * 0.25);
  const n = Math.max(1, Math.ceil(dist / step));
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    const y = y0 + ((y1 - y0) * i) / n;
    const g = ctx.createRadialGradient(x, y, radius * (1 - softness) * 0.98, x, y, radius);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  notify();
}

export function fillMask(mask: HTMLCanvasElement, on: boolean) {
  const ctx = mask.getContext('2d')!;
  ctx.clearRect(0, 0, mask.width, mask.height);
  if (on) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, mask.width, mask.height);
  }
}

export function invertMask(mask: HTMLCanvasElement): HTMLCanvasElement {
  const out = blankMask(mask.width, mask.height);
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.drawImage(mask, 0, 0);
  return out;
}

/** Grow (amount > 0) or shrink (amount < 0) a selection by blurring and re-thresholding. */
export function growShrink(mask: HTMLCanvasElement, amount: number): HTMLCanvasElement {
  const w = mask.width;
  const h = mask.height;
  const k = 4 + Math.round(Math.abs(amount) * 10);
  const small = blankMask(Math.max(1, Math.round(w / k)), Math.max(1, Math.round(h / k)));
  const sctx = small.getContext('2d')!;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(mask, 0, 0, small.width, small.height);
  const out = blankMask(w, h);
  const ctx = out.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(small, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) {
    const a = d[i] / 255;
    // growing keeps anything partly covered, shrinking keeps only the solid core
    const v = amount > 0 ? Math.min(1, a * 2.2) : Math.max(0, a * 2.2 - 1.2);
    d[i] = v * 255;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

export const SELECTION_COLORS = ['#ff4d6d', '#3dd6ff', '#ffd23f', '#7cff6b', '#c77dff', '#ff9f43', '#4d7cff', '#ff6bd6'];

/** Fraction of the frame a mask covers (rough, from a tiny downsample). */
export function coverage(mask: HTMLCanvasElement): number {
  const c = blankMask(48, Math.max(1, Math.round((48 * mask.height) / mask.width)));
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(mask, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let sum = 0;
  for (let i = 3; i < d.length; i += 4) sum += d[i];
  return sum / (255 * c.width * c.height);
}

/** Snap a selection to a coarse block grid so its outline becomes a staircase (the blocky-edged composites in the feed). */
export function stepEdges(mask: HTMLCanvasElement, blocks = 36): HTMLCanvasElement {
  const bw = Math.max(4, blocks);
  const bh = Math.max(4, Math.round((blocks * mask.height) / mask.width));
  const small = blankMask(bw, bh);
  const sctx = small.getContext('2d', { willReadFrequently: true })!;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(mask, 0, 0, bw, bh);
  const img = sctx.getImageData(0, 0, bw, bh);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i] > 110 ? 255 : 0;
  sctx.putImageData(img, 0, 0);
  const out = blankMask(mask.width, mask.height);
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, mask.width, mask.height);
  return out;
}
