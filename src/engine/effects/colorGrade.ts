import type { EffectDef } from '../types';
import { bool, hexToRgb, num, str } from './util';

export const colorGrade: EffectDef = {
  type: 'colorGrade',
  label: '컬러 그레이드',
  english: 'Color Grade',
  category: 'color',
  description: '노출·대비·채도·색온도·틴트·비네팅. 무채색에 한 가지 색만 남기는 톤 만들기.',
  params: [
    { key: 'exposure', label: '노출', type: 'range', min: -100, max: 100, step: 1, default: 0 },
    { key: 'contrast', label: '대비', type: 'range', min: -100, max: 100, step: 1, default: 15 },
    { key: 'saturation', label: '채도', type: 'range', min: -100, max: 100, step: 1, default: -15 },
    { key: 'temperature', label: '색온도 (차갑게 ↔ 따뜻하게)', type: 'range', min: -100, max: 100, step: 1, default: 0 },
    { key: 'fade', label: '블랙 띄우기 (필름 톤)', type: 'range', min: 0, max: 100, step: 1, default: 8 },
    { key: 'mono', label: '흑백', type: 'bool', default: false },
    { key: 'tint', label: '틴트 색', type: 'color', default: '#3d5bff' },
    { key: 'tintAmount', label: '틴트 양', type: 'range', min: 0, max: 100, step: 1, default: 0, unit: '%' },
    { key: 'vignette', label: '비네팅', type: 'range', min: 0, max: 100, step: 1, default: 30 },
  ],
  render(rc, p) {
    const { ctx, w, h } = rc;
    const exposure = Math.pow(2, num(p, 'exposure') / 60);
    const c = num(p, 'contrast') / 100;
    const contrast = c >= 0 ? 1 + c * 1.5 : 1 + c;
    const fade = (num(p, 'fade') / 100) * 70;
    const sat = bool(p, 'mono') ? 0 : 1 + num(p, 'saturation') / 100;
    const temp = num(p, 'temperature') / 100;
    const [tr, tg, tb] = hexToRgb(str(p, 'tint'));
    const ta = num(p, 'tintAmount') / 100;

    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) {
      let v = (i / 255) * exposure;
      v = (v - 0.5) * contrast + 0.5;
      lut[i] = fade + v * (255 - fade);
    }

    const needsPixels = exposure !== 1 || contrast !== 1 || fade > 0 || sat !== 1 || temp !== 0 || ta > 0;
    if (needsPixels) {
      const img = ctx.getImageData(0, 0, w, h);
      const d = img.data;
      const rT = 1 + temp * 0.18;
      const bT = 1 - temp * 0.18;
      for (let i = 0; i < d.length; i += 4) {
        let r = lut[d[i]];
        let g = lut[d[i + 1]];
        let b = lut[d[i + 2]];
        const l = r * 0.299 + g * 0.587 + b * 0.114;
        r = l + (r - l) * sat;
        g = l + (g - l) * sat;
        b = l + (b - l) * sat;
        r *= rT;
        b *= bT;
        if (ta > 0) {
          const k = l / 255;
          r += (tr * k * 1.15 - r) * ta;
          g += (tg * k * 1.15 - g) * ta;
          b += (tb * k * 1.15 - b) * ta;
        }
        d[i] = r;
        d[i + 1] = g;
        d[i + 2] = b;
      }
      ctx.putImageData(img, 0, 0);
    }

    const v = num(p, 'vignette') / 100;
    if (v > 0) {
      const r = Math.hypot(w, h) / 2;
      const g = ctx.createRadialGradient(w / 2, h / 2, r * (0.75 - v * 0.4), w / 2, h / 2, r);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(0,0,0,${Math.min(0.95, v * 0.95)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  },
};
