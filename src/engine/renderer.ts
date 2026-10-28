import { EFFECT_MAP, withDefaults } from './effects';
import { maskCanvas } from './masks';
import { selectionMaskAt } from './track';
import { hashStr, TAU } from './random';
import { frameKey, frameOf } from './video';
import type { Crop, FormatDef, Layer, Project, RenderContext, SourceImage, Surface } from './types';

export const FORMATS: FormatDef[] = [
  { id: '4:5', label: '4:5 피드', width: 1080, height: 1350 },
  { id: '3:4', label: '3:4 그리드', width: 1080, height: 1440 },
  { id: '1:1', label: '1:1 정사각', width: 1080, height: 1080 },
  { id: '9:16', label: '9:16 릴스', width: 1080, height: 1920 },
  { id: '16:9', label: '16:9 와이드', width: 1920, height: 1080 },
];

export const getFormat = (id: string) => FORMATS.find((f) => f.id === id) ?? FORMATS[0];

/** Width of the fixed-size analysis image used for feature detection. */
const ANALYSIS_WIDTH = 270;

const CENTER_CROP: Crop = { zoom: 1, x: 0.5, y: 0.5 };

export function makeSurface(w: number, h: number): Surface {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  return { canvas, ctx };
}

function resizeSurface(s: Surface, w: number, h: number) {
  if (s.canvas.width !== w || s.canvas.height !== h) {
    s.canvas.width = w;
    s.canvas.height = h;
  }
}

function resetCtx(ctx: CanvasRenderingContext2D) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'rgba(0,0,0,0)';
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.imageSmoothingEnabled = true;
}

/** Draw a source (photo, or the video's current frame) so it covers w×h, honoring zoom and focal point. */
export function drawCover(ctx: CanvasRenderingContext2D, src: SourceImage, w: number, h: number, crop: Crop) {
  const { img, w: iw, h: ih } = frameOf(src);
  const scale = Math.max(w / iw, h / ih) * Math.max(1, crop.zoom);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (iw - sw) * crop.x;
  const sy = (ih - sh) * crop.y;
  ctx.imageSmoothingQuality = 'high';
  ctx.save();
  if (crop.flip) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  ctx.restore();
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#2a2d33');
  g.addColorStop(0.55, '#15171a');
  g.addColorStop(1, '#0b0c0e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** Paint a white mask for a layer's region; feathering uses an offset shadow so it works without canvas filters. */
function paintMask(ctx: CanvasRenderingContext2D, layer: Layer, w: number, h: number, project: Project, time: number) {
  const m = layer.mask!;
  resetCtx(ctx);
  ctx.clearRect(0, 0, w, h);
  const blur = m.feather * Math.min(w, h) * 0.18;
  const off = w * 3;
  if (m.invert) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'destination-out';
  }
  // draw `draw(dx)` either directly or as a blurred shadow shifted back from far off-canvas
  const soft = (draw: (dx: number) => void) => {
    if (blur < 0.5) return draw(0);
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = blur;
    ctx.shadowOffsetX = off;
    draw(-off);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowColor = 'rgba(0,0,0,0)';
  };

  if (m.shape === 'paint' || m.shape === 'selection') {
    const sel = m.shape === 'selection' ? project.selections.find((x) => x.id === m.selectionId) : undefined;
    const src = m.shape === 'paint' ? maskCanvas(layer) : sel ? (selectionMaskAt(sel, project, time)?.canvas ?? null) : null;
    if (src) soft((dx) => ctx.drawImage(src, dx, 0, w, h));
  } else if (m.shape === 'gradient') {
    const g = m.gradient ?? { side: 'top', from: 0.35, to: 0.65 };
    const a = Math.min(g.from, g.to - 0.001);
    const b = Math.max(g.to, a + 0.001);
    let grad: CanvasGradient;
    if (g.side === 'center' || g.side === 'edges') {
      const R = Math.hypot(w, h) / 2;
      grad = ctx.createRadialGradient(w / 2, h / 2, a * R, w / 2, h / 2, b * R);
    } else if (g.side === 'top') grad = ctx.createLinearGradient(0, a * h, 0, b * h);
    else if (g.side === 'bottom') grad = ctx.createLinearGradient(0, (1 - a) * h, 0, (1 - b) * h);
    else if (g.side === 'left') grad = ctx.createLinearGradient(a * w, 0, b * w, 0);
    else grad = ctx.createLinearGradient((1 - a) * w, 0, (1 - b) * w, 0);
    const inner = g.side === 'edges' ? 'rgba(255,255,255,0)' : '#fff';
    const outer = g.side === 'edges' ? '#fff' : 'rgba(255,255,255,0)';
    grad.addColorStop(0, inner);
    grad.addColorStop(1, outer);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  } else {
    const x = m.rect.x * w;
    const y = m.rect.y * h;
    const rw = m.rect.w * w;
    const rh = m.rect.h * h;
    ctx.fillStyle = '#fff';
    soft((dx) => {
      ctx.beginPath();
      if (m.shape === 'ellipse') ctx.ellipse(x + rw / 2 + dx, y + rh / 2, Math.max(1, rw / 2), Math.max(1, rh / 2), 0, 0, TAU);
      else ctx.rect(x + dx, y, rw, rh);
      ctx.fill();
    });
  }
  resetCtx(ctx);
}

/** How strongly a layer shows at normalized time t (timing window plus fades). 0 means skip. */
export function layerPresence(layer: Layer, t: number): { alpha: number; local: number; span: number } {
  const tin = layer.tin ?? 0;
  const tout = layer.tout ?? 1;
  if (t < tin || t > tout) return { alpha: 0, local: 0, span: 1 };
  const span = Math.max(1e-3, tout - tin);
  const f = layer.fade ?? 0;
  let a = 1;
  if (f > 0) {
    if (tin > 0) a = Math.min(a, (t - tin) / f);
    if (tout < 1) a = Math.min(a, (tout - t) / f);
  }
  return { alpha: Math.max(0, Math.min(1, a)), local: Math.min(0.999999, (t - tin) / span), span };
}

interface Cached {
  key: string;
  surface: Surface;
}

/**
 * Renders a project frame onto its own canvas. Preview and export each own a Renderer;
 * given the same project and time they produce the same picture at different sizes.
 */
export class Renderer {
  readonly main: Surface;
  w = 0;
  h = 0;
  private scratches: Surface[] = [];
  private snap = makeSurface(1, 1);
  /** transparent target for overlay effects */
  private layerSurf = makeSurface(1, 1);
  private pre = makeSurface(1, 1);
  private maskSurf = makeSurface(1, 1);
  private base: Cached = { key: '', surface: makeSurface(1, 1) };
  private analysis: Cached = { key: '', surface: makeSurface(1, 1) };
  private images = new Map<string, Cached>();
  private selections = new Map<string, Cached>();

  constructor(canvas?: HTMLCanvasElement) {
    this.main = canvas
      ? { canvas, ctx: canvas.getContext('2d', { willReadFrequently: true })! }
      : makeSurface(1, 1);
  }

  private resize(w: number, h: number) {
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    for (const s of [this.main, this.snap, this.layerSurf, this.pre, this.maskSurf, ...this.scratches]) resizeSurface(s, w, h);
  }

  private sourceById(project: Project, id: string | null): SourceImage | undefined {
    return id ? project.images.find((i) => i.id === id) : undefined;
  }

  private getBase(project: Project): { canvas: HTMLCanvasElement; key: string } {
    const src = this.sourceById(project, project.baseImageId);
    const { zoom, x, y, flip } = project.crop;
    const key = `${src?.id ?? 'none'}${src ? frameKey(src) : ''}|${zoom}|${x}|${y}|${flip ? 1 : 0}|${project.format}`;
    const sizedKey = `${key}|${this.w}x${this.h}`;
    if (this.base.key !== sizedKey) {
      const s = this.base.surface;
      resizeSurface(s, this.w, this.h);
      s.ctx.clearRect(0, 0, this.w, this.h);
      if (src) drawCover(s.ctx, src, this.w, this.h, project.crop);
      else drawPlaceholder(s.ctx, this.w, this.h);
      this.base.key = sizedKey;
    }
    return { canvas: this.base.surface.canvas, key };
  }

  private getAnalysis(project: Project, baseKey: string): HTMLCanvasElement {
    if (this.analysis.key !== baseKey) {
      const fmt = getFormat(project.format);
      const aw = ANALYSIS_WIDTH;
      const ah = Math.round((ANALYSIS_WIDTH * fmt.height) / fmt.width);
      const s = this.analysis.surface;
      resizeSurface(s, aw, ah);
      const src = this.sourceById(project, project.baseImageId);
      if (src) drawCover(s.ctx, src, aw, ah, project.crop);
      else drawPlaceholder(s.ctx, aw, ah);
      this.analysis.key = baseKey;
    }
    return this.analysis.surface.canvas;
  }

  private getImage(project: Project, id: string): HTMLCanvasElement | null {
    const src = this.sourceById(project, id);
    if (!src) return null;
    const key = `${id}${frameKey(src)}|${this.w}x${this.h}`;
    let c = this.images.get(id);
    if (!c) {
      c = { key: '', surface: makeSurface(this.w, this.h) };
      this.images.set(id, c);
    }
    if (c.key !== key) {
      resizeSurface(c.surface, this.w, this.h);
      drawCover(c.surface.ctx, src, this.w, this.h, CENTER_CROP);
      c.key = key;
    }
    return c.surface.canvas;
  }

  /** A saved selection's mask at frame size, for the current time when it follows a video. */
  private getSelection(project: Project, id: string, time: number): HTMLCanvasElement | null {
    const sel = project.selections.find((x) => x.id === id);
    if (!sel) return null;
    const m = selectionMaskAt(sel, project, time);
    if (!m) return null;
    const key = `${m.key}|${this.w}x${this.h}`;
    let c = this.selections.get(id);
    if (!c) {
      c = { key: '', surface: makeSurface(this.w, this.h) };
      this.selections.set(id, c);
    }
    if (c.key !== key) {
      resizeSurface(c.surface, this.w, this.h);
      c.surface.ctx.clearRect(0, 0, this.w, this.h);
      c.surface.ctx.drawImage(m.canvas, 0, 0, this.w, this.h);
      c.key = key;
    }
    return c.surface.canvas;
  }

  private scratch(i: number): Surface {
    while (this.scratches.length <= i) this.scratches.push(makeSurface(this.w, this.h));
    const s = this.scratches[i];
    resizeSurface(s, this.w, this.h);
    resetCtx(s.ctx);
    s.ctx.clearRect(0, 0, this.w, this.h);
    return s;
  }

  /** Copy of the picture so far (never the transparent overlay surface). */
  private snapshot(): HTMLCanvasElement {
    const { ctx } = this.snap;
    resetCtx(ctx);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.drawImage(this.main.canvas, 0, 0);
    return this.snap.canvas;
  }

  /** Render the frame at `time` seconds, at `scale` × the format's export size. */
  render(project: Project, time: number, scale = 1): HTMLCanvasElement {
    const fmt = getFormat(project.format);
    const w = Math.max(2, Math.round(fmt.width * scale));
    const h = Math.max(2, Math.round(fmt.height * scale));
    this.resize(w, h);

    const { ctx } = this.main;
    const base = this.getBase(project);
    resetCtx(ctx);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(base.canvas, 0, 0);

    const duration = Math.max(0.1, project.duration);
    const t = Math.min(0.999999, Math.max(0, time / duration));

    for (const layer of project.layers) {
      if (!layer.enabled) continue;
      const def = EFFECT_MAP[layer.type];
      if (!def) continue;
      const { alpha: presence, local, span } = layerPresence(layer, t);
      if (presence <= 0) continue;

      const alpha = presence * (layer.opacity ?? 1);
      const blend = layer.blend ?? def.defaultBlend ?? 'source-over';
      const masked = !!layer.mask && layer.mask.shape !== 'full';
      const overlay = def.kind === 'overlay';
      const composite = overlay || alpha < 0.999 || blend !== 'source-over' || masked;

      let target: Surface = this.main;
      if (overlay) {
        target = this.layerSurf;
        resetCtx(target.ctx);
        target.ctx.clearRect(0, 0, w, h);
      } else if (composite) {
        resetCtx(this.pre.ctx);
        this.pre.ctx.clearRect(0, 0, w, h);
        this.pre.ctx.drawImage(this.main.canvas, 0, 0);
      }

      const rc: RenderContext = {
        canvas: target.canvas,
        ctx: target.ctx,
        w,
        h,
        s: Math.min(w, h) / 1080,
        t: local,
        time: local * span * duration,
        duration: span * duration,
        fps: project.fps,
        frame: Math.floor(t * duration * project.fps),
        seed: (Math.imul(project.seed, 2654435761) ^ hashStr(layer.id) ^ Math.imul(layer.seed ?? 0, 40503)) >>> 0,
        base: base.canvas,
        baseKey: base.key,
        analysis: () => this.getAnalysis(project, base.key),
        image: (id) => this.getImage(project, id),
        selection: (id) => this.getSelection(project, id, time),
        scratch: (i = 0) => this.scratch(i),
        snapshot: () => this.snapshot(),
      };
      target.ctx.save();
      try {
        def.render(rc, withDefaults(def, layer.params));
      } catch (err) {
        console.error(`[${layer.type}] render failed`, err);
      }
      target.ctx.restore();
      resetCtx(target.ctx);

      if (!composite) continue;

      // `result` holds what this layer produced; put the picture underneath back, then blend the result in.
      let result = target;
      if (!overlay) {
        const post = this.layerSurf;
        resetCtx(post.ctx);
        post.ctx.clearRect(0, 0, w, h);
        post.ctx.drawImage(this.main.canvas, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(this.pre.canvas, 0, 0);
        result = post;
      }
      if (masked) {
        paintMask(this.maskSurf.ctx, layer, w, h, project, time);
        result.ctx.globalCompositeOperation = 'destination-in';
        result.ctx.drawImage(this.maskSurf.canvas, 0, 0);
        result.ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = blend;
      ctx.drawImage(result.canvas, 0, 0);
      resetCtx(ctx);
    }
    return this.main.canvas;
  }
}

/** Fonts the effects draw with. Loading them up front keeps export frames identical to the preview. */
export const CANVAS_FONTS = [
  '400 20px "Anton"',
  '400 20px "Bebas Neue"',
  '700 20px "Oswald"',
  '400 20px "Archivo Black"',
  '700 20px "Space Grotesk"',
  '400 20px "Instrument Serif"',
  'italic 400 20px "Instrument Serif"',
  '600 20px "IBM Plex Mono"',
  '400 20px "IBM Plex Mono"',
  '700 20px "Inter"',
  '400 20px "JetBrains Mono"',
  '500 20px "JetBrains Mono"',
  '400 20px "Black Han Sans"',
  '800 20px "Nanum Myeongjo"',
];

export async function ensureFonts() {
  await Promise.all(CANVAS_FONTS.map((f) => document.fonts.load(f).catch(() => [])));
}
