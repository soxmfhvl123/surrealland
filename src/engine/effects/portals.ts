import { easeInOut, fbm1, hash1, mulberry32, TAU } from '../random';
import type { EffectDef } from '../types';
import { num, pickSource, rect, rectPx, rgba, str, vnoise2 } from './util';

/** Bright daytime sky used when a hole or door has nothing else to show. */
function paintSky(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number, t: number) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#3f7fd6');
  g.addColorStop(0.65, '#8fbef0');
  g.addColorStop(1, '#dfeefc');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  const rng = mulberry32(seed);
  for (let i = 0; i < 26; i++) {
    const cx = x + ((rng() + t * 0.04) % 1) * w;
    const cy = y + (0.25 + rng() * 0.75) * h;
    const r = (0.04 + rng() * 0.09) * Math.max(w, h);
    const c = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    c.addColorStop(0, 'rgba(255,255,255,0.85)');
    c.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 1.6, r * 0.7, 0, 0, TAU);
    ctx.fill();
  }
}

const revealOptions = [
  { value: 'sky', label: '파란 하늘' },
  { value: 'flip', label: '뒤집힌 세상' },
  { value: 'image', label: '고른 사진' },
  { value: 'white', label: '하얀 빛' },
  { value: 'black', label: '검은 공간' },
];

/** Fill a w×h box at (x, y) with what a portal shows. */
function paintReveal(ctx: CanvasRenderingContext2D, kind: string, src: CanvasImageSource, snap: HTMLCanvasElement, x: number, y: number, w: number, h: number, W: number, H: number, seed: number, t: number) {
  if (kind === 'sky') paintSky(ctx, x, y, w, h, seed, t);
  else if (kind === 'white') {
    ctx.fillStyle = '#fbfbf6';
    ctx.fillRect(x, y, w, h);
  } else if (kind === 'black') {
    ctx.fillStyle = '#050506';
    ctx.fillRect(x, y, w, h);
  } else if (kind === 'flip') {
    ctx.save();
    ctx.translate(0, H);
    ctx.scale(1, -1);
    ctx.drawImage(snap, 0, 0, W, H);
    ctx.restore();
  } else ctx.drawImage(src, 0, 0, W, H);
}

export const burnHole: EffectDef = {
  type: 'burnHole',
  label: '찢긴 하늘',
  english: 'Burning Tear',
  description: '사진에 불타는 가장자리의 구멍이 열리고, 그 안에 다른 세상(하늘·뒤집힌 풍경·다른 사진)이 보여요.',
  category: 'composite',
  kind: 'overlay',
  params: [
    { key: 'area', label: '구멍 자리', type: 'rect', default: { x: 0.08, y: 0.06, w: 0.84, h: 0.34 }, color: '#ff8a3d' },
    { key: 'reveal', label: '구멍 안', type: 'select', default: 'sky', options: revealOptions },
    { key: 'image', label: '안에 보일 사진', type: 'image', default: 'base' },
    { key: 'shape', label: '모양', type: 'select', default: 'tear', options: [
      { value: 'tear', label: '가로로 찢김' },
      { value: 'burn', label: '둥글게 탐' },
    ] },
    { key: 'rough', label: '가장자리 거칠기', type: 'range', min: 0, max: 100, step: 1, default: 60 },
    { key: 'ember', label: '불씨 테두리', type: 'range', min: 0, max: 100, step: 1, default: 55 },
    { key: 'emberColor', label: '불씨 색', type: 'color', default: '#ffb347' },
    { key: 'sparks', label: '불티', type: 'range', min: 0, max: 100, step: 1, default: 35 },
    { key: 'motion', label: '움직임', type: 'select', default: 'open', group: '모션', options: [
      { value: 'open', label: '점점 열림' },
      { value: 'breathe', label: '숨쉬기 (루프)' },
      { value: 'none', label: '정지' },
    ] },
  ],
  render(rc, p) {
    const { ctx, w, h, s, t, seed } = rc;
    const a = rectPx(rect(p, 'area'), w, h);
    const cx = a.x + a.w / 2;
    const cy = a.y + a.h / 2;
    const motion = str(p, 'motion');
    const open = motion === 'open' ? easeInOut(Math.min(1, t / 0.75)) : motion === 'breathe' ? 0.85 + 0.15 * Math.sin(t * TAU) : 1;
    if (open <= 0.01) return;
    const rough = num(p, 'rough') / 100;
    const tear = str(p, 'shape') === 'tear';

    // outline in polar form around the box centre; the tear version is flattened and spikier
    const N = 220;
    const pts: [number, number][] = [];
    for (let i = 0; i < N; i++) {
      const th = (i / N) * TAU;
      const big = fbm1(i * 0.09 + 3, seed);
      const fine = hash1(i, seed + 7);
      const r = 1 - rough * (0.28 * big + (tear ? 0.22 : 0.1) * fine);
      const flick = 1 + 0.015 * Math.sin(t * TAU * 6 + i);
      pts.push([cx + Math.cos(th) * (a.w / 2) * r * open * flick, cy + Math.sin(th) * (a.h / 2) * r * open * (tear ? 0.9 : 1) * flick]);
    }
    const path = () => {
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
    };

    const snap = rc.snapshot();
    ctx.save();
    path();
    ctx.clip();
    paintReveal(ctx, str(p, 'reveal'), pickSource(rc, str(p, 'image')), snap, 0, 0, w, h, w, h, seed, t);
    ctx.restore();

    // charred rim → glowing ember → hot inner edge
    const ember = num(p, 'ember') / 100;
    if (ember > 0) {
      const col = str(p, 'emberColor');
      ctx.save();
      ctx.lineJoin = 'round';
      path();
      ctx.strokeStyle = 'rgba(20,10,5,0.85)';
      ctx.lineWidth = (6 + 14 * ember) * s;
      ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowColor = col;
      ctx.shadowBlur = (12 + 40 * ember) * s;
      ctx.strokeStyle = rgba(col, 0.9);
      ctx.lineWidth = (2 + 6 * ember) * s;
      path();
      ctx.stroke();
      ctx.shadowBlur = (4 + 10 * ember) * s;
      ctx.strokeStyle = 'rgba(255,245,200,0.85)';
      ctx.lineWidth = (0.8 + 1.5 * ember) * s;
      path();
      ctx.stroke();
      ctx.restore();
    }

    const sparks = Math.round(num(p, 'sparks') * 0.8);
    if (sparks > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < sparks; i++) {
        const k = Math.floor(hash1(i, seed + 3) * N);
        const life = (t * 3 + hash1(i, seed + 4)) % 1;
        const [px, py] = pts[k];
        const x = px + (hash1(i, seed + 5) - 0.5) * 40 * s * life;
        const y = py - life * (40 + 80 * hash1(i, seed + 6)) * s;
        ctx.fillStyle = `rgba(255,${Math.round(150 + 90 * (1 - life))},80,${(1 - life) * 0.9})`;
        ctx.beginPath();
        ctx.arc(x, y, (1 + 2 * (1 - life)) * s, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  },
};

export const lightDoor: EffectDef = {
  type: 'lightDoor',
  label: '빛의 문',
  english: 'Glowing Doorway',
  description: '풍경 한가운데 하얗게 빛나는 문(사각형)이 서 있어요. 안에 사람 실루엣, 바닥에 빛 반사까지.',
  category: 'composite',
  kind: 'overlay',
  params: [
    { key: 'area', label: '문 자리', type: 'rect', default: { x: 0.38, y: 0.3, w: 0.24, h: 0.48 }, color: '#ffffff' },
    { key: 'shape', label: '모양', type: 'select', default: 'rect', options: [
      { value: 'rect', label: '네모' },
      { value: 'arch', label: '아치' },
    ] },
    { key: 'color', label: '빛 색', type: 'color', default: '#f4f8ff' },
    { key: 'glow', label: '번짐', type: 'range', min: 0, max: 100, step: 1, default: 60 },
    { key: 'figure', label: '사람 실루엣', type: 'select', default: 'one', options: [
      { value: 'none', label: '없음' },
      { value: 'one', label: '한 명' },
    ] },
    { key: 'inside', label: '문 안', type: 'select', default: 'white', options: revealOptions },
    { key: 'image', label: '안에 보일 사진', type: 'image', default: 'base' },
    { key: 'floor', label: '바닥 반사', type: 'range', min: 0, max: 100, step: 1, default: 55 },
    { key: 'flicker', label: '깜빡임', type: 'range', min: 0, max: 100, step: 1, default: 15, group: '모션' },
  ],
  render(rc, p) {
    const { ctx, w, h, s, t, seed } = rc;
    const a = rectPx(rect(p, 'area'), w, h);
    const col = str(p, 'color');
    const glow = num(p, 'glow') / 100;
    const fl = 1 - (num(p, 'flicker') / 100) * 0.35 * (0.5 + 0.5 * Math.sin(t * TAU * 7) * Math.sin(t * TAU * 3.1 + 1));
    const arch = str(p, 'shape') === 'arch';
    const door = () => {
      ctx.beginPath();
      if (arch) {
        const r = a.w / 2;
        ctx.moveTo(a.x, a.y + a.h);
        ctx.lineTo(a.x, a.y + r);
        ctx.arc(a.x + r, a.y + r, r, Math.PI, 0);
        ctx.lineTo(a.x + a.w, a.y + a.h);
        ctx.closePath();
      } else ctx.rect(a.x, a.y, a.w, a.h);
    };

    // light spilling on the ground and its streaky reflection
    const floor = num(p, 'floor') / 100;
    if (floor > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const fy = a.y + a.h;
      const g = ctx.createRadialGradient(a.x + a.w / 2, fy, 0, a.x + a.w / 2, fy, a.w * 2.2);
      g.addColorStop(0, rgba(col, 0.55 * floor * fl));
      g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(a.x + a.w / 2, fy, a.w * 2.2, a.w * 0.45, 0, 0, TAU);
      ctx.fill();
      const rg = ctx.createLinearGradient(0, fy, 0, fy + a.h * 0.8);
      rg.addColorStop(0, rgba(col, 0.5 * floor * fl));
      rg.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = rg;
      for (let i = 0; i < 18; i++) {
        const xx = a.x + (i / 18) * a.w + Math.sin(t * TAU * 2 + i) * 2 * s;
        ctx.fillRect(xx, fy, a.w / 22, a.h * 0.8 * (0.6 + 0.4 * hash1(i, seed)));
      }
      ctx.restore();
    }

    // bloom around the opening: a wide radial haze plus a rectangular halo of widening strokes
    if (glow > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const R = Math.max(a.w, a.h) * (0.8 + glow);
      const haze = ctx.createRadialGradient(a.x + a.w / 2, a.y + a.h / 2, 0, a.x + a.w / 2, a.y + a.h / 2, R);
      haze.addColorStop(0, rgba(col, 0.45 * glow * fl));
      haze.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = haze;
      ctx.fillRect(a.x + a.w / 2 - R, a.y + a.h / 2 - R, R * 2, R * 2);
      const steps = 10;
      const reach = Math.min(a.w, a.h) * 0.35 * (0.4 + glow);
      for (let k = steps; k >= 1; k--) {
        ctx.lineWidth = (reach * k) / steps;
        ctx.strokeStyle = rgba(col, (0.11 * glow * fl) / Math.sqrt(k));
        door();
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.save();
    door();
    ctx.clip();
    const inside = str(p, 'inside');
    if (inside === 'white') {
      const g = ctx.createLinearGradient(0, a.y, 0, a.y + a.h);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, col);
      ctx.fillStyle = g;
      ctx.fillRect(a.x, a.y, a.w, a.h);
    } else paintReveal(ctx, inside, pickSource(rc, str(p, 'image')), rc.snapshot(), 0, 0, w, h, w, h, seed, t);
    // the figure: dark core fading into the light at the feet
    if (str(p, 'figure') === 'one') {
      const fx = a.x + a.w / 2;
      const H = a.h * 0.46;
      const top = a.y + a.h - H;
      const body = ctx.createLinearGradient(0, top, 0, top + H);
      body.addColorStop(0, 'rgba(38,42,50,0.92)');
      body.addColorStop(0.7, 'rgba(60,66,78,0.8)');
      body.addColorStop(1, 'rgba(150,158,170,0.2)');
      ctx.fillStyle = body;
      const u = H / 100; // figure drawn on a 100-unit-tall grid
      ctx.beginPath();
      ctx.ellipse(fx, top + 6 * u, 4.6 * u, 5.8 * u, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(fx - 2 * u, top + 11 * u);
      ctx.lineTo(fx - 10.5 * u, top + 15 * u);
      ctx.lineTo(fx - 12 * u, top + 44 * u);
      ctx.lineTo(fx - 9.5 * u, top + 46 * u);
      ctx.lineTo(fx - 8 * u, top + 28 * u);
      ctx.lineTo(fx - 7.5 * u, top + 52 * u);
      ctx.lineTo(fx - 6.5 * u, top + 100 * u);
      ctx.lineTo(fx - 1.5 * u, top + 100 * u);
      ctx.lineTo(fx, top + 58 * u);
      ctx.lineTo(fx + 1.5 * u, top + 100 * u);
      ctx.lineTo(fx + 6.5 * u, top + 100 * u);
      ctx.lineTo(fx + 7.5 * u, top + 52 * u);
      ctx.lineTo(fx + 8 * u, top + 28 * u);
      ctx.lineTo(fx + 9.5 * u, top + 46 * u);
      ctx.lineTo(fx + 12 * u, top + 44 * u);
      ctx.lineTo(fx + 10.5 * u, top + 15 * u);
      ctx.lineTo(fx + 2 * u, top + 11 * u);
      ctx.closePath();
      ctx.fill();
    }
    // inner falloff so the edges burn whiter than the middle
    const edge = ctx.createRadialGradient(a.x + a.w / 2, a.y + a.h / 2, Math.min(a.w, a.h) * 0.2, a.x + a.w / 2, a.y + a.h / 2, Math.max(a.w, a.h) * 0.75);
    edge.addColorStop(0, 'rgba(255,255,255,0)');
    edge.addColorStop(1, rgba(col, 0.55 * fl));
    ctx.fillStyle = edge;
    ctx.fillRect(a.x, a.y, a.w, a.h);
    ctx.restore();
  },
};

export const lightBeam: EffectDef = {
  type: 'lightBeam',
  label: '빛기둥',
  english: 'Light Beam',
  description: '하늘(구름 천장)에서 한 줄기 빛이 내려와 땅이나 사람을 비춰요. 먼지가 빛 속에서 반짝여요.',
  category: 'atmosphere',
  kind: 'overlay',
  params: [
    { key: 'x', label: '가로 위치', type: 'range', min: 0, max: 100, step: 0.5, default: 50, unit: '%' },
    { key: 'top', label: '시작 높이', type: 'range', min: -20, max: 80, step: 0.5, default: 0, unit: '%' },
    { key: 'bottom', label: '닿는 높이', type: 'range', min: 20, max: 100, step: 0.5, default: 88, unit: '%' },
    { key: 'width', label: '굵기', type: 'range', min: 1, max: 40, step: 0.5, default: 7, unit: '%' },
    { key: 'spread', label: '아래로 퍼짐', type: 'range', min: 0, max: 300, step: 1, default: 60, unit: '%' },
    { key: 'tilt', label: '기울기 (도)', type: 'range', min: -40, max: 40, step: 1, default: 0 },
    { key: 'color', label: '빛 색', type: 'color', default: '#eef4ff' },
    { key: 'intensity', label: '밝기', type: 'range', min: 0, max: 100, step: 1, default: 75 },
    { key: 'dust', label: '먼지', type: 'range', min: 0, max: 100, step: 1, default: 40 },
    { key: 'pool', label: '바닥 빛', type: 'range', min: 0, max: 100, step: 1, default: 60 },
    { key: 'flicker', label: '일렁임', type: 'range', min: 0, max: 100, step: 1, default: 20, group: '모션' },
  ],
  render(rc, p) {
    const { ctx, w, h, s, t, seed } = rc;
    const col = str(p, 'color');
    const I = (num(p, 'intensity') / 100) * (1 - (num(p, 'flicker') / 100) * 0.3 * (0.5 + 0.5 * Math.sin(t * TAU * 5) * Math.cos(t * TAU * 2)));
    const x = (num(p, 'x') / 100) * w;
    const y0 = (num(p, 'top') / 100) * h;
    const y1 = (num(p, 'bottom') / 100) * h;
    const bw = (num(p, 'width') / 100) * w;
    const bw2 = bw * (1 + num(p, 'spread') / 100);
    const tilt = Math.tan((num(p, 'tilt') * Math.PI) / 180) * (y1 - y0);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // three nested trapezoids: wide haze, beam body, hot core
    for (const [k, alpha] of [
      [2.6, 0.12],
      [1, 0.35],
      [0.25, 0.6],
    ] as const) {
      const g = ctx.createLinearGradient(x - bw2 * k, 0, x + bw2 * k, 0);
      g.addColorStop(0, rgba(col, 0));
      g.addColorStop(0.5, rgba(col, alpha * I));
      g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - (bw * k) / 2, y0);
      ctx.lineTo(x + (bw * k) / 2, y0);
      ctx.lineTo(x + tilt + (bw2 * k) / 2, y1);
      ctx.lineTo(x + tilt - (bw2 * k) / 2, y1);
      ctx.closePath();
      ctx.fill();
    }
    // vertical fade so the beam emerges from the ceiling
    ctx.globalCompositeOperation = 'destination-out';
    const fade = ctx.createLinearGradient(0, y0, 0, y0 + (y1 - y0) * 0.25);
    fade.addColorStop(0, 'rgba(0,0,0,0.6)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, y0, w, (y1 - y0) * 0.25);
    ctx.globalCompositeOperation = 'lighter';

    const pool = num(p, 'pool') / 100;
    if (pool > 0) {
      const px = x + tilt;
      const g = ctx.createRadialGradient(px, y1, 0, px, y1, bw2 * 2.2);
      g.addColorStop(0, rgba(col, 0.8 * pool * I));
      g.addColorStop(0.3, rgba(col, 0.35 * pool * I));
      g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(px, y1, bw2 * 2.2, bw2 * 0.5, 0, 0, TAU);
      ctx.fill();
    }
    const dust = Math.round(num(p, 'dust') * 1.5);
    for (let i = 0; i < dust; i++) {
      const u = (hash1(i, seed) + t * (0.2 + hash1(i, seed + 1) * 0.3)) % 1;
      const yy = y0 + u * (y1 - y0);
      const wAt = bw + (bw2 - bw) * u;
      const xx = x + tilt * u + (hash1(i, seed + 2) - 0.5) * wAt * 0.9 + Math.sin(t * TAU * 2 + i) * 3 * s;
      const tw = 0.5 + 0.5 * Math.sin(t * TAU * 4 + i * 1.7);
      ctx.fillStyle = rgba(col, 0.8 * tw * I);
      ctx.beginPath();
      ctx.arc(xx, yy, (0.6 + 1.4 * hash1(i, seed + 3)) * s, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  },
};

export const reflectPool: EffectDef = {
  type: 'reflectPool',
  label: '반사 웅덩이',
  english: 'Reflection Pool',
  description: '땅에 검은 물웅덩이나 수은 웅덩이가 생겨 위쪽 하늘·풍경을 거꾸로 비춰요. 물결도 일렁여요.',
  category: 'composite',
  kind: 'overlay',
  params: [
    { key: 'area', label: '웅덩이 자리', type: 'rect', default: { x: 0.12, y: 0.66, w: 0.76, h: 0.16 }, color: '#7fd1ff' },
    { key: 'shape', label: '모양', type: 'select', default: 'blob', options: [
      { value: 'blob', label: '자연스러운 웅덩이' },
      { value: 'ellipse', label: '타원' },
      { value: 'rect', label: '네모 (수조)' },
    ] },
    { key: 'liquid', label: '물 종류', type: 'select', default: 'dark', options: [
      { value: 'dark', label: '검은 물' },
      { value: 'clear', label: '맑은 물' },
      { value: 'mercury', label: '수은 (크롬)' },
    ] },
    { key: 'from', label: '비칠 것', type: 'select', default: 'sky', options: [
      { value: 'sky', label: '하늘 (화면 위쪽)' },
      { value: 'above', label: '바로 위 풍경' },
    ] },
    { key: 'mirror', label: '비출 높이', type: 'range', min: 5, max: 100, step: 1, default: 60, unit: '%' },
    { key: 'ripple', label: '물결', type: 'range', min: 0, max: 100, step: 1, default: 35 },
    { key: 'rim', label: '가장자리 빛', type: 'range', min: 0, max: 100, step: 1, default: 40 },
  ],
  render(rc, p) {
    const { ctx, w, h, s, t, seed } = rc;
    const a = rectPx(rect(p, 'area'), w, h);
    const shape = str(p, 'shape');
    const path = () => {
      ctx.beginPath();
      if (shape === 'rect') ctx.rect(a.x, a.y, a.w, a.h);
      else if (shape === 'ellipse') ctx.ellipse(a.x + a.w / 2, a.y + a.h / 2, a.w / 2, a.h / 2, 0, 0, TAU);
      else {
        const N = 90;
        for (let i = 0; i <= N; i++) {
          const th = (i / N) * TAU;
          const r = 0.7 + 0.22 * vnoise2(Math.cos(th) * 1.4 + 5, Math.sin(th) * 1.4 + 5, seed) + 0.08 * vnoise2(Math.cos(th) * 5 + 9, Math.sin(th) * 5 + 9, seed + 1);
          const px = a.x + a.w / 2 + Math.cos(th) * (a.w / 2) * r;
          const py = a.y + a.h / 2 + Math.sin(th) * (a.h / 2) * r;
          if (i) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        }
        ctx.closePath();
      }
    };
    const snap = rc.snapshot();
    // mirror line at the pool's top edge; `mirror` sets how much of the scene above it reflects
    const fromSky = str(p, 'from') === 'sky';
    const reach = Math.max(4, (num(p, 'mirror') / 100) * (fromSky ? h * 0.45 : a.y));
    const squash = a.h / reach;
    // sky: the top band of the frame, mirrored; above: the scene right above the pool's edge
    const mirrorLine = fromSky ? reach : a.y;
    const ripple = (num(p, 'ripple') / 100) * 10 * s;
    ctx.save();
    path();
    ctx.clip();
    const band = Math.max(2, Math.round(3 * s));
    for (let y = a.y; y < a.y + a.h; y += band) {
      const d = (y - a.y) / squash; // distance into the reflection
      const sy = mirrorLine - d - band / squash;
      const off = ripple * Math.sin(y * 0.09 / s + t * TAU * 2) * (0.4 + (y - a.y) / a.h);
      ctx.drawImage(snap, 0, Math.max(0, sy), w, band / squash, off, y, w, band);
    }
    const liquid = str(p, 'liquid');
    if (liquid === 'dark') {
      ctx.fillStyle = 'rgba(4,8,14,0.3)';
      ctx.fillRect(a.x, a.y, a.w, a.h);
    } else if (liquid === 'mercury') {
      ctx.globalCompositeOperation = 'saturation';
      ctx.fillStyle = '#808080';
      ctx.fillRect(a.x, a.y, a.w, a.h);
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = 'rgba(200,215,235,0.55)';
      ctx.fillRect(a.x, a.y, a.w, a.h);
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.fillStyle = 'rgba(30,60,80,0.18)';
      ctx.fillRect(a.x, a.y, a.w, a.h);
    }
    // depth darkening towards the far edge
    const g = ctx.createLinearGradient(0, a.y, 0, a.y + a.h);
    g.addColorStop(0, 'rgba(0,0,0,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(a.x, a.y, a.w, a.h);
    ctx.restore();

    // wet dark shore around the water
    ctx.save();
    path();
    ctx.lineWidth = Math.max(2, a.h * 0.08);
    ctx.strokeStyle = 'rgba(10,12,10,0.35)';
    ctx.stroke();
    ctx.restore();
    const rim = num(p, 'rim') / 100;
    if (rim > 0) {
      ctx.save();
      path();
      ctx.clip();
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 14; i++) {
        const gy = a.y + a.h * (0.15 + 0.8 * hash1(i, seed + 20));
        const gx = a.x + a.w * hash1(i, seed + 21) + Math.sin(t * TAU + i) * 6 * s;
        ctx.fillStyle = `rgba(255,255,255,${0.25 * rim * (0.5 + 0.5 * Math.sin(t * TAU * 2 + i))})`;
        ctx.fillRect(gx, gy, a.w * (0.04 + 0.1 * hash1(i, seed + 22)), Math.max(1, 1.2 * s));
      }
      ctx.restore();
      ctx.save();
      path();
      ctx.lineWidth = 1.6 * s;
      ctx.strokeStyle = liquid === 'mercury' ? `rgba(255,255,255,${0.8 * rim})` : `rgba(220,235,255,${0.45 * rim})`;
      ctx.stroke();
      ctx.restore();
    }
  },
};

export const glassOrb: EffectDef = {
  type: 'glassOrb',
  label: '유리 구슬',
  english: 'Glass Orb',
  description: '커다란 유리 구슬이 떠 있고, 그 안에 풍경이 거꾸로 굴절되어 보여요. 반사광·그림자 포함.',
  category: 'composite',
  kind: 'overlay',
  params: [
    { key: 'cx', label: '가로 위치', type: 'range', min: 0, max: 100, step: 0.5, default: 50, unit: '%' },
    { key: 'cy', label: '세로 위치', type: 'range', min: 0, max: 100, step: 0.5, default: 52, unit: '%' },
    { key: 'radius', label: '크기', type: 'range', min: 3, max: 60, step: 0.5, default: 22, unit: '%' },
    { key: 'image', label: '구슬에 담길 것', type: 'image', default: 'current' },
    { key: 'refract', label: '굴절 (확대)', type: 'range', min: 0, max: 100, step: 1, default: 55 },
    { key: 'invert', label: '거꾸로 보이게', type: 'bool', default: true },
    { key: 'tint', label: '유리 색', type: 'color', default: '#dfefff' },
    { key: 'shadow', label: '그림자', type: 'range', min: 0, max: 100, step: 1, default: 45 },
    { key: 'float', label: '둥둥 뜨기', type: 'range', min: 0, max: 60, step: 1, default: 10, group: '모션' },
  ],
  render(rc, p) {
    const { ctx, w, h, s, t } = rc;
    const R = (num(p, 'radius') / 100) * Math.min(w, h);
    const cx = (num(p, 'cx') / 100) * w;
    const cy = (num(p, 'cy') / 100) * h + Math.sin(t * TAU) * num(p, 'float') * s;
    const src = pickSource(rc, str(p, 'image'));
    const refract = num(p, 'refract') / 100;
    const flip = p.invert as boolean;

    const sh = num(p, 'shadow') / 100;
    if (sh > 0) {
      const gy = (num(p, 'cy') / 100) * h + R * 1.08;
      const g = ctx.createRadialGradient(cx, gy, 0, cx, gy, R);
      g.addColorStop(0, `rgba(0,0,0,${0.55 * sh})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(cx, gy, R, R * 0.22, 0, 0, TAU);
      ctx.fill();
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.clip();
    // concentric rings magnify more towards the middle: a cheap fisheye
    const rings = 7;
    for (let k = 0; k < rings; k++) {
      const rr = R * (1 - k / rings);
      const mag = 1 + refract * 1.4 * (1 - rr / R) + refract * 0.6;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, TAU);
      ctx.clip();
      // a ball lens shows the world rotated by 180°
      ctx.translate(cx, cy);
      ctx.scale(mag, mag);
      if (flip) ctx.rotate(Math.PI);
      ctx.translate(-cx, -cy);
      ctx.drawImage(src, 0, 0, w, h);
      ctx.restore();
    }
    const tint = str(p, 'tint');
    const edge = ctx.createRadialGradient(cx, cy, R * 0.55, cx, cy, R);
    edge.addColorStop(0, rgba(tint, 0));
    edge.addColorStop(0.85, rgba(tint, 0.25));
    edge.addColorStop(1, 'rgba(255,255,255,0.75)');
    ctx.fillStyle = edge;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    const spec = ctx.createRadialGradient(cx - R * 0.38, cy - R * 0.45, 0, cx - R * 0.38, cy - R * 0.45, R * 0.45);
    spec.addColorStop(0, 'rgba(255,255,255,0.85)');
    spec.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = spec;
    ctx.beginPath();
    ctx.ellipse(cx - R * 0.38, cy - R * 0.45, R * 0.42, R * 0.26, -0.6, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.2 * s;
    ctx.beginPath();
    ctx.arc(cx, cy, R - 0.6 * s, 0, TAU);
    ctx.stroke();
    ctx.restore();
  },
};
