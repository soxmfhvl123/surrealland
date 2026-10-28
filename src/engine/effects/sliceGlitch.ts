import { mulberry32, noise1, smoothstep } from '../random';
import type { EffectDef } from '../types';
import { num } from './util';

export const sliceGlitch: EffectDef = {
  type: 'sliceGlitch',
  label: '슬라이스 글리치',
  english: 'Slice Glitch',
  category: 'distort',
  description: '화면을 가로 띠로 잘라 어긋나게 밀고 RGB를 분리합니다. 신호가 튀는 느낌.',
  params: [
    { key: 'amount', label: '밀림 정도', type: 'range', min: 0, max: 30, step: 0.5, default: 5, unit: '%' },
    { key: 'slices', label: '띠 개수', type: 'range', min: 2, max: 80, step: 1, default: 18 },
    { key: 'chance', label: '어긋나는 확률', type: 'range', min: 0, max: 100, step: 1, default: 30, unit: '%' },
    { key: 'rgb', label: 'RGB 분리', type: 'range', min: 0, max: 40, step: 1, default: 8 },
    { key: 'rate', label: '변화 속도 (초당)', type: 'range', min: 1, max: 30, step: 1, default: 6, group: '모션' },
    { key: 'burst', label: '잠잠함 ↔ 폭발 대비', type: 'range', min: 0, max: 100, step: 1, default: 55, group: '모션' },
  ],
  render(rc, p) {
    const rate = num(p, 'rate');
    const burst = num(p, 'burst') / 100;
    const calm = noise1(rc.time * rate * 0.2, rc.seed ^ 0xabc);
    const intensity = 1 - burst + burst * smoothstep(0.35, 0.8, calm);
    if (intensity < 0.02) return;

    const { ctx, w, h } = rc;
    const step = Math.floor(rc.time * rate);
    const rng = mulberry32((rc.seed ^ Math.imul(step + 1, 7919)) >>> 0);
    const snap = rc.snapshot();
    const amount = (num(p, 'amount') / 100) * w * intensity;
    const avg = h / num(p, 'slices');
    const chance = num(p, 'chance') / 100;
    const shifted: [number, number][] = [];

    let y = 0;
    while (y < h) {
      const sh = Math.max(2, Math.round(avg * (0.25 + rng() * 1.75)));
      if (rng() < chance) {
        const dx = Math.round((rng() * 2 - 1) * amount);
        ctx.drawImage(snap, 0, y, w, sh, dx, y, w, sh);
        // wrap the slice around so no empty gap appears
        ctx.drawImage(snap, 0, y, w, sh, dx > 0 ? dx - w : dx + w, y, w, sh);
        shifted.push([y, Math.min(h, y + sh)]);
      }
      y += sh;
    }

    const k = Math.round(num(p, 'rgb') * rc.s * intensity);
    if (k === 0 || shifted.length === 0) return;
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const o = new Uint8ClampedArray(d);
    for (const [y0, y1] of shifted) {
      for (let yy = y0; yy < y1; yy++) {
        const row = yy * w * 4;
        for (let x = 0; x < w; x++) {
          const i = row + x * 4;
          const xr = Math.min(w - 1, x + k);
          const xb = Math.max(0, x - k);
          d[i] = o[row + xr * 4];
          d[i + 2] = o[row + xb * 4 + 2];
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  },
};
