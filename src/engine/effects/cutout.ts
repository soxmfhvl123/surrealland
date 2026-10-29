import { hash1, TAU } from '../random';
import type { EffectDef } from '../types';
import { num, rgba, str } from './util';

/** Centre of the selected pixels, found on a tiny downsample of the mask. */
function maskCenter(mask: HTMLCanvasElement, w: number, h: number): { x: number; y: number } | null {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = Math.max(1, Math.round((64 * h) / w));
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(mask, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const a = d[(y * c.width + x) * 4 + 3];
      if (a > 100) {
        sx += x;
        sy += y;
        n++;
      }
    }
  }
  if (!n) return null;
  return { x: ((sx / n + 0.5) / c.width) * w, y: ((sy / n + 0.5) / c.height) * h };
}

export const cutout: EffectDef = {
  type: 'cutout',
  label: '오려서 띄우기',
  english: 'Cut Out Object',
  description: '선택한 물체를 오려내서 옮기고, 키우고, 둥둥 띄우고, 여러 개로 복제합니다. 원래 자리는 비우거나 그대로 둘 수 있어요.',
  category: 'composite',
  kind: 'overlay',
  params: [
    { key: 'selection', label: '오려낼 선택', type: 'selection', default: '' },
    {
      key: 'source',
      label: '어디서 오릴까',
      type: 'select',
      default: 'current',
      options: [
        { value: 'current', label: '지금까지의 결과' },
        { value: 'base', label: '원본 사진' },
      ],
    },
    { key: 'dx', label: '가로 이동', type: 'range', min: -100, max: 100, step: 0.5, default: 0, unit: '%' },
    { key: 'dy', label: '세로 이동', type: 'range', min: -100, max: 100, step: 0.5, default: -8, unit: '%' },
    { key: 'scale', label: '크기', type: 'range', min: 20, max: 300, step: 1, default: 100, unit: '%' },
    { key: 'rotate', label: '회전 (도)', type: 'range', min: -180, max: 180, step: 1, default: 0 },
    {
      key: 'hole',
      label: '원래 자리',
      type: 'select',
      default: 'keep',
      options: [
        { value: 'keep', label: '그대로 둠 (복제)' },
        { value: 'black', label: '검게 비움' },
        { value: 'color', label: '색으로 채움' },
      ],
    },
    { key: 'holeColor', label: '채울 색', type: 'color', default: '#000000' },
    { key: 'shadow', label: '그림자', type: 'range', min: 0, max: 100, step: 1, default: 45 },
    { key: 'outline', label: '테두리 (스티커)', type: 'range', min: 0, max: 30, step: 0.5, default: 0 },
    { key: 'outlineColor', label: '테두리 색', type: 'color', default: '#ffffff' },
    { key: 'copies', label: '복제 개수', type: 'range', min: 1, max: 12, step: 1, default: 1, group: '복제' },
    { key: 'stepX', label: '복제 간격 가로', type: 'range', min: -50, max: 50, step: 0.5, default: 8, unit: '%', group: '복제' },
    { key: 'stepY', label: '복제 간격 세로', type: 'range', min: -50, max: 50, step: 0.5, default: 0, unit: '%', group: '복제' },
    { key: 'fade', label: '뒤로 갈수록 흐리게', type: 'range', min: 0, max: 100, step: 1, default: 35, group: '복제' },
    { key: 'float', label: '둥둥 뜨는 폭', type: 'range', min: 0, max: 60, step: 1, default: 12, group: '모션' },
    { key: 'spin', label: '흔들리는 각도', type: 'range', min: 0, max: 30, step: 0.5, default: 2, group: '모션' },
    { key: 'cycles', label: '루프 반복', type: 'range', min: 1, max: 4, step: 1, default: 1, group: '모션' },
  ],
  render(rc, p) {
    const id = str(p, 'selection');
    if (!id) return;
    // a piece still sitting exactly where it was cut (fresh from 자동 누끼) changes nothing
    const still = !num(p, 'dx') && !num(p, 'dy') && num(p, 'scale') === 100 && !num(p, 'rotate') && !num(p, 'float') && !num(p, 'spin');
    if (still && str(p, 'source') !== 'base' && str(p, 'hole') === 'keep' && !num(p, 'shadow') && !num(p, 'outline') && num(p, 'copies') <= 1) return;
    const mask = rc.selection(id);
    if (!mask) return;
    const { ctx, w, h, s, t } = rc;
    const center = maskCenter(mask, w, h);
    if (!center) return;

    // the object alone, on transparent
    const src = str(p, 'source') === 'base' ? rc.base : rc.snapshot();
    const cut = rc.scratch(0);
    cut.ctx.drawImage(src, 0, 0);
    cut.ctx.globalCompositeOperation = 'destination-in';
    cut.ctx.drawImage(mask, 0, 0);
    cut.ctx.globalCompositeOperation = 'source-over';

    const hole = str(p, 'hole');
    if (hole !== 'keep') {
      const fill = rc.scratch(1);
      fill.ctx.fillStyle = hole === 'black' ? '#000' : str(p, 'holeColor');
      fill.ctx.fillRect(0, 0, w, h);
      fill.ctx.globalCompositeOperation = 'destination-in';
      fill.ctx.drawImage(mask, 0, 0);
      ctx.drawImage(fill.canvas, 0, 0);
    }

    // optional sticker outline: the silhouette stamped around in a ring
    const outline = num(p, 'outline') * s;
    let silhouette: HTMLCanvasElement | null = null;
    if (outline > 0) {
      const sil = rc.scratch(1);
      sil.ctx.clearRect(0, 0, w, h);
      sil.ctx.fillStyle = str(p, 'outlineColor');
      sil.ctx.fillRect(0, 0, w, h);
      sil.ctx.globalCompositeOperation = 'destination-in';
      sil.ctx.drawImage(mask, 0, 0);
      sil.ctx.globalCompositeOperation = 'source-over';
      silhouette = sil.canvas;
    }

    const copies = num(p, 'copies');
    const phase = TAU * t * num(p, 'cycles');
    const sc = num(p, 'scale') / 100;
    const fade = num(p, 'fade') / 100;
    const shadow = num(p, 'shadow') / 100;
    for (let k = copies - 1; k >= 0; k--) {
      const ph = phase + hash1(k, rc.seed) * TAU;
      const fx = (num(p, 'dx') / 100 + (k * num(p, 'stepX')) / 100) * w;
      const fy = (num(p, 'dy') / 100 + (k * num(p, 'stepY')) / 100) * h + num(p, 'float') * s * Math.sin(ph);
      const rot = ((num(p, 'rotate') + num(p, 'spin') * Math.sin(ph + 1.3)) * Math.PI) / 180;
      ctx.save();
      ctx.globalAlpha = Math.max(0.05, 1 - k * fade * 0.5);
      ctx.translate(center.x + fx, center.y + fy);
      ctx.rotate(rot);
      ctx.scale(sc, sc);
      ctx.translate(-center.x, -center.y);
      if (silhouette) {
        for (let a = 0; a < 12; a++) {
          const ang = (a / 12) * TAU;
          ctx.drawImage(silhouette, (Math.cos(ang) * outline) / sc, (Math.sin(ang) * outline) / sc);
        }
      }
      if (shadow > 0) {
        ctx.shadowColor = rgba('#000000', 0.75 * shadow);
        ctx.shadowBlur = (20 + 40 * shadow) * s;
        ctx.shadowOffsetY = 26 * s * shadow;
      }
      ctx.drawImage(cut.canvas, 0, 0);
      ctx.restore();
    }
  },
};
