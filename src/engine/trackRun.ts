import { blankMask, ensureUrls, maskFor, maskSize } from './masks';
import { drawCover, getFormat } from './renderer';
import { selectObject, selectPerson } from './select';
import type { TrackData } from './track';
import type { Project, Selection, SourceImage } from './types';

export interface TrackOptions {
  mode: 'object' | 'person';
  /** masks per second of video */
  fps: number;
  /** project time of the frame the current selection was drawn on */
  anchorTime: number;
  onProgress: (done: number, total: number) => void;
  signal: AbortSignal;
}

function alphaOf(c: HTMLCanvasElement): Uint8Array {
  const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data;
  const a = new Uint8Array(c.width * c.height);
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
  return a;
}

function areaOf(a: Uint8Array) {
  let n = 0;
  for (let i = 0; i < a.length; i++) n += a[i];
  return n / 255;
}

/** A point well inside the mask: the centroid if it lands inside, else the masked pixel nearest to it. */
function innerPoint(a: Uint8Array, w: number, h: number): { x: number; y: number } | null {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = 0; y < h; y += 2)
    for (let x = 0; x < w; x += 2)
      if (a[y * w + x] > 160) {
        sx += x;
        sy += y;
        n++;
      }
  if (!n) return null;
  const cx = sx / n;
  const cy = sy / n;
  if (a[Math.round(cy) * w + Math.round(cx)] > 160) return { x: cx / w, y: cy / h };
  let best = Infinity;
  let bx = cx;
  let by = cy;
  for (let y = 0; y < h; y += 2)
    for (let x = 0; x < w; x += 2)
      if (a[y * w + x] > 200) {
        const d = (x - cx) ** 2 + (y - cy) ** 2;
        if (d < best) {
          best = d;
          bx = x;
          by = y;
        }
      }
  return { x: bx / w, y: by / h };
}

/** Grow a mask by `r` pixels (separable max filter): where the object may have moved to by the next frame. */
function dilate(a: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const tmp = new Uint8Array(a.length);
  const out = new Uint8Array(a.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r) && m < 255; k += 2) if (a[row + k] > m) m = a[row + k];
      tmp[row + x] = m;
    }
  }
  for (let x = 0; x < w; x++)
    for (let y = 0; y < h; y++) {
      let m = 0;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r) && m < 255; k += 2) if (tmp[k * w + x] > m) m = tmp[k * w + x];
      out[y * w + x] = m;
    }
  return out;
}

function waitSeek(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(v.currentTime - t) < 1e-4 && v.readyState >= 2) return resolve();
    const done = () => {
      v.removeEventListener('seeked', done);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, 4000);
    v.addEventListener('seeked', done);
    v.currentTime = t;
  });
}

/**
 * Follow a selection through the base video: starting from the frame it was drawn on,
 * segment each sampled frame at a point inside the previous frame's mask (or find people),
 * keep only what lies near where the object was, and fall back to the previous mask
 * when the object is lost for a frame.
 */
export async function trackSelection(project: Project, sel: Selection, opts: TrackOptions): Promise<TrackData> {
  const src = project.images.find((i) => i.id === project.baseImageId);
  if (!src?.video || !src.videoUrl || !src.duration) throw new Error('베이스가 영상일 때만 따라갈 수 있어요');
  const { w, h } = maskSize(getFormat(project.format));

  // a private copy of the video so tracking never disturbs the preview
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.src = src.videoUrl;
  await new Promise<void>((res, rej) => {
    v.onloadeddata = () => res();
    v.onerror = () => rej(new Error('영상을 읽지 못했어요'));
  });
  const frameSrc: SourceImage = { ...src, video: v };
  const frame = blankMask(w, h);
  const fctx = frame.getContext('2d', { willReadFrequently: true })!;

  const total = Math.max(1, Math.ceil(src.duration * opts.fps));
  const frames: Uint8Array[] = new Array(total);
  const clipAnchor = ((opts.anchorTime % src.duration) + src.duration) % src.duration;
  const anchor = Math.min(total - 1, Math.round(clipAnchor * opts.fps));

  await ensureUrls([sel.paint]);
  const start = blankMask(w, h);
  const startMask = maskFor(sel.id, sel.paint);
  if (startMask) start.getContext('2d')!.drawImage(startMask, 0, 0, w, h);
  frames[anchor] = alphaOf(start);
  if (areaOf(frames[anchor]) < 20) throw new Error('선택이 비어 있어요. 먼저 물체를 선택하세요');

  const reach = Math.round(w * 0.07);
  let done = 1;
  opts.onProgress(done, total);

  const step = async (i: number, prev: Uint8Array) => {
    if (opts.signal.aborted) throw new DOMException('canceled', 'AbortError');
    await waitSeek(v, Math.min(src.duration! - 0.001, i / opts.fps));
    fctx.clearRect(0, 0, w, h);
    drawCover(fctx, frameSrc, w, h, project.crop);
    let seg: HTMLCanvasElement | null = null;
    try {
      if (opts.mode === 'person') seg = await selectPerson(frame);
      else {
        const pt = innerPoint(prev, w, h);
        if (pt) seg = await selectObject(frame, pt.x, pt.y);
      }
    } catch {
      seg = null;
    }
    let next = prev;
    if (seg) {
      const raw = alphaOf(seg);
      const gate = dilate(prev, w, h, reach);
      const cut = new Uint8Array(raw.length);
      for (let j = 0; j < raw.length; j++) cut[j] = gate[j] > 20 ? raw[j] : 0;
      const a0 = areaOf(prev);
      const a1 = areaOf(cut);
      // a sudden collapse or explosion means the object was lost for this frame
      if (a1 > a0 * 0.3 && a1 < a0 * 3) next = cut;
    }
    frames[i] = next;
    opts.onProgress(++done, total);
    return next;
  };

  let prev = frames[anchor];
  for (let i = anchor + 1; i < total; i++) prev = await step(i, prev);
  prev = frames[anchor];
  for (let i = anchor - 1; i >= 0; i--) prev = await step(i, prev);

  v.removeAttribute('src');
  v.load();
  return { fps: opts.fps, w, h, frames };
}
