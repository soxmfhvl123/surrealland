import { makeLayer } from './effects';
import { RECIPES } from './presets';
import type { Layer, LayerMask } from './types';

/**
 * Named effect stacks ("looks"). Every one of the 854 feed presets points at one of these;
 * the 22 recipes are included as looks so recipes and presets share one vocabulary.
 */
export interface Look {
  id: string;
  name: string;
  build: () => Layer[];
}

const mk = makeLayer;
const ellipse = (x: number, y: number, w: number, h: number, feather = 0.45): LayerMask => ({ shape: 'ellipse', rect: { x, y, w, h }, feather, invert: false });
const band = (y: number, h: number, feather = 0.4): LayerMask => ({ shape: 'rect', rect: { x: 0, y, w: 1, h }, feather, invert: false });

const film = (grain = 24, extra = {}) => mk('film', { grain, ...extra });

const EXTRA: Look[] = [
  {
    id: 'skyHole',
    name: '땅에 뚫린 하늘',
    build: () => [
      mk('floatingPanel', { shape: 'ellipse', src: { x: 0.05, y: 0.02, w: 0.9, h: 0.25 }, dst: { x: 0.18, y: 0.62, w: 0.64, h: 0.16 }, flipY: true, shadow: 10, float: 0, ripple: 30 }),
      mk('colorGrade', { contrast: 12, vignette: 30 }),
      film(),
    ],
  },
  {
    id: 'portalDoor',
    name: '빛나는 문',
    build: () => [
      mk('floatingPanel', { shape: 'arch', source: 'base', src: { x: 0.3, y: 0.05, w: 0.4, h: 0.3 }, dst: { x: 0.38, y: 0.42, w: 0.24, h: 0.3 }, border: 6, borderColor: '#e9e2d6', shadow: 40, float: 0 }),
      mk('lightLeak', { palette: 'warm', amount: 45, size: 40, blobs: 1 }),
      mk('glints', { count: 6, size: 90 }),
      film(),
    ],
  },
  {
    id: 'vortex',
    name: '소용돌이',
    build: () => [mk('twirl', { angle: 540, radius: 80, spin: 45 }), mk('colorGrade', { contrast: 15, vignette: 35 }), film()],
  },
  {
    id: 'tunnel',
    name: '원형 터널',
    build: () => [mk('polar', { hole: 22, invert: true, spin: 1 }), mk('colorGrade', { contrast: 15, vignette: 40 }), film()],
  },
  {
    id: 'monitorWall',
    name: '모니터 벽',
    build: () => [
      mk('terminalWindows', { theme: 'black', content: 'mixed', count: 18, size: 22 }),
      mk('colorGrade', { saturation: -15, contrast: 12 }),
      film(26, { scanlines: 18 }),
    ],
  },
  {
    id: 'gridFall',
    name: '가상 격자 공간',
    build: () => [
      mk('perspectiveGrid', { plane: 'both', horizon: 50, color: '#d8f5ff', glow: false }, { opacity: 0.55 }),
      mk('trackingLabels', { count: 18, links: 0, style: 'coord' }),
      film(),
    ],
  },
  {
    id: 'pointCloudLand',
    name: '점구름 지형',
    build: () => [mk('pointCloud', { step: 5, depth: 260, bg: 'black' }), mk('editorial', { title: 'POINT CLOUD / SCAN', barcode: false }), film(16)],
  },
  {
    id: 'smearH',
    name: '가로로 번진 풍경',
    build: () => [
      mk('pixelStretch', { area: { x: 0.35, y: 0.15, w: 0.65, h: 0.55 }, direction: 'right', melt: 45, drip: 50, anim: 'breathe' }),
      mk('sliceGlitch', { amount: 3, chance: 20, rgb: 6 }),
      mk('colorGrade', { contrast: 12, vignette: 25 }),
      film(),
    ],
  },
  {
    id: 'echoFigure',
    name: '잔상 인물',
    build: () => [mk('echo', { copies: 8, dx: 40, decay: 30, sway: 50 }), mk('colorGrade', { contrast: 15 }), film()],
  },
  {
    id: 'datamoshPerson',
    name: '픽셀로 부서지는 사람',
    build: () => [mk('dissolve', { mode: 'pixels', cell: 14, density: 65, scatter: 45, drift: 40 }), mk('datamosh', { amount: 10, block: 22 }), film()],
  },
  {
    id: 'edgeNeon',
    name: '네온 윤곽',
    build: () => [mk('edgeGlow', { mode: 'only', color: '#7df9ff', glow: 70, scan: 40 }), film(18)],
  },
  {
    id: 'circuitCollage',
    name: '회로 콜라주',
    build: () => [
      mk('terminalWindows', { theme: 'retro', content: 'mixed', count: 7, size: 24 }),
      mk('terminalWindows', { theme: 'green', content: 'code', count: 5, size: 18 }),
      mk('colorGrade', { contrast: 15, saturation: 10, vignette: 25 }),
      film(),
    ],
  },
  {
    id: 'chromeBody',
    name: '크롬 몸',
    build: () => [
      mk('gradientMap', { palette: 'chrome', contrast: 20, mix: 75 }, { mask: ellipse(0.12, 0.08, 0.76, 0.84) }),
      mk('glints', { count: 30, size: 40 }),
      mk('colorGrade', { contrast: 10, vignette: 30 }),
      film(20),
    ],
  },
  {
    id: 'glitterBody',
    name: '글리터',
    build: () => [mk('glints', { count: 90, size: 34, twinkle: 85 }), mk('lightLeak', { palette: 'rainbow', amount: 25 }), mk('colorGrade', { contrast: 12, vignette: 25 }), film(22)],
  },
  {
    id: 'foilObject',
    name: '포일·은박',
    build: () => [mk('gradientMap', { palette: 'chrome', mix: 40, contrast: 20 }), mk('glints', { count: 45, size: 38 }), mk('colorGrade', { contrast: 15, vignette: 30 }), film(22)],
  },
  {
    id: 'rainbowAccent',
    name: '무지개 포인트',
    build: () => [mk('lightLeak', { palette: 'rainbow', amount: 40, size: 60 }), mk('colorGrade', { contrast: 12, saturation: 10, vignette: 25 }), film()],
  },
  {
    id: 'crtStatic',
    name: 'CRT 화면',
    build: () => [mk('sliceGlitch', { amount: 4, chance: 30, rgb: 10 }), mk('colorGrade', { contrast: 15, saturation: -10 }), film(35, { scanlines: 45, chroma: 4, glow: 25 })],
  },
  {
    id: 'glassSkin',
    name: '유리 피부',
    build: () => [mk('edgeGlow', { mode: 'over', color: '#e8f6ff', glow: 60, threshold: 40 }), mk('glints', { count: 20, size: 36 }), mk('colorGrade', { temperature: -20, contrast: 10 }), film(18)],
  },
  {
    id: 'editorialPortrait',
    name: '매거진 초상',
    build: () => [mk('colorGrade', { contrast: 15, saturation: -5, fade: 10, vignette: 25 }), mk('editorial', { barcode: false, marks: false }), film(20)],
  },
  {
    id: 'magazineCover',
    name: '매거진 커버',
    build: () => [
      mk('colorGrade', { contrast: 12, fade: 8, vignette: 20 }),
      mk('text', { text: 'Title', font: 'Instrument Serif', uppercase: false, size: 190, y: 13, shadow: 20, anim: 'fade' }),
      mk('editorial', { title: 'ISSUE 07', index: 'VOL. II', barcode: true, marks: false }),
      film(18),
    ],
  },
  {
    id: 'echoFaces',
    name: '반복되는 얼굴',
    build: () => [mk('echo', { area: { x: 0.1, y: 0.15, w: 0.45, h: 0.7 }, copies: 5, dx: 90, decay: 15, sway: 20 }), mk('colorGrade', { contrast: 18 }), film()],
  },
  {
    id: 'duotonePortrait',
    name: '듀오톤',
    build: () => [mk('gradientMap', { palette: 'duotone', dark: '#14206b', light: '#ff8a5c', contrast: 20 }), mk('halftone', { cell: 5, colorMode: 'photo', bright: true, paper: '#000000', gain: 120 }, { opacity: 0.35, blend: 'overlay' }), film(26)],
  },
  {
    id: 'faceSlice',
    name: '슬라이스 얼굴',
    build: () => [mk('sliceGlitch', { amount: 12, slices: 9, chance: 70, rgb: 14, burst: 20, rate: 3 }), mk('colorGrade', { contrast: 15 }), film()],
  },
  {
    id: 'cinemaPortrait',
    name: '시네마 초상',
    build: () => [mk('colorGrade', { contrast: 22, saturation: -10, temperature: 15, fade: 10, vignette: 45 }), mk('camera', { move: 'zoomIn', amount: 5 }), film(26, { glow: 15 })],
  },
  {
    id: 'vintagePhoto',
    name: '빈티지 사진',
    build: () => [mk('gradientMap', { palette: 'sepia', mix: 45 }), mk('colorGrade', { contrast: 10, fade: 22, vignette: 40 }), film(45, { glow: 10 })],
  },
  {
    id: 'darkOccult',
    name: '어두운 오컬트',
    build: () => [mk('colorGrade', { exposure: -20, contrast: 35, saturation: -25, vignette: 70 }), mk('lightLeak', { palette: 'custom', custom: '#ff2a2a', amount: 18, blobs: 1 }), film(35)],
  },
  {
    id: 'popColor',
    name: '팝 컬러',
    build: () => [mk('colorGrade', { contrast: 25, saturation: 30, vignette: 20 }), film(20)],
  },
  {
    id: 'bwPortrait',
    name: '흑백',
    build: () => [mk('colorGrade', { mono: true, contrast: 30, fade: 12, vignette: 40 }), film(38)],
  },
  {
    id: 'posterTitle',
    name: '포스터',
    build: () => [mk('colorGrade', { contrast: 20, vignette: 30 }), mk('text', { text: 'TITLE', size: 150, y: 86, anim: 'rise' }), mk('editorial', { barcode: false }), film(24)],
  },
  {
    id: 'painterly',
    name: '회화풍',
    build: () => [mk('colorGrade', { contrast: 8, saturation: 12, fade: 14, temperature: 10 }), mk('wave', { amp: 4, freq: 30, turb: 60, speed: 1 }), film(30, { glow: 20 })],
  },
  {
    id: 'fantasyEpic',
    name: '판타지 시네마',
    build: () => [mk('colorGrade', { contrast: 25, saturation: -5, temperature: 20, tint: '#1d6b7a', tintAmount: 10, vignette: 40 }), mk('lightLeak', { palette: 'warm', amount: 30 }), film(22, { glow: 25 })],
  },
  {
    id: 'surrealCollage',
    name: '초현실 콜라주',
    build: () => [
      mk('floatingPanel', { source: 'base', shape: 'rect', src: { x: 0.1, y: 0.1, w: 0.5, h: 0.35 }, dst: { x: 0.35, y: 0.18, w: 0.5, h: 0.3 }, shadow: 50, border: 8 }),
      mk('scatter', { count: 6, size: 30, tiltMax: 12, border: 6 }),
      mk('colorGrade', { contrast: 12, vignette: 25 }),
      film(),
    ],
  },
  {
    id: 'heatHead',
    name: '열화상 인물',
    build: () => [mk('gradientMap', { palette: 'thermal', contrast: 25 }, { mask: ellipse(0.15, 0.05, 0.7, 0.85, 0.5) }), mk('colorGrade', { exposure: -15, vignette: 60 }), film(30)],
  },
  {
    id: 'waterReflect',
    name: '물에 비친 세계',
    build: () => [mk('mirror', { mode: 'tb', axis: 52, ripple: 55, darken: 30 }), mk('glints', { count: 14, size: 40 }, { mask: band(0.52, 0.48) }), film()],
  },
  {
    id: 'kaleido',
    name: '만화경',
    build: () => [mk('mirror', { mode: 'kaleido', segments: 6, spin: 40 }), mk('colorGrade', { contrast: 15, vignette: 40 }), film()],
  },
  {
    id: 'scanFace',
    name: '스캔되는 얼굴',
    build: () => [mk('scanTerrain', { lines: 140, height: 60, bg: 'dim', occlude: false, photoColor: true, scan: 80 }), mk('trackingLabels', { count: 20, style: 'metric' }), film(18)],
  },
  {
    id: 'sortedSky',
    name: '흘러내리는 하늘',
    build: () => [mk('pixelSort', { area: { x: 0, y: 0, w: 1, h: 0.55 }, lo: 45, hi: 95, anim: 'threshold' }), mk('pixelStretch', { area: { x: 0, y: 0.3, w: 1, h: 0.4 }, melt: 30, drip: 60 }), mk('colorGrade', { contrast: 12 }), film()],
  },
  {
    id: 'cubeWindow',
    name: '유리 큐브 속 세계',
    build: () => [
      mk('floatingPanel', { source: 'base', src: { x: 0, y: 0, w: 1, h: 1 }, dst: { x: 0.2, y: 0.25, w: 0.6, h: 0.42 }, thickness: 60, side: 'streak', sideShade: 30, shadow: 55, opacity: 92, float: 8 }),
      mk('edgeGlow', { mode: 'over', color: '#ffffff', glow: 40, threshold: 60 }, { opacity: 0.5, mask: { shape: 'rect', rect: { x: 0.2, y: 0.25, w: 0.6, h: 0.47 }, feather: 0.1, invert: false } }),
      mk('colorGrade', { contrast: 15, vignette: 35 }),
      film(),
    ],
  },
  {
    id: 'repeatTile',
    name: '반복 격자',
    build: () => [mk('tile', { area: { x: 0.2, y: 0.3, w: 0.6, h: 0.3 }, cols: 3, rows: 5, gap: 2, scroll: 20 }), mk('colorGrade', { contrast: 15, vignette: 25 }), film()],
  },
  {
    id: 'eyeWindow',
    name: '눈동자 속 창',
    build: () => [
      mk('floatingPanel', { shape: 'ellipse', source: 'base', src: { x: 0, y: 0, w: 1, h: 0.5 }, dst: { x: 0.33, y: 0.38, w: 0.34, h: 0.24 }, float: 0, shadow: 0, pan: 40, opacity: 95 }),
      mk('colorGrade', { contrast: 15, vignette: 35 }),
      film(),
    ],
  },
  {
    id: 'blueprint',
    name: '블루프린트',
    build: () => [mk('gradientMap', { palette: 'blueprint', contrast: 20 }), mk('perspectiveGrid', { plane: 'floor', color: '#cfe0ff', glow: false, horizon: 60 }, { opacity: 0.4 }), mk('editorial', { color: '#e8eeff' }), film(18)],
  },
];

// 'archWindow' was a recipe the feed presets still point at; it now opens the portal-frame look
const portal = RECIPES.find((r) => r.id === 'portalFrame')!;
const ALIASES: Look[] = [{ id: 'archWindow', name: portal.name, build: portal.build }];

export const LOOKS: Look[] = [...RECIPES.map((r) => ({ id: r.id, name: r.name, build: r.build })), ...EXTRA, ...ALIASES];
export const LOOK_MAP: Record<string, Look> = Object.fromEntries(LOOKS.map((l) => [l.id, l]));
