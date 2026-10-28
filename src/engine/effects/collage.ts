import { fbm1, hash1, TAU } from '../random';
import type { EffectDef } from '../types';
import { bool, num, pickSource, rect, rectPx, str } from './util';

export const patchwork: EffectDef = {
  type: 'patchwork',
  label: '패치 콜라주',
  english: 'Patch Shuffle',
  description: '사진의 네모 조각들을 다른 자리에 덧붙여요. 가는 테두리·안내선과 함께 박자에 맞춰 툭툭 자리를 바꿔요.',
  category: 'composite',
  kind: 'overlay',
  params: [
    { key: 'source', label: '조각을 떠올 사진', type: 'image', default: 'current' },
    { key: 'count', label: '조각 수', type: 'range', min: 1, max: 40, step: 1, default: 12 },
    { key: 'minSize', label: '작은 크기', type: 'range', min: 3, max: 60, step: 0.5, default: 10, unit: '%' },
    { key: 'maxSize', label: '큰 크기', type: 'range', min: 3, max: 80, step: 0.5, default: 34, unit: '%' },
    { key: 'shift', label: '옮기는 거리', type: 'range', min: 0, max: 100, step: 1, default: 35 },
    { key: 'zoom', label: '확대 섞기', type: 'range', min: 0, max: 100, step: 1, default: 30 },
    { key: 'outline', label: '테두리', type: 'range', min: 0, max: 6, step: 0.5, default: 1 },
    { key: 'outlineColor', label: '테두리 색', type: 'color', default: '#ffffff' },
    { key: 'guides', label: '안내선', type: 'bool', default: true },
    { key: 'jumps', label: '자리 바꾸기 (루프당)', type: 'range', min: 0, max: 24, step: 1, default: 6, group: '모션' },
  ],
  render(rc, p) {
    const { ctx, w, h, s, t, seed } = rc;
    const src = pickSource(rc, str(p, 'source'));
    const n = Math.round(num(p, 'count'));
    const jumps = Math.round(num(p, 'jumps'));
    const beat = jumps ? Math.floor(t * jumps) : 0;
    const lo = num(p, 'minSize') / 100;
    const hi = Math.max(lo, num(p, 'maxSize') / 100);
    const shift = num(p, 'shift') / 100;
    const zoomMix = num(p, 'zoom') / 100;
    const ow = num(p, 'outline') * s;
    ctx.save();
    for (let i = 0; i < n; i++) {
      // half the patches keep their place between beats so the collage doesn't flicker apart
      const k = i * 31 + (hash1(i, seed + 99) < 0.5 ? beat * 977 : 0);
      const pw = (lo + (hi - lo) * hash1(k, seed + 1)) * w;
      const ph = pw * (0.45 + 1.1 * hash1(k, seed + 2));
      const sx = hash1(k, seed + 3) * (w - pw);
      const sy = hash1(k, seed + 4) * (h - ph);
      const dx = Math.max(0, Math.min(w - pw, sx + (hash1(k, seed + 5) - 0.5) * 2 * shift * w));
      const dy = Math.max(0, Math.min(h - ph, sy + (hash1(k, seed + 6) - 0.5) * 2 * shift * h));
      const z = hash1(k, seed + 7) < zoomMix ? 1.5 + hash1(k, seed + 8) * 2 : 1;
      const cw = pw / z;
      const ch = ph / z;
      ctx.drawImage(src, sx + (pw - cw) / 2, sy + (ph - ch) / 2, cw, ch, dx, dy, pw, ph);
      if (ow > 0) {
        ctx.strokeStyle = str(p, 'outlineColor');
        ctx.lineWidth = ow;
        ctx.strokeRect(dx, dy, pw, ph);
      }
      if (bool(p, 'guides') && hash1(k, seed + 9) < 0.4) {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = Math.max(0.5, 0.6 * s);
        ctx.beginPath();
        if (hash1(k, seed + 10) < 0.5) {
          ctx.moveTo(0, dy);
          ctx.lineTo(w, dy);
        } else {
          ctx.moveTo(dx + pw, 0);
          ctx.lineTo(dx + pw, h);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  },
};

/** Panel rectangles (normalized) for each split layout. */
function panels(layout: string): [number, number, number, number][] {
  switch (layout) {
    case 'v2':
      return [
        [0, 0, 0.5, 1],
        [0.5, 0, 0.5, 1],
      ];
    case 'h2':
      return [
        [0, 0, 1, 0.5],
        [0, 0.5, 1, 0.5],
      ];
    case 'h3':
      return [
        [0, 0, 1, 1 / 3],
        [0, 1 / 3, 1, 1 / 3],
        [0, 2 / 3, 1, 1 / 3],
      ];
    case 'tri':
      return [
        [0, 0, 1, 0.5],
        [0, 0.5, 0.5, 0.5],
        [0.5, 0.5, 0.5, 0.5],
      ];
    default:
      return [
        [0, 0, 0.5, 0.5],
        [0.5, 0, 0.5, 0.5],
        [0, 0.5, 0.5, 0.5],
        [0.5, 0.5, 0.5, 0.5],
      ];
  }
}

export const splitCollage: EffectDef = {
  type: 'splitCollage',
  label: '분할 콜라주',
  english: 'Split Panels',
  description: '화면을 2~4칸으로 나눠 칸마다 다른 사진, 또는 같은 사진을 다른 배율·위치로 어긋나게 넣어요.',
  category: 'composite',
  kind: 'overlay',
  params: [
    { key: 'layout', label: '나누기', type: 'select', default: 'tri', options: [
      { value: 'v2', label: '좌우 2칸' },
      { value: 'h2', label: '위아래 2칸' },
      { value: 'h3', label: '가로 띠 3칸' },
      { value: 'tri', label: '위 1 + 아래 2' },
      { value: 'quad', label: '4칸' },
    ] },
    { key: 'imgA', label: '1번 칸', type: 'image', default: 'current' },
    { key: 'imgB', label: '2번 칸', type: 'image', default: 'current' },
    { key: 'imgC', label: '3번 칸', type: 'image', default: 'current' },
    { key: 'imgD', label: '4번 칸', type: 'image', default: 'current' },
    { key: 'offset', label: '같은 사진일 때 어긋남', type: 'range', min: 0, max: 100, step: 1, default: 45 },
    { key: 'gap', label: '칸 사이 간격', type: 'range', min: 0, max: 20, step: 0.5, default: 0 },
    { key: 'gapColor', label: '간격 색', type: 'color', default: '#000000' },
    { key: 'drift', label: '칸마다 천천히 움직임', type: 'range', min: 0, max: 100, step: 1, default: 25, group: '모션' },
  ],
  render(rc, p) {
    const { ctx, w, h, s, t, seed } = rc;
    const list = panels(str(p, 'layout'));
    const keys = ['imgA', 'imgB', 'imgC', 'imgD'];
    const off = num(p, 'offset') / 100;
    const drift = num(p, 'drift') / 100;
    const gap = num(p, 'gap') * s;
    const snap = rc.snapshot();
    ctx.save();
    if (gap > 0) {
      ctx.fillStyle = str(p, 'gapColor');
      ctx.fillRect(0, 0, w, h);
    }
    list.forEach(([nx, ny, nw, nh], i) => {
      const x = nx * w + gap / 2;
      const y = ny * h + gap / 2;
      const pw = nw * w - gap;
      const ph = nh * h - gap;
      const v = str(p, keys[i]);
      const src = v === 'current' ? snap : pickSource(rc, v);
      const same = v === 'current' || v === 'base';
      // same picture: each panel shows a different zoom and offset of it; other picture: cover-fit it
      const z = same ? 1 + off * (0.3 + 1.2 * hash1(i, seed)) : 1;
      const mx = Math.sin(t * TAU + i * 1.7) * drift * 0.04;
      const my = Math.cos(t * TAU + i * 2.3) * drift * 0.04;
      const cx = same ? nx + nw / 2 + (hash1(i, seed + 1) - 0.5) * off * 0.5 + mx : 0.5 + mx;
      const cy = same ? ny + nh / 2 + (hash1(i, seed + 2) - 0.5) * off * 0.5 + my : 0.5 + my;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, pw, ph);
      ctx.clip();
      if (same) {
        const sw = pw / z;
        const sh = ph / z;
        ctx.drawImage(src, cx * w - sw / 2, cy * h - sh / 2, sw, sh, x, y, pw, ph);
      } else {
        const k = Math.max(pw / w, ph / h) * 1.05;
        const dw = w * k;
        const dh = h * k;
        ctx.drawImage(src, x + (pw - dw) * cx, y + (ph - dh) * cy, dw, dh);
      }
      ctx.restore();
    });
    ctx.restore();
  },
};

export const fillImage: EffectDef = {
  type: 'fillImage',
  label: '사진 채우기',
  english: 'Photo Fill',
  description: '다른 사진(하늘·바다 등)으로 영역을 채워요. 물체 선택과 함께 쓰면 그 물체 안에만 들어가고, 계단처럼 각진 경계도 만들 수 있어요.',
  category: 'composite',
  kind: 'overlay',
  params: [
    { key: 'image', label: '채울 사진', type: 'image', default: 'base' },
    { key: 'area', label: '채울 영역', type: 'rect', default: { x: 0, y: 0, w: 1, h: 0.45 }, color: '#3dd6ff' },
    { key: 'edge', label: '경계', type: 'select', default: 'steps', options: [
      { value: 'straight', label: '반듯하게' },
      { value: 'steps', label: '계단처럼 각지게' },
      { value: 'soft', label: '부드럽게' },
    ] },
    { key: 'block', label: '계단 크기', type: 'range', min: 1, max: 15, step: 0.5, default: 4, unit: '%' },
    { key: 'zoom', label: '사진 확대', type: 'range', min: 100, max: 300, step: 1, default: 130, unit: '%' },
    { key: 'flip', label: '뒤집기', type: 'select', default: 'v', options: [
      { value: 'none', label: '그대로' },
      { value: 'v', label: '위아래' },
      { value: 'h', label: '좌우' },
    ] },
    { key: 'drift', label: '천천히 흐르기', type: 'range', min: 0, max: 100, step: 1, default: 20, group: '모션' },
  ],
  render(rc, p) {
    const { ctx, w, h, t, seed } = rc;
    const a = rectPx(rect(p, 'area'), w, h);
    const src = pickSource(rc, str(p, 'image'));
    const edge = str(p, 'edge');
    const B = Math.max(2, (num(p, 'block') / 100) * w);
    ctx.save();
    ctx.beginPath();
    if (edge === 'steps') {
      // a staircase silhouette: each side is cut back by whole blocks that change in steps,
      // except sides that touch the frame edge
      const cols = Math.ceil(a.w / B);
      const rows = Math.ceil(a.h / B);
      const depth = 3;
      const cut = (i: number, side: number, open: boolean) => (open ? Math.floor(fbm1(i * 0.32 + side * 17, seed) * (depth + 1)) : 0);
      const openT = a.y > 1;
      const openB = a.y + a.h < h - 1;
      const openL = a.x > 1;
      const openR = a.x + a.w < w - 1;
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          if (r < cut(c, 1, openT) || r >= rows - cut(c, 2, openB) || c < cut(r, 3, openL) || c >= cols - cut(r, 4, openR)) continue;
          ctx.rect(a.x + c * B, a.y + r * B, B + 0.5, B + 0.5);
        }
    } else ctx.rect(a.x, a.y, a.w, a.h);
    ctx.clip();
    const z = num(p, 'zoom') / 100;
    const dr = (num(p, 'drift') / 100) * 0.05;
    const dw = w * z;
    const dh = h * z;
    ctx.translate(w / 2 + Math.sin(t * TAU) * dr * w, h / 2 + Math.cos(t * TAU) * dr * h * 0.5);
    const flip = str(p, 'flip');
    ctx.scale(flip === 'h' ? -1 : 1, flip === 'v' ? -1 : 1);
    ctx.drawImage(src, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
    if (edge === 'soft') {
      // feather by fading the outermost band back to the picture underneath
      const f = Math.min(a.w, a.h) * 0.08;
      ctx.save();
      for (const [x, y, ww, hh, x0, y0, x1, y1] of [
        [a.x, a.y, a.w, f, 0, a.y, 0, a.y + f],
        [a.x, a.y + a.h - f, a.w, f, 0, a.y + a.h, 0, a.y + a.h - f],
        [a.x, a.y, f, a.h, a.x, 0, a.x + f, 0],
        [a.x + a.w - f, a.y, f, a.h, a.x + a.w, 0, a.x + a.w - f, 0],
      ]) {
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, 'rgba(0,0,0,1)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, ww, hh);
        ctx.clip();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = g;
        ctx.fillRect(x, y, ww, hh);
        ctx.restore();
      }
      ctx.restore();
    }
  },
};
