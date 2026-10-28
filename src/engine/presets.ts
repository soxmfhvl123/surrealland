import { EFFECT_MAP, makeLayer } from './effects';
import type { Layer } from './types';

export interface Recipe {
  id: string;
  name: string;
  english: string;
  hint: string;
  build: () => Layer[];
}

const mk = makeLayer;

/** Layer stacks modelled on recurring looks in the @mezotes feed (docs/mezotes-analysis.md). */
export const RECIPES: Recipe[] = [
  {
    id: 'floatingSky',
    name: '떠있는 하늘',
    english: 'Floating Sky',
    hint: '하늘이 위쪽에 넓은 풍경',
    build: () => [
      mk('floatingPanel', { src: { x: 0.05, y: 0.02, w: 0.9, h: 0.2 }, dst: { x: 0.15, y: 0.27, w: 0.7, h: 0.2 }, shadow: 25, float: 8 }),
      mk('floatingPanel', { src: { x: 0.05, y: 0.02, w: 0.9, h: 0.2 }, dst: { x: 0.1, y: 0.72, w: 0.8, h: 0.09 }, flipY: true, float: 0, shadow: 0, ripple: 45, opacity: 92 }, { name: '물 반사' }),
      mk('colorGrade', { contrast: 12, saturation: -10, vignette: 25 }),
      mk('camera', { move: 'zoomIn', amount: 6 }),
      mk('film', { grain: 20 }),
    ],
  },
  {
    id: 'portalFrame',
    name: '포털 액자',
    english: 'Portal Frame',
    hint: '잔디·광장처럼 바닥이 보이는 풍경 (다른 사진을 올리면 액자 안에 들어가요)',
    build: () => [
      mk('floatingPanel', { source: 'base', shape: 'rect', src: { x: 0.1, y: 0.22, w: 0.8, h: 0.36 }, dst: { x: 0.24, y: 0.16, w: 0.52, h: 0.42 }, border: 16, borderColor: '#2b2620', shadow: 55, float: 0, pan: 40 }),
      mk('reflectPool', { area: { x: 0.16, y: 0.64, w: 0.68, h: 0.16 }, from: 'above', mirror: 75, liquid: 'dark', ripple: 25 }),
      mk('colorGrade', { contrast: 14, saturation: -12, vignette: 35 }),
      mk('film', { grain: 22 }),
    ],
  },
  {
    id: 'tornSky',
    name: '찢긴 하늘',
    english: 'Burning Tear',
    hint: '하늘이 넓은 거리·풍경',
    build: () => [
      mk('burnHole', { area: { x: 0.04, y: 0.04, w: 0.92, h: 0.36 }, reveal: 'sky', rough: 70, ember: 65, sparks: 45, motion: 'open' }),
      mk('colorGrade', { contrast: 16, temperature: -8, vignette: 30 }),
      mk('film', { grain: 24 }),
    ],
  },
  {
    id: 'lightDoorway',
    name: '빛의 문',
    english: 'Glowing Doorway',
    hint: '어두운 정원·들판·길 (밤 사진이면 더 좋아요)',
    build: () => [
      mk('flashLook', { power: 35, dark: 70, temp: -20 }),
      mk('lightDoor', { area: { x: 0.39, y: 0.3, w: 0.22, h: 0.46 }, glow: 75, floor: 70, figure: 'one' }),
      mk('fog', { density: 35, height: 30 }),
      mk('film', { grain: 26 }),
    ],
  },
  {
    id: 'skyBeam',
    name: '하늘의 빛기둥',
    english: 'Light from Above',
    hint: '구름 낀 하늘 아래 사람이나 길',
    build: () => [
      mk('colorGrade', { exposure: -18, contrast: 20, saturation: -25, vignette: 45 }),
      mk('lightBeam', { x: 52, width: 4, spread: 30, intensity: 85, dust: 60, pool: 75 }),
      mk('fog', { density: 30, height: 25 }),
      mk('film', { grain: 26 }),
    ],
  },
  {
    id: 'mercuryPool',
    name: '수은 웅덩이',
    english: 'Mercury Pool',
    hint: '잔디밭·광장·사막처럼 넓은 바닥',
    build: () => [
      mk('reflectPool', { area: { x: 0.14, y: 0.6, w: 0.72, h: 0.2 }, liquid: 'mercury', from: 'sky', ripple: 55, rim: 70 }),
      mk('glints', {}),
      mk('colorGrade', { contrast: 12, saturation: -15, vignette: 25 }),
      mk('film', { grain: 18 }),
    ],
  },
  {
    id: 'crystalBall',
    name: '유리 구슬',
    english: 'Glass Orb',
    hint: '들판·하늘이 있는 풍경',
    build: () => [
      mk('glassOrb', { cx: 50, cy: 55, radius: 24, refract: 60, invert: true, float: 12 }),
      mk('colorGrade', { contrast: 10, saturation: -8, vignette: 30 }),
      mk('film', { grain: 20 }),
    ],
  },
  {
    id: 'annotated',
    name: '데이터 주석',
    english: 'Annotated',
    hint: '물건·사람이 많은 복잡한 장면',
    build: () => [
      mk('redact', { style: 'card', count: 10, pop: true, jumps: 0 }),
      mk('plexus', { count: 110, link: 11, palette: 'redgreen', dot: 4, line: 70 }),
      mk('colorGrade', { contrast: 10, vignette: 20 }),
      mk('film', { grain: 20 }),
    ],
  },
  {
    id: 'satellite',
    name: '위성 지도 인셋',
    english: 'Satellite Insets',
    hint: '항공·지도처럼 위에서 내려다본 사진',
    build: () => [
      mk('colorGrade', { contrast: 18, saturation: 10, vignette: 40 }),
      mk('zoomInsets', { count: 3, zoom: 4, box: 22, labels: true, motion: 'scan' }),
      mk('plexus', { count: 40, link: 8, palette: 'white', dot: 2, line: 40 }),
      mk('film', { grain: 16 }),
    ],
  },
  {
    id: 'patchCollage',
    name: '패치 콜라주',
    english: 'Patch Shuffle',
    hint: '집·강·나무가 있는 평범한 풍경',
    build: () => [
      mk('patchwork', { count: 14, minSize: 10, maxSize: 34, shift: 35, zoom: 30, jumps: 6 }),
      mk('colorGrade', { contrast: 12, saturation: 8 }),
      mk('film', { grain: 22 }),
    ],
  },
  {
    id: 'chromeHelix',
    name: '크롬 나선 대시보드',
    english: 'Chrome Helix Dashboard',
    hint: '어두운 사진이나 아무 사진 (가장자리가 데이터 패널로 덮여요)',
    build: () => [
      mk('colorGrade', { exposure: -25, contrast: 20, saturation: -30 }),
      mk('dashboard', { layout: 'frame', cells: 6, palette: 'rainbow', panel: 85, fill: 15 }),
      mk('helix', { cx: 50, top: 12, bottom: 90, radius: 12, turns: 5, thick: 3, material: 'chrome', tilt: 35, spin: 1 }),
      mk('film', { grain: 18 }),
    ],
  },
  {
    id: 'redHelix',
    name: '빨간 나선 탑',
    english: 'Red Helix',
    hint: '파란 하늘과 들판',
    build: () => [
      mk('helix', { cx: 32, top: 14, bottom: 92, radius: 7, turns: 4.5, thick: 4, material: 'red', tilt: 30, spin: 1 }),
      mk('terminalWindows', { area: { x: 0.5, y: 0.05, w: 0.46, h: 0.5 }, count: 3, content: 'wave', theme: 'black' }),
      mk('film', { grain: 20 }),
    ],
  },
  {
    id: 'neonDrip',
    name: '빛 흘러내리는 창',
    english: 'Dripping Window',
    hint: '땅·강이 보이는 풍경',
    build: () => [
      mk('terminalWindows', { area: { x: 0.2, y: 0.06, w: 0.6, h: 0.18 }, count: 1, content: 'code', theme: 'black', popIn: false }),
      mk('spectralDrip', { area: { x: 0.24, y: 0.08, w: 0.52, h: 0.14 }, length: 55, palette: 'pinkblue', density: 70, glow: 60, grow: 'breathe' }),
      mk('colorGrade', { contrast: 14, vignette: 30 }),
      mk('film', { grain: 20 }),
    ],
  },
  {
    id: 'flashNight',
    name: '플래시 밤',
    english: 'Direct Flash Night',
    hint: '밤·실내에서 찍은 인물이나 사물',
    build: () => [
      mk('flashLook', { power: 70, dark: 75, temp: -10, flicker: 30 }),
      mk('colorGrade', { contrast: 22, saturation: -10 }),
      mk('film', { grain: 30, chroma: 20 }),
    ],
  },
  {
    id: 'liquidChrome',
    name: '액체 크롬 세상',
    english: 'Liquid Chrome World',
    hint: '산·물결·건물처럼 굴곡이 많은 사진',
    build: () => [
      mk('chromeSkin', { tint: 'silver', contrast: 65, detail: 30, ripple: 45 }),
      mk('glints', {}),
      mk('colorGrade', { contrast: 10, vignette: 30 }),
      mk('film', { grain: 16 }),
    ],
  },
  {
    id: 'stepCollage',
    name: '계단 합성',
    english: 'Stepped Composite',
    hint: '방·거리 사진 (다른 하늘·바다 사진을 올리면 그 사진으로 채워요)',
    build: () => [
      mk('fillImage', { image: 'base', area: { x: 0, y: 0, w: 1, h: 0.42 }, edge: 'steps', block: 4, zoom: 140, flip: 'v', drift: 15 }),
      mk('colorGrade', { contrast: 12, saturation: -5, vignette: 25 }),
      mk('film', { grain: 22 }),
    ],
  },
  {
    id: 'splitWorld',
    name: '분할 세상',
    english: 'Split Worlds',
    hint: '사진 2~3장을 올려두면 칸마다 다른 풍경',
    build: () => [
      mk('splitCollage', { layout: 'tri', offset: 50, gap: 0, drift: 30 }),
      mk('lightDoor', { area: { x: 0.44, y: 0.3, w: 0.12, h: 0.36 }, glow: 60, floor: 30 }),
      mk('film', { grain: 22 }),
    ],
  },
  {
    id: 'viewfinderDoc',
    name: '뷰파인더 기록',
    english: 'Viewfinder',
    hint: '물건·동물·사람이 가운데 있는 사진',
    build: () => [
      mk('colorGrade', { contrast: 12, saturation: -8, vignette: 25 }),
      mk('viewfinder', { cross: 'full', info: true, rec: true, focus: 18 }),
      mk('film', { grain: 18 }),
    ],
  },
  {
    id: 'floatingSlab',
    name: '떠오르는 땅',
    english: 'Floating Slab',
    hint: '지면·절벽·바다 항공 사진',
    build: () => [
      mk('floatingPanel', {
        src: { x: 0.08, y: 0.45, w: 0.84, h: 0.3 },
        dst: { x: 0.1, y: 0.26, w: 0.8, h: 0.28 },
        mode: 'cut',
        thickness: 150,
        side: 'strata',
        shadow: 60,
        float: 12,
        tilt: 0.6,
      }),
      mk('trackingLabels', { area: { x: 0.1, y: 0.24, w: 0.8, h: 0.32 }, count: 30, drop: 32, links: 20 }),
      mk('colorGrade', { contrast: 15, vignette: 40 }),
      mk('camera', { move: 'zoomIn', amount: 6 }),
      mk('film', { grain: 22 }),
    ],
  },
  {
    id: 'scatteredSky',
    name: '조각난 하늘',
    english: 'Scattered Sky',
    hint: '언덕·들판 사진 (+ 하늘 사진이 있으면 더 좋아요)',
    build: () => [
      mk('scatter', { source: 'base', area: { x: 0.03, y: 0.45, w: 0.94, h: 0.5 }, count: 11, zoom: 1.2, shadow: 70, float: 8 }),
      mk('colorGrade', { contrast: 10, saturation: -5, vignette: 25 }),
      mk('film', { grain: 22 }),
    ],
  },
  {
    id: 'meltingTower',
    name: '녹아내리는 건축',
    english: 'Melting Monument',
    hint: '빌딩·성당·폭포처럼 세로로 긴 피사체',
    build: () => [
      mk('pixelStretch', { area: { x: 0, y: 0.42, w: 1, h: 0.58 }, melt: 45, drip: 55, wave: 8, anim: 'breathe', strength: 45 }),
      mk('sliceGlitch', { amount: 2, chance: 15, rgb: 4, burst: 80 }),
      mk('colorGrade', { saturation: -70, contrast: 25, fade: 10, vignette: 35 }),
      mk('camera', { move: 'zoomIn', amount: 5 }),
      mk('film', { grain: 30 }),
    ],
  },
  {
    id: 'chromeMelt',
    name: '크롬 녹음',
    english: 'Chrome Melt',
    hint: '건물·얼굴·조각상',
    build: () => [
      mk('gradientMap', { palette: 'chrome', contrast: 25 }, { mask: { shape: 'ellipse', rect: { x: 0.15, y: 0.1, w: 0.7, h: 0.75 }, feather: 0.45, invert: false } }),
      mk('wave', { amp: 18, freq: 9, turb: 50 }, { mask: { shape: 'rect', rect: { x: 0, y: 0.5, w: 1, h: 0.5 }, feather: 0.5, invert: false } }),
      mk('glints', { count: 24, size: 50 }),
      mk('film', { grain: 22 }),
    ],
  },
  {
    id: 'dataTerrain',
    name: '데이터 지형',
    english: 'Data Terrain',
    hint: '디테일 많은 풍경·도시·군중',
    build: () => [
      mk('colorGrade', { contrast: 18, temperature: -15, saturation: -5, vignette: 30 }),
      mk('trackingLabels', { count: 46, drop: 14, links: 35 }),
      mk('camera', { move: 'drift', amount: 6 }),
      mk('film', { grain: 22, chroma: 2 }),
    ],
  },
  {
    id: 'lidar',
    name: '라이다 스캔',
    english: 'LiDAR Scan',
    hint: '산·지형·얼굴',
    build: () => [
      mk('scanTerrain', { lines: 110, height: 90, bg: 'black', scan: 70 }),
      mk('editorial', { title: 'TERRAIN SCAN / 04', index: 'N°112' }),
      mk('film', { grain: 18 }),
    ],
  },
  {
    id: 'codeWall',
    name: '코드 벽',
    english: 'Code Wall',
    hint: '넓은 계곡·들판',
    build: () => [
      mk('terminalWindows', { area: { x: 0.08, y: 0.08, w: 0.84, h: 0.42 }, count: 1, content: 'code', theme: 'blue', size: 82, sizeVar: 0, fontSize: 11, popIn: false, opacity: 80 }, { blend: 'screen' }),
      mk('scanTerrain', { lines: 60, height: 40, bg: 'none', occlude: false, color: '#9fc0ff', scan: 0 }, { opacity: 0.35, mask: { shape: 'rect', rect: { x: 0, y: 0.55, w: 1, h: 0.45 }, feather: 0.4, invert: false } }),
      mk('colorGrade', { contrast: 10, temperature: -10, vignette: 30 }),
      mk('film', { grain: 20 }),
    ],
  },
  {
    id: 'signalMonitor',
    name: '시그널 모니터',
    english: 'Signal Monitor',
    hint: '인물·사물이 중앙에 있는 사진',
    build: () => [
      mk('pixelSort', { lo: 42, hi: 92, anim: 'threshold', strength: 35 }),
      mk('terminalWindows', { count: 14, theme: 'blue', content: 'mixed' }),
      mk('colorGrade', { saturation: -20, contrast: 10, vignette: 20 }),
      mk('camera', { move: 'drift', amount: 4, shake: 3 }),
      mk('film', { grain: 25, scanlines: 15, chroma: 3 }),
    ],
  },
  {
    id: 'blueDissolve',
    name: '파란 창 분해',
    english: 'Blue Dissolve',
    hint: '사람이 있는 사진 (영역을 사람에 맞추세요)',
    build: () => [
      mk('dissolve', { mode: 'blue', density: 60, drift: 45 }),
      mk('terminalWindows', { count: 5, size: 16, content: 'code' }),
      mk('film', { grain: 22 }),
    ],
  },
  {
    id: 'thermal',
    name: '열화상 감시',
    english: 'Thermal Watch',
    hint: '사람·거리',
    build: () => [
      mk('gradientMap', { palette: 'thermal', contrast: 20 }),
      mk('cctv', { label: 'THERMAL_02  SECTOR 7', track: 3 }),
      mk('film', { grain: 35, scanlines: 25 }),
    ],
  },
  {
    id: 'surveil',
    name: '감시 화면',
    english: 'Surveillance',
    hint: '거리·군중',
    build: () => [
      mk('colorGrade', { saturation: -35, contrast: 15, tint: '#2bff6a', tintAmount: 12 }),
      mk('cctv', { track: 4 }),
      mk('datamosh', { amount: 6, block: 24 }),
      mk('film', { grain: 30, scanlines: 30, chroma: 3 }),
    ],
  },
  {
    id: 'dotFace',
    name: '점 얼굴',
    english: 'Dot Face',
    hint: '얼굴·인물 클로즈업',
    build: () => [
      mk('halftone', { cell: 9, bright: true, ink: '#ffffff', paper: '#000000', pulse: 25 }),
      mk('colorGrade', { vignette: 50, saturation: 0, contrast: 0, fade: 0 }),
    ],
  },
  {
    id: 'riso',
    name: '리소 프린트',
    english: 'Riso Print',
    hint: '인물·포스터',
    build: () => [
      mk('halftone', { cell: 7, bright: false, ink: '#ff3b3b', paper: '#f4ecd8', angle: 15 }),
      mk('editorial', { color: '#ff3b3b', barcode: false, frame: true }),
      mk('film', { grain: 30, animated: false }),
    ],
  },
  {
    id: 'codeEye',
    name: '코드 눈',
    english: 'Code Eye',
    hint: '눈·얼굴 클로즈업',
    build: () => [
      mk('ascii', { cell: 10, colorMode: 'photo', boost: 50, flicker: 25 }),
      mk('glints', { count: 6, size: 70 }),
    ],
  },
  {
    id: 'mirrorWorld',
    name: '거울 세계',
    english: 'Mirror World',
    hint: '수평선이 가운데쯤 있는 풍경·도시',
    build: () => [
      mk('mirror', { mode: 'tb', axis: 55, ripple: 35, darken: 25 }),
      mk('colorGrade', { contrast: 12, vignette: 30 }),
      mk('film', { grain: 20 }),
    ],
  },
  {
    id: 'tinyPlanet',
    name: '작은 행성',
    english: 'Tiny Planet',
    hint: '하늘이 위, 땅이 아래인 넓은 풍경',
    build: () => [
      mk('polar', { hole: 0, invert: false, spin: 1 }),
      mk('glints', { count: 12 }),
      mk('film', { grain: 18 }),
    ],
  },
  {
    id: 'droste',
    name: '무한 액자',
    english: 'Endless Frame',
    hint: '어떤 사진이든',
    build: () => [mk('droste', { depth: 8, border: 6, zoom: true }), mk('colorGrade', { vignette: 35 }), mk('film', { grain: 18 })],
  },
  {
    id: 'shatter',
    name: '유리 파편',
    english: 'Shatter',
    hint: '인물·건물',
    build: () => [mk('shatter', { pieces: 30, spread: 20 }), mk('colorGrade', { contrast: 15, vignette: 35 }), mk('film', { grain: 22 })],
  },
  {
    id: 'retroDesk',
    name: '레트로 데스크톱',
    english: 'Retro Desktop',
    hint: '인물·사물·풍경',
    build: () => [
      mk('terminalWindows', { theme: 'retro', count: 9, content: 'mixed', size: 26 }),
      mk('datamosh', { amount: 8, block: 32 }),
      mk('film', { grain: 22 }),
    ],
  },
  {
    id: 'coverTitle',
    name: '커버 타이포',
    english: 'Cover Title',
    hint: '앨범 커버·릴스 썸네일',
    build: () => [
      mk('colorGrade', { contrast: 20, saturation: -25, vignette: 45, fade: 12 }),
      mk('camera', { move: 'zoomIn', amount: 5 }),
      mk('text', { anim: 'rise' }),
      mk('film', { grain: 28 }),
    ],
  },
];

const RANDOM_POOL = [
  'floatingPanel', 'scatter', 'shatter', 'echo', 'pixelStretch', 'pixelSort', 'sliceGlitch', 'wave', 'mirror',
  'twirl', 'datamosh', 'halftone', 'gradientMap', 'dissolve', 'trackingLabels', 'terminalWindows', 'scanTerrain',
  'glints', 'lightLeak', 'cctv', 'edgeGlow', 'burnHole', 'lightDoor', 'reflectPool', 'glassOrb', 'patchwork',
  'splitCollage', 'helix', 'spectralDrip', 'lightBeam', 'plexus', 'zoomInsets', 'redact', 'dashboard',
];

/** A surprise stack: 2–3 random effects with jittered settings, a region now and then, film on top. */
export function randomStack(): Layer[] {
  const r = Math.random;
  const picks: string[] = [];
  const n = 2 + Math.floor(r() * 2);
  while (picks.length < n) {
    const k = RANDOM_POOL[Math.floor(r() * RANDOM_POOL.length)];
    if (!picks.includes(k)) picks.push(k);
  }
  const layers = picks.map((type) => {
    const L = makeLayer(type);
    const def = EFFECT_MAP[type];
    for (const d of def.params) {
      if (d.type === 'range' && d.group !== '모션') {
        let v = (L.params[d.key] as number) + (r() - 0.5) * (d.max - d.min) * 0.6;
        v = Math.min(d.max, Math.max(d.min, v));
        L.params[d.key] = Math.round(v / d.step) * d.step;
      } else if (d.type === 'select' && r() < 0.4) {
        L.params[d.key] = d.options[Math.floor(r() * d.options.length)].value;
      }
    }
    if (def.kind !== 'overlay' && r() < 0.45) {
      const w = 0.35 + r() * 0.5;
      const h = 0.3 + r() * 0.5;
      L.mask = { shape: r() < 0.5 ? 'rect' : 'ellipse', rect: { x: r() * (1 - w), y: r() * (1 - h), w, h }, feather: r() * 0.6, invert: r() < 0.2 };
    }
    return L;
  });
  layers.push(makeLayer('colorGrade', { contrast: 10 + Math.round(r() * 20), saturation: -Math.round(r() * 40), vignette: 30 }));
  layers.push(makeLayer('film', { grain: 15 + Math.round(r() * 20) }));
  return layers;
}
