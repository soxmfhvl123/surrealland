import { clamp, hash1 } from '../random';
import type { Params, Rect, RenderContext } from '../types';

export interface PxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Normalized rect → integer pixel rect clipped to the frame (always at least 1×1). */
export function rectPx(r: Rect, w: number, h: number): PxRect {
  const x = clamp(Math.round(r.x * w), 0, w - 1);
  const y = clamp(Math.round(r.y * h), 0, h - 1);
  const x2 = clamp(Math.round((r.x + r.w) * w), x + 1, w);
  const y2 = clamp(Math.round((r.y + r.h) * h), y + 1, h);
  return { x, y, w: x2 - x, h: y2 - y };
}

export const num = (p: Params, k: string) => p[k] as number;
export const str = (p: Params, k: string) => p[k] as string;
export const bool = (p: Params, k: string) => p[k] as boolean;
export const rect = (p: Params, k: string) => p[k] as Rect;

/** Perceived brightness 0..255 of a little-endian RGBA pixel read through a Uint32Array. */
export const lum32 = (c: number) => ((c & 255) * 54 + ((c >>> 8) & 255) * 183 + ((c >>> 16) & 255) * 19) >>> 8;

export function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '');
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m.padEnd(6, '0');
  const n = parseInt(full.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const rgba = (hex: string, a: number) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};

export const motionOptions = [
  { value: 'none', label: '정지' },
  { value: 'breathe', label: '숨쉬기 (루프)' },
  { value: 'grow', label: '점점 커짐' },
  { value: 'sweep', label: '경계 이동 (루프)' },
  { value: 'flow', label: '흐름' },
];

/**
 * Soft drop shadow for a path without painting the path itself: the path is drawn far
 * off-canvas and only its shadow is offset back. Shadow offsets live in device space,
 * so the shift is converted through the current transform to stay correct when rotated or scaled.
 */
export function dropShadow(
  ctx: CanvasRenderingContext2D,
  strength: number,
  scale: number,
  path: () => void,
  dy = 26,
) {
  if (strength <= 0) return;
  const off = ctx.canvas.width * 4;
  const inv = ctx.getTransform().inverse();
  ctx.save();
  ctx.translate(inv.a * -off, inv.b * -off);
  ctx.shadowColor = `rgba(0,0,0,${0.85 * strength})`;
  ctx.shadowBlur = (14 + 50 * strength) * scale;
  ctx.shadowOffsetX = off;
  ctx.shadowOffsetY = dy * scale * strength;
  ctx.fillStyle = '#000';
  path();
  ctx.fill();
  ctx.restore();
}

/** The picture an 'image' param points at: the result so far, the original photo, or another uploaded source. */
export function pickSource(rc: RenderContext, value: string): CanvasImageSource {
  if (value === 'current') return rc.snapshot();
  if (value === 'base') return rc.base;
  return rc.image(value) ?? rc.base;
}

/** Smooth 2D value noise, 0..1. */
export function vnoise2(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const h = (i: number, j: number) => hash1(i * 73856093 + j * 19349663, seed);
  const a = h(xi, yi) * (1 - u) + h(xi + 1, yi) * u;
  const b = h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u;
  return a * (1 - v) + b * v;
}

/** A label font that is loaded up front (see CANVAS_FONTS). */
export const mono = (px: number, weight = 500) => `${weight} ${Math.max(6, Math.round(px))}px "JetBrains Mono", ui-monospace, monospace`;
