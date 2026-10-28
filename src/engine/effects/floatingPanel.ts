import { hash1, TAU } from '../random';
import type { EffectDef } from '../types';
import { bool, dropShadow, num, rect, rectPx, str } from './util';

/** Trace a panel outline centred on the origin. */
function shapePath(ctx: CanvasRenderingContext2D, shape: string, hw: number, hh: number, inset = 0) {
  const x = -hw + inset;
  const y = -hh + inset;
  const w = Math.max(1, hw * 2 - inset * 2);
  const h = Math.max(1, hh * 2 - inset * 2);
  ctx.beginPath();
  if (shape === 'ellipse') ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, TAU);
  else if (shape === 'round') ctx.roundRect(x, y, w, h, Math.min(w, h) * 0.14);
  else if (shape === 'arch') {
    const r = Math.min(w / 2, h);
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.arc(x + w / 2, y + r, w / 2, Math.PI, 0);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
  } else ctx.rect(x, y, w, h);
}

export const floatingPanel: EffectDef = {
  type: 'floatingPanel',
  label: '떠있는 조각',
  english: 'Floating Panel',
  kind: 'overlay',
  category: 'composite',
  description: '사진의 한 부분(하늘·땅)을 잘라 다른 위치에 띄웁니다. 네모·아치·원 창문, 지층 두께, 물 반사까지.',
  params: [
    { key: 'source', label: '가져올 사진', type: 'image', default: 'current' },
    { key: 'src', label: '잘라올 영역', type: 'rect', default: { x: 0.1, y: 0.04, w: 0.8, h: 0.2 }, color: '#ffb03d' },
    { key: 'dst', label: '띄울 위치', type: 'rect', default: { x: 0.18, y: 0.3, w: 0.64, h: 0.18 }, color: '#2fe0a0' },
    {
      key: 'shape',
      label: '모양',
      type: 'select',
      default: 'rect',
      options: [
        { value: 'rect', label: '네모' },
        { value: 'round', label: '둥근 네모' },
        { value: 'arch', label: '아치' },
        { value: 'ellipse', label: '원' },
      ],
    },
    {
      key: 'mode',
      label: '원래 자리',
      type: 'select',
      default: 'clone',
      options: [
        { value: 'clone', label: '그대로 둠 (복제)' },
        { value: 'cut', label: '비움 (잘라내기)' },
      ],
    },
    { key: 'hole', label: '비운 자리 색', type: 'color', default: '#000000' },
    { key: 'flipX', label: '좌우 뒤집기', type: 'bool', default: false },
    { key: 'flipY', label: '상하 뒤집기 (반사)', type: 'bool', default: false },
    { key: 'opacity', label: '불투명도', type: 'range', min: 0, max: 100, step: 1, default: 100, unit: '%' },
    { key: 'border', label: '테두리', type: 'range', min: 0, max: 40, step: 0.5, default: 0 },
    { key: 'borderColor', label: '테두리 색', type: 'color', default: '#f3f2ee' },
    { key: 'thickness', label: '두께 (슬래브)', type: 'range', min: 0, max: 300, step: 1, default: 0, group: '입체' },
    {
      key: 'side',
      label: '옆면 질감',
      type: 'select',
      default: 'strata',
      group: '입체',
      options: [
        { value: 'strata', label: '지층 (가로 결)' },
        { value: 'streak', label: '스트레치 (세로 결)' },
      ],
    },
    { key: 'sideShade', label: '옆면 어둡기', type: 'range', min: 0, max: 100, step: 1, default: 55, group: '입체' },
    { key: 'shadow', label: '그림자', type: 'range', min: 0, max: 100, step: 1, default: 30, group: '입체' },
    { key: 'ripple', label: '물결 (반사용)', type: 'range', min: 0, max: 100, step: 1, default: 0, group: '입체' },
    { key: 'float', label: '둥둥 뜨는 폭', type: 'range', min: 0, max: 60, step: 1, default: 10, group: '모션' },
    { key: 'tilt', label: '기울어짐 (도)', type: 'range', min: 0, max: 8, step: 0.1, default: 0, group: '모션' },
    { key: 'pan', label: '안쪽 흐름', type: 'range', min: 0, max: 100, step: 1, default: 0, group: '모션' },
    { key: 'cycles', label: '루프 반복', type: 'range', min: 1, max: 4, step: 1, default: 1, group: '모션' },
  ],
  render(rc, p) {
    const { ctx, s } = rc;
    const source = str(p, 'source');
    const srcCanvas =
      source === 'current' ? rc.snapshot() : source === 'base' ? rc.base : (rc.image(source) ?? rc.base);
    const S = rectPx(rect(p, 'src'), rc.w, rc.h);
    const D = rectPx(rect(p, 'dst'), rc.w, rc.h);
    const shape = str(p, 'shape');

    if (str(p, 'mode') === 'cut') {
      ctx.fillStyle = str(p, 'hole');
      ctx.fillRect(S.x, S.y, S.w, S.h);
    }

    const phase = TAU * rc.t * num(p, 'cycles') + hash1(1, rc.seed) * TAU;
    const dy = num(p, 'float') * s * Math.sin(phase);
    const rot = ((num(p, 'tilt') * Math.PI) / 180) * Math.sin(phase + 1.3);
    const thick = num(p, 'thickness') * s;
    const hw = D.w / 2;
    const hh = D.h / 2;
    // slide the sampled window inside the source for a slow "view through a window" drift
    const pan = (num(p, 'pan') / 100) * Math.sin(phase) * S.w * 0.15;
    const sx = Math.max(0, Math.min(rc.w - S.w, S.x + pan));

    ctx.translate(D.x + hw, D.y + hh + dy);
    ctx.rotate(rot);

    dropShadow(ctx, num(p, 'shadow') / 100, s, () => {
      if (thick > 0.5 && shape === 'rect') {
        ctx.beginPath();
        ctx.rect(-hw, -hh, D.w, D.h + thick);
      } else shapePath(ctx, shape, hw, hh);
    });

    if (thick > 0.5) {
      if (str(p, 'side') === 'strata') {
        ctx.drawImage(srcCanvas, sx + Math.floor(S.w / 2), S.y, 1, S.h, -hw, hh, D.w, thick);
      } else {
        ctx.drawImage(srcCanvas, sx, S.y + S.h - 1, S.w, 1, -hw, hh, D.w, thick);
      }
      const shade = num(p, 'sideShade') / 100;
      const g = ctx.createLinearGradient(0, hh, 0, hh + thick);
      g.addColorStop(0, `rgba(0,0,0,${shade * 0.35})`);
      g.addColorStop(1, `rgba(0,0,0,${Math.min(1, shade * 1.1)})`);
      ctx.fillStyle = g;
      ctx.fillRect(-hw, hh, D.w, thick);
    }

    ctx.save();
    ctx.globalAlpha = num(p, 'opacity') / 100;
    shapePath(ctx, shape, hw, hh);
    ctx.clip();
    ctx.scale(bool(p, 'flipX') ? -1 : 1, bool(p, 'flipY') ? -1 : 1);
    const ripple = (num(p, 'ripple') / 100) * 12 * s;
    if (ripple > 0) {
      const step = Math.max(1, Math.round(2 * s));
      for (let y = 0; y < D.h; y += step) {
        const f = y / D.h;
        const off = Math.sin(y / (5 * s) + phase * 2) * ripple * (0.3 + f);
        const sy = S.y + (y / D.h) * S.h;
        ctx.drawImage(srcCanvas, sx, sy, S.w, Math.max(1, (step / D.h) * S.h), -hw + off, -hh + y, D.w, step);
      }
    } else {
      ctx.drawImage(srcCanvas, sx, S.y, S.w, S.h, -hw, -hh, D.w, D.h);
    }
    ctx.restore();

    const border = num(p, 'border') * s;
    if (border > 0) {
      ctx.strokeStyle = str(p, 'borderColor');
      ctx.lineWidth = border;
      shapePath(ctx, shape, hw, hh, border / 2);
      ctx.stroke();
    }
  },
};
