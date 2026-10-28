import { clamp, fbm1, noise1, smoothstep, TAU } from '../random';
import type { EffectDef } from '../types';
import { motionOptions, num, rect, rectPx, str } from './util';

export const pixelStretch: EffectDef = {
  type: 'pixelStretch',
  label: '픽셀 스트레치',
  english: 'Pixel Stretch',
  category: 'distort',
  description: '경계선의 픽셀 한 줄을 길게 끌어내려 건물·폭포·지형이 녹아내리는 느낌을 만듭니다.',
  params: [
    { key: 'area', label: '적용 영역', type: 'rect', default: { x: 0, y: 0.45, w: 1, h: 0.55 }, color: '#4f7cff' },
    {
      key: 'direction',
      label: '방향',
      type: 'select',
      default: 'down',
      options: [
        { value: 'down', label: '↓ 아래로' },
        { value: 'up', label: '↑ 위로' },
        { value: 'right', label: '→ 오른쪽' },
        { value: 'left', label: '← 왼쪽' },
      ],
    },
    { key: 'melt', label: '경계 들쭉날쭉', type: 'range', min: 0, max: 100, step: 1, default: 35, unit: '%' },
    { key: 'grain', label: '경계 결 크기', type: 'range', min: 1, max: 100, step: 1, default: 30 },
    { key: 'drip', label: '흘러내림 길이 차이', type: 'range', min: 0, max: 100, step: 1, default: 45, unit: '%' },
    { key: 'wave', label: '물결 왜곡', type: 'range', min: 0, max: 100, step: 1, default: 10 },
    { key: 'anim', label: '움직임', type: 'select', default: 'breathe', options: motionOptions, group: '모션' },
    { key: 'strength', label: '움직임 세기', type: 'range', min: 0, max: 100, step: 1, default: 50, group: '모션' },
    { key: 'cycles', label: '루프 반복', type: 'range', min: 1, max: 6, step: 1, default: 1, group: '모션' },
  ],
  render(rc, p) {
    const R = rectPx(rect(p, 'area'), rc.w, rc.h);
    const dir = str(p, 'direction');
    const vertical = dir === 'down' || dir === 'up';
    const across = vertical ? R.w : R.h;
    const along = vertical ? R.h : R.w;
    if (along < 2) return;

    const img = rc.ctx.getImageData(R.x, R.y, R.w, R.h);
    const d = new Uint32Array(img.data.buffer);
    const orig = d.slice();
    const pw = R.w;
    const ph = R.h;
    const idx: (a: number, b: number) => number =
      dir === 'down'
        ? (a, b) => b * pw + a
        : dir === 'up'
          ? (a, b) => (ph - 1 - b) * pw + a
          : dir === 'right'
            ? (a, b) => a * pw + b
            : (a, b) => a * pw + (pw - 1 - b);

    const cycles = num(p, 'cycles');
    const strength = num(p, 'strength') / 100;
    const phase = TAU * rc.t * cycles;
    let shift = 0;
    let growth = 1;
    let flow = 0;
    switch (str(p, 'anim')) {
      case 'breathe':
        growth = 1 - strength * 0.6 * (0.5 - 0.5 * Math.cos(phase));
        break;
      case 'grow':
        growth = 1 - strength * (1 - smoothstep(0, 0.85, rc.t));
        break;
      case 'sweep':
        shift = along * 0.5 * strength * (0.5 - 0.5 * Math.cos(phase));
        break;
      case 'flow':
        flow = rc.time * strength * 0.8;
        break;
    }

    // Everything below is measured in reference pixels (short side = 1080) so preview matches export.
    const s = rc.s;
    const meltPx = along * (num(p, 'melt') / 100) * 0.6;
    const cell = Math.max(1, num(p, 'grain')) * 2;
    const drip = num(p, 'drip') / 100;
    const wavePx = (num(p, 'wave') / 100) * 40 * s;
    const seed = rc.seed;

    for (let a = 0; a < across; a++) {
      const wa = a / s;
      const n = fbm1(wa / cell + flow, seed);
      const start = Math.floor(meltPx * n + shift);
      if (start >= along - 1) continue;
      const dn = noise1(wa / (cell * 0.35) + 77.7 + flow * 0.5, seed ^ 0x51ed);
      const len = Math.floor((along - start) * (1 - drip * dn) * growth);
      const end = Math.min(along, start + 1 + len);
      if (wavePx === 0) {
        const c = orig[idx(a, start)];
        for (let b = start + 1; b < end; b++) d[idx(a, b)] = c;
      } else {
        for (let b = start + 1; b < end; b++) {
          const off = Math.round(wavePx * Math.sin((b / s) * 0.02 + wa * 0.004 + phase));
          d[idx(a, b)] = orig[idx(clamp(a + off, 0, across - 1), start)];
        }
      }
    }
    rc.ctx.putImageData(img, R.x, R.y);
  },
};
