import { hash1, TAU } from '../random';
import type { EffectDef } from '../types';
import { bool, hexToRgb, num, str } from './util';

type Stop = [number, string];
const PALETTES: Record<string, { label: string; stops: Stop[] }> = {
  thermal: { label: '열화상', stops: [[0, '#05000f'], [0.2, '#2a0b8c'], [0.4, '#b0119a'], [0.6, '#ff3b1f'], [0.8, '#ffb000'], [1, '#fffbe0']] },
  night: { label: '나이트비전', stops: [[0, '#000a00'], [0.5, '#1f7a2a'], [1, '#c8ffc0']] },
  xray: { label: '엑스레이', stops: [[0, '#f4fbff'], [0.5, '#6f8ea8'], [1, '#05070c']] },
  chrome: { label: '크롬 메탈', stops: [[0, '#0b0d12'], [0.18, '#d9e3ee'], [0.35, '#3b4452'], [0.55, '#f6f9fc'], [0.75, '#55606f'], [1, '#ffffff']] },
  blueprint: { label: '블루프린트', stops: [[0, '#06123d'], [0.6, '#2a55ff'], [1, '#e8eeff']] },
  sepia: { label: '세피아', stops: [[0, '#140c06'], [0.5, '#8a6a45'], [1, '#f6ead2']] },
  acid: { label: '애시드', stops: [[0, '#000000'], [0.33, '#00ff9c'], [0.66, '#ff00d4'], [1, '#fff700']] },
  duotone: { label: '듀오톤 (직접 고르기)', stops: [] },
};

function buildLut(stops: Stop[]): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 3);
  const rgb = stops.map(([pos, c]) => [pos, ...hexToRgb(c)] as [number, number, number, number]);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    let k = 0;
    while (k < rgb.length - 2 && v > rgb[k + 1][0]) k++;
    const [p0, r0, g0, b0] = rgb[k];
    const [p1, r1, g1, b1] = rgb[Math.min(rgb.length - 1, k + 1)];
    const f = p1 > p0 ? Math.min(1, Math.max(0, (v - p0) / (p1 - p0))) : 0;
    lut[i * 3] = r0 + (r1 - r0) * f;
    lut[i * 3 + 1] = g0 + (g1 - g0) * f;
    lut[i * 3 + 2] = b0 + (b1 - b0) * f;
  }
  return lut;
}

export const gradientMap: EffectDef = {
  type: 'gradientMap',
  label: '색 바꾸기',
  english: 'Gradient Map',
  description: '밝기에 따라 색을 다시 칠합니다. 열화상·나이트비전·엑스레이·크롬·듀오톤.',
  category: 'color',
  params: [
    {
      key: 'palette',
      label: '팔레트',
      type: 'select',
      default: 'thermal',
      options: Object.entries(PALETTES).map(([value, v]) => ({ value, label: v.label })),
    },
    { key: 'dark', label: '어두운 색 (듀오톤)', type: 'color', default: '#0b1a6b' },
    { key: 'light', label: '밝은 색 (듀오톤)', type: 'color', default: '#ff6a3d' },
    { key: 'contrast', label: '대비', type: 'range', min: -50, max: 100, step: 1, default: 10 },
    { key: 'posterize', label: '단계 나누기 (0=부드럽게)', type: 'range', min: 0, max: 16, step: 1, default: 0 },
    { key: 'invert', label: '밝기 뒤집기', type: 'bool', default: false },
    { key: 'mix', label: '적용 양', type: 'range', min: 0, max: 100, step: 1, default: 100, unit: '%' },
    { key: 'shift', label: '색 흐름', type: 'range', min: 0, max: 100, step: 1, default: 0, group: '모션' },
  ],
  render(rc, p) {
    const { ctx, w, h, t } = rc;
    const key = str(p, 'palette');
    const stops: Stop[] = key === 'duotone' ? [[0, str(p, 'dark')], [1, str(p, 'light')]] : PALETTES[key]?.stops ?? PALETTES.thermal.stops;
    const lut = buildLut(stops);
    const c = num(p, 'contrast') / 100;
    const k = c >= 0 ? 1 + c * 1.5 : 1 + c;
    const levels = num(p, 'posterize');
    const inv = bool(p, 'invert');
    const mix = num(p, 'mix') / 100;
    const shift = (num(p, 'shift') / 100) * 0.5 * (0.5 - 0.5 * Math.cos(TAU * t));
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      let v = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
      v = Math.min(1, Math.max(0, (v - 0.5) * k + 0.5));
      if (inv) v = 1 - v;
      if (shift) v = (v + shift) % 1;
      if (levels > 1) v = Math.round(v * (levels - 1)) / (levels - 1);
      const j = Math.min(255, Math.max(0, Math.round(v * 255))) * 3;
      d[i] += (lut[j] - d[i]) * mix;
      d[i + 1] += (lut[j + 1] - d[i + 1]) * mix;
      d[i + 2] += (lut[j + 2] - d[i + 2]) * mix;
    }
    ctx.putImageData(img, 0, 0);
  },
};

/** Downsample the picture to a grid and return its pixels (one sample per cell). */
function sampleGrid(rc: Parameters<EffectDef['render']>[0], gw: number, gh: number) {
  const g = rc.scratch(0);
  g.ctx.imageSmoothingQuality = 'high';
  g.ctx.drawImage(rc.canvas, 0, 0, gw, gh);
  return g.ctx.getImageData(0, 0, gw, gh).data;
}

export const halftone: EffectDef = {
  type: 'halftone',
  label: '망점',
  english: 'Halftone',
  description: '사진을 점·선 망점으로 바꿉니다. 검은 배경에 밝은 점을 찍으면 “점 얼굴”.',
  category: 'stylize',
  params: [
    { key: 'cell', label: '점 간격', type: 'range', min: 3, max: 60, step: 0.5, default: 10 },
    {
      key: 'shape',
      label: '모양',
      type: 'select',
      default: 'dot',
      options: [
        { value: 'dot', label: '원' },
        { value: 'square', label: '네모' },
        { value: 'line', label: '가로선' },
        { value: 'cross', label: '십자' },
      ],
    },
    {
      key: 'colorMode',
      label: '색',
      type: 'select',
      default: 'mono',
      options: [
        { value: 'mono', label: '한 가지 잉크' },
        { value: 'photo', label: '사진 색 그대로' },
      ],
    },
    { key: 'ink', label: '잉크 색', type: 'color', default: '#ffffff' },
    { key: 'paper', label: '바탕 색', type: 'color', default: '#000000' },
    { key: 'bright', label: '밝은 곳에 큰 점', type: 'bool', default: true },
    { key: 'angle', label: '각도', type: 'range', min: 0, max: 90, step: 1, default: 0 },
    { key: 'gain', label: '점 크기', type: 'range', min: 20, max: 200, step: 1, default: 100, unit: '%' },
    { key: 'pulse', label: '점 출렁임', type: 'range', min: 0, max: 100, step: 1, default: 0, group: '모션' },
  ],
  render(rc, p) {
    const { ctx, w, h, s, t } = rc;
    const cell = Math.max(2, num(p, 'cell') * s);
    const ang = (num(p, 'angle') * Math.PI) / 180;
    // sample on a rotated grid that still covers the whole frame
    const diag = Math.hypot(w, h);
    const gw = Math.ceil(diag / cell);
    const data = sampleGrid(rc, Math.ceil(w / cell), Math.ceil(h / cell));
    const sw = Math.ceil(w / cell);
    const shape = str(p, 'shape');
    const photo = str(p, 'colorMode') === 'photo';
    const bright = bool(p, 'bright');
    const gain = num(p, 'gain') / 100;
    const pulse = num(p, 'pulse') / 100;
    ctx.fillStyle = str(p, 'paper');
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = str(p, 'ink');
    ctx.strokeStyle = str(p, 'ink');
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    for (let gy = 0; gy < gw; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        const lx = (gx - gw / 2) * cell;
        const ly = (gy - gw / 2) * cell;
        const x = w / 2 + lx * cos - ly * sin;
        const y = h / 2 + lx * sin + ly * cos;
        if (x < -cell || y < -cell || x > w + cell || y > h + cell) continue;
        const sx = Math.min(sw - 1, Math.max(0, Math.floor(x / cell)));
        const sy = Math.min(Math.ceil(h / cell) - 1, Math.max(0, Math.floor(y / cell)));
        const i = (sy * sw + sx) * 4;
        let v = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
        if (!bright) v = 1 - v;
        if (pulse) v *= 1 - pulse * 0.5 + pulse * 0.5 * Math.sin(TAU * t + (x + y) / (cell * 9));
        const r = (cell / 2) * Math.sqrt(Math.max(0, v)) * gain;
        if (r < 0.3) continue;
        if (photo) ctx.fillStyle = ctx.strokeStyle = `rgb(${data[i]},${data[i + 1]},${data[i + 2]})`;
        if (shape === 'dot') {
          ctx.beginPath();
          ctx.arc(x, y, r, 0, TAU);
          ctx.fill();
        } else if (shape === 'square') {
          ctx.fillRect(x - r, y - r, r * 2, r * 2);
        } else if (shape === 'line') {
          ctx.fillRect(x - cell / 2, y - r / 2, cell, r);
        } else {
          ctx.fillRect(x - r, y - r / 4, r * 2, r / 2);
          ctx.fillRect(x - r / 4, y - r, r / 2, r * 2);
        }
      }
    }
  },
};

const CHARSETS: Record<string, string> = {
  standard: ' .:-=+*#%@',
  blocks: ' ░▒▓█',
  binary: ' 01',
  code: ' .:;<>/\\{}[]#$&@',
  hangul: ' ㆍㅡㅁㅂㅃ█',
};

export const ascii: EffectDef = {
  type: 'ascii',
  label: '아스키 글자',
  english: 'ASCII',
  description: '사진을 글자로 그립니다. 눈동자나 얼굴을 코드로 만든 화면.',
  category: 'stylize',
  params: [
    { key: 'cell', label: '글자 크기', type: 'range', min: 4, max: 40, step: 0.5, default: 11 },
    {
      key: 'charset',
      label: '문자',
      type: 'select',
      default: 'standard',
      options: [
        { value: 'standard', label: '기본 ( .:-=+*#%@)' },
        { value: 'blocks', label: '블록 (░▒▓█)' },
        { value: 'binary', label: '0과 1' },
        { value: 'code', label: '코드 기호' },
        { value: 'hangul', label: '한글 자모' },
      ],
    },
    {
      key: 'colorMode',
      label: '색',
      type: 'select',
      default: 'photo',
      options: [
        { value: 'photo', label: '사진 색 그대로' },
        { value: 'mono', label: '한 가지 색' },
      ],
    },
    { key: 'color', label: '글자 색', type: 'color', default: '#ffb15c' },
    { key: 'bg', label: '바탕 색', type: 'color', default: '#000000' },
    { key: 'boost', label: '밝기 끌어올리기', type: 'range', min: 0, max: 100, step: 1, default: 30 },
    { key: 'flicker', label: '글자 바뀜', type: 'range', min: 0, max: 100, step: 1, default: 20, group: '모션' },
  ],
  render(rc, p) {
    const { ctx, w, h, s } = rc;
    const cell = Math.max(3, num(p, 'cell') * s);
    const cw = cell * 0.62;
    const gw = Math.ceil(w / cw);
    const gh = Math.ceil(h / cell);
    const data = sampleGrid(rc, gw, gh);
    const chars = CHARSETS[str(p, 'charset')] ?? CHARSETS.standard;
    const photo = str(p, 'colorMode') === 'photo';
    const boost = num(p, 'boost') / 100;
    const flicker = num(p, 'flicker') / 100;
    const step = Math.floor(rc.time * 12);
    ctx.fillStyle = str(p, 'bg');
    ctx.fillRect(0, 0, w, h);
    ctx.font = `500 ${cell}px "JetBrains Mono", "IBM Plex Mono", monospace`;
    ctx.textBaseline = 'top';
    if (!photo) ctx.fillStyle = str(p, 'color');
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const i = (y * gw + x) * 4;
        let v = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
        v = Math.min(1, v * (1 + boost));
        let ci = Math.min(chars.length - 1, Math.floor(v * chars.length));
        if (flicker && ci > 0 && hash1(i + step * 7919, rc.seed) < flicker * 0.25) ci = 1 + Math.floor(hash1(i, step) * (chars.length - 1));
        const ch = chars[ci];
        if (ch === ' ') continue;
        if (photo) {
          const k = 1 + boost;
          ctx.fillStyle = `rgb(${Math.min(255, data[i] * k)},${Math.min(255, data[i + 1] * k)},${Math.min(255, data[i + 2] * k)})`;
        }
        ctx.fillText(ch, x * cw, y * cell);
      }
    }
  },
};

const BAYER8 = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35,
  11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
];

export const dither: EffectDef = {
  type: 'dither',
  label: '1비트 디더',
  english: 'Dither',
  description: '두 가지 색 점으로만 그리는 오래된 모니터·프린터 질감.',
  category: 'stylize',
  params: [
    {
      key: 'method',
      label: '방식',
      type: 'select',
      default: 'bayer',
      options: [
        { value: 'bayer', label: '격자 (Bayer)' },
        { value: 'diffuse', label: '오차 확산 (Floyd)' },
      ],
    },
    { key: 'pixel', label: '점 크기', type: 'range', min: 1, max: 12, step: 0.5, default: 2.5 },
    { key: 'threshold', label: '밝기 기준', type: 'range', min: -50, max: 50, step: 1, default: 0 },
    { key: 'dark', label: '어두운 색', type: 'color', default: '#0a0a0a' },
    { key: 'light', label: '밝은 색', type: 'color', default: '#e9e6dc' },
  ],
  render(rc, p) {
    const { ctx, w, h, s } = rc;
    const px = Math.max(1, num(p, 'pixel') * s);
    const gw = Math.max(1, Math.round(w / px));
    const gh = Math.max(1, Math.round(h / px));
    const g = rc.scratch(0);
    g.ctx.imageSmoothingQuality = 'high';
    g.ctx.drawImage(rc.canvas, 0, 0, gw, gh);
    const img = g.ctx.getImageData(0, 0, gw, gh);
    const d = img.data;
    const [dr, dg, db] = hexToRgb(str(p, 'dark'));
    const [lr, lg, lb] = hexToRgb(str(p, 'light'));
    const th = 128 - num(p, 'threshold') * 2.2;
    const lum = new Float32Array(gw * gh);
    for (let i = 0; i < gw * gh; i++) lum[i] = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114;
    const diffuse = str(p, 'method') === 'diffuse';
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        let on: boolean;
        if (diffuse) {
          const old = lum[i];
          on = old > th;
          const err = old - (on ? 255 : 0);
          if (x + 1 < gw) lum[i + 1] += (err * 7) / 16;
          if (y + 1 < gh) {
            if (x > 0) lum[i + gw - 1] += (err * 3) / 16;
            lum[i + gw] += (err * 5) / 16;
            if (x + 1 < gw) lum[i + gw + 1] += err / 16;
          }
        } else {
          on = lum[i] + (BAYER8[(y & 7) * 8 + (x & 7)] / 64 - 0.5) * 255 > th;
        }
        d[i * 4] = on ? lr : dr;
        d[i * 4 + 1] = on ? lg : dg;
        d[i * 4 + 2] = on ? lb : db;
        d[i * 4 + 3] = 255;
      }
    }
    g.ctx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(g.canvas, 0, 0, gw, gh, 0, 0, w, h);
  },
};

export const edgeGlow: EffectDef = {
  type: 'edgeGlow',
  label: '윤곽 네온',
  english: 'Edge Glow',
  description: '윤곽선만 뽑아 네온처럼 빛나게 합니다. 검은 화면에 선만 남길 수도 있어요.',
  category: 'stylize',
  params: [
    {
      key: 'mode',
      label: '방식',
      type: 'select',
      default: 'over',
      options: [
        { value: 'over', label: '사진 위에 겹치기' },
        { value: 'only', label: '윤곽선만 (검은 바탕)' },
      ],
    },
    { key: 'threshold', label: '윤곽 기준', type: 'range', min: 0, max: 100, step: 1, default: 30 },
    { key: 'color', label: '선 색', type: 'color', default: '#5cf2ff' },
    { key: 'photoColor', label: '사진 색으로 칠하기', type: 'bool', default: false },
    { key: 'glow', label: '번짐', type: 'range', min: 0, max: 100, step: 1, default: 50 },
    { key: 'scan', label: '스캔 빛', type: 'range', min: 0, max: 100, step: 1, default: 0, group: '모션' },
  ],
  render(rc, p) {
    const { ctx, w, h, t } = rc;
    const src = ctx.getImageData(0, 0, w, h);
    const d = src.data;
    const g = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) g[i] = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114;
    const out = ctx.createImageData(w, h);
    const o = out.data;
    const th = 20 + num(p, 'threshold') * 3;
    const [cr, cg, cb] = hexToRgb(str(p, 'color'));
    const photo = bool(p, 'photoColor');
    const scan = num(p, 'scan') / 100;
    const scanY = (t % 1) * h;
    for (let y = 1; y < h - 1; y++) {
      const boostRow = scan ? 1 + scan * 2 * Math.max(0, 1 - Math.abs(y - scanY) / (h * 0.06)) : 1;
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const gx = g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - 1] - g[i + w - 1];
        const gy = g[i + w - 1] + 2 * g[i + w] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - w] - g[i - w + 1];
        const m = Math.abs(gx) + Math.abs(gy);
        if (m < th) continue;
        const a = Math.min(1, ((m - th) / 160) * boostRow);
        const j = i * 4;
        o[j] = photo ? d[j] : cr;
        o[j + 1] = photo ? d[j + 1] : cg;
        o[j + 2] = photo ? d[j + 2] : cb;
        o[j + 3] = a * 255;
      }
    }
    const lines = rc.scratch(0);
    lines.ctx.putImageData(out, 0, 0);
    if (str(p, 'mode') === 'only') {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
    }
    const glow = num(p, 'glow') / 100;
    if (glow > 0) {
      const b = rc.scratch(1);
      const sw = Math.max(2, Math.round(w / 8));
      const sh = Math.max(2, Math.round(h / 8));
      b.ctx.imageSmoothingQuality = 'high';
      b.ctx.drawImage(lines.canvas, 0, 0, sw, sh);
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = Math.min(1, glow * 1.4);
      ctx.drawImage(b.canvas, 0, 0, sw, sh, 0, 0, w, h);
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(lines.canvas, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  },
};
