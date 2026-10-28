import { hash1, mulberry32, smoothstep, TAU } from '../random';
import type { EffectDef, Params, RenderContext } from '../types';
import { dropShadow, num, rect, rectPx, str } from './util';

const SOURCE_PARAM = { key: 'source', label: '가져올 사진', type: 'image', default: 'current' } as const;

function sourceCanvas(rc: RenderContext, p: Params): HTMLCanvasElement {
  const s = str(p, 'source');
  if (s === 'current') return rc.snapshot();
  if (s === 'base') return rc.base;
  return rc.image(s) ?? rc.base;
}

export const scatter: EffectDef = {
  type: 'scatter',
  label: '조각 흩뿌리기',
  english: 'Scatter Fragments',
  description: '하늘(또는 다른 사진)을 여러 네모 조각으로 떠서 땅 위에 흩어 놓습니다. 조각난 하늘.',
  category: 'composite',
  kind: 'overlay',
  params: [
    { ...SOURCE_PARAM, default: 'base' },
    { key: 'from', label: '조각을 떠올 영역', type: 'rect', default: { x: 0, y: 0, w: 1, h: 0.35 }, color: '#5fd0ff' },
    { key: 'area', label: '흩뿌릴 영역', type: 'rect', default: { x: 0.03, y: 0.42, w: 0.94, h: 0.52 }, color: '#ffb03d' },
    { key: 'count', label: '조각 개수', type: 'range', min: 2, max: 40, step: 1, default: 9 },
    { key: 'size', label: '조각 크기', type: 'range', min: 0, max: 100, step: 1, default: 50 },
    { key: 'zoom', label: '안쪽 확대', type: 'range', min: 1, max: 3, step: 0.05, default: 1.3 },
    { key: 'tiltMax', label: '기울기 (도)', type: 'range', min: 0, max: 30, step: 0.5, default: 0 },
    { key: 'shadow', label: '그림자', type: 'range', min: 0, max: 100, step: 1, default: 65 },
    { key: 'border', label: '테두리', type: 'range', min: 0, max: 20, step: 0.5, default: 0 },
    { key: 'borderColor', label: '테두리 색', type: 'color', default: '#f3f2ee' },
    { key: 'pan', label: '안쪽 흐름', type: 'range', min: 0, max: 100, step: 1, default: 40, group: '모션' },
    { key: 'float', label: '떠다님', type: 'range', min: 0, max: 60, step: 1, default: 10, group: '모션' },
  ],
  render(rc, p) {
    const { ctx, w, s, t } = rc;
    const src = sourceCanvas(rc, p);
    const A = rectPx(rect(p, 'area'), rc.w, rc.h);
    const rng = mulberry32(rc.seed * 131 + 17);
    const sizeK = num(p, 'size') / 100;
    const frs = Array.from({ length: num(p, 'count') }, () => {
      const sz = (0.05 + rng() * 0.2 * (0.3 + sizeK)) * w;
      const ar = 0.6 + rng() * 1.1;
      const fw = Math.min(sz * ar, A.w);
      const fh = Math.min((sz / ar) * 0.9, A.h);
      return { x: A.x + rng() * Math.max(0, A.w - fw), y: A.y + rng() * Math.max(0, A.h - fh), w: fw, h: fh, k: rng(), tilt: rng() - 0.5, u: rng(), v: rng() };
    }).sort((a, b) => a.y + a.h - (b.y + b.h));
    const F = rectPx(rect(p, 'from'), rc.w, rc.h);

    const zoom = num(p, 'zoom');
    const panX = (num(p, 'pan') / 100) * Math.sin(TAU * t) * w * 0.08;
    const border = num(p, 'border') * s;
    for (const f of frs) {
      const fy = f.y + num(p, 'float') * s * Math.sin(TAU * t + f.k * TAU);
      const cx = f.x + f.w / 2;
      const cy = fy + f.h / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(((f.tilt * num(p, 'tiltMax')) * Math.PI) / 180);
      const box = () => {
        ctx.beginPath();
        ctx.rect(-f.w / 2, -f.h / 2, f.w, f.h);
      };
      dropShadow(ctx, num(p, 'shadow') / 100, s, box, 34);
      // each fragment shows a random window of the source region (sky by default), magnified by `zoom`
      const sw = Math.min(F.w, f.w / zoom);
      const sh = Math.min(F.h, f.h / zoom);
      const sx = Math.min(rc.w - sw, Math.max(0, F.x + f.u * (F.w - sw) + panX));
      const sy = F.y + f.v * (F.h - sh);
      ctx.drawImage(src, sx, sy, sw, sh, -f.w / 2, -f.h / 2, f.w, f.h);
      if (border > 0) {
        ctx.strokeStyle = str(p, 'borderColor');
        ctx.lineWidth = border;
        ctx.strokeRect(-f.w / 2 + border / 2, -f.h / 2 + border / 2, f.w - border, f.h - border);
      }
      ctx.restore();
    }
  },
};

type Pt = [number, number];
const shardCache = new Map<string, Pt[][]>();

function polyArea(poly: Pt[]) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

function centroid(poly: Pt[]): Pt {
  let x = 0;
  let y = 0;
  for (const q of poly) {
    x += q[0];
    y += q[1];
  }
  return [x / poly.length, y / poly.length];
}

/** Split a convex polygon by the line through `o` with direction `d`. */
function cut(poly: Pt[], o: Pt, d: Pt): [Pt[], Pt[]] {
  const side = (q: Pt) => (q[0] - o[0]) * d[1] - (q[1] - o[1]) * d[0];
  const a: Pt[] = [];
  const b: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p1 = poly[i];
    const p2 = poly[(i + 1) % poly.length];
    const s1 = side(p1);
    const s2 = side(p2);
    (s1 >= 0 ? a : b).push(p1);
    if (s1 * s2 < 0) {
      const k = s1 / (s1 - s2);
      const x: Pt = [p1[0] + (p2[0] - p1[0]) * k, p1[1] + (p2[1] - p1[1]) * k];
      a.push(x);
      b.push(x);
    }
  }
  return [a, b];
}

/** Shards in normalized frame coordinates, from repeated random cuts of the area. */
function shards(area: { x: number; y: number; w: number; h: number }, n: number, seed: number): Pt[][] {
  const key = `${area.x},${area.y},${area.w},${area.h}|${n}|${seed}`;
  const hit = shardCache.get(key);
  if (hit) return hit;
  const rng = mulberry32(seed);
  let polys: Pt[][] = [
    [
      [area.x, area.y],
      [area.x + area.w, area.y],
      [area.x + area.w, area.y + area.h],
      [area.x, area.y + area.h],
    ],
  ];
  let guard = 0;
  while (polys.length < n && guard++ < n * 6) {
    polys.sort((a, b) => polyArea(b) - polyArea(a));
    const big = polys[0];
    const c = centroid(big);
    const ang = rng() * Math.PI;
    const o: Pt = [c[0] + (rng() - 0.5) * area.w * 0.15, c[1] + (rng() - 0.5) * area.h * 0.15];
    const [a, b] = cut(big, o, [Math.cos(ang), Math.sin(ang)]);
    if (a.length >= 3 && b.length >= 3) polys = [a, b, ...polys.slice(1)];
  }
  if (shardCache.size > 30) shardCache.clear();
  shardCache.set(key, polys);
  return polys;
}

export const shatter: EffectDef = {
  type: 'shatter',
  label: '유리 파편',
  english: 'Shatter',
  description: '영역을 유리처럼 깨서 파편을 밀어내고 돌립니다. 뒤에는 검은 빈 공간이 드러납니다.',
  category: 'composite',
  kind: 'overlay',
  params: [
    SOURCE_PARAM,
    { key: 'area', label: '깨질 영역', type: 'rect', default: { x: 0.15, y: 0.18, w: 0.7, h: 0.6 }, color: '#9fe0ff' },
    { key: 'pieces', label: '파편 수', type: 'range', min: 3, max: 90, step: 1, default: 26 },
    { key: 'spread', label: '흩어짐', type: 'range', min: 0, max: 100, step: 1, default: 16 },
    { key: 'rotate', label: '회전 (도)', type: 'range', min: 0, max: 60, step: 1, default: 7 },
    { key: 'gap', label: '틈', type: 'range', min: 0, max: 20, step: 0.5, default: 2 },
    { key: 'edge', label: '모서리 빛', type: 'range', min: 0, max: 100, step: 1, default: 45 },
    { key: 'void', label: '뒤 공간 색', type: 'color', default: '#000000' },
    { key: 'showVoid', label: '뒤 공간 채우기', type: 'bool', default: true },
    { key: 'shadow', label: '그림자', type: 'range', min: 0, max: 100, step: 1, default: 40 },
    {
      key: 'anim',
      label: '움직임',
      type: 'select',
      default: 'breathe',
      group: '모션',
      options: [
        { value: 'breathe', label: '벌어졌다 모임 (루프)' },
        { value: 'explode', label: '점점 터짐' },
        { value: 'none', label: '정지' },
      ],
    },
  ],
  render(rc, p) {
    const { ctx, w, h, s, t } = rc;
    const src = sourceCanvas(rc, p);
    const area = rect(p, 'area');
    const polys = shards(area, num(p, 'pieces'), rc.seed);
    const anim = str(p, 'anim');
    const amt = anim === 'breathe' ? 0.5 - 0.5 * Math.cos(TAU * t) : anim === 'explode' ? smoothstep(0, 0.9, t) : 1;
    const spread = (num(p, 'spread') / 100) * Math.min(w, h) * 0.25 * amt;
    const rot = ((num(p, 'rotate') * Math.PI) / 180) * amt;
    const gap = num(p, 'gap') * s;
    const ac: Pt = [(area.x + area.w / 2) * w, (area.y + area.h / 2) * h];

    if (p.showVoid) {
      ctx.fillStyle = str(p, 'void');
      ctx.fillRect(area.x * w, area.y * h, area.w * w, area.h * h);
    }
    polys.forEach((poly, i) => {
      const px = poly.map(([x, y]) => [x * w, y * h] as Pt);
      const c = centroid(px);
      let dx = c[0] - ac[0];
      let dy = c[1] - ac[1];
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      const k = 0.4 + hash1(i, rc.seed) * 0.9;
      const r = (hash1(i, rc.seed ^ 0x33) - 0.5) * 2 * rot;
      // shrink each shard toward its centre to open a gap
      const sz = Math.sqrt(polyArea(px)) || 1;
      const shrink = Math.max(0.2, 1 - gap / sz);
      const path = () => {
        ctx.beginPath();
        px.forEach(([x, y], j) => {
          const qx = c[0] + (x - c[0]) * shrink;
          const qy = c[1] + (y - c[1]) * shrink;
          if (j === 0) ctx.moveTo(qx, qy);
          else ctx.lineTo(qx, qy);
        });
        ctx.closePath();
      };
      ctx.save();
      ctx.translate(c[0] + dx * spread * k, c[1] + dy * spread * k);
      ctx.rotate(r);
      ctx.translate(-c[0], -c[1]);
      dropShadow(ctx, num(p, 'shadow') / 100, s, path, 18);
      ctx.save();
      path();
      ctx.clip();
      ctx.drawImage(src, 0, 0);
      ctx.restore();
      const edge = num(p, 'edge') / 100;
      if (edge > 0) {
        path();
        ctx.strokeStyle = `rgba(255,255,255,${edge * (0.4 + 0.6 * hash1(i, rc.seed ^ 9))})`;
        ctx.lineWidth = Math.max(1, 1.4 * s);
        ctx.stroke();
      }
      ctx.restore();
    });
  },
};

export const echo: EffectDef = {
  type: 'echo',
  label: '잔상',
  english: 'Echo Trail',
  description: '영역을 여러 번 겹쳐 찍어 움직임의 잔상을 남깁니다. 사람이 미끄러지듯 반복되는 느낌.',
  category: 'composite',
  kind: 'overlay',
  params: [
    SOURCE_PARAM,
    { key: 'area', label: '잔상 낼 영역', type: 'rect', default: { x: 0.32, y: 0.25, w: 0.36, h: 0.6 }, color: '#ff7ad9' },
    { key: 'copies', label: '반복 수', type: 'range', min: 1, max: 24, step: 1, default: 7 },
    { key: 'dx', label: '가로 간격', type: 'range', min: -120, max: 120, step: 1, default: 34 },
    { key: 'dy', label: '세로 간격', type: 'range', min: -120, max: 120, step: 1, default: 0 },
    { key: 'scale', label: '크기 변화', type: 'range', min: 80, max: 120, step: 0.5, default: 100, unit: '%' },
    { key: 'decay', label: '흐려짐', type: 'range', min: 0, max: 100, step: 1, default: 35 },
    {
      key: 'mode',
      label: '겹치는 방식',
      type: 'select',
      default: 'source-over',
      options: [
        { value: 'source-over', label: '보통' },
        { value: 'screen', label: '스크린' },
        { value: 'lighten', label: '밝게' },
        { value: 'difference', label: '차이' },
      ],
    },
    { key: 'sway', label: '출렁임', type: 'range', min: 0, max: 100, step: 1, default: 40, group: '모션' },
  ],
  render(rc, p) {
    const { ctx, s, t } = rc;
    const src = sourceCanvas(rc, p);
    const R = rectPx(rect(p, 'area'), rc.w, rc.h);
    const n = num(p, 'copies');
    const sway = (num(p, 'sway') / 100) * Math.sin(TAU * t);
    const dx = num(p, 'dx') * s * (1 + sway * 0.6);
    const dy = num(p, 'dy') * s * (1 + sway * 0.6);
    const sc = num(p, 'scale') / 100;
    const decay = num(p, 'decay') / 100;
    ctx.globalCompositeOperation = str(p, 'mode') as GlobalCompositeOperation;
    for (let k = n; k >= 1; k--) {
      const z = Math.pow(sc, k);
      ctx.globalAlpha = Math.pow(1 - decay * 0.6, k);
      const cw = R.w * z;
      const ch = R.h * z;
      ctx.drawImage(src, R.x, R.y, R.w, R.h, R.x + dx * k + (R.w - cw) / 2, R.y + dy * k + (R.h - ch) / 2, cw, ch);
    }
  },
};

export const droste: EffectDef = {
  type: 'droste',
  label: '무한 액자',
  english: 'Droste Frame',
  description: '그림 안에 같은 그림을 계속 넣어 끝없는 액자를 만듭니다. 줌을 켜면 끝없이 빨려 들어갑니다.',
  category: 'composite',
  kind: 'overlay',
  params: [
    { key: 'inset', label: '안쪽 액자 위치', type: 'rect', default: { x: 0.22, y: 0.24, w: 0.56, h: 0.56 }, color: '#ffe14d' },
    { key: 'depth', label: '반복 깊이', type: 'range', min: 1, max: 14, step: 1, default: 7 },
    { key: 'twist', label: '단계별 회전 (도)', type: 'range', min: -30, max: 30, step: 0.5, default: 0 },
    { key: 'border', label: '테두리', type: 'range', min: 0, max: 30, step: 0.5, default: 4 },
    { key: 'borderColor', label: '테두리 색', type: 'color', default: '#f3f2ee' },
    { key: 'shadow', label: '그림자', type: 'range', min: 0, max: 100, step: 1, default: 40 },
    { key: 'zoom', label: '끝없이 빨려 들어가기 (루프)', type: 'bool', default: true, group: '모션' },
  ],
  render(rc, p) {
    const { ctx, w, h, s, t } = rc;
    const src = rc.snapshot();
    const R = rect(p, 'inset');
    const sx = Math.max(0.02, R.w);
    const sy = Math.max(0.02, R.h);
    // fixed point of the frame→inset map, so zooming about it is self-similar
    const fx = (R.x * w) / (1 - sx || 1e-3);
    const fy = (R.y * h) / (1 - sy || 1e-3);
    const u = p.zoom ? t : 0;
    const zx = Math.pow(1 / sx, u);
    const zy = Math.pow(1 / sy, u);
    const twist = (num(p, 'twist') * Math.PI) / 180;
    const depth = num(p, 'depth');
    const border = num(p, 'border') * s;

    ctx.save();
    ctx.translate(fx, fy);
    ctx.scale(zx, zy);
    ctx.rotate(-twist * u);
    ctx.translate(-fx, -fy);
    for (let k = 0; k <= depth; k++) {
      ctx.save();
      for (let j = 0; j < k; j++) {
        ctx.translate(R.x * w, R.y * h);
        ctx.scale(sx, sy);
        if (twist) {
          ctx.translate(w / 2, h / 2);
          ctx.rotate(twist);
          ctx.translate(-w / 2, -h / 2);
        }
      }
      if (k > 0) {
        dropShadow(ctx, num(p, 'shadow') / 100, s, () => {
          ctx.beginPath();
          ctx.rect(0, 0, w, h);
        });
      }
      ctx.drawImage(src, 0, 0, w, h);
      if (k > 0 && border > 0) {
        ctx.strokeStyle = str(p, 'borderColor');
        ctx.lineWidth = border / Math.pow(Math.min(sx, sy), k);
        ctx.strokeRect(0, 0, w, h);
      }
      ctx.restore();
    }
    ctx.restore();
  },
};
