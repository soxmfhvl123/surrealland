import { hash1, mulberry32, TAU } from '../random';
import type { EffectDef, RenderContext, Rect } from '../types';
import { bool, mono, num, rect, rectPx, rgba, str } from './util';

/** Salient points (strong local contrast) inside an area, from the small analysis image. */
const pointCache = new Map<string, { x: number; y: number }[]>();
function salientPoints(rc: RenderContext, area: Rect, count: number): { x: number; y: number }[] {
  const key = `${rc.baseKey}|${area.x},${area.y},${area.w},${area.h}|${count}|${rc.seed}`;
  const hit = pointCache.get(key);
  if (hit) return hit;
  const A = rc.analysis();
  const aw = A.width;
  const ah = A.height;
  const d = A.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, aw, ah).data;
  const g = new Float32Array(aw * ah);
  for (let i = 0; i < aw * ah; i++) g[i] = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11;
  const rng = mulberry32(rc.seed ^ 0x51ed);
  const x0 = Math.max(1, Math.floor(area.x * aw));
  const y0 = Math.max(1, Math.floor(area.y * ah));
  const x1 = Math.min(aw - 1, Math.ceil((area.x + area.w) * aw));
  const y1 = Math.min(ah - 1, Math.ceil((area.y + area.h) * ah));
  const cand: { x: number; y: number; s: number }[] = [];
  for (let y = y0; y < y1; y += 2)
    for (let x = x0; x < x1; x += 2) {
      const i = y * aw + x;
      const sc = Math.abs(g[i + 1] - g[i - 1]) + Math.abs(g[i + aw] - g[i - aw]);
      cand.push({ x, y, s: sc + rng() * 30 });
    }
  cand.sort((a, b) => b.s - a.s);
  const md2 = (Math.sqrt(((x1 - x0) * (y1 - y0)) / Math.max(1, count)) * 0.5) ** 2;
  const out: { x: number; y: number }[] = [];
  for (const c of cand) {
    if (out.length >= count) break;
    if (out.every((q) => (q.x - c.x) ** 2 + (q.y - c.y) ** 2 >= md2)) out.push(c);
  }
  const pts = out.map((q) => ({ x: q.x / aw, y: q.y / ah }));
  if (pointCache.size > 60) pointCache.clear();
  pointCache.set(key, pts);
  return pts;
}

const PALETTES: Record<string, [string, string]> = {
  redgreen: ['#ff3b3b', '#39ff6a'],
  white: ['#ffffff', '#ffffff'],
  cyan: ['#3dd6ff', '#ffffff'],
  yellow: ['#ffd23f', '#ff8a3d'],
};

export const plexus: EffectDef = {
  type: 'plexus',
  label: '점 연결망',
  english: 'Point Network',
  description: '사진의 또렷한 지점마다 점을 찍고 가는 선으로 이어요. 데이터로 주석 단 듯한 연결망이 살짝씩 떨려요.',
  category: 'data',
  kind: 'overlay',
  params: [
    { key: 'area', label: '찾을 영역', type: 'rect', default: { x: 0.02, y: 0.02, w: 0.96, h: 0.96 }, color: '#39ff6a' },
    { key: 'count', label: '점 개수', type: 'range', min: 10, max: 300, step: 1, default: 90 },
    { key: 'link', label: '이을 거리', type: 'range', min: 2, max: 40, step: 0.5, default: 12, unit: '%' },
    { key: 'palette', label: '색', type: 'select', default: 'redgreen', options: [
      { value: 'redgreen', label: '빨강·초록' },
      { value: 'white', label: '흰색' },
      { value: 'cyan', label: '청록' },
      { value: 'yellow', label: '노랑' },
    ] },
    { key: 'dot', label: '점 크기', type: 'range', min: 0.5, max: 8, step: 0.5, default: 4 },
    { key: 'line', label: '선 진하기', type: 'range', min: 0, max: 100, step: 1, default: 75 },
    { key: 'fill', label: '삼각형 채우기', type: 'range', min: 0, max: 100, step: 1, default: 0 },
    { key: 'labels', label: '좌표 글자', type: 'bool', default: false },
    { key: 'jitter', label: '떨림', type: 'range', min: 0, max: 100, step: 1, default: 30, group: '모션' },
    { key: 'build', label: '하나씩 나타나기', type: 'bool', default: false, group: '모션' },
  ],
  render(rc, p) {
    const { ctx, w, h, s, t, seed } = rc;
    const pts0 = salientPoints(rc, rect(p, 'area'), Math.round(num(p, 'count')));
    const jit = (num(p, 'jitter') / 100) * 4 * s;
    const shown = bool(p, 'build') ? Math.ceil(pts0.length * Math.min(1, t * 1.4)) : pts0.length;
    const pts = pts0.slice(0, shown).map((q, i) => ({
      x: q.x * w + Math.sin(t * TAU * 3 + i * 1.3) * jit,
      y: q.y * h + Math.cos(t * TAU * 2 + i * 0.7) * jit,
    }));
    const maxD = (num(p, 'link') / 100) * Math.min(w, h);
    const [c1, c2] = PALETTES[str(p, 'palette')] ?? PALETTES.redgreen;
    const la = num(p, 'line') / 100;
    const fill = num(p, 'fill') / 100;
    ctx.save();
    ctx.lineWidth = Math.max(0.7, 1.1 * s);
    for (let i = 0; i < pts.length; i++) {
      const near: number[] = [];
      for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
        if (d > maxD) continue;
        near.push(j);
        const flick = 0.6 + 0.4 * Math.sin(t * TAU * 4 + i + j);
        ctx.strokeStyle = `rgba(255,255,255,${la * (0.35 + 0.65 * (1 - d / maxD)) * flick})`;
        ctx.beginPath();
        ctx.moveTo(pts[i].x, pts[i].y);
        ctx.lineTo(pts[j].x, pts[j].y);
        ctx.stroke();
      }
      if (fill > 0 && near.length >= 2) {
        ctx.fillStyle = rgba(hash1(i, seed) < 0.5 ? c1 : c2, 0.12 * fill);
        ctx.beginPath();
        ctx.moveTo(pts[i].x, pts[i].y);
        ctx.lineTo(pts[near[0]].x, pts[near[0]].y);
        ctx.lineTo(pts[near[1]].x, pts[near[1]].y);
        ctx.closePath();
        ctx.fill();
      }
    }
    const r = num(p, 'dot') * s;
    ctx.font = mono(9 * s);
    pts.forEach((q, i) => {
      const c = hash1(i, seed + 9) < 0.6 ? c1 : c2;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(q.x, q.y, r, 0, TAU);
      ctx.fill();
      if (bool(p, 'labels') && hash1(i, seed + 4) < 0.35) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText(`${(q.x / w).toFixed(3)},${(q.y / h).toFixed(3)}`, q.x + r + 3 * s, q.y - r);
      }
    });
    ctx.restore();
  },
};

export const redact: EffectDef = {
  type: 'redact',
  label: '빈 카드',
  english: 'Blank Cards',
  description: '흰 종이 카드나 검은 가림 막대가 사진 곳곳을 덮어요. 하나씩 나타나거나 박자에 맞춰 자리를 바꿔요.',
  category: 'data',
  kind: 'overlay',
  params: [
    { key: 'area', label: '놓을 영역', type: 'rect', default: { x: 0.03, y: 0.03, w: 0.94, h: 0.94 }, color: '#ffffff' },
    { key: 'style', label: '모양', type: 'select', default: 'card', options: [
      { value: 'card', label: '흰 카드' },
      { value: 'bar', label: '검은 가림 막대' },
      { value: 'mixed', label: '섞어서' },
    ] },
    { key: 'count', label: '개수', type: 'range', min: 1, max: 40, step: 1, default: 9 },
    { key: 'minSize', label: '작은 크기', type: 'range', min: 2, max: 40, step: 0.5, default: 6, unit: '%' },
    { key: 'maxSize', label: '큰 크기', type: 'range', min: 2, max: 60, step: 0.5, default: 22, unit: '%' },
    { key: 'shadow', label: '그림자', type: 'range', min: 0, max: 100, step: 1, default: 30 },
    { key: 'pop', label: '하나씩 나타나기', type: 'bool', default: true, group: '모션' },
    { key: 'jumps', label: '자리 바꾸기 (루프당)', type: 'range', min: 0, max: 12, step: 1, default: 0, group: '모션' },
  ],
  render(rc, p) {
    const { ctx, w, h, s, t, seed } = rc;
    const a = rectPx(rect(p, 'area'), w, h);
    const n = Math.round(num(p, 'count'));
    const jumps = Math.round(num(p, 'jumps'));
    const beat = jumps ? Math.floor(t * jumps) : 0;
    const lo = num(p, 'minSize') / 100;
    const hi = Math.max(lo, num(p, 'maxSize') / 100);
    const style = str(p, 'style');
    const sh = num(p, 'shadow') / 100;
    for (let i = 0; i < n; i++) {
      if (bool(p, 'pop') && t < (i / n) * 0.7) continue;
      const k = i * 7 + beat * 131;
      const bar = style === 'bar' || (style === 'mixed' && hash1(k, seed + 1) < 0.4);
      const cw = (lo + (hi - lo) * hash1(k, seed + 2)) * w;
      const ch = bar ? cw * (0.1 + 0.15 * hash1(k, seed + 3)) : cw * (0.6 + 0.9 * hash1(k, seed + 3));
      const x = a.x + hash1(k, seed + 4) * Math.max(1, a.w - cw);
      const y = a.y + hash1(k, seed + 5) * Math.max(1, a.h - ch);
      ctx.save();
      if (sh > 0 && !bar) {
        ctx.shadowColor = `rgba(0,0,0,${0.45 * sh})`;
        ctx.shadowBlur = 14 * s;
        ctx.shadowOffsetY = 5 * s;
      }
      ctx.fillStyle = bar ? '#050505' : '#f6f5f1';
      ctx.fillRect(x, y, cw, ch);
      ctx.restore();
      if (!bar && hash1(k, seed + 6) < 0.35) {
        // a few faint printed lines on some cards
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        const lines = 2 + Math.floor(hash1(k, seed + 7) * 4);
        for (let j = 0; j < lines; j++) ctx.fillRect(x + cw * 0.1, y + ch * (0.15 + j * 0.12), cw * (0.35 + 0.45 * hash1(k + j, seed + 8)), Math.max(1, 1.2 * s));
      }
    }
  },
};

export const zoomInsets: EffectDef = {
  type: 'zoomInsets',
  label: '확대 인셋',
  english: 'Zoom Callouts',
  description: '사진 속 몇 곳을 확대해서 옆 상자에 보여주고, 가는 선과 좌표로 이어요. 위성 지도·조사 보고서 같은 느낌.',
  category: 'data',
  kind: 'overlay',
  params: [
    { key: 'area', label: '확대할 곳을 고를 영역', type: 'rect', default: { x: 0.2, y: 0.2, w: 0.6, h: 0.6 }, color: '#ffd23f' },
    { key: 'count', label: '개수', type: 'range', min: 1, max: 6, step: 1, default: 3 },
    { key: 'zoom', label: '배율', type: 'range', min: 1.5, max: 10, step: 0.5, default: 4 },
    { key: 'box', label: '상자 크기', type: 'range', min: 8, max: 40, step: 0.5, default: 22, unit: '%' },
    { key: 'color', label: '선 색', type: 'color', default: '#ffffff' },
    { key: 'labels', label: '좌표 글자', type: 'bool', default: true },
    { key: 'motion', label: '움직임', type: 'select', default: 'scan', group: '모션', options: [
      { value: 'scan', label: '천천히 훑기' },
      { value: 'step', label: '툭툭 옮기기' },
      { value: 'none', label: '정지' },
    ] },
  ],
  render(rc, p) {
    const { ctx, w, h, s, t, seed } = rc;
    const area = rect(p, 'area');
    const n = Math.round(num(p, 'count'));
    const zoom = num(p, 'zoom');
    const B = (num(p, 'box') / 100) * Math.min(w, h);
    const col = str(p, 'color');
    const motion = str(p, 'motion');
    const pts = salientPoints(rc, area, Math.max(n * 3, 8));
    const snap = rc.snapshot();
    ctx.save();
    ctx.lineWidth = Math.max(0.8, 1.1 * s);
    ctx.font = mono(10 * s);
    const step = motion === 'step' ? Math.floor(t * 4) : 0;
    const drift = motion === 'scan' ? 0.03 : 0;
    const targets = Array.from({ length: n }, (_, i) => {
      const q = pts[(i * 3 + step * 2) % Math.max(1, pts.length)] ?? { x: 0.5, y: 0.5 };
      const tx = (q.x + Math.sin(t * TAU + i * 2) * drift) * w;
      const ty = (q.y + Math.cos(t * TAU + i * 1.3) * drift) * h;
      return { tx, ty, left: tx > w / 2 };
    });
    // boxes stack in a column on the side opposite their target, ordered top to bottom
    const slots = { true: targets.filter((q) => q.left).sort((a, b) => a.ty - b.ty), false: targets.filter((q) => !q.left).sort((a, b) => a.ty - b.ty) };
    for (let i = 0; i < n; i++) {
      const { tx, ty, left } = targets[i];
      const col0 = slots[`${left}`];
      const rank = col0.indexOf(targets[i]);
      const m = col0.length;
      const srcW = B / zoom;
      const bx = left ? w * 0.04 : w * 0.96 - B;
      const by = m === 1 ? Math.min(h - B - h * 0.06, Math.max(h * 0.06, ty - B / 2)) : h * 0.06 + (rank * (h * 0.88 - B)) / (m - 1);
      ctx.strokeStyle = col;
      ctx.strokeRect(tx - srcW / 2, ty - srcW / 2, srcW, srcW);
      ctx.beginPath();
      ctx.moveTo(left ? tx - srcW / 2 : tx + srcW / 2, ty);
      ctx.lineTo(left ? bx + B : bx, by + B / 2);
      ctx.stroke();
      ctx.save();
      ctx.beginPath();
      ctx.rect(bx, by, B, B);
      ctx.clip();
      ctx.imageSmoothingEnabled = zoom < 6;
      ctx.drawImage(snap, tx - srcW / 2, ty - srcW / 2, srcW, srcW, bx, by, B, B);
      ctx.restore();
      ctx.lineWidth = Math.max(1, 1.6 * s);
      ctx.strokeRect(bx, by, B, B);
      ctx.lineWidth = Math.max(0.8, 1.1 * s);
      if (bool(p, 'labels')) {
        const lat = (40 + hash1(i, seed) * 10 + (ty / h) * 2).toFixed(4);
        const lon = (12 + hash1(i, seed + 1) * 8 + (tx / w) * 2).toFixed(4);
        ctx.fillStyle = col;
        ctx.fillText(`N ${lat}°  E ${lon}°`, bx, by + B + 13 * s);
        ctx.fillText(`×${zoom.toFixed(1)}  #${String(i + 1).padStart(2, '0')}`, bx, by - 5 * s);
      }
    }
    ctx.restore();
  },
};

export const viewfinder: EffectDef = {
  type: 'viewfinder',
  label: '뷰파인더',
  english: 'Camera Viewfinder',
  description: '카메라 화면처럼 십자선·초점 괄호·ISO/셔터 숫자·REC 타임코드가 얹혀요.',
  category: 'data',
  kind: 'overlay',
  params: [
    { key: 'color', label: '색', type: 'color', default: '#ffd23f' },
    { key: 'cross', label: '가운데 십자선', type: 'select', default: 'full', options: [
      { value: 'full', label: '화면 끝까지' },
      { value: 'small', label: '작게' },
      { value: 'none', label: '없음' },
    ] },
    { key: 'grid', label: '3분할 격자', type: 'bool', default: false },
    { key: 'info', label: '숫자 정보', type: 'bool', default: true },
    { key: 'rec', label: 'REC 표시', type: 'bool', default: true },
    { key: 'focus', label: '초점 상자', type: 'range', min: 0, max: 50, step: 1, default: 16, unit: '%' },
    { key: 'meter', label: '노출계', type: 'bool', default: true },
  ],
  render(rc, p) {
    const { ctx, w, h, s, t, time } = rc;
    const col = str(p, 'color');
    const m = Math.min(w, h) * 0.045;
    ctx.save();
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = Math.max(1, 1.4 * s);
    const L = m * 1.4;
    for (const [x, y, dx, dy] of [
      [m, m, 1, 1],
      [w - m, m, -1, 1],
      [m, h - m, 1, -1],
      [w - m, h - m, -1, -1],
    ]) {
      ctx.beginPath();
      ctx.moveTo(x + dx * L, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + dy * L);
      ctx.stroke();
    }
    const cross = str(p, 'cross');
    ctx.lineWidth = Math.max(0.6, 0.8 * s);
    if (cross === 'full') {
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.moveTo(m, h / 2);
      ctx.lineTo(w - m, h / 2);
      ctx.moveTo(w / 2, m);
      ctx.lineTo(w / 2, h - m);
      ctx.stroke();
      for (let k = -10; k <= 10; k++) {
        const len = k % 5 === 0 ? 7 : 3.5;
        ctx.beginPath();
        ctx.moveTo(w / 2 + k * w * 0.04, h / 2 - len * s);
        ctx.lineTo(w / 2 + k * w * 0.04, h / 2 + len * s);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else if (cross === 'small') {
      const c = 14 * s;
      ctx.beginPath();
      ctx.moveTo(w / 2 - c, h / 2);
      ctx.lineTo(w / 2 + c, h / 2);
      ctx.moveTo(w / 2, h / 2 - c);
      ctx.lineTo(w / 2, h / 2 + c);
      ctx.stroke();
    }
    if (bool(p, 'grid')) {
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      for (const f of [1 / 3, 2 / 3]) {
        ctx.moveTo(w * f, 0);
        ctx.lineTo(w * f, h);
        ctx.moveTo(0, h * f);
        ctx.lineTo(w, h * f);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // focus box hunts for a moment, then locks
    const fz = (num(p, 'focus') / 100) * Math.min(w, h);
    if (fz > 0) {
      const lock = Math.min(1, t * 3);
      const fx = w / 2 + (1 - lock) * Math.sin(t * 40) * fz * 0.4;
      const fy = h / 2 + (1 - lock) * Math.cos(t * 33) * fz * 0.3;
      const fs = fz * (1.2 - 0.2 * lock);
      const b = fs * 0.22;
      ctx.lineWidth = Math.max(1, 1.6 * s);
      ctx.strokeStyle = lock >= 1 ? '#39ff6a' : col;
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        const cx = fx + (sx * fs) / 2;
        const cy = fy + (sy * fs) / 2;
        ctx.beginPath();
        ctx.moveTo(cx - sx * b, cy);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx, cy - sy * b);
        ctx.stroke();
      }
      ctx.strokeStyle = col;
    }
    ctx.font = mono(13 * s, 600);
    ctx.textBaseline = 'top';
    const pad = m + 10 * s;
    if (bool(p, 'info')) {
      ctx.textAlign = 'left';
      ctx.fillText('ISO 800   1/125   F2.8', pad, pad);
      ctx.textAlign = 'right';
      ctx.fillText('4K  24P   ▮▮▮▯', w - pad, pad);
      ctx.textBaseline = 'bottom';
      ctx.fillText(`${String(Math.floor(time / 60)).padStart(2, '0')}:${String(Math.floor(time % 60)).padStart(2, '0')}:${String(Math.floor((time % 1) * 24)).padStart(2, '0')}  TC`, w - pad, h - pad);
    }
    if (bool(p, 'rec')) {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      if (Math.floor(t * 12) % 2 === 0) {
        ctx.fillStyle = '#ff3b3b';
        ctx.beginPath();
        ctx.arc(pad + 6 * s, h - pad - 8 * s, 5.5 * s, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = col;
      ctx.fillText('REC', pad + 17 * s, h - pad);
    }
    if (bool(p, 'meter')) {
      const mw = w * 0.36;
      const mx = w / 2 - mw / 2;
      const my = h - pad - 6 * s;
      ctx.lineWidth = Math.max(0.8, 1 * s);
      ctx.beginPath();
      for (let k = 0; k <= 12; k++) {
        const x = mx + (k / 12) * mw;
        const len = k % 4 === 0 ? 8 : 4;
        ctx.moveTo(x, my);
        ctx.lineTo(x, my - len * s);
      }
      ctx.stroke();
      const v = 0.5 + 0.12 * Math.sin(t * TAU * 2);
      ctx.beginPath();
      ctx.moveTo(mx + v * mw, my + 2 * s);
      ctx.lineTo(mx + v * mw - 4 * s, my + 9 * s);
      ctx.lineTo(mx + v * mw + 4 * s, my + 9 * s);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  },
};

const RAINBOW = ['#ff3b3b', '#ff9f43', '#ffd23f', '#7cff6b', '#3dd6ff', '#4d7cff', '#c77dff'];

export const dashboard: EffectDef = {
  type: 'dashboard',
  label: '데이터 대시보드',
  english: 'Data Dashboard',
  description: '막대그래프·무지개 막대·히스토그램·파형·숫자 열·작은 썸네일 패널이 화면 가장자리에 빼곡히 붙어 움직여요.',
  category: 'data',
  kind: 'overlay',
  params: [
    { key: 'layout', label: '배치', type: 'select', default: 'frame', options: [
      { value: 'frame', label: '가장자리 둘레' },
      { value: 'side', label: '양옆 기둥' },
      { value: 'grid', label: '화면 가득' },
    ] },
    { key: 'cells', label: '칸 수', type: 'range', min: 3, max: 10, step: 1, default: 6 },
    { key: 'palette', label: '색', type: 'select', default: 'rainbow', options: [
      { value: 'rainbow', label: '무지개' },
      { value: 'mono', label: '흰색' },
      { value: 'green', label: '터미널 초록' },
    ] },
    { key: 'panel', label: '패널 바탕 진하기', type: 'range', min: 0, max: 100, step: 1, default: 75 },
    { key: 'fill', label: '빈칸 비율', type: 'range', min: 0, max: 80, step: 1, default: 25 },
    { key: 'speed', label: '움직임 속도', type: 'range', min: 0, max: 8, step: 1, default: 2, group: '모션' },
  ],
  render(rc, p) {
    const { ctx, w, h, s, t, seed } = rc;
    const n = Math.round(num(p, 'cells'));
    const cols = n;
    const rows = Math.round((n * h) / w);
    const cw = w / cols;
    const chh = h / rows;
    const layout = str(p, 'layout');
    const pal = str(p, 'palette');
    const color = (i: number) => (pal === 'mono' ? '#f2f2f2' : pal === 'green' ? '#39ff6a' : RAINBOW[i % RAINBOW.length]);
    const skip = num(p, 'fill') / 100;
    const sp = Math.round(num(p, 'speed'));
    const snap = rc.snapshot();
    const panelA = num(p, 'panel') / 100;
    ctx.save();
    ctx.font = mono(8.5 * s);
    ctx.textBaseline = 'top';
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const edge = r === 0 || c === 0 || r === rows - 1 || c === cols - 1;
        if (layout === 'frame' && !edge) continue;
        if (layout === 'side' && c !== 0 && c !== cols - 1) continue;
        const k = r * 97 + c * 13;
        if (hash1(k, seed) < skip) continue;
        const x = c * cw + 2 * s;
        const y = r * chh + 2 * s;
        const pw = cw - 4 * s;
        const ph = chh - 4 * s;
        ctx.fillStyle = `rgba(4,6,8,${panelA})`;
        ctx.fillRect(x, y, pw, ph);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = Math.max(0.6, 0.7 * s);
        ctx.strokeRect(x, y, pw, ph);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText(`CH_${String(k % 100).padStart(2, '0')}  ${['SPECTRUM', 'FLUX', 'DEPTH', 'SIGNAL', 'INDEX', 'LOAD'][k % 6]}`, x + 4 * s, y + 3 * s);
        const ix = x + 4 * s;
        const iy = y + 15 * s;
        const iw = pw - 8 * s;
        const ih = ph - 19 * s;
        if (ih < 6) continue;
        const kind = Math.floor(hash1(k, seed + 1) * 6);
        const ph0 = t * TAU * sp;
        if (kind === 0) {
          const bars = 14;
          for (let b = 0; b < bars; b++) {
            const v = 0.15 + 0.85 * Math.abs(Math.sin(b * 1.7 + ph0 + k));
            ctx.fillStyle = color(b);
            ctx.fillRect(ix + (b / bars) * iw, iy + ih * (1 - v), (iw / bars) * 0.7, ih * v);
          }
        } else if (kind === 1) {
          for (let b = 0; b < 7; b++) {
            ctx.fillStyle = pal === 'rainbow' ? RAINBOW[b] : rgba(color(0), 0.3 + b * 0.1);
            ctx.fillRect(ix + (b / 7) * iw, iy, iw / 7 + 0.5, ih * 0.7);
          }
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          ctx.fillRect(ix + ((Math.sin(ph0) * 0.5 + 0.5) * iw) | 0, iy + ih * 0.72, Math.max(1, s), ih * 0.28);
        } else if (kind === 2) {
          ctx.strokeStyle = color(k);
          ctx.beginPath();
          for (let u = 0; u <= 60; u++) {
            const v = 0.5 + 0.4 * Math.sin(u * 0.35 + ph0 * 2 + k) * Math.cos(u * 0.13 - ph0);
            const px = ix + (u / 60) * iw;
            const py = iy + ih * (1 - v);
            if (u) ctx.lineTo(px, py);
            else ctx.moveTo(px, py);
          }
          ctx.stroke();
        } else if (kind === 3) {
          ctx.fillStyle = color(k + 2);
          const lines = Math.floor(ih / (10 * s));
          for (let li = 0; li < lines; li++) {
            const v = hash1(li + Math.floor(t * sp * 8), k + seed);
            ctx.fillText(`0x${Math.floor(v * 0xffffff).toString(16).padStart(6, '0')}  ${(v * 100).toFixed(2)}`, ix, iy + li * 10 * s);
          }
        } else if (kind === 4) {
          // a tiny crop of the picture itself, like a monitor thumbnail
          const sx = hash1(k, seed + 2) * (w - iw * 2);
          const sy = hash1(k, seed + 3) * (h - ih * 2);
          ctx.drawImage(snap, sx, sy, iw * 2, ih * 2, ix, iy, iw, ih);
          ctx.strokeStyle = color(k);
          ctx.strokeRect(ix + iw * 0.3, iy + ih * 0.3, iw * 0.3, ih * 0.3);
        } else {
          for (let d = 0; d < 40; d++) {
            const px = ix + hash1(d, k) * iw;
            const py = iy + ih * (0.5 + 0.45 * Math.sin(hash1(d, k + 1) * 6 + ph0));
            ctx.fillStyle = color(d);
            ctx.fillRect(px, py, 2 * s, 2 * s);
          }
        }
      }
    ctx.restore();
  },
};
