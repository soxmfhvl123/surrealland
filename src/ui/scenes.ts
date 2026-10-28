/**
 * Scene prompts for AI base images, drawn from the recurring scene types in the
 * @mezotes feed (see docs/mezotes-analysis.md). {subject} is replaced by the user's word.
 */
export interface Scene {
  id: string;
  label: string;
  hint: string;
  subject: string;
  prompt: string;
}

export const STYLE_SUFFIX =
  'shot on 35mm film, natural light, documentary realism, subtle film grain, muted colors, hyperreal detail, no text, no watermark';

export const SCENES: Scene[] = [
  {
    id: 'skyWindow',
    label: '떠있는 하늘 창',
    hint: '떠있는 조각·물 반사 레시피와 짝',
    subject: 'small red-roofed farmhouse in a green valley',
    prompt:
      'A wide quiet landscape with a {subject}, a huge empty sky with soft cumulus clouds, a still reflective pond in the foreground, low horizon, lots of empty space for compositing',
  },
  {
    id: 'slab',
    label: '떠오르는 땅',
    hint: '잘라내기 + 두께 + 트래킹',
    subject: 'rugged sea cliff with green grass on top',
    prompt:
      'Aerial three-quarter view of a {subject} above a stormy ocean, white waves crashing against exposed rock strata, overcast dramatic light',
  },
  {
    id: 'monument',
    label: '녹아내릴 건축',
    hint: '픽셀 스트레치·크롬과 짝',
    subject: 'gothic cathedral interior with tall columns',
    prompt: 'A monumental {subject}, symmetrical composition, soft daylight from above, a tiny lone figure for scale, grey stone and dust',
  },
  {
    id: 'codeValley',
    label: '코드가 서는 계곡',
    hint: 'HUD 창(코드)·스캔라인과 짝',
    subject: 'alpine valley with grazing cows',
    prompt: 'A vast green {subject} at golden hour, mist in the distance, a flat empty meadow in the middle ground, cinematic wide shot',
  },
  {
    id: 'crowd',
    label: '감시되는 군중',
    hint: '감시 카메라·트래킹·조각 분해',
    subject: 'one person in a bright blue raincoat',
    prompt: 'Pedestrians walking on a busy city street at dusk, {subject} in the center, cars with red tail lights, high CCTV-like angle, flash photography',
  },
  {
    id: 'circuitBeing',
    label: '회로 생명체',
    hint: '회로·사이버 콜라주 시기',
    subject: 'hummingbird',
    prompt: 'A {subject} built from green circuit boards, copper wires, capacitors and tiny microchips, studio product photography on a black background, macro detail',
  },
  {
    id: 'petri',
    label: '접시 속 기계',
    hint: '제품샷 + 에디토리얼 라벨',
    subject: 'rice grains and tiny electronic components',
    prompt: 'A clear glass petri dish filled with {subject}, miniature machinery growing like an ecosystem, macro product shot, pure black background, hard light',
  },
  {
    id: 'glassBody',
    label: '유리 인체',
    hint: '반짝이·빛 번짐과 짝',
    subject: 'person sitting in a summer field',
    prompt: 'A transparent glass human figure, a {subject}, the body filled with glittering light and tiny galaxies, editorial fashion photography',
  },
  {
    id: 'chromeFace',
    label: '크롬 피부',
    hint: '색 바꾸기(크롬)·윤곽 네온',
    subject: 'woman with a jeweled spiked headpiece',
    prompt: 'Close portrait of a {subject} whose skin is liquid mirror chrome, reflections of the room on the face, hard flash, fashion editorial',
  },
  {
    id: 'portal',
    label: '포털 문',
    hint: '떠있는 조각(아치)·무한 액자',
    subject: 'red desert hillside',
    prompt: 'A lone stone doorway standing on a {subject}, blinding warm light pouring out of it, a small figure walking toward it, cinematic dusk',
  },
  {
    id: 'crtField',
    label: '모니터 더미',
    hint: '레트로 OS 창·블록 깨짐',
    subject: 'misty meadow',
    prompt: 'Old beige CRT computers and keyboards piled in a {subject}, tangled cables, screens glowing blue, overcast light, film photography',
  },
  {
    id: 'foilCar',
    label: '포일 감싼 차',
    hint: '반짝이·컬러 그레이드',
    subject: 'vintage sports car',
    prompt: 'A {subject} completely wrapped in crinkled silver foil parked on a suburban street at night, direct flash, specular highlights',
  },
  {
    id: 'grotesque',
    label: '기괴한 패션 초상',
    hint: '초기 AI 초상 시기',
    subject: 'person in a sculptural horned mask',
    prompt: 'Editorial portrait of a {subject}, saturated colors, strange beauty, magazine cover lighting, shallow depth of field',
  },
];
