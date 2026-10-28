import { hash1, smoothstep } from '../random';
import type { EffectDef } from '../types';
import { bool, num, rgba, str } from './util';

export const FONTS: { value: string; label: string; weight: number; style?: string }[] = [
  { value: 'Anton', label: 'Anton (콘덴스드)', weight: 400 },
  { value: 'Bebas Neue', label: 'Bebas Neue', weight: 400 },
  { value: 'Oswald', label: 'Oswald', weight: 700 },
  { value: 'Archivo Black', label: 'Archivo Black', weight: 400 },
  { value: 'Space Grotesk', label: 'Space Grotesk', weight: 700 },
  { value: 'Instrument Serif', label: 'Instrument Serif (세리프)', weight: 400 },
  { value: 'Instrument Serif Italic', label: 'Instrument Serif Italic', weight: 400, style: 'italic' },
  { value: 'IBM Plex Mono', label: 'IBM Plex Mono (모노)', weight: 600 },
  { value: 'Inter', label: 'Inter', weight: 700 },
];

export const text: EffectDef = {
  type: 'text',
  label: '타이포',
  english: 'Typography',
  kind: 'overlay',
  category: 'text',
  description: '굵은 콘덴스드 대문자 문구를 얹습니다. 커버·릴스용 한 줄 카피.',
  params: [
    { key: 'text', label: '문구', type: 'text', multiline: true, default: 'SHAPING THE VISUAL\nIDENTITY\nOF YOUR SOUND.' },
    { key: 'font', label: '폰트', type: 'select', default: 'Anton', options: FONTS.map((f) => ({ value: f.value, label: f.label })) },
    { key: 'size', label: '크기', type: 'range', min: 8, max: 400, step: 1, default: 78 },
    { key: 'x', label: '가로 위치', type: 'range', min: 0, max: 100, step: 0.5, default: 50, unit: '%' },
    { key: 'y', label: '세로 위치', type: 'range', min: 0, max: 100, step: 0.5, default: 50, unit: '%' },
    {
      key: 'align',
      label: '정렬',
      type: 'select',
      default: 'center',
      options: [
        { value: 'left', label: '왼쪽' },
        { value: 'center', label: '가운데' },
        { value: 'right', label: '오른쪽' },
      ],
    },
    { key: 'color', label: '색', type: 'color', default: '#ffffff' },
    { key: 'uppercase', label: '대문자', type: 'bool', default: true },
    { key: 'tracking', label: '자간', type: 'range', min: -10, max: 40, step: 0.5, default: 0, unit: '%' },
    { key: 'leading', label: '행간', type: 'range', min: 70, max: 200, step: 1, default: 102, unit: '%' },
    { key: 'shadow', label: '그림자', type: 'range', min: 0, max: 100, step: 1, default: 55 },
    {
      key: 'anim',
      label: '등장 방식',
      type: 'select',
      default: 'fade',
      group: '모션',
      options: [
        { value: 'none', label: '처음부터 보임' },
        { value: 'fade', label: '페이드' },
        { value: 'type', label: '타자기' },
        { value: 'rise', label: '줄마다 올라오기' },
        { value: 'glitch', label: '글리치' },
      ],
    },
    { key: 'delay', label: '시작 시점', type: 'range', min: 0, max: 90, step: 1, default: 0, unit: '%', group: '모션' },
  ],
  render(rc, p) {
    const { ctx, w, h, s } = rc;
    const raw = str(p, 'text');
    const content = bool(p, 'uppercase') ? raw.toUpperCase() : raw;
    const lines = content.split('\n');
    const font = FONTS.find((f) => f.value === str(p, 'font')) ?? FONTS[0];
    const family = font.value.replace(' Italic', '');
    const size = num(p, 'size') * s;
    const lh = size * (num(p, 'leading') / 100);
    const align = str(p, 'align') as CanvasTextAlign;
    const color = str(p, 'color');
    const anim = str(p, 'anim');
    const lt = Math.max(0, (rc.t - num(p, 'delay') / 100) / Math.max(0.05, 1 - num(p, 'delay') / 100));
    if (anim !== 'none' && rc.t < num(p, 'delay') / 100) return;

    ctx.font = `${font.style ?? ''} ${font.weight} ${size}px "${family}"`.trim();
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${(num(p, 'tracking') / 100) * size}px`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';

    const ax = (num(p, 'x') / 100) * w;
    const blockH = lh * (lines.length - 1) + size * 0.8;
    const top = (num(p, 'y') / 100) * h - blockH / 2 + size * 0.8;

    const shadow = num(p, 'shadow') / 100;
    if (shadow > 0) {
      ctx.shadowColor = `rgba(0,0,0,${0.85 * shadow})`;
      ctx.shadowBlur = 22 * s * shadow + 2 * s;
      ctx.shadowOffsetY = 4 * s;
    }

    const totalChars = lines.reduce((n, l) => n + l.length, 0);
    let visibleChars = totalChars;
    if (anim === 'type') visibleChars = Math.floor(totalChars * smoothstep(0, 0.55, lt));
    let alpha = 1;
    if (anim === 'fade') alpha = smoothstep(0, 0.2, lt);

    let used = 0;
    lines.forEach((line, li) => {
      let y = top + li * lh;
      let x = ax;
      let a = alpha;
      let shown = line;
      if (anim === 'type') {
        shown = line.slice(0, Math.max(0, visibleChars - used));
        used += line.length;
      } else if (anim === 'rise') {
        const k = smoothstep(li * 0.08, li * 0.08 + 0.18, lt);
        y += (1 - k) * size * 0.6;
        a = k;
      } else if (anim === 'glitch') {
        const step = Math.floor(rc.time * 14);
        const settle = smoothstep(0.1, 0.4, lt);
        const r = hash1(li * 41 + step, rc.seed);
        const glitching = r < 0.85 * (1 - settle) + 0.04;
        a = lt < 0.03 ? 0 : 1;
        if (glitching) {
          x += (hash1(li * 7 + step, rc.seed ^ 3) - 0.5) * size * 0.6 * (1 - settle * 0.7);
          ctx.save();
          ctx.shadowColor = 'transparent';
          ctx.globalAlpha = 0.7;
          ctx.fillStyle = 'rgba(255,40,80,0.9)';
          ctx.fillText(shown, x - 4 * s, y);
          ctx.fillStyle = 'rgba(40,220,255,0.9)';
          ctx.fillText(shown, x + 4 * s, y);
          ctx.restore();
        }
      }
      if (a <= 0 || !shown) return;
      ctx.fillStyle = rgba(color, a);
      ctx.fillText(shown, x, y);
    });
  },
};
