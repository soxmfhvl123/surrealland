import { TAU } from '../random';
import type { EffectDef } from '../types';
import { bool, lum32, num, rect, rectPx, str } from './util';

export const pixelSort: EffectDef = {
  type: 'pixelSort',
  label: '픽셀 소트',
  english: 'Pixel Sort',
  category: 'distort',
  description: '밝기 구간에 들어오는 픽셀을 줄 단위로 정렬해서 데이터가 흘러내리는 질감을 만듭니다.',
  params: [
    { key: 'area', label: '적용 영역', type: 'rect', default: { x: 0, y: 0, w: 1, h: 1 }, color: '#ff5fa2' },
    {
      key: 'direction',
      label: '방향',
      type: 'select',
      default: 'vertical',
      options: [
        { value: 'vertical', label: '세로' },
        { value: 'horizontal', label: '가로' },
      ],
    },
    { key: 'lo', label: '밝기 하한', type: 'range', min: 0, max: 100, step: 1, default: 35, unit: '%' },
    { key: 'hi', label: '밝기 상한', type: 'range', min: 0, max: 100, step: 1, default: 85, unit: '%' },
    { key: 'maxRun', label: '최대 줄 길이', type: 'range', min: 2, max: 100, step: 1, default: 100, unit: '%' },
    { key: 'reverse', label: '정렬 뒤집기', type: 'bool', default: false },
    {
      key: 'anim',
      label: '움직임',
      type: 'select',
      default: 'threshold',
      group: '모션',
      options: [
        { value: 'none', label: '정지' },
        { value: 'threshold', label: '밝기 구간 출렁임 (루프)' },
        { value: 'reveal', label: '위에서부터 퍼짐' },
      ],
    },
    { key: 'strength', label: '움직임 세기', type: 'range', min: 0, max: 100, step: 1, default: 40, group: '모션' },
    { key: 'cycles', label: '루프 반복', type: 'range', min: 1, max: 6, step: 1, default: 1, group: '모션' },
  ],
  render(rc, p) {
    const R = rectPx(rect(p, 'area'), rc.w, rc.h);
    const vertical = str(p, 'direction') === 'vertical';
    const strength = num(p, 'strength') / 100;
    let lo = (num(p, 'lo') / 100) * 255;
    let hi = (num(p, 'hi') / 100) * 255;
    let coverage = 1;
    const anim = str(p, 'anim');
    if (anim === 'threshold') {
      const wob = Math.sin(TAU * rc.t * num(p, 'cycles'));
      hi = Math.min(255, hi + wob * strength * 60);
      lo = Math.max(0, lo - wob * strength * 30);
    } else if (anim === 'reveal') {
      coverage = 1 - strength + strength * Math.min(1, rc.t / 0.8);
    }
    if (hi <= lo) return;

    const img = rc.ctx.getImageData(R.x, R.y, R.w, R.h);
    const d = new Uint32Array(img.data.buffer);
    const pw = R.w;
    const L = Math.floor((vertical ? R.h : R.w) * coverage);
    const lines = vertical ? R.w : R.h;
    const maxRun = Math.max(2, Math.floor(((vertical ? R.h : R.w) * num(p, 'maxRun')) / 100));
    const reverse = bool(p, 'reverse');
    const keys = new Uint32Array(L);
    const vals = new Uint32Array(L);
    const at = vertical ? (line: number, i: number) => i * pw + line : (line: number, i: number) => line * pw + i;

    for (let line = 0; line < lines; line++) {
      let i = 0;
      while (i < L) {
        while (i < L) {
          const l = lum32(d[at(line, i)]);
          if (l >= lo && l <= hi) break;
          i++;
        }
        const start = i;
        while (i < L && i - start < maxRun) {
          const l = lum32(d[at(line, i)]);
          if (l < lo || l > hi) break;
          i++;
        }
        const len = i - start;
        if (len < 2) {
          i = Math.max(i, start + 1);
          continue;
        }
        for (let k = 0; k < len; k++) {
          const c = d[at(line, start + k)];
          vals[k] = c;
          // brightness in the high bits, original position in the low 12 bits
          keys[k] = (lum32(c) << 12) | k;
        }
        const sorted = keys.subarray(0, len).sort();
        for (let k = 0; k < len; k++) {
          const src = sorted[reverse ? len - 1 - k : k] & 4095;
          d[at(line, start + k)] = vals[src];
        }
      }
    }
    rc.ctx.putImageData(img, R.x, R.y);
  },
};
