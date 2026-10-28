import { hash1, mulberry32, TAU } from '../random';
import type { EffectDef } from '../types';
import { bool, num, str } from './util';

export const mirror: EffectDef = {
  type: 'mirror',
  label: '거울 세계',
  english: 'Mirror World',
  description: '화면 반쪽을 거울처럼 뒤집어 대칭을 만듭니다. 위아래로 하면 물에 비친 세계.',
  category: 'distort',
  params: [
    {
      key: 'mode',
      label: '방향',
      type: 'select',
      default: 'tb',
      options: [
        { value: 'lr', label: '왼쪽 → 오른쪽' },
        { value: 'rl', label: '오른쪽 → 왼쪽' },
        { value: 'tb', label: '위 → 아래 (반사)' },
        { value: 'bt', label: '아래 → 위' },
        { value: 'quad', label: '4분할' },
        { value: 'kaleido', label: '만화경 (원형)' },
      ],
    },
    { key: 'segments', label: '만화경 조각 수', type: 'range', min: 4, max: 16, step: 2, default: 8 },
    { key: 'axis', label: '거울 위치', type: 'range', min: 10, max: 90, step: 0.5, default: 50, unit: '%' },
    { key: 'ripple', label: '반사 물결', type: 'range', min: 0, max: 100, step: 1, default: 0 },
    { key: 'darken', label: '반사쪽 어둡게', type: 'range', min: 0, max: 100, step: 1, default: 0 },
    { key: 'spin', label: '만화경 회전', type: 'range', min: 0, max: 100, step: 1, default: 30, group: '모션' },
  ],
  render(rc, p) {
    const { ctx, w, h, s, t } = rc;
    const src = rc.snapshot();
    const mode = str(p, 'mode');
    const ax = num(p, 'axis') / 100;
    const ripple = (num(p, 'ripple') / 100) * 14 * s;
    const step = Math.max(1, Math.round(2 * s));
    const darken = num(p, 'darken') / 100;

    if (mode === 'kaleido') {
      // even segments show the source wedge, odd ones its reflection, so seams line up
      const n = num(p, 'segments');
      const wedge = TAU / n;
      const R = Math.hypot(w, h);
      const spin = (num(p, 'spin') / 100) * TAU * t * 0.25;
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < n; i++) {
        ctx.save();
        ctx.translate(w / 2, h / 2);
        if (i % 2) {
          ctx.rotate((i + 1) * wedge);
          ctx.scale(1, -1);
        } else ctx.rotate(i * wedge);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, R, -0.002, wedge + 0.002);
        ctx.closePath();
        ctx.clip();
        ctx.rotate(spin);
        // enlarge the source so every wedge reaches the frame corners
        const k = Math.hypot(w, h) / Math.min(w, h);
        ctx.scale(k, k);
        ctx.drawImage(src, -w * ax, -h / 2);
        ctx.restore();
      }
      return;
    }

    if (mode === 'quad') {
      const cw = Math.round(w * ax);
      const ch = Math.round(h * ax);
      const tiles: [number, number, number, number][] = [
        [1, 1, 0, 0],
        [-1, 1, 2 * cw, 0],
        [1, -1, 0, 2 * ch],
        [-1, -1, 2 * cw, 2 * ch],
      ];
      for (const [fx, fy, tx, ty] of tiles) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(tx === 0 ? 0 : cw, ty === 0 ? 0 : ch, tx === 0 ? cw : w - cw, ty === 0 ? ch : h - ch);
        ctx.clip();
        ctx.translate(tx, ty);
        ctx.scale(fx, fy);
        ctx.drawImage(src, 0, 0, cw, ch, 0, 0, cw, ch);
        ctx.restore();
      }
      return;
    }

    const vertical = mode === 'tb' || mode === 'bt';
    const len = vertical ? h : w;
    const axis = Math.round(len * ax);
    // keep side A, rebuild side B as its reflection, one strip at a time so it can ripple
    const keepFirst = mode === 'tb' || mode === 'lr';
    const bLen = keepFirst ? len - axis : axis;
    for (let i = 0; i < bLen; i += step) {
      const srcPos = keepFirst ? axis - 1 - i : axis + i;
      const dstPos = keepFirst ? axis + i : axis - 1 - i;
      if (srcPos < 0 || srcPos >= len) continue;
      const off = ripple ? Math.sin(i / (6 * s) + TAU * t * 2) * ripple * (0.3 + i / bLen) : 0;
      if (vertical) ctx.drawImage(src, 0, srcPos, w, step, off, dstPos, w, step);
      else ctx.drawImage(src, srcPos, 0, step, h, dstPos, off, step, h);
    }
    if (darken > 0) {
      ctx.fillStyle = `rgba(0,0,0,${darken * 0.7})`;
      if (vertical) ctx.fillRect(0, keepFirst ? axis : 0, w, bLen);
      else ctx.fillRect(keepFirst ? axis : 0, 0, bLen, h);
    }
  },
};

export const wave: EffectDef = {
  type: 'wave',
  label: '물결 왜곡',
  english: 'Wave Warp',
  description: '화면을 물결처럼 휘게 합니다. 녹는 금속, 아지랑이, 흔들리는 신호.',
  category: 'distort',
  params: [
    {
      key: 'dir',
      label: '방향',
      type: 'select',
      default: 'h',
      options: [
        { value: 'h', label: '가로로 휨' },
        { value: 'v', label: '세로로 휨' },
        { value: 'both', label: '양쪽' },
      ],
    },
    { key: 'amp', label: '세기', type: 'range', min: 0, max: 100, step: 1, default: 30 },
    { key: 'freq', label: '물결 수', type: 'range', min: 1, max: 40, step: 1, default: 6 },
    { key: 'turb', label: '불규칙함', type: 'range', min: 0, max: 100, step: 1, default: 40 },
    { key: 'speed', label: '움직임 속도', type: 'range', min: 0, max: 4, step: 1, default: 1, group: '모션' },
  ],
  render(rc, p) {
    const { ctx, w, h, s, t } = rc;
    const amp = (num(p, 'amp') / 100) * 0.1 * Math.min(w, h);
    const freq = num(p, 'freq');
    const turb = num(p, 'turb') / 100;
    const k = num(p, 'speed');
    const p0 = hash1(1, rc.seed) * TAU;
    const step = Math.max(1, Math.round(2 * s));
    const pass = (horiz: boolean) => {
      const src = rc.snapshot();
      ctx.clearRect(0, 0, w, h);
      const len = horiz ? h : w;
      for (let i = 0; i < len; i += step) {
        const f = i / len;
        const off =
          amp *
          (Math.sin(f * freq * TAU + TAU * t * k + p0) + turb * 0.6 * Math.sin(f * freq * 2.73 * TAU - TAU * t * k * 2 + p0 * 2));
        if (horiz) {
          ctx.drawImage(src, 0, i, w, step, off, i, w, step);
          ctx.drawImage(src, 0, i, w, step, off + (off > 0 ? -w : w), i, w, step);
        } else {
          ctx.drawImage(src, i, 0, step, h, i, off, step, h);
          ctx.drawImage(src, i, 0, step, h, i, off + (off > 0 ? -h : h), step, h);
        }
      }
    };
    const dir = str(p, 'dir');
    if (dir !== 'v') pass(true);
    if (dir !== 'h') pass(false);
  },
};

export const datamosh: EffectDef = {
  type: 'datamosh',
  label: '블록 깨짐',
  english: 'Datamosh Blocks',
  description: '영상 압축이 깨진 것처럼 네모 블록이 밀리고 번지고 반복됩니다.',
  category: 'distort',
  params: [
    { key: 'block', label: '블록 크기', type: 'range', min: 4, max: 120, step: 1, default: 28 },
    { key: 'amount', label: '깨지는 양', type: 'range', min: 0, max: 100, step: 1, default: 25, unit: '%' },
    {
      key: 'mode',
      label: '깨지는 방식',
      type: 'select',
      default: 'mix',
      options: [
        { value: 'mix', label: '섞어서' },
        { value: 'smear', label: '아래로 번짐' },
        { value: 'shift', label: '어긋남' },
        { value: 'repeat', label: '반복' },
        { value: 'flat', label: '평균색 덩어리' },
      ],
    },
    { key: 'rgb', label: '색 어긋남', type: 'bool', default: true },
    { key: 'rate', label: '바뀌는 속도 (초당)', type: 'range', min: 0, max: 30, step: 1, default: 6, group: '모션' },
  ],
  render(rc, p) {
    const { ctx, w, h, s } = rc;
    const src = rc.snapshot();
    const bs = Math.max(2, Math.round(num(p, 'block') * s));
    const amount = num(p, 'amount') / 100;
    const rate = num(p, 'rate');
    const step = rate > 0 ? Math.floor(rc.time * rate) : 0;
    const rng = mulberry32((rc.seed ^ Math.imul(step + 3, 9973)) >>> 0);
    const modes = ['smear', 'shift', 'repeat', 'flat'];
    const sel = str(p, 'mode');
    const small = rc.scratch(0);
    const gw = Math.ceil(w / bs);
    const gh = Math.ceil(h / bs);
    small.ctx.drawImage(src, 0, 0, gw, gh);
    const avg = small.ctx.getImageData(0, 0, gw, gh).data;

    for (let by = 0; by < gh; by++) {
      for (let bx = 0; bx < gw; bx++) {
        if (rng() > amount) continue;
        const x = bx * bs;
        const y = by * bs;
        const mode = sel === 'mix' ? modes[Math.floor(rng() * modes.length)] : sel;
        const span = 1 + Math.floor(rng() * 4);
        if (mode === 'smear') {
          ctx.drawImage(src, x, y, bs, 1, x, y, bs, bs * span);
        } else if (mode === 'shift') {
          const dx = Math.round((rng() - 0.5) * 6) * bs;
          const dy = Math.round((rng() - 0.5) * 2) * bs;
          ctx.drawImage(src, x + dx, y + dy, bs * span, bs, x, y, bs * span, bs);
        } else if (mode === 'repeat') {
          for (let k = 1; k <= span; k++) ctx.drawImage(src, x, y, bs, bs, x + k * bs, y, bs, bs);
        } else {
          const i = (by * gw + bx) * 4;
          ctx.fillStyle = `rgb(${avg[i]},${avg[i + 1]},${avg[i + 2]})`;
          ctx.fillRect(x, y, bs * span, bs);
        }
        if (p.rgb && rng() < 0.35) {
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = rng() < 0.5 ? '#ff0040' : '#00e5ff';
          ctx.fillRect(x, y, bs * span, bs);
          ctx.restore();
        }
      }
    }
  },
};

export const mosaic: EffectDef = {
  type: 'mosaic',
  label: '모자이크',
  english: 'Mosaic',
  description: '큰 픽셀 덩어리로 바꿉니다. 적용 범위를 원/네모로 지정하면 얼굴만 가리기.',
  category: 'distort',
  params: [
    { key: 'cell', label: '칸 크기', type: 'range', min: 2, max: 160, step: 1, default: 28 },
    { key: 'gap', label: '칸 사이 틈', type: 'range', min: 0, max: 10, step: 0.5, default: 0 },
    { key: 'pulse', label: '칸 크기 출렁임', type: 'range', min: 0, max: 100, step: 1, default: 0, group: '모션' },
  ],
  render(rc, p) {
    const { ctx, w, h, s, t } = rc;
    const pulse = num(p, 'pulse') / 100;
    const cell = Math.max(1, num(p, 'cell') * s * (1 + pulse * 0.6 * Math.sin(TAU * t)));
    const src = rc.snapshot();
    const small = rc.scratch(0);
    const gw = Math.max(1, Math.round(w / cell));
    const gh = Math.max(1, Math.round(h / cell));
    small.ctx.imageSmoothingQuality = 'high';
    small.ctx.drawImage(src, 0, 0, gw, gh);
    const gap = num(p, 'gap') * s;
    ctx.imageSmoothingEnabled = false;
    if (gap <= 0) {
      ctx.drawImage(small.canvas, 0, 0, gw, gh, 0, 0, w, h);
      return;
    }
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    const cw = w / gw;
    const ch = h / gh;
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        ctx.drawImage(small.canvas, x, y, 1, 1, x * cw + gap / 2, y * ch + gap / 2, cw - gap, ch - gap);
      }
    }
  },
};

export const twirl: EffectDef = {
  type: 'twirl',
  label: '소용돌이',
  english: 'Twirl',
  description: '한 점을 중심으로 화면을 감아 돌립니다. 빨려 들어가는 소용돌이.',
  category: 'distort',
  params: [
    { key: 'cx', label: '중심 가로', type: 'range', min: 0, max: 100, step: 0.5, default: 50, unit: '%' },
    { key: 'cy', label: '중심 세로', type: 'range', min: 0, max: 100, step: 0.5, default: 50, unit: '%' },
    { key: 'radius', label: '반지름', type: 'range', min: 5, max: 150, step: 1, default: 60, unit: '%' },
    { key: 'angle', label: '감는 각도 (도)', type: 'range', min: -1080, max: 1080, step: 5, default: 360 },
    { key: 'spin', label: '돌아가는 정도', type: 'range', min: 0, max: 100, step: 1, default: 40, group: '모션' },
  ],
  render(rc, p) {
    const { ctx, w, h, t } = rc;
    const src = rc.ctx.getImageData(0, 0, w, h);
    const out = ctx.createImageData(w, h);
    const S = new Uint32Array(src.data.buffer);
    const D = new Uint32Array(out.data.buffer);
    const cx = (num(p, 'cx') / 100) * w;
    const cy = (num(p, 'cy') / 100) * h;
    const R = (num(p, 'radius') / 100) * Math.min(w, h) * 0.5;
    const spin = num(p, 'spin') / 100;
    const ang = ((num(p, 'angle') * Math.PI) / 180) * (1 - spin + spin * Math.sin(TAU * t));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const r = Math.sqrt(dx * dx + dy * dy);
        const i = y * w + x;
        if (r >= R) {
          D[i] = S[i];
          continue;
        }
        const k = 1 - r / R;
        const a = Math.atan2(dy, dx) + ang * k * k;
        const sx = Math.min(w - 1, Math.max(0, Math.round(cx + r * Math.cos(a))));
        const sy = Math.min(h - 1, Math.max(0, Math.round(cy + r * Math.sin(a))));
        D[i] = S[sy * w + sx];
      }
    }
    ctx.putImageData(out, 0, 0);
  },
};

export const polar: EffectDef = {
  type: 'polar',
  label: '원형 터널',
  english: 'Polar Tunnel',
  description: '사진을 둥글게 말아 터널·고리·눈동자 같은 원형 구조로 바꿉니다.',
  category: 'distort',
  params: [
    { key: 'hole', label: '가운데 구멍', type: 'range', min: 0, max: 90, step: 1, default: 25, unit: '%' },
    { key: 'repeat', label: '반복', type: 'range', min: 1, max: 6, step: 1, default: 1 },
    { key: 'invert', label: '안팎 뒤집기', type: 'bool', default: false },
    { key: 'holeColor', label: '구멍 색', type: 'color', default: '#000000' },
    { key: 'spin', label: '회전 속도', type: 'range', min: -2, max: 2, step: 1, default: 1, group: '모션' },
  ],
  render(rc, p) {
    const { ctx, w, h, t } = rc;
    const src = rc.ctx.getImageData(0, 0, w, h);
    const out = ctx.createImageData(w, h);
    const S = new Uint32Array(src.data.buffer);
    const D = new Uint32Array(out.data.buffer);
    const cx = w / 2;
    const cy = h / 2;
    const rMax = Math.hypot(cx, cy);
    const r0 = (num(p, 'hole') / 100) * Math.min(cx, cy);
    const rep = num(p, 'repeat');
    const rot = t * num(p, 'spin');
    const inv = bool(p, 'invert');
    const hc = str(p, 'holeColor').replace('#', '');
    const hn = parseInt(hc, 16);
    const hole = (255 << 24) | ((hn & 255) << 16) | (((hn >> 8) & 255) << 8) | ((hn >> 16) & 255);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const r = Math.sqrt(dx * dx + dy * dy);
        const i = y * w + x;
        if (r < r0) {
          D[i] = hole >>> 0;
          continue;
        }
        let u = (Math.atan2(dy, dx) / TAU + 0.5) * rep + rot;
        u -= Math.floor(u);
        let v = (r - r0) / (rMax - r0);
        if (!inv) v = 1 - v;
        const sx = Math.min(w - 1, Math.floor(u * w));
        const sy = Math.min(h - 1, Math.max(0, Math.floor(v * h)));
        D[i] = S[sy * w + sx];
      }
    }
    ctx.putImageData(out, 0, 0);
  },
};
