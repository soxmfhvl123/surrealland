import { hash1, TAU } from '../random';
import type { EffectDef, Params, RenderContext } from '../types';
import { bool, num, rect, rectPx, rgba, str } from './util';

const glintCache = new Map<string, { x: number; y: number; v: number }[]>();

/** Brightest well-separated points of the base photo, in normalized coordinates. */
function brightPoints(rc: RenderContext, p: Params) {
  const area = rect(p, 'area');
  const count = num(p, 'count');
  const key = `${rc.baseKey}|${area.x},${area.y},${area.w},${area.h}|${count}|${rc.seed}`;
  const hit = glintCache.get(key);
  if (hit) return hit;
  const A = rc.analysis();
  const aw = A.width;
  const ah = A.height;
  const d = A.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, aw, ah).data;
  const cand: { x: number; y: number; v: number }[] = [];
  for (let y = Math.floor(area.y * ah); y < Math.min(ah, (area.y + area.h) * ah); y++) {
    for (let x = Math.floor(area.x * aw); x < Math.min(aw, (area.x + area.w) * aw); x++) {
      const i = (y * aw + x) * 4;
      const v = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
      cand.push({ x, y, v: v + hash1(y * aw + x, rc.seed) * 25 });
    }
  }
  cand.sort((a, b) => b.v - a.v);
  const md2 = ((aw * area.w * ah * area.h) / Math.max(1, count)) * 0.25;
  const out: { x: number; y: number; v: number }[] = [];
  for (const c of cand) {
    if (out.length >= count) break;
    if (out.every((q) => (q.x * aw - c.x) ** 2 + (q.y * ah - c.y) ** 2 >= md2)) out.push({ x: c.x / aw, y: c.y / ah, v: c.v / 280 });
  }
  if (glintCache.size > 30) glintCache.clear();
  glintCache.set(key, out);
  return out;
}

export const glints: EffectDef = {
  type: 'glints',
  label: '반짝이',
  english: 'Glints',
  description: '밝은 지점마다 십자 별빛이 반짝입니다. 글리터 몸, 포일, 크롬, 도시 불빛.',
  category: 'color',
  kind: 'overlay',
  defaultBlend: 'screen',
  params: [
    { key: 'area', label: '찾을 영역', type: 'rect', default: { x: 0, y: 0, w: 1, h: 1 }, color: '#fff7c2' },
    { key: 'count', label: '별 개수', type: 'range', min: 2, max: 200, step: 1, default: 36 },
    { key: 'size', label: '크기', type: 'range', min: 4, max: 200, step: 1, default: 42 },
    {
      key: 'rays',
      label: '빛살',
      type: 'select',
      default: '4',
      options: [
        { value: '4', label: '4갈래' },
        { value: '6', label: '6갈래' },
        { value: '8', label: '8갈래' },
      ],
    },
    { key: 'color', label: '색', type: 'color', default: '#fff6dd' },
    { key: 'glow', label: '번짐', type: 'range', min: 0, max: 100, step: 1, default: 50 },
    { key: 'twinkle', label: '깜빡임', type: 'range', min: 0, max: 100, step: 1, default: 70, group: '모션' },
    { key: 'spin', label: '돌기', type: 'bool', default: false, group: '모션' },
  ],
  render(rc, p) {
    const { ctx, w, h, s, t } = rc;
    const pts = brightPoints(rc, p);
    const color = str(p, 'color');
    const rays = parseInt(str(p, 'rays'), 10);
    const size = num(p, 'size') * s;
    const tw = num(p, 'twinkle') / 100;
    const glow = num(p, 'glow') / 100;
    pts.forEach((q, i) => {
      const ph = hash1(i, rc.seed) * TAU;
      const speed = 1 + Math.floor(hash1(i, rc.seed ^ 5) * 3);
      const a = (1 - tw) + tw * Math.pow(0.5 + 0.5 * Math.sin(TAU * t * speed + ph), 3);
      if (a < 0.02) return;
      const r = size * (0.4 + q.v * 0.8) * (0.6 + 0.4 * a);
      const x = q.x * w;
      const y = q.y * h;
      ctx.save();
      ctx.translate(x, y);
      if (bool(p, 'spin')) ctx.rotate(TAU * t * 0.25);
      if (glow > 0) {
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.45);
        g.addColorStop(0, rgba(color, 0.9 * a));
        g.addColorStop(1, rgba(color, 0));
        ctx.fillStyle = g;
        ctx.globalAlpha = glow;
        ctx.fillRect(-r, -r, r * 2, r * 2);
        ctx.globalAlpha = 1;
      }
      for (let k = 0; k < rays; k++) {
        ctx.save();
        ctx.rotate((k * Math.PI * 2) / rays);
        const len = k % 2 && rays > 4 ? r * 0.55 : r;
        const g = ctx.createLinearGradient(0, 0, len, 0);
        g.addColorStop(0, rgba(color, a));
        g.addColorStop(1, rgba(color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, -Math.max(0.6, 1.4 * s));
        ctx.lineTo(len, 0);
        ctx.lineTo(0, Math.max(0.6, 1.4 * s));
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    });
  },
};

export const tile: EffectDef = {
  type: 'tile',
  label: '반복 타일',
  english: 'Repeat Tile',
  description: '한 영역을 격자로 반복합니다. 눈동자 벽, 같은 얼굴이 줄지어 선 화면.',
  category: 'composite',
  params: [
    { key: 'area', label: '반복할 영역', type: 'rect', default: { x: 0.25, y: 0.3, w: 0.5, h: 0.35 }, color: '#c08bff' },
    { key: 'cols', label: '가로 칸', type: 'range', min: 1, max: 16, step: 1, default: 3 },
    { key: 'rows', label: '세로 칸', type: 'range', min: 1, max: 16, step: 1, default: 4 },
    { key: 'mirror', label: '번갈아 뒤집기', type: 'bool', default: false },
    { key: 'gap', label: '칸 사이', type: 'range', min: 0, max: 30, step: 0.5, default: 0 },
    { key: 'gapColor', label: '칸 사이 색', type: 'color', default: '#000000' },
    { key: 'scroll', label: '줄마다 흐르기', type: 'range', min: 0, max: 100, step: 1, default: 0, group: '모션' },
  ],
  render(rc, p) {
    const { ctx, w, h, s, t } = rc;
    const src = rc.snapshot();
    const R = rectPx(rect(p, 'area'), w, h);
    const cols = num(p, 'cols');
    const rows = num(p, 'rows');
    const gap = num(p, 'gap') * s;
    const cw = w / cols;
    const ch = h / rows;
    const scroll = (num(p, 'scroll') / 100) * cw;
    ctx.fillStyle = str(p, 'gapColor');
    ctx.fillRect(0, 0, w, h);
    for (let r = 0; r < rows; r++) {
      // alternate rows slide in opposite directions; at 100% they move one cell per loop
      const off = (r % 2 ? -1 : 1) * t * scroll;
      for (let c = -1; c <= cols; c++) {
        const x = c * cw + (((off % cw) + cw) % cw);
        const flip = bool(p, 'mirror') && (c + r) % 2 !== 0;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + gap / 2, r * ch + gap / 2, cw - gap, ch - gap);
        ctx.clip();
        if (flip) {
          ctx.translate(x + cw, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(src, R.x, R.y, R.w, R.h, 0, r * ch, cw, ch);
        } else {
          ctx.drawImage(src, R.x, R.y, R.w, R.h, x, r * ch, cw, ch);
        }
        ctx.restore();
      }
    }
  },
};
