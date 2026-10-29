/** Normalized rectangle: every value is a fraction (0..1) of the frame. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ParamValue = number | string | boolean | Rect;
export type Params = Record<string, ParamValue>;

interface ParamBase {
  key: string;
  label: string;
  /** Inspector section. Params without a group land in the first section. */
  group?: string;
  hint?: string;
}

export type ParamDef =
  | (ParamBase & { type: 'range'; min: number; max: number; step: number; default: number; unit?: string })
  | (ParamBase & { type: 'select'; options: { value: string; label: string }[]; default: string })
  | (ParamBase & { type: 'bool'; default: boolean })
  | (ParamBase & { type: 'text'; default: string; multiline?: boolean })
  | (ParamBase & { type: 'color'; default: string })
  | (ParamBase & { type: 'rect'; default: Rect; color: string })
  /** A picture from the gallery, or 'current' (the pipeline so far) / 'base' (the untouched source). */
  | (ParamBase & { type: 'image'; default: string })
  /** One of the project's saved selections (objects); '' means none chosen yet. */
  | (ParamBase & { type: 'selection'; default: string; /** label for the empty choice, when '' is a valid answer (e.g. whole frame) */ none?: string });

export type EffectCategory = 'composite' | 'distort' | 'stylize' | 'color' | 'atmosphere' | 'data' | 'overlay' | 'text' | 'camera' | 'finish';

/** Where a layer applies. 'full' means the whole frame. */
export interface MaskGradient {
  /** which side keeps the effect */
  side: 'top' | 'bottom' | 'left' | 'right' | 'center' | 'edges';
  /** 0..1 where the fade starts and where the effect is fully gone */
  from: number;
  to: number;
}

export interface LayerMask {
  /**
   * 'paint' is this layer's own brush/auto mask; 'selection' points at one of the
   * project's saved selections so several layers can share an object.
   */
  shape: 'full' | 'rect' | 'ellipse' | 'gradient' | 'paint' | 'selection';
  selectionId?: string;
  rect: Rect;
  gradient?: MaskGradient;
  /** grayscale JPEG data URL for 'paint' masks */
  paint?: string;
  /** 0..1 edge softness */
  feather: number;
  /** apply outside the shape instead of inside */
  invert: boolean;
}

/** Layer-level settings shared by every effect. All optional so older saved layers still load. */
export interface Layer {
  id: string;
  type: string;
  enabled: boolean;
  params: Params;
  name?: string;
  /** extra seed so one layer can be reshuffled on its own */
  seed?: number;
  opacity?: number;
  blend?: GlobalCompositeOperation;
  /** start/end as fractions of the clip (0..1) */
  tin?: number;
  tout?: number;
  /** fade length as a fraction of the clip */
  fade?: number;
  mask?: LayerMask;
}

export interface Surface {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

export interface RenderContext extends Surface {
  w: number;
  h: number;
  /** Pixel scale relative to a frame whose short side is 1080px, so sizes look the same in preview and export. */
  s: number;
  /** Normalized time 0..1 across the clip. */
  t: number;
  time: number;
  duration: number;
  fps: number;
  frame: number;
  /** Per-layer seed (global seed mixed with the layer id). */
  seed: number;
  /** Untouched source photo, cropped to the frame. */
  base: HTMLCanvasElement;
  /** Stable identifier for the base framing, for caching analysis results. */
  baseKey: string;
  /** Small fixed-size copy of the base used for feature detection (identical in preview and export). */
  analysis: () => HTMLCanvasElement;
  /** Gallery image cropped to the frame, or null if missing. */
  image: (id: string) => HTMLCanvasElement | null;
  /** A saved selection's mask (white = selected) at frame size, or null. */
  selection: (id: string) => HTMLCanvasElement | null;
  /** Temporary canvas of frame size. Index lets an effect hold several at once. */
  scratch: (index?: number) => Surface;
  /** Copy of the current working canvas. */
  snapshot: () => HTMLCanvasElement;
}

export interface EffectDef {
  type: string;
  label: string;
  english: string;
  description: string;
  category: EffectCategory;
  /**
   * 'process' rewrites the picture in place. 'overlay' paints onto a transparent layer
   * that is then composited, so blend modes and masks act only on what it adds.
   */
  kind?: 'process' | 'overlay';
  defaultBlend?: GlobalCompositeOperation;
  params: ParamDef[];
  render: (rc: RenderContext, p: Params) => void;
}

export interface SourceImage {
  id: string;
  name: string;
  /** still picture (for a video: its first frame, used until the video can draw) */
  bitmap: ImageBitmap;
  /** thumbnail / image URL */
  url: string;
  width: number;
  height: number;
  /** set for video sources */
  video?: HTMLVideoElement;
  videoUrl?: string;
  /** clip length in seconds (videos only) */
  duration?: number;
}

export interface Crop {
  zoom: number;
  /** Focal point 0..1 */
  x: number;
  y: number;
  flip?: boolean;
}

export interface FormatDef {
  id: string;
  label: string;
  width: number;
  height: number;
}

/** A named object/area picked on the photo, shared by any layer that targets it. */
export interface Selection {
  id: string;
  name: string;
  color: string;
  /** grayscale JPEG data URL, same format as painted layer masks */
  paint: string;
  /** set after tracking through a video: the per-frame masks live in engine/track.ts */
  track?: SelectionTrack;
  /** pieces from the same auto split share this id; the next split replaces them */
  group?: string;
}

export interface SelectionTrack {
  /** the video the masks were computed on */
  sourceId: string;
  fps: number;
  frames: number;
  /** clip time (s) of the frame the tracking started from */
  anchor: number;
  mode: 'object' | 'person';
}

export interface Project {
  images: SourceImage[];
  selections: Selection[];
  baseImageId: string | null;
  format: string;
  crop: Crop;
  layers: Layer[];
  seed: number;
  duration: number;
  fps: number;
}
