import { hash1, TAU } from '../random';
import type { EffectDef } from '../types';
import { hexToRgb, num, rect, rectPx, str } from './util';

const MATERIALS: Record<string, { base: string; hi: string; lo: string }> = {
  red: { base: '#e2321f', hi: '#ffd2c4', lo: '#5a0a05' },
  chrome: { base: '#b9c0c8', hi: '#ffffff', lo: '#1c1f24' },
  white: { base: '#e9e7e2', hi: '#ffffff', lo: '#77736c' },
  glass: { base: 'rgba(210,235,255,0.35)', hi: '#ffffff', lo: 'rgba(40,70,100,0.4)' },
};

export const helix: EffectDef = {
  type: 'helix',
  label: '3D 나선',
  english: 'Helix',
  description: '빨간 튜브·크롬 조각·유리로 된 거대한 나선이 풍경 위에 서서 천천히 돌아가요.',
  category: 'composite',
  kind: 'overlay',
  params: [
    { key: 'cx', label: '가로 위치', type: 'range', min: 0, max: 100, step: 0.5, default: 35, unit: '%' },
    { key: 'top', label: '위 끝', type: 'range', min: -10, max: 90, step: 0.5, default: 18, unit: '%' },
    { key: 'bottom', label: '아래 끝', type: 'range', min: 10, max: 110, step: 0.5, default: 88, unit: '%' },
    { key: 'radius', label: '나선 폭', type: 'range', min: 2, max: 40, step: 0.5, default: 9, unit: '%' },
    { key: 'turns', label: '감긴 횟수', type: 'range', min: 1, max: 12, step: 0.5, default: 4 },
    { key: 'thick', label: '굵기', type: 'range', min: 0.5, max: 12, step: 0.25, default: 3.5, unit: '%' },
    { key: 'material', label: '재질', type: 'select', default: 'red', options: [
      { value: 'red', label: '빨간 튜브' },
      { value: 'chrome', label: '크롬 조각' },
      { value: 'white', label: '하얀 세라믹' },
      { value: 'glass', label: '유리' },
    ] },
    { key: 'tilt', label: '내려다보는 각도', type: 'range', min: 0, max: 100, step: 1, default: 30 },
    { key: 'shadow', label: '그림자', type: 'range', min: 0, max: 100, step: 1, default: 40 },
    { key: 'spin', label: '회전 (루프당)', type: 'range', min: -4, max: 4, step: 1, default: 1, group: '모션' },
  ],
  render(rc, p) {
    const { ctx, w, h, t, seed } = rc;
    const cx = (num(p, 'cx') / 100) * w;
    const y0 = (num(p, 'top') / 100) * h;
    const y1 = (num(p, 'bottom') / 100) * h;
    const R = (num(p, 'radius') / 100) * w;
    const turns = num(p, 'turns');
    const th = (num(p, 'thick') / 100) * w;
    const tilt = num(p, 'tilt') / 100;
    const mat = MATERIALS[str(p, 'material')] ?? MATERIALS.red;
    const shards = str(p, 'material') === 'chrome';
    const spin = t * TAU * Math.round(num(p, 'spin'));
    const N = Math.round(120 * turns);
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const a = u * turns * TAU + spin;
      pts.push({ x: cx + Math.cos(a) * R, y: y0 + u * (y1 - y0) + Math.sin(a) * R * tilt * 0.5, z: Math.sin(a), i });
    }
    const sh = num(p, 'shadow') / 100;
    if (sh > 0) {
      const g = ctx.createRadialGradient(cx, y1 + R * tilt * 0.5, 0, cx, y1 + R * tilt * 0.5, R * 1.6);
      g.addColorStop(0, `rgba(0,0,0,${0.5 * sh})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(cx, y1 + R * tilt * 0.5, R * 1.6, R * 0.35, 0, 0, TAU);
      ctx.fill();
    }
    // back half first so the tube passes behind itself
    pts.sort((a, b) => a.z - b.z);
    for (const q of pts) {
      const depth = 0.55 + 0.45 * ((q.z + 1) / 2);
      const r = th * 0.5 * (0.85 + 0.15 * depth);
      if (shards) {
        if (q.i % 2) continue;
        const k = q.i * 7;
        const sz = r * (0.7 + 0.9 * hash1(k, seed));
        const rot = hash1(k, seed + 1) * TAU + spin * 0.3;
        const jx = (hash1(k, seed + 2) - 0.5) * r * 1.2;
        const jy = (hash1(k, seed + 3) - 0.5) * r * 1.2;
        ctx.save();
        ctx.translate(q.x + jx, q.y + jy);
        ctx.rotate(rot);
        const g = ctx.createLinearGradient(-sz, -sz, sz, sz);
        const v = hash1(k, seed + 4);
        g.addColorStop(0, v < 0.5 ? mat.hi : mat.lo);
        g.addColorStop(0.5, mat.base);
        g.addColorStop(1, v < 0.5 ? mat.lo : mat.hi);
        ctx.fillStyle = g;
        ctx.globalAlpha = 0.6 + 0.4 * depth;
        ctx.beginPath();
        const sides = 3 + Math.floor(hash1(k, seed + 5) * 3);
        for (let j = 0; j < sides; j++) {
          const aa = (j / sides) * TAU;
          const rr = sz * (0.6 + 0.4 * hash1(k + j, seed + 6));
          if (j) ctx.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr);
          else ctx.moveTo(Math.cos(aa) * rr, Math.sin(aa) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        continue;
      }
      const g = ctx.createRadialGradient(q.x - r * 0.35, q.y - r * 0.4, r * 0.05, q.x, q.y, r);
      g.addColorStop(0, mat.hi);
      g.addColorStop(0.35, mat.base);
      g.addColorStop(1, mat.lo);
      ctx.fillStyle = g;
      ctx.globalAlpha = 0.5 + 0.5 * depth;
      ctx.beginPath();
      ctx.arc(q.x, q.y, r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  },
};

const TINTS: Record<string, [number, number, number]> = {
  silver: [225, 230, 236],
  mercury: [205, 220, 240],
  gold: [245, 205, 130],
  black: [150, 155, 165],
};

export const chromeSkin: EffectDef = {
  type: 'chromeSkin',
  label: '액체 크롬',
  english: 'Liquid Chrome',
  description: '사진을 거울 같은 액체 금속으로 바꾸고 표면이 일렁여요. 물체 선택과 같이 쓰면 그 물체만 크롬이 돼요.',
  category: 'stylize',
  params: [
    { key: 'tint', label: '금속 색', type: 'select', default: 'silver', options: [
      { value: 'silver', label: '은색 크롬' },
      { value: 'mercury', label: '수은' },
      { value: 'gold', label: '금' },
      { value: 'black', label: '검은 크롬' },
    ] },
    { key: 'contrast', label: '반사 대비', type: 'range', min: 0, max: 100, step: 1, default: 65 },
    { key: 'detail', label: '원본 결 남기기', type: 'range', min: 0, max: 100, step: 1, default: 35 },
    { key: 'ripple', label: '일렁임', type: 'range', min: 0, max: 100, step: 1, default: 40, group: '모션' },
    { key: 'speed', label: '빠르기', type: 'range', min: 1, max: 6, step: 1, default: 2, group: '모션' },
  ],
  render(rc, p) {
    const { ctx, w, h, s, t } = rc;
    const src = rc.snapshot().getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
    const out = ctx.getImageData(0, 0, w, h);
    const o = out.data;
    const [tr, tg, tb] = TINTS[str(p, 'tint')] ?? TINTS.silver;
    const con = 0.6 + (num(p, 'contrast') / 100) * 2.2;
    const detail = num(p, 'detail') / 100;
    const rip = (num(p, 'ripple') / 100) * 6 * s;
    const ph = t * TAU * Math.round(num(p, 'speed'));
    const Lm = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) Lm[i] = (src[i * 4] * 0.3 + src[i * 4 + 1] * 0.59 + src[i * 4 + 2] * 0.11) / 255;
    const lum = (x: number, y: number) => Lm[(y < 0 ? 0 : y >= h ? h - 1 : y | 0) * w + (x < 0 ? 0 : x >= w ? w - 1 : x | 0)];
    const d = Math.max(1, Math.round(2 * s));
    const black = str(p, 'tint') === 'black';
    for (let y = 0; y < h; y++) {
      const wy = Math.sin(y * 0.03 / s + ph) * rip;
      for (let x = 0; x < w; x++) {
        const wx = Math.sin(x * 0.025 / s + ph * 0.7 + y * 0.01 / s) * rip;
        const sx = x + wy;
        const sy = y + wx;
        const L = lum(sx, sy);
        // surface slope from the brightness gradient, as if brightness were height
        const nx = lum(sx + d, sy) - lum(sx - d, sy);
        const ny = lum(sx, sy + d) - lum(sx, sy - d);
        // reflect a sky-above / dark-ground environment
        let v = 0.5 - ny * 4 * con + (L - 0.5) * 0.9 + nx * 1.5;
        v = 0.5 + (v - 0.5) * con;
        const env = v < 0.45 ? Math.pow(Math.max(0, v / 0.45), 1.6) * 0.45 : 0.45 + (1 - Math.pow(Math.max(0, 1 - (v - 0.45) / 0.55), 2)) * 0.55;
        const spec = Math.pow(Math.max(0, 1 - Math.hypot(nx * 6 - 0.5, ny * 6 + 0.6)), 8);
        let k = Math.min(1.15, env + spec * 0.9);
        k = k * (1 - detail) + (k * 0.6 + L * 0.4) * detail;
        if (black) k = k * k * 0.85;
        const i = (y * w + x) * 4;
        o[i] = tr * k;
        o[i + 1] = tg * k;
        o[i + 2] = tb * k;
      }
    }
    ctx.putImageData(out, 0, 0);
  },
};

const SPECTRA: Record<string, string[]> = {
  rainbow: ['#ff3b3b', '#ff9f43', '#ffd23f', '#7cff6b', '#3dd6ff', '#4d7cff', '#c77dff'],
  pinkblue: ['#ff4d9d', '#ff8ad8', '#c77dff', '#4d7cff', '#3dd6ff'],
  fire: ['#ffffff', '#ffd23f', '#ff9f43', '#ff3b3b', '#7a0d0d'],
  ice: ['#ffffff', '#cfe8ff', '#7fbfff', '#3d6bff'],
};

export const spectralDrip: EffectDef = {
  type: 'spectralDrip',
  label: '빛 흘러내림',
  english: 'Spectral Drip',
  description: '창이나 물체의 아래 가장자리에서 무지개·네온빛 줄기가 아래로 길게 흘러내려요.',
  category: 'distort',
  kind: 'overlay',
  params: [
    { key: 'area', label: '흘러내릴 곳 (아래 가장자리에서 시작)', type: 'rect', default: { x: 0.25, y: 0.12, w: 0.5, h: 0.2 }, color: '#ff4d9d' },
    { key: 'length', label: '길이', type: 'range', min: 5, max: 100, step: 1, default: 45, unit: '%' },
    { key: 'palette', label: '색', type: 'select', default: 'pinkblue', options: [
      { value: 'source', label: '사진 색 그대로' },
      { value: 'rainbow', label: '무지개' },
      { value: 'pinkblue', label: '분홍·파랑' },
      { value: 'fire', label: '불빛' },
      { value: 'ice', label: '얼음' },
    ] },
    { key: 'density', label: '줄기 촘촘함', type: 'range', min: 5, max: 100, step: 1, default: 60 },
    { key: 'glow', label: '빛나게', type: 'range', min: 0, max: 100, step: 1, default: 50 },
    { key: 'grow', label: '자라나기', type: 'select', default: 'breathe', group: '모션', options: [
      { value: 'breathe', label: '늘었다 줄었다' },
      { value: 'grow', label: '점점 길어짐' },
      { value: 'none', label: '정지' },
    ] },
  ],
  render(rc, p) {
    const { ctx, w, h, s, t, seed } = rc;
    const a = rectPx(rect(p, 'area'), w, h);
    const y0 = a.y + a.h;
    const L = (num(p, 'length') / 100) * h;
    const pal = str(p, 'palette');
    const colors = SPECTRA[pal];
    const snap = rc.snapshot().getContext('2d', { willReadFrequently: true })!.getImageData(a.x, Math.max(0, y0 - 2), a.w, 1).data;
    const dens = num(p, 'density') / 100;
    const step = Math.max(1, Math.round((6 - 5 * dens) * s));
    const grow = str(p, 'grow');
    const g0 = grow === 'grow' ? Math.min(1, t * 1.3) : grow === 'breathe' ? 0.75 + 0.25 * Math.sin(t * TAU) : 1;
    const glow = num(p, 'glow') / 100;
    // streaks go to a scratch layer; glow = that layer shrunk and blown back up (no per-stroke shadow blur)
    const layer = rc.scratch(0);
    const lc = layer.ctx;
    for (let x = 0; x < a.w; x += step) {
      const k = Math.floor(x / step);
      const len = L * g0 * (0.25 + 0.75 * Math.pow(hash1(k, seed), 0.7)) * (0.85 + 0.15 * Math.sin(t * TAU * 2 + k * 0.4));
      const [r, g, b] = colors
        ? hexToRgb(colors[Math.floor(((x / a.w) * colors.length * 1.999 + k * 0.13) % colors.length)])
        : [snap[x * 4], snap[x * 4 + 1], snap[x * 4 + 2]];
      const grad = lc.createLinearGradient(0, y0, 0, y0 + len);
      grad.addColorStop(0, `rgba(${r},${g},${b},0.85)`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      lc.fillStyle = grad;
      lc.fillRect(a.x + x, y0, Math.max(1, step * 0.7), len);
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (glow > 0) {
      const small = rc.scratch(1);
      const k = 8;
      small.ctx.drawImage(layer.canvas, 0, 0, w / k, h / k);
      ctx.globalAlpha = glow;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(small.canvas, 0, 0, w / k, h / k, 0, 0, w, h);
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(layer.canvas, 0, 0);
    ctx.restore();
  },
};

export const flashLook: EffectDef = {
  type: 'flashLook',
  label: '다이렉트 플래시',
  english: 'Direct Flash',
  description: '밤에 카메라 플래시를 정면으로 터뜨린 사진처럼: 가운데는 하얗게 밝고 주변은 깊게 어두워져요.',
  category: 'color',
  params: [
    { key: 'cx', label: '빛 가로', type: 'range', min: 0, max: 100, step: 0.5, default: 50, unit: '%' },
    { key: 'cy', label: '빛 세로', type: 'range', min: 0, max: 100, step: 0.5, default: 55, unit: '%' },
    { key: 'reach', label: '빛이 닿는 범위', type: 'range', min: 10, max: 120, step: 1, default: 55, unit: '%' },
    { key: 'power', label: '플래시 세기', type: 'range', min: 0, max: 100, step: 1, default: 60 },
    { key: 'dark', label: '배경 어둡게', type: 'range', min: 0, max: 100, step: 1, default: 65 },
    { key: 'temp', label: '색온도 (− 차갑게 / + 따뜻하게)', type: 'range', min: -100, max: 100, step: 1, default: -15 },
    { key: 'flicker', label: '플래시 깜빡임', type: 'range', min: 0, max: 100, step: 1, default: 0, group: '모션' },
  ],
  render(rc, p) {
    const { ctx, w, h, t } = rc;
    const cx = (num(p, 'cx') / 100) * w;
    const cy = (num(p, 'cy') / 100) * h;
    const R = (num(p, 'reach') / 100) * Math.hypot(w, h) * 0.5;
    const fl = num(p, 'flicker') / 100;
    const pulse = fl > 0 && (t * 4) % 1 < 0.08 ? 1 + fl : 1;
    const power = (num(p, 'power') / 100) * pulse;
    const dark = num(p, 'dark') / 100;
    // background falls into darkness
    const v = ctx.createRadialGradient(cx, cy, R * 0.25, cx, cy, R * 1.4);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, `rgba(0,0,0,${0.9 * dark})`);
    ctx.save();
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
    // hot, slightly blown-out centre
    const temp = num(p, 'temp') / 100;
    const tint = temp >= 0 ? [255, 236 - 30 * temp, 210 - 80 * temp] : [225 + 30 * (1 + temp), 238, 255];
    const hot = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    hot.addColorStop(0, `rgba(${tint[0] | 0},${tint[1] | 0},${tint[2] | 0},${0.55 * power})`);
    hot.addColorStop(0.5, `rgba(${tint[0] | 0},${tint[1] | 0},${tint[2] | 0},${0.18 * power})`);
    hot.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = hot;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'screen';
    const spec = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.6);
    spec.addColorStop(0, `rgba(255,255,255,${0.22 * power})`);
    spec.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = spec;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  },
};
