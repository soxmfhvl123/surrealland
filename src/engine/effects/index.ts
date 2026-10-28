import type { EffectCategory, EffectDef, Layer, Params } from '../types';
import { uid } from '../random';
import { camera } from './camera';
import { colorGrade } from './colorGrade';
import { droste, echo, scatter, shatter } from './composite';
import { cutout } from './cutout';
import { cctv, dissolve, editorial, lightLeak, perspectiveGrid, pointCloud, scanTerrain } from './data';
import { datamosh, mirror, mosaic, polar, twirl, wave } from './distort';
import { glints, tile } from './extra';
import { film } from './film';
import { flow } from './flow';
import { blur, bulge, channelShift, fog, glassBlocks, hologram, lightning, liquify, particles, posterize, solarize, vhs, zoomBlur } from './more';
import { floatingPanel } from './floatingPanel';
import { pixelSort } from './pixelSort';
import { pixelStretch } from './pixelStretch';
import { sliceGlitch } from './sliceGlitch';
import { ascii, dither, edgeGlow, gradientMap, halftone } from './stylize';
import { terminalWindows } from './terminalWindows';
import { text } from './text';
import { trackingLabels } from './trackingLabels';
import { burnHole, glassOrb, lightBeam, lightDoor, reflectPool } from './portals';
import { dashboard, plexus, redact, viewfinder, zoomInsets } from './annotate';
import { fillImage, patchwork, splitCollage } from './collage';
import { chromeSkin, flashLook, helix, spectralDrip } from './objects';

export const EFFECTS: EffectDef[] = [
  cutout,
  flow,
  floatingPanel,
  burnHole,
  lightDoor,
  reflectPool,
  glassOrb,
  fillImage,
  patchwork,
  splitCollage,
  helix,
  scatter,
  shatter,
  echo,
  droste,
  tile,
  spectralDrip,
  pixelStretch,
  pixelSort,
  sliceGlitch,
  wave,
  mirror,
  twirl,
  polar,
  datamosh,
  mosaic,
  liquify,
  bulge,
  zoomBlur,
  blur,
  glassBlocks,
  halftone,
  ascii,
  dither,
  edgeGlow,
  channelShift,
  posterize,
  vhs,
  hologram,
  chromeSkin,
  colorGrade,
  flashLook,
  gradientMap,
  lightLeak,
  glints,
  solarize,
  particles,
  fog,
  lightBeam,
  lightning,
  dissolve,
  trackingLabels,
  plexus,
  zoomInsets,
  redact,
  dashboard,
  viewfinder,
  terminalWindows,
  scanTerrain,
  pointCloud,
  perspectiveGrid,
  cctv,
  text,
  editorial,
  camera,
  film,
];

export const EFFECT_MAP: Record<string, EffectDef> = Object.fromEntries(EFFECTS.map((e) => [e.type, e]));

export const CATEGORY_LABELS: Record<EffectCategory, string> = {
  composite: '합성',
  distort: '왜곡',
  stylize: '스타일',
  color: '색·빛',
  atmosphere: '날씨·대기',
  data: '데이터·화면',
  overlay: '오버레이',
  text: '글자',
  camera: '카메라',
  finish: '마감',
};

export const CATEGORY_ORDER: EffectCategory[] = ['composite', 'distort', 'stylize', 'color', 'atmosphere', 'data', 'text', 'camera', 'finish'];

export function defaultParams(def: EffectDef): Params {
  const p: Params = {};
  for (const d of def.params) p[d.key] = typeof d.default === 'object' ? { ...d.default } : d.default;
  return p;
}

/** Fill parameters a layer is missing (e.g. saved by an older version) with the effect's defaults. */
export function withDefaults(def: EffectDef, params: Params): Params {
  for (const d of def.params) if (params[d.key] === undefined) return { ...defaultParams(def), ...params };
  return params;
}

export function normalizeLayers(layers: Layer[]): Layer[] {
  return layers.filter((l) => EFFECT_MAP[l.type]).map((l) => ({ ...l, params: withDefaults(EFFECT_MAP[l.type], l.params ?? {}) }));
}

export function makeLayer(type: string, overrides: Params = {}, extra: Partial<Layer> = {}): Layer {
  const def = EFFECT_MAP[type];
  return { id: uid(), type, enabled: true, params: { ...defaultParams(def), ...overrides }, ...extra };
}

/** Key of the effect's own selection parameter (effects like cutout and flow pick their object themselves). */
export const selectionParam = (type: string) => EFFECT_MAP[type]?.params.find((d) => d.type === 'selection')?.key ?? null;
