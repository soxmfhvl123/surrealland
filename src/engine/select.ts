import { hexToRgb } from './effects/util';
import { blankMask, maskSize } from './masks';
import { drawCover, getFormat } from './renderer';
import type { Project } from './types';

/**
 * Auto selections for layer masks. Each takes the base photo rendered at mask
 * resolution and returns a white canvas whose alpha is the selection.
 */

/** The cropped base photo at mask resolution (what selections are computed from), or `width` wide. */
export function baseFrame(project: Project, width?: number): HTMLCanvasElement | null {
  const src = project.images.find((i) => i.id === project.baseImageId);
  if (!src) return null;
  const size = maskSize(getFormat(project.format));
  const w = width ?? size.w;
  const h = Math.round((w * size.h) / size.w);
  const c = blankMask(w, h);
  drawCover(c.getContext('2d', { willReadFrequently: true })!, src, w, h, project.crop);
  return c;
}

function pixels(src: HTMLCanvasElement) {
  return src.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, src.width, src.height).data;
}

function alphaCanvas(w: number, h: number, alpha: (i: number) => number): HTMLCanvasElement {
  const c = blankMask(w, h);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let i = 0; i < w * h; i++) {
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 255;
    d[i * 4 + 3] = Math.max(0, Math.min(255, alpha(i) * 255));
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Soften a selection's edge by blurring its alpha (down/up-sampling). */
export function soften(mask: HTMLCanvasElement, amount: number): HTMLCanvasElement {
  if (amount <= 0) return mask;
  const k = Math.max(2, Math.round(2 + amount * 14));
  const small = blankMask(Math.max(1, Math.round(mask.width / k)), Math.max(1, Math.round(mask.height / k)));
  const sctx = small.getContext('2d')!;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(mask, 0, 0, small.width, small.height);
  const out = blankMask(mask.width, mask.height);
  const octx = out.getContext('2d')!;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(small, 0, 0, out.width, out.height);
  // keep the solid interior solid
  octx.globalCompositeOperation = 'source-over';
  octx.globalAlpha = 1 - Math.min(0.85, amount);
  octx.drawImage(mask, 0, 0);
  return out;
}

const ramp = (v: number, a: number, b: number) => Math.max(0, Math.min(1, (v - a) / Math.max(1e-3, b - a)));

/** Pixels whose brightness lies in [lo, hi] (0..1), with a soft edge. */
export function selectLuma(base: HTMLCanvasElement, lo: number, hi: number, soft = 0.06): HTMLCanvasElement {
  const d = pixels(base);
  return alphaCanvas(base.width, base.height, (i) => {
    const l = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) / 255;
    return Math.min(ramp(l, lo - soft, lo + soft), 1 - ramp(l, hi - soft, hi + soft));
  });
}

/** Pixels close to a color; tolerance 0..1. */
export function selectColor(base: HTMLCanvasElement, hex: string, tolerance: number): HTMLCanvasElement {
  const d = pixels(base);
  const [r, g, b] = hexToRgb(hex);
  const t = 30 + tolerance * 160;
  return alphaCanvas(base.width, base.height, (i) => {
    const dr = d[i * 4] - r;
    const dg = d[i * 4 + 1] - g;
    const db = d[i * 4 + 2] - b;
    const dist = Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11) * 1.7;
    return 1 - ramp(dist, t * 0.6, t);
  });
}

/** Color of the base photo at a normalized point. */
export function sampleColor(base: HTMLCanvasElement, x: number, y: number): string {
  const px = Math.min(base.width - 1, Math.max(0, Math.round(x * base.width)));
  const py = Math.min(base.height - 1, Math.max(0, Math.round(y * base.height)));
  const [r, g, b] = base.getContext('2d', { willReadFrequently: true })!.getImageData(px, py, 1, 1).data;
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Sky: scan each column from the top while pixels still look like sky (bright or
 * blue-ish) and stay close to the colour seen so far in that column, so water
 * meeting the horizon is not swallowed. The per-column skyline is then
 * median-smoothed so a single odd column cannot leak.
 */
export function selectSky(base: HTMLCanvasElement): HTMLCanvasElement {
  const w = base.width;
  const h = base.height;
  const d = pixels(base);
  const isSky = (i: number) => {
    const r = d[i * 4] / 255;
    const g = d[i * 4 + 1] / 255;
    const b = d[i * 4 + 2] / 255;
    const l = r * 0.299 + g * 0.587 + b * 0.114;
    const mx = Math.max(r, g, b);
    const sat = mx ? (mx - Math.min(r, g, b)) / mx : 0;
    return (b > r * 1.05 && b >= g * 0.92 && l > 0.3) || (l > 0.6 && sat < 0.3);
  };
  const line = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    let mr = -1;
    let mg = 0;
    let mb = 0;
    let pr = 0;
    let pg = 0;
    let pb = 0;
    let n = 0;
    let miss = 0;
    let y = 0;
    for (; y < h; y++) {
      const i = y * w + x;
      const r = d[i * 4];
      const g = d[i * 4 + 1];
      const b = d[i * 4 + 2];
      // a hard edge from the pixel above (skyline), or drifting far from this column's sky colour
      const edge = mr >= 0 && Math.abs(r - pr) + Math.abs(g - pg) + Math.abs(b - pb) > 70;
      const far = mr >= 0 && Math.abs(r - mr) + Math.abs(g - mg) + Math.abs(b - mb) > 190;
      if (!isSky(i) || edge || far) {
        if (++miss > 2) break;
        continue;
      }
      miss = 0;
      [pr, pg, pb] = [r, g, b];
      n = Math.min(n + 1, 10);
      if (mr < 0) [mr, mg, mb] = [r, g, b];
      else {
        mr += (r - mr) / n;
        mg += (g - mg) / n;
        mb += (b - mb) / n;
      }
    }
    line[x] = Math.max(0, y - miss);
  }
  const win = Math.max(3, Math.round(w / 24));
  const smooth = new Float32Array(w);
  const buf: number[] = [];
  for (let x = 0; x < w; x++) {
    buf.length = 0;
    for (let k = -win; k <= win; k++) buf.push(line[Math.min(w - 1, Math.max(0, x + k))]);
    buf.sort((a, b) => a - b);
    smooth[x] = buf[buf.length >> 1];
  }
  return soften(alphaCanvas(w, h, (i) => (Math.floor(i / w) < smooth[i % w] ? 1 : 0)), 0.2);
}

// ---------- MediaPipe (loaded on first use) ----------

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm';
const MODELS = {
  person: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite',
  object: 'https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite',
};

type Vision = typeof import('@mediapipe/tasks-vision');
let visionMod: Promise<{ mp: Vision; files: Awaited<ReturnType<Vision['FilesetResolver']['forVisionTasks']>> }> | null = null;
let personSeg: Promise<import('@mediapipe/tasks-vision').ImageSegmenter> | null = null;
let objectSeg: Promise<import('@mediapipe/tasks-vision').InteractiveSegmenterLegacy> | null = null;

function vision() {
  if (!visionMod) {
    visionMod = import('@mediapipe/tasks-vision').then(async (mp) => ({ mp, files: await mp.FilesetResolver.forVisionTasks(WASM) }));
    visionMod.catch(() => (visionMod = null));
  }
  return visionMod;
}

/** People (hair, skin, clothes) via the selfie multiclass model. */
export async function selectPerson(base: HTMLCanvasElement): Promise<HTMLCanvasElement> {
  if (!personSeg) {
    personSeg = vision().then(({ mp, files }) =>
      mp.ImageSegmenter.createFromOptions(files, {
        baseOptions: { modelAssetPath: MODELS.person },
        runningMode: 'IMAGE',
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      }),
    );
    personSeg.catch(() => (personSeg = null));
  }
  const seg = await personSeg;
  let cats: Uint8Array | null = null;
  let mw = 0;
  let mh = 0;
  seg.segment(base, (res) => {
    if (!res.categoryMask) return;
    mw = res.categoryMask.width;
    mh = res.categoryMask.height;
    cats = res.categoryMask.getAsUint8Array().slice();
  });
  if (!cats) throw new Error('사람을 찾지 못했어요');
  const c: Uint8Array = cats;
  const raw = alphaCanvas(mw, mh, (i) => (c[i] > 0 ? 1 : 0));
  const out = blankMask(base.width, base.height);
  out.getContext('2d')!.drawImage(raw, 0, 0, out.width, out.height);
  return soften(out, 0.12);
}

/** The object under a clicked point (normalized x, y) via MediaPipe magic touch. */
export async function selectObject(base: HTMLCanvasElement, x: number, y: number): Promise<HTMLCanvasElement> {
  if (!objectSeg) {
    objectSeg = vision().then(({ mp, files }) =>
      mp.InteractiveSegmenterLegacy.createFromOptions(files, {
        baseOptions: { modelAssetPath: MODELS.object },
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      }),
    );
    objectSeg.catch(() => (objectSeg = null));
  }
  const seg = await objectSeg;
  const res = seg.segment(base, { keypoint: { x, y } });
  const masks = res.confidenceMasks ?? [];
  if (!masks.length) throw new Error('물체를 찾지 못했어요');
  const m = masks[masks.length - 1];
  const conf = m.getAsFloat32Array().slice();
  const mw = m.width;
  const mh = m.height;
  masks.forEach((mm) => mm.close());
  // whichever polarity the model uses, the clicked point must be inside the selection
  const at = conf[Math.min(mh - 1, Math.floor(y * mh)) * mw + Math.min(mw - 1, Math.floor(x * mw))];
  const flip = at < 0.5;
  const raw = alphaCanvas(mw, mh, (i) => {
    const v = flip ? 1 - conf[i] : conf[i];
    return ramp(v, 0.35, 0.65);
  });
  const out = blankMask(base.width, base.height);
  out.getContext('2d')!.drawImage(raw, 0, 0, out.width, out.height);
  return soften(out, 0.08);
}
