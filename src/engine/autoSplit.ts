import { blankMask } from './masks';
import { SAM_MASK, samSession, loadSam } from './sam';

/**
 * Auto split ("자동 누끼"): cut the whole photo into objects at once.
 *
 * SAM 2.1 looks at the photo once, then a grid of points is prompted the way SAM's automatic
 * mask generator does it; each point gives three masks (part / object / whole) with the
 * model's own quality score. Low-scoring or unstable masks are dropped and the same region found
 * from another point is merged. Big surfaces (a wall, a road) often score low, so the regions
 * nothing has claimed yet are prompted again from their middle. Every kept mask is snapped to
 * the photo's edges with a guided filter. The survivors become a partition: every pixel goes to the smallest object
 * that claims it, so a sign on a building is carved out of the building instead of being
 * counted twice. What nothing claims becomes a piece of its own when it's big, or joins its
 * neighbour when it's a sliver.
 */

export type SplitDetail = 'low' | 'mid' | 'high';

interface Level {
  cols: number;
  minArea: number;
  max: number;
  /** which of the three masks per point: the largest good one, the best scored, or all good ones */
  pick: 'big' | 'best' | 'all';
  /** don't prompt inside an object smaller than this that was already found */
  skipBelow: number;
}

const LEVELS: Record<SplitDetail, Level> = {
  low: { cols: 8, minArea: 0.01, max: 10, pick: 'big', skipBelow: 0.25 },
  mid: { cols: 12, minArea: 0.004, max: 24, pick: 'best', skipBelow: 0.12 },
  high: { cols: 17, minArea: 0.0015, max: 48, pick: 'all', skipBelow: 0.02 },
};

export type SplitStage = 'model' | 'look' | 'split';

export interface SplitPiece {
  /** white, with the piece in alpha (mask resolution) */
  mask: HTMLCanvasElement;
  name: string;
  /** fraction of the frame */
  area: number;
}

interface Cand {
  /** the model's 256² logits for this mask */
  logits: Float32Array;
  /** soft membership 0..255 at full mask resolution (plain upsample, then edge-snapped at the end) */
  alpha?: Uint8Array;
  /** hard membership on the model's 64×64 grid, for cheap overlap tests */
  lo: Uint8Array;
  loArea: number;
  area: number;
  score: number;
}

const LO = 64;
const ramp = (v: number, a: number, b: number) => Math.max(0, Math.min(1, (v - a) / (b - a)));

/**
 * `base` is the frame at mask resolution (the pieces come out at that size); `look` is the same
 * frame larger, for the model to see detail (it works at 1024px).
 */
export async function autoSplit(
  base: HTMLCanvasElement,
  look: HTMLCanvasElement,
  detail: SplitDetail,
  onProgress?: (stage: SplitStage, frac: number) => void,
): Promise<SplitPiece[]> {
  const { cols, minArea, max, pick, skipBelow } = LEVELS[detail];
  const W = base.width;
  const H = base.height;
  const N = W * H;
  const rows = Math.max(2, Math.round((cols * H) / W));
  await loadSam((f) => onProgress?.('model', f));
  onProgress?.('look', 0);
  const sam = await samSession(look);
  const guide = edgeGuide(base);
  const cands: Cand[] = [];
  const M = SAM_MASK;

  const consider = (logits: Float32Array, off: number, score: number) => {
    const lo = new Uint8Array(LO * LO);
    let loArea = 0;
    const step = M / LO;
    for (let y = 0; y < LO; y++) {
      for (let x = 0; x < LO; x++) {
        if (logits[off + (y * step + 2) * M + x * step + 2] > 0) {
          lo[y * LO + x] = 1;
          loArea++;
        }
      }
    }
    const area = loArea / (LO * LO);
    // the same region seen from another point (or nearly all of it): keep the better scored
    for (let j = 0; j < cands.length; j++) {
      const c = cands[j];
      let inter = 0;
      for (let i = 0; i < lo.length; i++) inter += lo[i] & c.lo[i];
      const small = Math.min(loArea, c.loArea);
      const big = Math.max(loArea, c.loArea);
      const same = inter / (loArea + c.loArea - inter) > (pick === 'all' ? 0.85 : 0.75) || (pick !== 'all' && inter / small > 0.9 && small / big > 0.6);
      if (same) {
        if (score > c.score) cands[j] = { logits: logits.slice(off, off + M * M), lo, loArea, area, score };
        return;
      }
    }
    cands.push({ logits: logits.slice(off, off + M * M), lo, loArea, area, score });
  };

  // logits (256², squashed over the frame) → soft alpha at W×H, optionally snapped to the photo's edges
  const toAlpha = (logits: Float32Array, snap: boolean) => {
    const p = new Float32Array(N);
    for (let y = 0; y < H; y++) {
      const v = Math.min(M - 1.001, Math.max(0, ((y + 0.5) / H) * M - 0.5));
      const y0 = Math.floor(v);
      const fy = v - y0;
      for (let x = 0; x < W; x++) {
        const u = Math.min(M - 1.001, Math.max(0, ((x + 0.5) / W) * M - 0.5));
        const x0 = Math.floor(u);
        const fx = u - x0;
        const i = y0 * M + x0;
        const l = (logits[i] * (1 - fx) + logits[i + 1] * fx) * (1 - fy) + (logits[i + M] * (1 - fx) + logits[i + M + 1] * fx) * fy;
        p[y * W + x] = ramp(l, -2, 2);
      }
    }
    const q = snap ? guide(p) : p;
    const alpha = new Uint8Array(N);
    for (let i = 0; i < N; i++) alpha[i] = Math.round(ramp(q[i], 0.1, 0.9) * 255);
    return alpha;
  };

  const total = cols * rows;
  try {
    for (let k = 0; k < total; k++) {
      const x = ((k % cols) + 0.5) / cols;
      const y = (Math.floor(k / cols) + 0.5) / rows;
      // inside a small object already found: nothing new to find here
      const li = Math.min(LO - 1, Math.floor(y * LO)) * LO + Math.min(LO - 1, Math.floor(x * LO));
      if (!cands.some((c) => c.lo[li] && c.area < skipBelow)) {
        const out = await sam.decode(x, y);
        if (out.objectness > 0) {
          const good: { m: number; area: number; score: number }[] = [];
          for (let m = 0; m < 3; m++) {
            const off = m * M * M;
            let pos = 0;
            let loose = 0;
            let tight = 0;
            for (let i = off; i < off + M * M; i++) {
              const v = out.logits[i];
              if (v > 0) pos++;
              if (v > -1) loose++;
              if (v > 1) tight++;
            }
            const area = pos / (M * M);
            // SAM's filters: its own IoU guess, and a stable edge (the mask barely moves with the threshold)
            const stable = loose ? tight / loose : 0;
            if (out.iou[m] < 0.65 || stable < 0.8 || area < minArea * 0.6 || area > 0.95) continue;
            good.push({ m, area, score: out.iou[m] * stable });
          }
          const chosen =
            pick === 'all' ? good : pick === 'big' ? good.sort((a, b) => b.area - a.area).slice(0, 1) : good.sort((a, b) => b.score - a.score).slice(0, 1);
          for (const g of chosen) consider(out.logits, g.m * M * M, g.score);
        }
      }
      if (k % 4 === 3 || k === total - 1) {
        onProgress?.('split', ((k + 1) / total) * 0.85);
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    // fill the gaps: prompt the deepest point of the biggest region nothing has claimed yet and
    // take the mask that covers most of it while staying mostly inside it
    const tried = new Uint8Array(LO * LO);
    for (let round = 0; round < 24; round++) {
      const free = new Uint8Array(LO * LO);
      for (let i = 0; i < LO * LO; i++) free[i] = tried[i] || cands.some((c) => c.lo[i]) ? 0 : 1;
      const { label, sizes } = components((i) => free[i] === 1, LO, LO);
      let gap = -1;
      sizes.forEach((n, c) => (gap < 0 || n > sizes[gap] ? (gap = c) : 0));
      if (gap < 0 || sizes[gap] < minArea * LO * LO) break;
      const at = deepest(label, gap, LO);
      const out = await sam.decode(((at % LO) + 0.5) / LO, (Math.floor(at / LO) + 0.5) / LO);
      let pickM = -1;
      let gain = 0;
      for (let m = 0; m < 3 && out.objectness > 0; m++) {
        const off = m * M * M;
        const step = M / LO;
        let area = 0;
        let fresh = 0;
        let inGap = 0;
        for (let i = 0; i < LO * LO; i++) {
          if (out.logits[off + (Math.floor(i / LO) * step + 2) * M + (i % LO) * step + 2] <= 0) continue;
          area++;
          if (free[i]) fresh++;
          if (label[i] === gap) inGap++;
        }
        if (out.iou[m] < 0.3 || area < minArea * LO * LO * 0.6 || fresh < area * 0.6 || inGap <= gain) continue;
        pickM = m;
        gain = inGap;
      }
      if (pickM >= 0) consider(out.logits, pickM * M * M, out.iou[pickM]);
      // never prompt the same spot twice
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const x = (at % LO) + dx;
          const y = Math.floor(at / LO) + dy;
          if (x >= 0 && y >= 0 && x < LO && y < LO) tried[y * LO + x] = 1;
        }
      }
      onProgress?.('split', 0.85 + (round / 24) * 0.15);
    }
  } finally {
    sam.release();
  }

  // partition, smallest first; drop pieces left too small (or past the cap) and redo. The
  // passes work on plain upsampled masks; the final one on edge-snapped masks.
  let list = cands;
  let parts: { cand: Cand; alpha: Uint8Array; area: number }[] = [];
  let rest = new Uint8Array(N);
  for (let pass = 0, last = false; pass < 6; pass++) {
    if (last) for (const c of list) c.alpha = toAlpha(c.logits, true);
    else for (const c of list) c.alpha ??= toAlpha(c.logits, false);
    const order = [...list].sort((a, b) => a.area - b.area);
    const out = order.map(() => new Uint8Array(N));
    const sums = order.map(() => 0);
    rest = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      let r = 255;
      for (let k = 0; k < order.length && r; k++) {
        const a = Math.min(order[k].alpha![i], r);
        if (a) {
          out[k][i] = a;
          sums[k] += a;
          r -= a;
        }
      }
      rest[i] = r;
    }
    parts = order.map((cand, k) => ({ cand, alpha: out[k], area: sums[k] / 255 / N }));
    if (last) break;
    const keep = parts
      .filter((pt) => pt.area >= minArea)
      .sort((a, b) => b.area - a.area)
      .slice(0, max);
    if (keep.length === parts.length || pass >= 3) last = true;
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

/** The cell of component `id` farthest from its edge (city-block distance transform). */
function deepest(label: Int32Array, id: number, n: number) {
  const d = new Int32Array(n * n);
  for (let i = 0; i < n * n; i++) d[i] = label[i] === id ? n * n : 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], (x ? d[i - 1] : 0) + 1, (y ? d[i - n] : 0) + 1);
    }
  }
  let best = 0;
  for (let y = n - 1; y >= 0; y--) {
    for (let x = n - 1; x >= 0; x--) {
      const i = y * n + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], (x < n - 1 ? d[i + 1] : 0) + 1, (y < n - 1 ? d[i + n] : 0) + 1);
      if (d[i] > d[best]) best = i;
    }
  }
  return best;
}

/** Box mean over a (2r+1)² window, via an integral image. */
function boxMean(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const ii = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += src[y * w + x];
      ii[(y + 1) * (w + 1) + x + 1] = ii[y * (w + 1) + x + 1] + row;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const s = ii[y1 * (w + 1) + x1] - ii[y0 * (w + 1) + x1] - ii[y1 * (w + 1) + x0] + ii[y0 * (w + 1) + x0];
      out[y * w + x] = s / ((y1 - y0) * (x1 - x0));
    }
  }
  return out;
}

/**
 * Guided filter (He et al.) with the photo's brightness as the guide: a soft mask comes back
 * with its edge pulled onto the edges in the photo. The guide's statistics are computed once.
 */
function edgeGuide(base: HTMLCanvasElement, r = 3, eps = 0.002) {
  const w = base.width;
  const h = base.height;
  const d = base.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  const I = new Float32Array(w * h);
  const II = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    I[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) / 255;
    II[i] = I[i] * I[i];
  }
  const mI = boxMean(I, w, h, r);
  const mII = boxMean(II, w, h, r);
  return (p: Float32Array) => {
    const Ip = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) Ip[i] = I[i] * p[i];
    const mp = boxMean(p, w, h, r);
    const mIp = boxMean(Ip, w, h, r);
    const a = new Float32Array(w * h);
    const b = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      a[i] = (mIp[i] - mI[i] * mp[i]) / (mII[i] - mI[i] * mI[i] + eps);
      b[i] = mp[i] - a[i] * mI[i];
    }
    const ma = boxMean(a, w, h, r);
    const mb = boxMean(b, w, h, r);
    const q = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) q[i] = ma[i] * I[i] + mb[i];
    return q;
  };
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
