import { hash1, mulberry32, smoothstep, TAU } from '../random';
import type { EffectDef, RenderContext } from '../types';
import { bool, hexToRgb, num, rgba, str } from './util';

/** Smooth 2D value noise 0..1. */
function noise2(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const h = (a: number, b: number) => hash1(a * 73856093 + b * 19349663, seed);
  const a = h(xi, yi) + (h(xi + 1, yi) - h(xi, yi)) * u;
  const b = h(xi, yi + 1) + (h(xi + 1, yi + 1) - h(xi, yi + 1)) * u;
  return a + (b - a) * v;
}

/** Blurred copy of the current frame via repeated down/up-sampling (works without canvas filters). */
function blurred(rc: RenderContext, radius: number): HTMLCanvasElement {
  const a = rc.scratch(2);
  const b = rc.scratch(3);
  const k = Math.max(1, radius / 2);
  const sw = Math.max(2, Math.round(rc.w / k));
  const sh = Math.max(2, Math.round(rc.h / k));
  a.ctx.imageSmoothingQuality = 'high';
  a.ctx.drawImage(rc.canvas, 0, 0, sw, sh);
  b.ctx.imageSmoothingQuality = 'high';
  b.ctx.drawImage(a.canvas, 0, 0, sw, sh, 0, 0, Math.max(2, sw >> 1), Math.max(2, sh >> 1));
  a.ctx.clearRect(0, 0, rc.w, rc.h);
  a.ctx.drawImage(b.canvas, 0, 0, Math.max(2, sw >> 1), Math.max(2, sh >> 1), 0, 0, rc.w, rc.h);
  return a.canvas;
}

export const blur: EffectDef = {
  type: 'blur',
  label: '흐림·틸트시프트',
  english: 'Blur / Tilt-shift',
  description: '흐리게 합니다. 틸트시프트로 띠 하나만 선명하게 남기면 미니어처처럼 보여요. 적용 범위와 함께 쓰면 배경만 흐림.',
  category: 'distort',
  params: [
    { key: 'amount', label: '흐림 정도', type: 'range', min: 1, max: 60, step: 1, default: 14 },
    {
      key: 'mode',
      label: '방식',
      type: 'select',
      default: 'all',
      options: [
        { value: 'all', label: '전체' },
        { value: 'tilt', label: '틸트시프트 (가로 띠만 선명)' },
        { value: 'focus', label: '가운데 원만 선명' },
      ],
    },
    { key: 'focusY', label: '선명한 위치', type: 'range', min: 0, max: 100, step: 0.5, default: 55, unit: '%' },
    { key: 'focusSize', label: '선명한 폭', type: 'range', min: 2, max: 80, step: 1, default: 20, unit: '%' },
    { key: 'pulse', label: '초점 숨쉬기', type: 'range', min: 0, max: 100, step: 1, default: 0, group: '모션' },
  ],
  render(rc, p) {
    const { ctx, w, h, s, t } = rc;
    const pulse = num(p, 'pulse') / 100;
    const amt = num(p, 'amount') * s * (1 - pulse * 0.6 * (0.5 + 0.5 * Math.sin(TAU * t)));
    const soft = blurred(rc, amt);
    const mode = str(p, 'mode');
    if (mode === 'all') {
      ctx.drawImage(soft, 0, 0);
      return;
    }
    // keep a sharp band/circle by erasing the blur there before laying it on top
    const m = rc.scratch(4);
    m.ctx.drawImage(soft, 0, 0);
    const fy = (num(p, 'focusY') / 100) * h;
    const fs = (num(p, 'focusSize') / 100) * h;
    m.ctx.globalCompositeOperation = 'destination-out';
    const g =
      mode === 'tilt'
        ? m.ctx.createLinearGradient(0, fy - fs * 1.5, 0, fy + fs * 1.5)
        : m.ctx.createRadialGradient(w / 2, fy, fs * 0.5, w / 2, fy, fs * 1.5);
    if (mode === 'tilt') {
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.33, 'rgba(0,0,0,1)');
      g.addColorStop(0.67, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
    } else {
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
    }
    m.ctx.fillStyle = g;
    m.ctx.fillRect(0, 0, w, h);
    ctx.drawImage(m.canvas, 0, 0);
  },
};

export const zoomBlur: EffectDef = {
  type: 'zoomBlur',
  label: '줌 블러',
  english: 'Zoom Blur',
  description: '한 점을 향해 빨려 들어가는 방사형 잔상. 워프 속도, 충격, 빛의 터널.',
  category: 'distort',
  params: [
    { key: 'cx', label: '중심 가로', type: 'range', min: 0, max: 100, step: 0.5, default: 50, unit: '%' },
    { key: 'cy', label: '중심 세로', type: 'range', min: 0, max: 100, step: 0.5, default: 45, unit: '%' },
    { key: 'strength', label: '세기', type: 'range', min: 0, max: 100, step: 1, default: 40 },
    { key: 'samples', label: '겹침 수', type: 'range', min: 4, max: 32, step: 1, default: 14 },
    { key: 'glow', label: '빛나게 (더하기)', type: 'bool', default: false },
    { key: 'pulse', label: '세기 출렁임', type: 'range', min: 0, max: 100, step: 1, default: 30, group: '모션' },
  ],
  render(rc, p) {
    const { ctx, w, h, t } = rc;
    const src = rc.snapshot();
    const cx = (num(p, 'cx') / 100) * w;
    const cy = (num(p, 'cy') / 100) * h;
    const pulse = num(p, 'pulse') / 100;
    const str0 = (num(p, 'strength') / 100) * 0.35 * (1 - pulse + pulse * (0.5 + 0.5 * Math.sin(TAU * t)));
    const n = num(p, 'samples');
    ctx.globalCompositeOperation = bool(p, 'glow') ? 'lighter' : 'source-over';
    for (let i = 1; i <= n; i++) {
      const k = 1 + (str0 * i) / n;
      ctx.globalAlpha = bool(p, 'glow') ? 0.6 / n : 1 / (i + 1);
      ctx.setTransform(k, 0, 0, k, cx * (1 - k), cy * (1 - k));
      ctx.drawImage(src, 0, 0);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  },
};

export const channelShift: EffectDef = {
  type: 'channelShift',
  label: 'RGB 채널 분리',
  english: 'Channel Shift',
  description: '빨강·초록·파랑 채널을 따로 밀어 색이 어긋난 3D 안경 같은 화면을 만듭니다.',
  category: 'stylize',
  params: [
    { key: 'rx', label: '빨강 가로', type: 'range', min: -80, max: 80, step: 1, default: 14 },
    { key: 'ry', label: '빨강 세로', type: 'range', min: -80, max: 80, step: 1, default: 0 },
    { key: 'bx', label: '파랑 가로', type: 'range', min: -80, max: 80, step: 1, default: -14 },
    { key: 'by', label: '파랑 세로', type: 'range', min: -80, max: 80, step: 1, default: 4 },
    { key: 'wobble', label: '흔들림', type: 'range', min: 0, max: 100, step: 1, default: 30, group: '모션' },
  ],
  render(rc, p) {
    const { ctx, w, h, s, t } = rc;
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const o = new Uint8ClampedArray(d);
    const wob = (num(p, 'wobble') / 100) * Math.sin(TAU * t);
    const rx = Math.round(num(p, 'rx') * s * (1 + wob));
    const ry = Math.round(num(p, 'ry') * s * (1 + wob));
    const bx = Math.round(num(p, 'bx') * s * (1 - wob));
    const by = Math.round(num(p, 'by') * s * (1 - wob));
    for (let y = 0; y < h; y++) {
      const yr = Math.min(h - 1, Math.max(0, y - ry));
      const yb = Math.min(h - 1, Math.max(0, y - by));
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const xr = Math.min(w - 1, Math.max(0, x - rx));
        const xb = Math.min(w - 1, Math.max(0, x - bx));
        d[i] = o[(yr * w + xr) * 4];
        d[i + 2] = o[(yb * w + xb) * 4 + 2];
      }
    }
    ctx.putImageData(img, 0, 0);
  },
};

export const bulge: EffectDef = {
  type: 'bulge',
  label: '볼록·오목 렌즈',
  english: 'Bulge / Pinch',
  description: '한 부분을 렌즈처럼 부풀리거나 빨아들입니다. 눈동자·얼굴·건물이 기묘하게 커져요.',
  category: 'distort',
  params: [
    { key: 'cx', label: '중심 가로', type: 'range', min: 0, max: 100, step: 0.5, default: 50, unit: '%' },
    { key: 'cy', label: '중심 세로', type: 'range', min: 0, max: 100, step: 0.5, default: 45, unit: '%' },
    { key: 'radius', label: '반지름', type: 'range', min: 5, max: 100, step: 1, default: 35, unit: '%' },
    { key: 'strength', label: '세기 (− 오목 / + 볼록)', type: 'range', min: -100, max: 100, step: 1, default: 85 },
    { key: 'breathe', label: '숨쉬기', type: 'range', min: 0, max: 100, step: 1, default: 30, group: '모션' },
  ],
  render(rc, p) {
    const { ctx, w, h, t } = rc;
    const src = ctx.getImageData(0, 0, w, h);
    const out = ctx.createImageData(w, h);
    const S = new Uint32Array(src.data.buffer);
    const D = new Uint32Array(out.data.buffer);
    const cx = (num(p, 'cx') / 100) * w;
    const cy = (num(p, 'cy') / 100) * h;
    const R = (num(p, 'radius') / 100) * Math.min(w, h) * 0.5;
    const br = num(p, 'breathe') / 100;
    const k = (num(p, 'strength') / 100) * (1 - br + br * (0.5 + 0.5 * Math.sin(TAU * t)));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const dx = x - cx;
        const dy = y - cy;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r >= R || r === 0) {
          D[i] = S[i];
          continue;
        }
        const f = r / R;
        // bulge pulls samples toward the centre (magnify); pinch pushes them out
        const m = k >= 0 ? Math.pow(f, 1 + k * 1.5) / f : Math.pow(f, 1 / (1 - k * 0.8)) / f;
        const sx = Math.min(w - 1, Math.max(0, Math.round(cx + dx * m)));
        const sy = Math.min(h - 1, Math.max(0, Math.round(cy + dy * m)));
        D[i] = S[sy * w + sx];
      }
    }
    ctx.putImageData(out, 0, 0);
  },
};

export const liquify: EffectDef = {
  type: 'liquify',
  label: '녹아 흐르기',
  english: 'Liquify',
  description: '노이즈로 화면을 이리저리 밀어 액체 금속처럼 녹아 흐르게 합니다.',
  category: 'distort',
  params: [
    { key: 'amount', label: '세기', type: 'range', min: 0, max: 100, step: 1, default: 50 },
    { key: 'scale', label: '물결 크기', type: 'range', min: 5, max: 100, step: 1, default: 30 },
    { key: 'drip', label: '아래로 흘러내림', type: 'range', min: 0, max: 100, step: 1, default: 30 },
    { key: 'speed', label: '흐르는 속도', type: 'range', min: 0, max: 100, step: 1, default: 35, group: '모션' },
  ],
  render(rc, p) {
    const { ctx, w, h, s, t } = rc;
    const src = ctx.getImageData(0, 0, w, h);
    const out = ctx.createImageData(w, h);
    const S = new Uint32Array(src.data.buffer);
    const D = new Uint32Array(out.data.buffer);
    const amt = (num(p, 'amount') / 100) * 60 * s;
    const cell = num(p, 'scale') * 6 * s;
    const drip = num(p, 'drip') / 100;
    const ph = TAU * t;
    const sp = (num(p, 'speed') / 100) * 1.5;
    // sample the displacement on a coarse grid and interpolate, for speed
    const step = 4;
    const gw = Math.ceil(w / step) + 1;
    const gh = Math.ceil(h / step) + 1;
    const gx = new Float32Array(gw * gh);
    const gy = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++) {
        const x = (i * step) / cell;
        const y = (j * step) / cell;
        const ox = Math.cos(ph) * sp;
        const oy = Math.sin(ph) * sp;
        gx[j * gw + i] = (noise2(x + ox, y + oy, rc.seed) - 0.5) * 2 * amt;
        gy[j * gw + i] = ((noise2(x + 31.7 - ox, y + 11.3 + oy, rc.seed ^ 77) - 0.5) * 2 + drip * 0.8) * amt;
      }
    }
    for (let y = 0; y < h; y++) {
      const j = Math.min(gh - 2, (y / step) | 0);
      const fy = y / step - j;
      for (let x = 0; x < w; x++) {
        const i = Math.min(gw - 2, (x / step) | 0);
        const fx = x / step - i;
        const a = j * gw + i;
        const dx = (gx[a] * (1 - fx) + gx[a + 1] * fx) * (1 - fy) + (gx[a + gw] * (1 - fx) + gx[a + gw + 1] * fx) * fy;
        const dy = (gy[a] * (1 - fx) + gy[a + 1] * fx) * (1 - fy) + (gy[a + gw] * (1 - fx) + gy[a + gw + 1] * fx) * fy;
        const sx = Math.min(w - 1, Math.max(0, Math.round(x - dx)));
        const sy = Math.min(h - 1, Math.max(0, Math.round(y - dy)));
        D[y * w + x] = S[sy * w + sx];
      }
    }
    ctx.putImageData(out, 0, 0);
  },
};

export const glassBlocks: EffectDef = {
  type: 'glassBlocks',
  label: '유리 블록 굴절',
  english: 'Glass Blocks',
  description: '유리 벽돌 너머로 보는 것처럼 칸마다 화면이 어긋나고 확대됩니다.',
  category: 'distort',
  params: [
    { key: 'cols', label: '가로 칸', type: 'range', min: 2, max: 30, step: 1, default: 8 },
    { key: 'rows', label: '세로 칸', type: 'range', min: 2, max: 40, step: 1, default: 10 },
    { key: 'shift', label: '어긋남', type: 'range', min: 0, max: 100, step: 1, default: 40 },
    { key: 'zoom', label: '칸 안 확대', type: 'range', min: 100, max: 200, step: 1, default: 125, unit: '%' },
    { key: 'edge', label: '유리 테두리 빛', type: 'range', min: 0, max: 100, step: 1, default: 45 },
    { key: 'drift', label: '흔들림', type: 'range', min: 0, max: 100, step: 1, default: 30, group: '모션' },
  ],
  render(rc, p) {
    const { ctx, w, h, s, t } = rc;
    const src = rc.snapshot();
    const cols = num(p, 'cols');
    const rows = num(p, 'rows');
    const cw = w / cols;
    const ch = h / rows;
    const z = num(p, 'zoom') / 100;
    const sh = (num(p, 'shift') / 100) * cw * 0.6;
    const drift = num(p, 'drift') / 100;
    const edge = num(p, 'edge') / 100;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const k = r * cols + c;
        const ox = (hash1(k, rc.seed) - 0.5) * 2 * sh + Math.sin(TAU * t + k) * drift * cw * 0.15;
        const oy = (hash1(k, rc.seed ^ 9) - 0.5) * 2 * sh * 0.6;
        const x = c * cw;
        const y = r * ch;
        const sw = cw / z;
        const shh = ch / z;
        ctx.drawImage(src, x + (cw - sw) / 2 + ox, y + (ch - shh) / 2 + oy, sw, shh, x, y, cw, ch);
        if (edge > 0) {
          const g = ctx.createLinearGradient(x, y, x + cw, y + ch);
          g.addColorStop(0, `rgba(255,255,255,${0.35 * edge})`);
          g.addColorStop(0.5, 'rgba(255,255,255,0)');
          g.addColorStop(1, `rgba(0,0,0,${0.35 * edge})`);
          ctx.fillStyle = g;
          ctx.fillRect(x, y, cw, ch);
          ctx.strokeStyle = `rgba(255,255,255,${0.5 * edge})`;
          ctx.lineWidth = Math.max(1, s);
          ctx.strokeRect(x + 0.5, y + 0.5, cw - 1, ch - 1);
        }
      }
    }
  },
};

export const vhs: EffectDef = {
  type: 'vhs',
  label: 'VHS 테이프',
  english: 'VHS Tape',
  description: '색이 옆으로 번지고, 트래킹 띠가 지나가고, 화면이 살짝 떨리는 비디오테이프 질감.',
  category: 'stylize',
  params: [
    { key: 'bleed', label: '색 번짐', type: 'range', min: 0, max: 100, step: 1, default: 45 },
    { key: 'tracking', label: '트래킹 띠', type: 'range', min: 0, max: 100, step: 1, default: 50 },
    { key: 'noise', label: '잡음 줄', type: 'range', min: 0, max: 100, step: 1, default: 35 },
    { key: 'jitter', label: '떨림', type: 'range', min: 0, max: 100, step: 1, default: 30 },
    { key: 'osd', label: 'PLAY 표시', type: 'bool', default: true },
  ],
  render(rc, p) {
    const { ctx, w, h, s, t, time } = rc;
    const src = rc.snapshot();
    // jitter whole lines a little
    const jit = (num(p, 'jitter') / 100) * 6 * s;
    const rng = mulberry32((rc.seed ^ Math.floor(time * 24)) >>> 0);
    if (jit > 0) {
      const band = Math.max(2, Math.round(4 * s));
      for (let y = 0; y < h; y += band) ctx.drawImage(src, 0, y, w, band, (rng() - 0.5) * jit, y, w, band);
    }
    // chroma bleed: a horizontally smeared, saturated copy in 'color' mode
    const bleed = num(p, 'bleed') / 100;
    if (bleed > 0) {
      const sm = rc.scratch(2);
      const sw = Math.max(2, Math.round(w / (6 + bleed * 18)));
      sm.ctx.drawImage(rc.canvas, 0, 0, sw, h);
      ctx.save();
      ctx.globalCompositeOperation = 'color';
      ctx.globalAlpha = 0.5 + bleed * 0.5;
      ctx.drawImage(sm.canvas, 0, 0, sw, h, 6 * s * bleed, 0, w, h);
      ctx.restore();
    }
    // a tracking band rolling down the frame
    const tr = num(p, 'tracking') / 100;
    if (tr > 0) {
      const by = ((t * 1.3) % 1) * (h * 1.2) - h * 0.1;
      const bh = h * 0.05 * (0.5 + tr);
      ctx.drawImage(src, 0, by, w, bh, 25 * s * tr, by, w, bh);
      ctx.fillStyle = `rgba(255,255,255,${0.12 * tr})`;
      ctx.fillRect(0, by, w, bh * 0.3);
    }
    const nz = num(p, 'noise') / 100;
    for (let i = 0; i < 8 * nz; i++) {
      const y = rng() * h;
      ctx.fillStyle = `rgba(255,255,255,${0.15 + rng() * 0.35})`;
      ctx.fillRect(rng() * w * 0.3, y, w * (0.2 + rng() * 0.8), Math.max(1, s * (1 + rng() * 2)));
    }
    if (bool(p, 'osd')) {
      const fs = 34 * s;
      ctx.font = `600 ${fs}px "IBM Plex Mono", monospace`;
      ctx.fillStyle = '#f0f0f0';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 4 * s;
      ctx.textBaseline = 'top';
      ctx.fillText('PLAY ▶', 50 * s, 50 * s);
      const sec = Math.floor(time);
      ctx.textAlign = 'right';
      ctx.fillText(`SP 0:${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`, w - 50 * s, 50 * s);
    }
  },
};

export const hologram: EffectDef = {
  type: 'hologram',
  label: '홀로그램',
  english: 'Hologram',
  description: '청록색 빛으로 바뀌고 주사선이 흐르며 깜빡이는 홀로그램 투사.',
  category: 'stylize',
  params: [
    { key: 'color', label: '색', type: 'color', default: '#5cf2ff' },
    { key: 'lines', label: '주사선', type: 'range', min: 0, max: 100, step: 1, default: 55 },
    { key: 'flicker', label: '깜빡임', type: 'range', min: 0, max: 100, step: 1, default: 35 },
    { key: 'glow', label: '빛 번짐', type: 'range', min: 0, max: 100, step: 1, default: 50 },
    { key: 'dark', label: '배경 어둡게', type: 'bool', default: true },
  ],
  render(rc, p) {
    const { ctx, w, h, s, t, time } = rc;
    const [cr, cg, cb] = hexToRgb(str(p, 'color'));
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const flick = num(p, 'flicker') / 100;
    const f = 1 - flick * 0.5 * hash1(Math.floor(time * 15), rc.seed);
    for (let i = 0; i < d.length; i += 4) {
      const l = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
      const v = Math.pow(l, 1.2) * f;
      d[i] = cr * v;
      d[i + 1] = cg * v;
      d[i + 2] = cb * v;
    }
    ctx.putImageData(img, 0, 0);
    if (!bool(p, 'dark')) {
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.6;
      ctx.drawImage(rc.base, 0, 0, w, h);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    const glow = num(p, 'glow') / 100;
    if (glow > 0) {
      const b = blurred(rc, 18 * s);
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = glow;
      ctx.drawImage(b, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    const ln = num(p, 'lines') / 100;
    if (ln > 0) {
      const gap = Math.max(2, 4 * s);
      const off = (t * 40 * s) % gap;
      ctx.fillStyle = `rgba(0,0,0,${0.5 * ln})`;
      for (let y = -gap + off; y < h; y += gap) ctx.fillRect(0, y, w, Math.max(1, gap / 2));
      const by = ((t * 2) % 1) * h;
      const g = ctx.createLinearGradient(0, by - 60 * s, 0, by + 60 * s);
      g.addColorStop(0, rgba(str(p, 'color'), 0));
      g.addColorStop(0.5, rgba(str(p, 'color'), 0.25 * ln));
      g.addColorStop(1, rgba(str(p, 'color'), 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, by - 60 * s, w, 120 * s);
    }
  },
};

export const posterize: EffectDef = {
  type: 'posterize',
  label: '포스터·팝아트',
  english: 'Posterize',
  description: '색 단계를 몇 개로 줄이고 윤곽선을 그어 실크스크린 포스터처럼 만듭니다.',
  category: 'stylize',
  params: [
    { key: 'levels', label: '색 단계', type: 'range', min: 2, max: 12, step: 1, default: 4 },
    { key: 'saturate', label: '채도 올리기', type: 'range', min: 0, max: 100, step: 1, default: 40 },
    { key: 'outline', label: '검은 윤곽선', type: 'range', min: 0, max: 100, step: 1, default: 40 },
  ],
  render(rc, p) {
    const { ctx, w, h } = rc;
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const L = num(p, 'levels') - 1;
    const sat = 1 + num(p, 'saturate') / 100;
    const g = new Float32Array(w * h);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      const l = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      g[j] = l;
      for (let c = 0; c < 3; c++) {
        const v = Math.min(255, Math.max(0, l + (d[i + c] - l) * sat));
        d[i + c] = Math.round((v / 255) * L) * (255 / L);
      }
    }
    const outline = num(p, 'outline') / 100;
    if (outline > 0) {
      const th = 140 - outline * 100;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          const m = Math.abs(g[i + 1] - g[i - 1]) + Math.abs(g[i + w] - g[i - w]);
          if (m > th) {
            d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 12;
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  },
};

export const solarize: EffectDef = {
  type: 'solarize',
  label: '솔라리제이션·반전',
  english: 'Solarize / Invert',
  description: '밝은 부분만 뒤집거나 전체를 네거티브로 바꿉니다. 필름이 빛에 탄 듯한 초현실 톤.',
  category: 'color',
  params: [
    {
      key: 'mode',
      label: '방식',
      type: 'select',
      default: 'solarize',
      options: [
        { value: 'solarize', label: '솔라리제이션' },
        { value: 'invert', label: '네거티브' },
        { value: 'invertLight', label: '밝기만 뒤집기' },
      ],
    },
    { key: 'threshold', label: '기준 밝기', type: 'range', min: 0, max: 100, step: 1, default: 50 },
    { key: 'mix', label: '적용 양', type: 'range', min: 0, max: 100, step: 1, default: 100, unit: '%' },
  ],
  render(rc, p) {
    const { ctx, w, h } = rc;
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const mode = str(p, 'mode');
    const th = (num(p, 'threshold') / 100) * 255;
    const mix = num(p, 'mix') / 100;
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i];
      let g = d[i + 1];
      let b = d[i + 2];
      if (mode === 'invert') {
        r = 255 - r;
        g = 255 - g;
        b = 255 - b;
      } else if (mode === 'invertLight') {
        const l = r * 0.299 + g * 0.587 + b * 0.114;
        const k = (255 - l) - l;
        r += k;
        g += k;
        b += k;
      } else {
        if (r > th) r = 255 - r;
        if (g > th) g = 255 - g;
        if (b > th) b = 255 - b;
      }
      d[i] += (r - d[i]) * mix;
      d[i + 1] += (g - d[i + 1]) * mix;
      d[i + 2] += (b - d[i + 2]) * mix;
    }
    ctx.putImageData(img, 0, 0);
  },
};

export const particles: EffectDef = {
  type: 'particles',
  label: '파티클 (비·눈·먼지·불씨)',
  english: 'Particles',
  description: '비, 눈, 먼지, 불씨, 반짝이는 가루를 화면에 흩날립니다. 루프가 끊기지 않아요.',
  category: 'atmosphere',
  kind: 'overlay',
  params: [
    {
      key: 'type',
      label: '종류',
      type: 'select',
      default: 'snow',
      options: [
        { value: 'snow', label: '눈' },
        { value: 'rain', label: '비' },
        { value: 'dust', label: '먼지' },
        { value: 'embers', label: '불씨 (위로)' },
        { value: 'sparkle', label: '반짝이 가루' },
        { value: 'ash', label: '검은 재' },
      ],
    },
    { key: 'count', label: '개수', type: 'range', min: 10, max: 1500, step: 10, default: 300 },
    { key: 'size', label: '크기', type: 'range', min: 0.5, max: 16, step: 0.5, default: 6 },
    { key: 'wind', label: '바람 (← →)', type: 'range', min: -100, max: 100, step: 1, default: 15 },
    { key: 'depth', label: '원근 (크기 차이)', type: 'range', min: 0, max: 100, step: 1, default: 60 },
    { key: 'color', label: '색', type: 'color', default: '#ffffff' },
    { key: 'speed', label: '속도 (루프당 바퀴)', type: 'range', min: 1, max: 6, step: 1, default: 1, group: '모션' },
  ],
  render(rc, p) {
    const { ctx, w, h, s, t } = rc;
    const type = str(p, 'type');
    const n = num(p, 'count');
    const size = num(p, 'size') * s;
    const wind = num(p, 'wind') / 100;
    const depth = num(p, 'depth') / 100;
    const color = type === 'embers' ? '#ff7a2a' : type === 'ash' ? '#1a1a1a' : str(p, 'color');
    const laps = num(p, 'speed');
    const up = type === 'embers';
    const rng = mulberry32(rc.seed);
    for (let i = 0; i < n; i++) {
      const z = 1 - depth + depth * rng();
      const x0 = rng();
      const y0 = rng();
      const ph = rng() * TAU;
      const sp = (type === 'rain' ? 3 : type === 'dust' ? 0.25 : 1) * laps * (0.6 + z * 0.6);
      // whole number of wraps per loop keeps the animation seamless
      const lap = Math.max(1, Math.round(sp));
      let y = (y0 + (up ? -1 : 1) * lap * t) % 1;
      if (y < 0) y += 1;
      const sway = type === 'rain' ? 0 : Math.sin(TAU * t * 2 + ph) * 0.01;
      let x = (x0 + wind * lap * t * 0.6 + sway) % 1;
      if (x < 0) x += 1;
      const px = x * w;
      const py = y * h;
      const r = size * z;
      const a = type === 'sparkle' ? 0.4 + 0.6 * Math.pow(0.5 + 0.5 * Math.sin(TAU * t * 3 + ph), 4) : 0.5 + 0.5 * z;
      ctx.fillStyle = rgba(color, a);
      ctx.strokeStyle = rgba(color, a * 0.7);
      if (type === 'rain') {
        ctx.lineWidth = Math.max(0.5, r * 0.35);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px - wind * r * 6, py - r * 9);
        ctx.stroke();
      } else if (type === 'embers') {
        ctx.shadowColor = color;
        ctx.shadowBlur = r * 3;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(0.8, r * 0.45), 0, TAU);
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.beginPath();
        ctx.arc(px, py, Math.max(0.8, type === 'dust' ? r * 0.35 : r * 0.6), 0, TAU);
        ctx.fill();
      }
    }
  },
};

export const fog: EffectDef = {
  type: 'fog',
  label: '안개',
  english: 'Fog',
  description: '천천히 흘러가는 안개를 겹칩니다. 아래쪽에만 깔거나 화면 전체를 덮을 수 있어요.',
  category: 'atmosphere',
  kind: 'overlay',
  params: [
    { key: 'density', label: '짙기', type: 'range', min: 0, max: 100, step: 1, default: 55 },
    { key: 'height', label: '깔리는 높이', type: 'range', min: 10, max: 100, step: 1, default: 55, unit: '%' },
    { key: 'scale', label: '덩어리 크기', type: 'range', min: 10, max: 100, step: 1, default: 45 },
    { key: 'color', label: '색', type: 'color', default: '#dfe6ee' },
    { key: 'drift', label: '흘러가는 속도', type: 'range', min: 0, max: 100, step: 1, default: 40, group: '모션' },
  ],
  render(rc, p) {
    const { ctx, w, h, t } = rc;
    // build the fog at low resolution and scale up: it's soft by nature
    const fw = 160;
    const fh = Math.max(2, Math.round((160 * h) / w));
    const f = rc.scratch(2);
    const img = f.ctx.createImageData(fw, fh);
    const d = img.data;
    const [r, g, b] = hexToRgb(str(p, 'color'));
    const dens = num(p, 'density') / 100;
    const top = 1 - num(p, 'height') / 100;
    const cell = 6 + num(p, 'scale') * 0.5;
    const drift = (num(p, 'drift') / 100) * 2;
    const ox = Math.cos(TAU * t) * drift * 2;
    const oy = Math.sin(TAU * t) * drift;
    for (let y = 0; y < fh; y++) {
      const vy = y / fh;
      const fall = smoothstep(top - 0.15, top + 0.25, vy);
      for (let x = 0; x < fw; x++) {
        const n1 = noise2(x / cell + ox, y / cell + oy, rc.seed);
        const n2 = noise2(x / (cell * 0.45) - ox * 1.6, y / (cell * 0.45), rc.seed ^ 3);
        const v = Math.max(0, n1 * 0.7 + n2 * 0.5 - 0.35) * 1.6;
        const i = (y * fw + x) * 4;
        d[i] = r;
        d[i + 1] = g;
        d[i + 2] = b;
        d[i + 3] = Math.min(255, v * fall * dens * 255);
      }
    }
    f.ctx.putImageData(img, 0, 0);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(f.canvas, 0, 0, fw, fh, 0, 0, w, h);
  },
};

export const lightning: EffectDef = {
  type: 'lightning',
  label: '번개',
  english: 'Lightning',
  description: '갈라지는 번개가 내리치고 화면이 번쩍입니다. 불꽃·전기·에너지 장면.',
  category: 'atmosphere',
  kind: 'overlay',
  defaultBlend: 'screen',
  params: [
    { key: 'strikes', label: '루프당 번개 수', type: 'range', min: 1, max: 8, step: 1, default: 3 },
    { key: 'branches', label: '가지', type: 'range', min: 0, max: 100, step: 1, default: 55 },
    { key: 'width', label: '굵기', type: 'range', min: 0.5, max: 8, step: 0.5, default: 2.5 },
    { key: 'color', label: '색', type: 'color', default: '#bfe3ff' },
    { key: 'flash', label: '화면 번쩍임', type: 'range', min: 0, max: 100, step: 1, default: 45 },
    { key: 'targetX', label: '떨어지는 위치', type: 'range', min: 0, max: 100, step: 1, default: 50, unit: '%' },
  ],
  render(rc, p) {
    const { ctx, w, h, s, t } = rc;
    const n = num(p, 'strikes');
    const slot = Math.floor(t * n);
    const local = t * n - slot;
    // each strike lives for the first 35% of its slot, fading fast
    if (local > 0.35) return;
    const life = 1 - local / 0.35;
    const color = str(p, 'color');
    const rng = mulberry32((rc.seed ^ Math.imul(slot + 1, 2654435761)) >>> 0);
    const bolt = (x: number, y: number, len: number, ang: number, width: number, depth: number) => {
      let cx = x;
      let cy = y;
      const segs = 14;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      for (let i = 0; i < segs; i++) {
        ang += (rng() - 0.5) * 0.9;
        cx += Math.cos(ang) * (len / segs);
        cy += Math.sin(ang) * (len / segs);
        ctx.lineTo(cx, cy);
        if (depth < 2 && rng() < (num(p, 'branches') / 100) * 0.18) {
          const bx = cx;
          const by = cy;
          ctx.stroke();
          bolt(bx, by, len * 0.45, ang + (rng() - 0.5) * 1.6, width * 0.55, depth + 1);
          ctx.beginPath();
          ctx.moveTo(bx, by);
        }
      }
      ctx.lineWidth = width;
      ctx.stroke();
    };
    ctx.strokeStyle = rgba(color, life);
    ctx.shadowColor = color;
    ctx.shadowBlur = 18 * s;
    ctx.lineCap = 'round';
    const tx = (num(p, 'targetX') / 100) * w + (rng() - 0.5) * w * 0.3;
    bolt(tx + (rng() - 0.5) * w * 0.2, -10, h * 0.95, Math.PI / 2, num(p, 'width') * s, 0);
    ctx.shadowBlur = 0;
    const flash = (num(p, 'flash') / 100) * Math.pow(life, 3);
    if (flash > 0) {
      ctx.fillStyle = rgba(color, flash * 0.6);
      ctx.fillRect(0, 0, w, h);
    }
  },
};
