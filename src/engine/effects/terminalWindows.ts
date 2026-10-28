import { hash1, mulberry32, TAU } from '../random';
import type { EffectDef } from '../types';
import { bool, num, rect, str } from './util';

const THEMES: Record<string, { bg: string; fg: string; dim: string; border: string; bar: string; barFg: string }> = {
  blue: { bg: 'rgba(38,78,255,0.9)', fg: '#eef2ff', dim: 'rgba(238,242,255,0.55)', border: '#a9bbff', bar: '#1832c9', barFg: '#ffffff' },
  black: { bg: 'rgba(6,6,8,0.9)', fg: '#ececec', dim: 'rgba(236,236,236,0.45)', border: 'rgba(255,255,255,0.55)', bar: '#1b1b1f', barFg: '#ffffff' },
  white: { bg: 'rgba(242,241,236,0.94)', fg: '#111111', dim: 'rgba(17,17,17,0.45)', border: '#111111', bar: '#111111', barFg: '#f2f1ec' },
  green: { bg: 'rgba(3,12,6,0.9)', fg: '#86ffa3', dim: 'rgba(134,255,163,0.45)', border: 'rgba(134,255,163,0.6)', bar: '#0c2a14', barFg: '#86ffa3' },
  retro: { bg: '#c3c3c3', fg: '#111111', dim: '#6b6b6b', border: '#ffffff', bar: '#0a2a8a', barFg: '#ffffff' },
  mac: { bg: '#f1f0ea', fg: '#111111', dim: '#777777', border: '#111111', bar: '#d9d8d2', barFg: '#111111' },
};

const TITLES = ['SIG_MONITOR', 'terrain_scan', 'node.log', 'MEM_DUMP', 'spectral.exe', 'ARCHIVE_04', 'waveform', 'trace —', 'DREAM.SYS', 'sensor_grid'];
const OPS = ['mov', 'xor', 'jmp', 'ld', 'str', 'cmp', 'add', 'sync', 'push', 'pop'];
const LOGS = ['sampling terrain', 'linking node', 'decoding signal', 'mapping ridge', 'indexing memory', 'listening', 'resolving face', 'tracing light'];

const hex = (v: number, n: number) => Math.floor(v * 16 ** n).toString(16).toUpperCase().padStart(n, '0');

function codeLine(k: number, seed: number): string {
  const h = (j: number) => hash1(k * 53 + j, seed);
  switch (Math.floor(h(0) * 5)) {
    case 0:
      return `0x${hex(h(1), 4)}  ${OPS[Math.floor(h(2) * OPS.length)]}  r${Math.floor(h(3) * 9)}, [sig+0x${hex(h(4), 2)}]`;
    case 1:
      return `> ${LOGS[Math.floor(h(1) * LOGS.length)]} ... ${Math.floor(h(2) * 100)}%`;
    case 2:
      return `[OK] node ${hex(h(1), 4)} linked  ${(h(2) * 9).toFixed(3)}ms`;
    case 3:
      return `freq=${(100 + h(1) * 900).toFixed(2)}Hz  amp=${(h(2) * -24).toFixed(1)}dB`;
    default:
      return Array.from({ length: 8 }, (_, j) => hex(h(j + 1), 2)).join(' ');
  }
}

export const terminalWindows: EffectDef = {
  type: 'terminalWindows',
  label: 'HUD 창',
  english: 'Terminal Windows',
  kind: 'overlay',
  category: 'data',
  description: '코드·파형·확대 모니터 창을 화면 곳곳에 띄웁니다. 파란 창을 사람·사물 주변에 흩뿌리는 스타일.',
  params: [
    { key: 'area', label: '배치 영역', type: 'rect', default: { x: 0.05, y: 0.12, w: 0.9, h: 0.76 }, color: '#7f9bff' },
    { key: 'count', label: '창 개수', type: 'range', min: 1, max: 40, step: 1, default: 12 },
    {
      key: 'content',
      label: '창 내용',
      type: 'select',
      default: 'mixed',
      options: [
        { value: 'mixed', label: '섞어서' },
        { value: 'code', label: '코드/로그' },
        { value: 'wave', label: '파형' },
        { value: 'monitor', label: '확대 모니터' },
      ],
    },
    {
      key: 'theme',
      label: '색 테마',
      type: 'select',
      default: 'blue',
      options: [
        { value: 'blue', label: '블루' },
        { value: 'black', label: '블랙' },
        { value: 'white', label: '화이트' },
        { value: 'green', label: '그린 터미널' },
        { value: 'retro', label: '윈도우 95' },
        { value: 'mac', label: '클래식 맥' },
      ],
    },
    { key: 'size', label: '창 크기', type: 'range', min: 5, max: 70, step: 1, default: 20, unit: '%' },
    { key: 'sizeVar', label: '크기 다양함', type: 'range', min: 0, max: 100, step: 1, default: 60, unit: '%' },
    { key: 'fontSize', label: '글자 크기', type: 'range', min: 5, max: 20, step: 1, default: 9 },
    { key: 'opacity', label: '불투명도', type: 'range', min: 0, max: 100, step: 1, default: 92, unit: '%' },
    { key: 'popIn', label: '하나씩 뜨기', type: 'bool', default: true, group: '모션' },
    { key: 'scroll', label: '텍스트 스크롤 속도', type: 'range', min: 0, max: 100, step: 1, default: 40, group: '모션' },
    { key: 'jitter', label: '깜빡임/튐', type: 'range', min: 0, max: 100, step: 1, default: 15, group: '모션' },
  ],
  render(rc, p) {
    const { ctx, w, h, s, t, seed } = rc;
    const theme = THEMES[str(p, 'theme')] ?? THEMES.blue;
    const area = rect(p, 'area');
    const count = num(p, 'count');
    const content = str(p, 'content');
    const fs = num(p, 'fontSize') * s;
    const opacity = num(p, 'opacity') / 100;
    const jitter = num(p, 'jitter') / 100;
    const snap = content === 'mixed' || content === 'monitor' ? rc.snapshot() : null;
    const rng = mulberry32(seed);

    for (let i = 0; i < count; i++) {
      const sizeVar = num(p, 'sizeVar') / 100;
      const ww = w * (num(p, 'size') / 100) * (1 - sizeVar * 0.6 + rng() * sizeVar * 1.2);
      const kind = content === 'mixed' ? ['code', 'code', 'wave', 'monitor'][Math.floor(rng() * 4)] : content;
      const aspect = kind === 'code' ? 0.45 + rng() * 0.5 : 0.55 + rng() * 0.35;
      const wh = ww * aspect;
      let x = area.x * w + rng() * Math.max(0, area.w * w - ww);
      let y = area.y * h + rng() * Math.max(0, area.h * h - wh);
      const appear = rng() * 0.5;
      const titleIdx = Math.floor(rng() * TITLES.length);
      const focus = { x: rng(), y: rng() };

      // pop-in with a short blink, then occasional jumps
      if (bool(p, 'popIn')) {
        const since = t - appear;
        if (since < 0) continue;
        if (since < 0.03 && Math.floor(rc.frame / 2) % 2 === 0) continue;
      }
      const step = Math.floor(rc.time * 6);
      const jr = hash1(i * 31 + step, seed ^ 0x5a);
      if (jr < jitter * 0.12) continue;
      if (jr < jitter * 0.35) {
        x += (hash1(i + step, seed) - 0.5) * 30 * s;
        y += (hash1(i + step * 3, seed) - 0.5) * 12 * s;
      }

      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.beginPath();
      ctx.rect(x, y, ww, wh);
      ctx.clip();
      ctx.fillStyle = theme.bg;
      ctx.fillRect(x, y, ww, wh);

      const bar = Math.max(fs * 1.5, 8 * s);
      ctx.fillStyle = theme.bar;
      ctx.fillRect(x, y, ww, bar);
      ctx.fillStyle = theme.barFg;
      ctx.font = `600 ${fs * 0.9}px "IBM Plex Mono", monospace`;
      ctx.textBaseline = 'middle';
      ctx.fillText(`${TITLES[titleIdx]}_${String(i).padStart(2, '0')}`, x + 4 * s, y + bar / 2);
      for (let b = 0; b < 3; b++) {
        ctx.fillRect(x + ww - (b + 1) * bar * 0.8, y + bar * 0.3, bar * 0.4, bar * 0.4);
      }

      const ix = x + 4 * s;
      const iy = y + bar + 4 * s;
      const iw = ww - 8 * s;
      const ih = wh - bar - 8 * s;

      if (kind === 'code') {
        ctx.font = `400 ${fs}px "IBM Plex Mono", monospace`;
        ctx.textBaseline = 'top';
        const lh = fs * 1.35;
        const rows = Math.max(1, Math.floor(ih / lh));
        const offset = Math.floor(rc.time * (0.5 + num(p, 'scroll') / 8)) + i * 13;
        for (let r = 0; r < rows; r++) {
          const k = offset + r;
          ctx.fillStyle = hash1(k, seed ^ 0x99) < 0.2 ? theme.dim : theme.fg;
          ctx.fillText(codeLine(k, seed ^ i), ix, iy + r * lh);
        }
      } else if (kind === 'wave') {
        ctx.strokeStyle = theme.dim;
        ctx.lineWidth = Math.max(0.5, 0.6 * s);
        ctx.beginPath();
        for (let gx = 1; gx < 8; gx++) {
          ctx.moveTo(ix + (iw * gx) / 8, iy);
          ctx.lineTo(ix + (iw * gx) / 8, iy + ih);
        }
        for (let gy = 1; gy < 4; gy++) {
          ctx.moveTo(ix, iy + (ih * gy) / 4);
          ctx.lineTo(ix + iw, iy + (ih * gy) / 4);
        }
        ctx.stroke();
        ctx.strokeStyle = theme.fg;
        ctx.lineWidth = Math.max(1, 1.2 * s);
        ctx.beginPath();
        const f1 = 2 + hash1(i, seed) * 6;
        const f2 = 9 + hash1(i, seed ^ 1) * 20;
        for (let k = 0; k <= 120; k++) {
          const u = k / 120;
          const v =
            Math.sin(TAU * (u * f1 + t * 2)) * 0.5 +
            Math.sin(TAU * (u * f2 - t * 3 + i)) * 0.25 * Math.sin(TAU * t + u * 3) +
            (hash1(k + Math.floor(rc.time * 12) * 200, seed ^ i) - 0.5) * 0.25;
          const px = ix + u * iw;
          const py = iy + ih / 2 - v * ih * 0.42;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.fillStyle = theme.fg;
        ctx.font = `400 ${fs * 0.85}px "IBM Plex Mono", monospace`;
        ctx.textBaseline = 'bottom';
        ctx.fillText(`CH${i % 4 + 1}  ${(100 + hash1(i, seed) * 800).toFixed(1)}Hz`, ix, iy + ih);
      } else if (snap) {
        // zoomed, high-contrast view of the picture under a random focus point
        const zw = rc.w * 0.18;
        const zh = zw * (ih / Math.max(1, iw));
        const sx = Math.min(rc.w - zw, Math.max(0, focus.x * rc.w - zw / 2 + Math.sin(TAU * t) * zw * 0.1));
        const sy = Math.min(rc.h - zh, Math.max(0, focus.y * rc.h - zh / 2));
        ctx.drawImage(snap, sx, sy, zw, zh, ix, iy, iw, ih);
        ctx.globalCompositeOperation = 'color';
        ctx.fillStyle = theme.bg;
        ctx.fillRect(ix, iy, iw, ih);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        for (let ly = iy; ly < iy + ih; ly += 3 * s) ctx.fillRect(ix, ly, iw, Math.max(1, s));
        ctx.strokeStyle = theme.fg;
        ctx.lineWidth = Math.max(1, s);
        const cx = ix + iw / 2;
        const cy = iy + ih / 2;
        ctx.strokeRect(cx - 8 * s, cy - 8 * s, 16 * s, 16 * s);
      }

      ctx.restore();
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.strokeStyle = theme.border;
      ctx.lineWidth = Math.max(1, s);
      ctx.strokeRect(x + 0.5, y + 0.5, ww - 1, wh - 1);
      ctx.restore();
    }
  },
};
