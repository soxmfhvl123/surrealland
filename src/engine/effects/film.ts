import { mulberry32 } from '../random';
import type { EffectDef, Surface } from '../types';
import { bool, num } from './util';

let grainSurface: Surface | null = null;

export const film: EffectDef = {
  type: 'film',
  label: '필름 질감',
  english: 'Film & Lens',
  category: 'finish',
  description: '그레인, 색수차, 주사선, 하이라이트 번짐. 마지막에 얹어서 디지털 느낌을 지웁니다.',
  params: [
    { key: 'grain', label: '그레인', type: 'range', min: 0, max: 100, step: 1, default: 25 },
    { key: 'grainSize', label: '그레인 입자 크기', type: 'range', min: 1, max: 4, step: 0.5, default: 1.5 },
    { key: 'animated', label: '그레인 움직이기', type: 'bool', default: true },
    { key: 'chroma', label: '색수차', type: 'range', min: 0, max: 30, step: 0.5, default: 0 },
    { key: 'glow', label: '하이라이트 번짐', type: 'range', min: 0, max: 100, step: 1, default: 0 },
    { key: 'scanlines', label: '주사선', type: 'range', min: 0, max: 100, step: 1, default: 0 },
  ],
  render(rc, p) {
    const { ctx, w, h, s } = rc;

    const glow = num(p, 'glow') / 100;
    if (glow > 0) {
      // downsample twice for a cheap blur, then screen it back over the frame
      const a = rc.scratch(0);
      const b = rc.scratch(1);
      const sw = Math.max(2, Math.round(w / 12));
      const sh = Math.max(2, Math.round(h / 12));
      a.ctx.imageSmoothingQuality = 'high';
      a.ctx.drawImage(rc.canvas, 0, 0, sw, sh);
      b.ctx.imageSmoothingQuality = 'high';
      b.ctx.drawImage(a.canvas, 0, 0, sw, sh, 0, 0, sw / 2, sh / 2);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = glow * 0.6;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(b.canvas, 0, 0, sw / 2, sh / 2, 0, 0, w, h);
      ctx.restore();
    }

    const chroma = Math.round(num(p, 'chroma') * s);
    if (chroma > 0) {
      const img = ctx.getImageData(0, 0, w, h);
      const d = img.data;
      const o = new Uint8ClampedArray(d);
      const cx = w / 2;
      for (let y = 0; y < h; y++) {
        const row = y * w * 4;
        for (let x = 0; x < w; x++) {
          const k = Math.round((chroma * (x - cx)) / cx);
          const xr = Math.min(w - 1, Math.max(0, x + k));
          const xb = Math.min(w - 1, Math.max(0, x - k));
          d[row + x * 4] = o[row + xr * 4];
          d[row + x * 4 + 2] = o[row + xb * 4 + 2];
        }
      }
      ctx.putImageData(img, 0, 0);
    }

    const scan = num(p, 'scanlines') / 100;
    if (scan > 0) {
      ctx.fillStyle = `rgba(0,0,0,${scan * 0.45})`;
      const gap = Math.max(2, 3 * s);
      for (let y = 0; y < h; y += gap) ctx.fillRect(0, y, w, Math.max(1, gap / 3));
    }

    const grain = num(p, 'grain') / 100;
    if (grain > 0) {
      const cell = Math.max(1, num(p, 'grainSize') * s);
      const gw = Math.ceil(w / cell);
      const gh = Math.ceil(h / cell);
      if (!grainSurface) {
        const c = document.createElement('canvas');
        grainSurface = { canvas: c, ctx: c.getContext('2d')! };
      }
      const { canvas: gc, ctx: gctx } = grainSurface;
      gc.width = gw;
      gc.height = gh;
      const img = gctx.createImageData(gw, gh);
      const d = img.data;
      const rng = mulberry32((rc.seed ^ Math.imul(bool(p, 'animated') ? rc.frame + 1 : 1, 2246822519)) >>> 0);
      for (let i = 0; i < d.length; i += 4) {
        const v = 128 + (rng() + rng() - 1) * 160;
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 255;
      }
      gctx.putImageData(img, 0, 0);
      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = Math.min(1, grain * 0.9);
      ctx.imageSmoothingEnabled = cell > 1.5;
      ctx.drawImage(gc, 0, 0, w, h);
      ctx.restore();
    }
  },
};
