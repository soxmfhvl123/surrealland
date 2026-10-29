import { blankMask } from './masks';
import { objectProber } from './select';

/**
 * Auto split ("자동 누끼"): cut the whole photo into objects at once.
 *
 * A grid of points is probed with the magic touch model, the way SAM's automatic mask
 * generator does it. Masks that are the same region seen from another point are merged, then
 * the survivors are turned into a partition: every pixel goes to the smallest object that
 * claims it, so a person standing on a cliff is carved out of the cliff instead of being
 * counted twice. What nothing claims (often the sky, where the model is unsure) becomes a
 * piece of its own when it's big, or joins its neighbour when it's a sliver.
 */

export type SplitDetail = 'low' | 'mid' | 'high';

const LEVELS: Record<SplitDetail, { cols: number; minArea: number; max: number }> = {
  low: { cols: 6, minArea: 0.015, max: 8 },
  mid: { cols: 10, minArea: 0.006, max: 16 },
  high: { cols: 15, minArea: 0.0025, max: 30 },
};

export interface SplitPiece {
  /** white, with the piece in alpha (mask resolution) */
  mask: HTMLCanvasElement;
  name: string;
  /** fraction of the frame */
  area: number;
}

interface Cand {
  /** soft membership 0..255 at full mask resolution */
  alpha: Uint8Array;
  /** hard membership on a 1/LO grid, for cheap overlap tests */
  lo: Uint8Array;
  loArea: number;
  area: number;
}

const LO = 4;
const ramp = (v: number, a: number, b: number) => Math.max(0, Math.min(1, (v - a) / (b - a)));

export async function autoSplit(base: HTMLCanvasElement, detail: SplitDetail, onProgress?: (done: number, total: number) => void): Promise<SplitPiece[]> {
  const { cols, minArea, max } = LEVELS[detail];
  const W = base.width;
  const H = base.height;
  const N = W * H;
  const rows = Math.max(2, Math.round((cols * H) / W));
  const lw = Math.ceil(W / LO);
  const lh = Math.ceil(H / LO);
  const probe = await objectProber();
  const cands: Cand[] = [];

  const consider = (conf: Float32Array) => {
    let area = 0;
    let loose = 0;
    let tight = 0;
    for (let i = 0; i < N; i++) {
      const v = conf[i];
      if (v > 0.5) area++;
      if (v > 0.35) loose++;
      if (v > 0.65) tight++;
    }
    const frac = area / N;
    // specks, the whole frame, or a mushy mask whose edge moves with the threshold (SAM's
    // stability score: real objects sit around 0.95, sky and haze around 0.65)
    if (frac < minArea * 0.6 || frac > 0.9 || tight < loose * 0.8) return;
    const lo = new Uint8Array(lw * lh);
    let loArea = 0;
    for (let y = 0; y < lh; y++) {
      for (let x = 0; x < lw; x++) {
        if (conf[Math.min(H - 1, y * LO + 2) * W + Math.min(W - 1, x * LO + 2)] > 0.5) {
          lo[y * lw + x] = 1;
          loArea++;
        }
      }
    }
    if (!loArea) return;
    const make = (): Cand => {
      const alpha = new Uint8Array(N);
      for (let i = 0; i < N; i++) alpha[i] = Math.round(ramp(conf[i], 0.35, 0.65) * 255);
      return { alpha, lo, loArea, area: frac };
    };
    // the same region seen from another point (or most of it): keep the fuller mask
    for (let j = 0; j < cands.length; j++) {
      const c = cands[j];
      let inter = 0;
      for (let i = 0; i < lo.length; i++) inter += lo[i] & c.lo[i];
      const small = Math.min(loArea, c.loArea);
      const big = Math.max(loArea, c.loArea);
      if (inter / (loArea + c.loArea - inter) > 0.8 || (inter / small > 0.85 && small / big > 0.5)) {
        if (loArea > c.loArea) cands[j] = make();
        return;
      }
    }
    cands.push(make());
  };

  const total = cols * rows;
  for (let k = 0; k < total; k++) {
    const x = ((k % cols) + 0.5) / cols;
    const y = (Math.floor(k / cols) + 0.5) / rows;
    // inside an object already found (not a big region like sky or ground): nothing new here
    const li = Math.min(lh - 1, Math.floor((y * H) / LO)) * lw + Math.min(lw - 1, Math.floor((x * W) / LO));
    if (!cands.some((c) => c.lo[li] && c.area < 0.2)) {
      const conf = probe(base, x, y);
      if (conf) consider(conf);
    }
    if (k % 4 === 3 || k === total - 1) {
      onProgress?.(k + 1, total);
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // partition, smallest first; drop pieces left too small (or past the cap) and redo
  let list = cands;
  let parts: { cand: Cand; alpha: Uint8Array; area: number }[] = [];
  let rest = new Uint8Array(N);
  for (let pass = 0; pass < 4; pass++) {
    const order = [...list].sort((a, b) => a.area - b.area);
    const out = order.map(() => new Uint8Array(N));
    const sums = order.map(() => 0);
    rest = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      let r = 255;
      for (let k = 0; k < order.length && r; k++) {
        const a = Math.min(order[k].alpha[i], r);
        if (a) {
          out[k][i] = a;
          sums[k] += a;
          r -= a;
        }
      }
      rest[i] = r;
    }
    parts = order.map((cand, k) => ({ cand, alpha: out[k], area: sums[k] / 255 / N }));
    const keep = parts
      .filter((pt) => pt.area >= minArea)
      .sort((a, b) => b.area - a.area)
      .slice(0, max);
    if (keep.length === parts.length) break;
    list = keep.map((pt) => pt.cand);
  }

  // stray islands a piece only got because of overlap go to the rest, then the rest is shared out
  const alphas = parts.map((pt) => pt.alpha);
  for (const a of alphas) dropIslands(a, rest, W, H, Math.max(40, minArea * 0.25 * N));
  fillRest(alphas, rest, W, H, minArea * N);
  const pieces = alphas
    .map((alpha) => ({ alpha, area: sum(alpha) / 255 / N, name: '' }))
    .filter((pc) => pc.area >= minArea * 0.5)
    .sort((a, b) => b.area - a.area);

  const sky = pieces.find((pc) => looksLikeSky(base, pc.alpha, W, H));
  let n = 0;
  for (const pc of pieces) pc.name = pc === sky ? '하늘' : `누끼 ${++n}`;
  return pieces.map((pc) => ({ mask: toMask(pc.alpha, W, H), name: pc.name, area: pc.area }));
}

function sum(a: Uint8Array) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return s;
}

/** 4-connected components of the pixels where `on` holds. */
function components(on: (i: number) => boolean, w: number, h: number) {
  const label = new Int32Array(w * h).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (label[s] >= 0 || !on(s)) continue;
    const id = sizes.length;
    let size = 0;
    label[s] = id;
    stack.push(s);
    while (stack.length) {
      const i = stack.pop()!;
      size++;
      const x = i % w;
      if (x > 0 && label[i - 1] < 0 && on(i - 1)) (label[i - 1] = id), stack.push(i - 1);
      if (x < w - 1 && label[i + 1] < 0 && on(i + 1)) (label[i + 1] = id), stack.push(i + 1);
      if (i >= w && label[i - w] < 0 && on(i - w)) (label[i - w] = id), stack.push(i - w);
      if (i + w < w * h && label[i + w] < 0 && on(i + w)) (label[i + w] = id), stack.push(i + w);
    }
    sizes.push(size);
  }
  return { label, sizes };
}

/** Remove connected islands (alpha > 127) smaller than `minPx`, plus the soft edge around them. */
function dropIslands(alpha: Uint8Array, rest: Uint8Array, w: number, h: number, minPx: number) {
  const { label, sizes } = components((i) => alpha[i] > 127, w, h);
  const kept = (i: number) => label[i] >= 0 && sizes[label[i]] >= minPx;
  for (let i = 0; i < w * h; i++) {
    if (!alpha[i] || kept(i)) continue;
    // a soft edge pixel stays if a kept pixel is within 2px
    let near = false;
    if (alpha[i] <= 127) {
      const x = i % w;
      const y = (i - x) / w;
      for (let dy = -2; dy <= 2 && !near; dy++) {
        for (let dx = -2; dx <= 2 && !near; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h && kept(yy * w + xx)) near = true;
        }
      }
    }
    if (near) continue;
    rest[i] = Math.min(255, rest[i] + alpha[i]);
    alpha[i] = 0;
  }
}

/**
 * Share out what no piece claimed: a patch of at least `minPx` becomes a new piece, a smaller
 * one joins the piece it borders most, and soft leftovers go to the strongest piece there.
 */
function fillRest(alphas: Uint8Array[], rest: Uint8Array, w: number, h: number, minPx: number) {
  const N = w * h;
  const owner = new Int16Array(N).fill(-1);
  for (let i = 0; i < N; i++) {
    let best = 0;
    for (let k = 0; k < alphas.length; k++) {
      if (alphas[k][i] > best) {
        best = alphas[k][i];
        owner[i] = k;
      }
    }
  }
  const { label, sizes } = components((i) => rest[i] > 127, w, h);
  const votes = sizes.map(() => new Map<number, number>());
  for (let i = 0; i < N; i++) {
    const c = label[i];
    if (c < 0) continue;
    const x = i % w;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
      if (j >= 0 && j < N && label[j] !== c && owner[j] >= 0) votes[c].set(owner[j], (votes[c].get(owner[j]) ?? 0) + 1);
    }
  }
  const target = sizes.map((size, c) => {
    const best = [...votes[c]].sort((a, b) => b[1] - a[1])[0];
    if (size < minPx && best) return best[0];
    if (size < minPx * 0.25) return -1;
    alphas.push(new Uint8Array(N));
    return alphas.length - 1;
  });
  for (let i = 0; i < N; i++) {
    if (!rest[i]) continue;
    const k = label[i] >= 0 ? target[label[i]] : owner[i];
    if (k >= 0) alphas[k][i] = Math.min(255, alphas[k][i] + rest[i]);
  }
}

/** Spans the top edge, sits high, is smooth, and is blue or grey (overcast counts). */
function looksLikeSky(base: HTMLCanvasElement, alpha: Uint8Array, w: number, h: number) {
  let top = 0;
  for (let x = 0; x < w; x++) if (alpha[w + x] > 127) top++;
  if (top < w * 0.4) return false;
  const d = base.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  const luma = (i: number) => (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) / 255;
  let n = 0;
  let sy = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  let rough = 0;
  for (let i = 0; i < w * (h - 1); i += 3) {
    if (alpha[i] <= 127 || alpha[i + 1] <= 127 || alpha[i + w] <= 127) continue;
    n++;
    sy += Math.floor(i / w);
    r += d[i * 4];
    g += d[i * 4 + 1];
    b += d[i * 4 + 2];
    rough += Math.abs(luma(i) - luma(i + 1)) + Math.abs(luma(i) - luma(i + w));
  }
  // leaves and crowds are busy; sky is a smooth gradient
  if (!n || sy / n / h > 0.35 || rough / n > 0.06) return false;
  [r, g, b] = [r / n / 255, g / n / 255, b / n / 255];
  const l = r * 0.299 + g * 0.587 + b * 0.114;
  const mx = Math.max(r, g, b);
  const sat = mx ? (mx - Math.min(r, g, b)) / mx : 0;
  return l > 0.35 && ((b > r * 1.1 && b >= g) || sat < 0.2);
}

function toMask(alpha: Uint8Array, w: number, h: number): HTMLCanvasElement {
  const c = blankMask(w, h);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255;
    img.data[i * 4 + 3] = alpha[i];
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
