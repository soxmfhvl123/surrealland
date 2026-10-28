import { hash1, TAU } from '../random';
import type { EffectDef } from '../types';
import { num, str } from './util';

const DIRS: Record<string, number> = { down: 90, up: -90, right: 0, left: 180 };

/**
 * Cinemagraph-style flow: the region's own texture slides downstream.
 *
 * Two copies of the picture are offset along the flow by a phase that keeps
 * resetting; they are cross-faded (each is invisible at its reset) so the loop
 * is seamless. Samples that would come from outside the selection are dropped,
 * so rock or trees above a waterfall never get dragged into the water.
 */
export const flow: EffectDef = {
  type: 'flow',
  label: '흐르게 하기',
  english: 'Flowing Water',
  description: '선택한 곳(폭포·강·구름·연기)의 결이 한 방향으로 계속 흘러가요. 나머지는 멈춰 있는 시네마그래프가 돼요.',
  category: 'distort',
  params: [
    { key: 'selection', label: '흐르게 할 곳', type: 'selection', default: '', none: '화면 전체' },
    {
      key: 'direction',
      label: '방향',
      type: 'select',
      default: 'down',
      options: [
        { value: 'down', label: '아래로 (폭포)' },
        { value: 'up', label: '위로 (연기·김)' },
        { value: 'right', label: '오른쪽으로' },
        { value: 'left', label: '왼쪽으로' },
      ],
    },
    { key: 'tilt', label: '기울기 (도)', type: 'range', min: -60, max: 60, step: 1, default: 0 },
    { key: 'speed', label: '빠르기', type: 'range', min: 1, max: 12, step: 1, default: 4 },
    { key: 'length', label: '한 번에 흐르는 거리', type: 'range', min: 1, max: 20, step: 0.5, default: 6, unit: '%' },
    { key: 'vary', label: '물줄기마다 속도 차이', type: 'range', min: 0, max: 100, step: 1, default: 45, group: '물결' },
    { key: 'ripple', label: '좌우 흔들림', type: 'range', min: 0, max: 100, step: 1, default: 30, group: '물결' },
    { key: 'streak', label: '물줄기 늘어짐', type: 'range', min: 0, max: 100, step: 1, default: 40, group: '물결' },
    { key: 'shine', label: '물빛 밝게', type: 'range', min: 0, max: 100, step: 1, default: 15, group: '물결' },
  ],
  render(rc, p) {
    const { ctx, w, h, t, s } = rc;
    const selId = str(p, 'selection');
    const maskCanvas = selId ? rc.selection(selId) : null;
    if (selId && !maskCanvas) return;

    // where to work: the selection's bounding box (or everything)
    let mask: Uint8ClampedArray | null = null;
    let x0 = 0;
    let y0 = 0;
    let x1 = w - 1;
    let y1 = h - 1;
    if (maskCanvas) {
      mask = maskCanvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
      x0 = w;
      y0 = h;
      x1 = -1;
      y1 = -1;
      for (let y = 0; y < h; y++) {
        const row = y * w;
        for (let x = 0; x < w; x++) {
          if (mask[(row + x) * 4 + 3] > 6) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      if (x1 < 0) return;
    }
    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;

    const src = rc.snapshot().getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
    const out = ctx.getImageData(x0, y0, bw, bh);
    const o = out.data;

    const ang = ((DIRS[str(p, 'direction')] ?? 90) + num(p, 'tilt')) * (Math.PI / 180);
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    const L = (num(p, 'length') / 100) * h;
    const cycles = Math.round(num(p, 'speed'));
    const a = (t * cycles) % 1;
    const b = (a + 0.5) % 1;
    const wA = 1 - Math.abs(2 * a - 1);
    const wB = 1 - wA;
    const oA = (a - 0.5) * L;
    const oB = (b - 0.5) * L;
    const vary = num(p, 'vary') / 100;
    const ripple = (num(p, 'ripple') / 100) * 9 * s;
    const streak = (num(p, 'streak') / 100) * 0.35 * L;
    const shine = num(p, 'shine') / 100;
    const taps = streak > 0.5 ? 3 : 1;

    // across-flow coordinate gives each "strand" its own speed; along-flow waves give the ripple
    const across = (x: number, y: number) => -x * dy + y * dx;
    const along = (x: number, y: number) => x * dx + y * dy;
    const seed = rc.seed;
    const strandSpeed = (c: number) => {
      const u = c / (14 * s);
      const i = Math.floor(u);
      const f = u - i;
      const k = f * f * (3 - 2 * f);
      return 1 + vary * 0.9 * ((hash1(i, seed) * (1 - k) + hash1(i + 1, seed) * k) * 2 - 1);
    };
    const wave = TAU * t * cycles;

    const sample = (x: number, y: number, off: number, sp: number, acc: Float32Array) => {
      // content at (x, y) came from upstream
      let r = 0;
      let g = 0;
      let bl = 0;
      let n = 0;
      for (let k = 0; k < taps; k++) {
        const d = off * sp + k * streak * 0.5;
        const sx = Math.round(x - dx * d);
        const sy = Math.round(y - dy * d);
        if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
        const i = (sy * w + sx) * 4;
        if (mask && mask[i + 3] < 90) continue;
        r += src[i];
        g += src[i + 1];
        bl += src[i + 2];
        n++;
      }
      if (!n) return 0;
      acc[0] = r / n;
      acc[1] = g / n;
      acc[2] = bl / n;
      return 1;
    };

    const ca = new Float32Array(3);
    const cb = new Float32Array(3);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const mi = (y * w + x) * 4;
        const m = mask ? mask[mi + 3] / 255 : 1;
        if (m <= 0.02) continue;
        const sp = strandSpeed(across(x, y));
        const al = along(x, y) / (40 * s);
        const lat = ripple * (Math.sin(al + wave) * 0.6 + Math.sin(al * 2.3 - wave * 2 + across(x, y) * 0.05) * 0.4);
        const rx = x - dy * lat;
        const ry = y + dx * lat;
        const va = sample(rx, ry, oA, sp, ca) * wA;
        const vb = sample(rx, ry, oB, sp, cb) * wB;
        const tot = va + vb;
        if (tot < 1e-3) continue;
        let r = (ca[0] * va + cb[0] * vb) / tot;
        let g = (ca[1] * va + cb[1] * vb) / tot;
        let bl = (ca[2] * va + cb[2] * vb) / tot;
        // where only one copy is usable (near the upstream edge) fade towards the still picture
        const keep = Math.min(1, tot * 1.6);
        if (shine > 0) {
          const l = (r * 0.3 + g * 0.59 + bl * 0.11) / 255;
          const boost = shine * 60 * l * l;
          r += boost;
          g += boost;
          bl += boost;
        }
        const k = m * keep;
        const oi = ((y - y0) * bw + (x - x0)) * 4;
        o[oi] += (r - o[oi]) * k;
        o[oi + 1] += (g - o[oi + 1]) * k;
        o[oi + 2] += (bl - o[oi + 2]) * k;
      }
    }
    ctx.putImageData(out, x0, y0);
  },
};
