import { hash1, mulberry32, smoothstep, TAU } from '../random';
import type { EffectDef, Params, RenderContext } from '../types';
import { bool, num, rect, rgba, str } from './util';

interface Feature {
  x: number;
  y: number;
  /** Indices of the two nearest neighbours. */
  near: number[];
}

const cache = new Map<string, Feature[]>();

const WORDS = [
  'RIDGE', 'WAVE', 'LIGHT', 'MEMORY', 'SIGNAL', 'NODE', 'VOID', 'TERRAIN', 'ECHO', 'DRIFT',
  'SHORE', 'STATIC', 'NOISE', 'ORIGIN', 'TRACE', 'PULSE', 'DEPTH', 'FORM', 'SOURCE', 'BODY',
];

/** Pick salient points from the fixed-size analysis image. Cached because it never changes per frame. */
function detect(rc: RenderContext, p: Params): Feature[] {
  const area = rect(p, 'area');
  const count = num(p, 'count');
  const pick = str(p, 'pick');
  const key = `${rc.baseKey}|${area.x},${area.y},${area.w},${area.h}|${count}|${pick}|${rc.seed}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const A = rc.analysis();
  const aw = A.width;
  const ah = A.height;
  const data = A.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, aw, ah).data;
  const g = new Float32Array(aw * ah);
  for (let i = 0; i < aw * ah; i++) g[i] = data[i * 4] * 0.3 + data[i * 4 + 1] * 0.59 + data[i * 4 + 2] * 0.11;

  const rng = mulberry32(rc.seed);
  const x0 = Math.max(1, Math.floor(area.x * aw));
  const y0 = Math.max(1, Math.floor(area.y * ah));
  const x1 = Math.min(aw - 1, Math.ceil((area.x + area.w) * aw));
  const y1 = Math.min(ah - 1, Math.ceil((area.y + area.h) * ah));
  const cand: { x: number; y: number; s: number }[] = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * aw + x;
      let score: number;
      if (pick === 'bright') score = g[i];
      else if (pick === 'random') score = rng() * 255;
      else score = Math.abs(g[i + 1] - g[i - 1]) + Math.abs(g[i + aw] - g[i - aw]);
      cand.push({ x, y, s: score + rng() * 40 });
    }
  }
  cand.sort((a, b) => b.s - a.s);

  const minDist = Math.sqrt(((x1 - x0) * (y1 - y0)) / Math.max(1, count)) * 0.55;
  const picked: { x: number; y: number }[] = [];
  for (let pass = 0; pass < 3 && picked.length < count; pass++) {
    const md2 = (minDist * (1 - pass * 0.35)) ** 2;
    for (const c of cand) {
      if (picked.length >= count) break;
      if (picked.every((q) => (q.x - c.x) ** 2 + (q.y - c.y) ** 2 >= md2)) picked.push(c);
    }
  }

  const feats: Feature[] = picked.map((q) => ({ x: q.x / aw, y: q.y / ah, near: [] }));
  for (let i = 0; i < feats.length; i++) {
    feats[i].near = feats
      .map((f, j) => ({ j, d: (f.x - feats[i].x) ** 2 + (f.y - feats[i].y) ** 2 }))
      .filter((o) => o.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2)
      .map((o) => o.j);
  }
  if (cache.size > 40) cache.clear();
  cache.set(key, feats);
  return feats;
}

function labelFor(style: string, i: number, variant: number, px: number, py: number, seed: number): string {
  const h = (k: number) => hash1(i * 131 + variant * 17 + k, seed);
  const kind = style === 'mixed' ? ['coord', 'id', 'word', 'metric'][Math.floor(h(9) * 4)] : style;
  switch (kind) {
    case 'coord':
      return `X:${Math.round(px)} Y:${Math.round(py)}`;
    case 'id':
      return `ID_${Math.floor(h(1) * 0xffff).toString(16).toUpperCase().padStart(4, '0')}`;
    case 'word':
      return `${WORDS[Math.floor(h(2) * WORDS.length)]}_${String(Math.floor(h(3) * 99)).padStart(2, '0')}`;
    default:
      return h(4) < 0.5 ? (h(5) * 0.999).toFixed(4) : `${(h(6) * 24 - 12).toFixed(1)}dB`;
  }
}

export const trackingLabels: EffectDef = {
  type: 'trackingLabels',
  label: '트래킹 데이터',
  english: 'Tracking Labels',
  kind: 'overlay',
  category: 'data',
  description: '사진에서 윤곽이 강한 지점을 찾아 마커·좌표·라벨·연결선을 붙입니다. 기계가 세상을 읽는 느낌.',
  params: [
    { key: 'area', label: '찾을 영역', type: 'rect', default: { x: 0.04, y: 0.04, w: 0.92, h: 0.92 }, color: '#ffffff' },
    { key: 'count', label: '포인트 개수', type: 'range', min: 4, max: 160, step: 1, default: 40 },
    {
      key: 'pick',
      label: '포인트 고르는 기준',
      type: 'select',
      default: 'edges',
      options: [
        { value: 'edges', label: '윤곽이 강한 곳' },
        { value: 'bright', label: '밝은 곳' },
        { value: 'random', label: '무작위' },
      ],
    },
    {
      key: 'style',
      label: '라벨 내용',
      type: 'select',
      default: 'mixed',
      options: [
        { value: 'mixed', label: '섞어서' },
        { value: 'coord', label: '좌표' },
        { value: 'id', label: 'ID 코드' },
        { value: 'word', label: '단어' },
        { value: 'metric', label: '수치' },
      ],
    },
    {
      key: 'marker',
      label: '마커 모양',
      type: 'select',
      default: 'square',
      options: [
        { value: 'square', label: '사각형' },
        { value: 'cross', label: '십자' },
        { value: 'dot', label: '점' },
      ],
    },
    { key: 'markerSize', label: '마커 크기', type: 'range', min: 2, max: 30, step: 1, default: 9 },
    { key: 'links', label: '연결선', type: 'range', min: 0, max: 100, step: 1, default: 30, unit: '%' },
    { key: 'drop', label: '아래로 늘어진 선', type: 'range', min: 0, max: 100, step: 1, default: 0, unit: '%' },
    { key: 'color', label: '색', type: 'color', default: '#ffffff' },
    { key: 'fontSize', label: '글자 크기', type: 'range', min: 6, max: 32, step: 1, default: 12 },
    { key: 'labelBg', label: '라벨 배경', type: 'bool', default: false },
    { key: 'opacity', label: '불투명도', type: 'range', min: 0, max: 100, step: 1, default: 90, unit: '%' },
    { key: 'reveal', label: '하나씩 나타나기', type: 'bool', default: true, group: '모션' },
    { key: 'drift', label: '흔들림', type: 'range', min: 0, max: 30, step: 1, default: 4, group: '모션' },
    { key: 'flicker', label: '숫자 깜빡임', type: 'range', min: 0, max: 100, step: 1, default: 35, group: '모션' },
  ],
  render(rc, p) {
    const feats = detect(rc, p);
    const { ctx, w, h, s, t, seed } = rc;
    const color = str(p, 'color');
    const opacity = num(p, 'opacity') / 100;
    const reveal = bool(p, 'reveal');
    const drift = num(p, 'drift') * s;
    const flicker = num(p, 'flicker') / 100;
    const m = num(p, 'markerSize') * s;
    const links = num(p, 'links') / 100;
    const drop = num(p, 'drop') / 100;
    const n = feats.length;

    const alphaOf = (i: number) => (reveal ? smoothstep(0, 0.04, t - (i / Math.max(1, n)) * 0.45) : 1);
    const pos = feats.map((f, i) => {
      const ph = hash1(i, seed) * TAU;
      return {
        x: f.x * w + drift * Math.sin(TAU * t + ph),
        y: f.y * h + drift * Math.cos(TAU * t * 2 + ph * 1.7) * 0.6,
      };
    });

    ctx.lineWidth = Math.max(1, s);
    ctx.lineCap = 'square';

    if (links > 0) {
      for (let i = 0; i < n; i++) {
        for (const j of feats[i].near) {
          if (j < i && feats[j].near.includes(i)) continue; // draw shared links once
          if (hash1(i * 977 + j, seed ^ 0x77) > links) continue;
          ctx.strokeStyle = rgba(color, 0.55 * opacity * Math.min(alphaOf(i), alphaOf(j)));
          ctx.beginPath();
          ctx.moveTo(pos[i].x, pos[i].y);
          ctx.lineTo(pos[j].x, pos[j].y);
          ctx.stroke();
        }
      }
    }

    const fs = num(p, 'fontSize') * s;
    ctx.font = `500 ${fs}px "JetBrains Mono", monospace`;
    ctx.textBaseline = 'middle';

    for (let i = 0; i < n; i++) {
      const a = alphaOf(i) * opacity;
      if (a <= 0.001) continue;
      const { x, y } = pos[i];
      ctx.strokeStyle = rgba(color, a);
      ctx.fillStyle = rgba(color, a);

      if (drop > 0 && hash1(i, seed ^ 0x1d) < 0.75) {
        const len = drop * h * (0.25 + 0.75 * hash1(i, seed ^ 0x2e));
        ctx.strokeStyle = rgba(color, a * 0.6);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + len);
        ctx.moveTo(x - 3 * s, y + len);
        ctx.lineTo(x + 3 * s, y + len);
        ctx.stroke();
        ctx.strokeStyle = rgba(color, a);
      }

      const marker = str(p, 'marker');
      if (marker === 'square') ctx.strokeRect(x - m / 2, y - m / 2, m, m);
      else if (marker === 'dot') {
        ctx.beginPath();
        ctx.arc(x, y, m / 3, 0, TAU);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(x - m / 2, y);
        ctx.lineTo(x + m / 2, y);
        ctx.moveTo(x, y - m / 2);
        ctx.lineTo(x, y + m / 2);
        ctx.stroke();
      }

      const flickers = hash1(i, seed ^ 0x3f) < flicker;
      const variant = flickers ? Math.floor(rc.time * (3 + 9 * hash1(i, seed ^ 0x4a))) : 0;
      const label = labelFor(str(p, 'style'), i, variant, x / s, y / s, seed);
      const lx = x + m * 0.8;
      const ly = y - m * 0.9;
      if (bool(p, 'labelBg')) {
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = `rgba(0,0,0,${0.7 * a})`;
        ctx.fillRect(lx - 2 * s, ly - fs * 0.62, tw + 4 * s, fs * 1.24);
        ctx.fillStyle = rgba(color, a);
      }
      ctx.fillText(label, lx, ly);
    }
  },
};
