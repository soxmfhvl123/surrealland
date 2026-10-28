/**
 * Higgsfield image models wired into the generate panel. Field names and enums
 * follow open.higgsfield.ai API references (checked 2026-10). Anything else can
 * be called through the "직접 입력" model with a raw JSON body.
 */
export interface HfModel {
  id: string;
  label: string;
  price: string;
  note: string;
  aspects: string[];
  resolutions: string[];
  /** accepts reference images through image_urls */
  edit: boolean;
  /** native multi-image batch sizes; otherwise we send one request per image */
  batch?: number[];
  build: (o: BuildOpts) => Record<string, unknown>;
}

export interface BuildOpts {
  prompt: string;
  aspect: string;
  resolution: string;
  count: number;
  seed?: number;
  enhance: boolean;
  imageUrls: string[];
}

const seedOf = (o: BuildOpts) => (o.seed ? { seed: o.seed } : {});

export const HF_MODELS: HfModel[] = [
  {
    id: 'higgsfield-ai/soul/v2/standard',
    label: 'Soul 2',
    price: '$0.003/장',
    note: '사실적인 사진·패션 톤. 가장 저렴해서 여러 장 뽑아보기 좋아요.',
    aspects: ['3:4', '2:3', '1:1', '4:3', '3:2', '9:16', '16:9'],
    resolutions: ['1080p', '720p'],
    edit: false,
    batch: [1, 4],
    build: (o) => ({
      prompt: o.prompt,
      aspect_ratio: o.aspect,
      resolution: o.resolution,
      batch_size: o.count >= 4 ? 4 : 1,
      enhance_prompt: o.enhance,
      ...seedOf(o),
    }),
  },
  {
    id: 'z-image/turbo',
    label: 'Z-Image Turbo',
    price: '$0.015/장',
    note: '빠르고 구도를 잘 따라요. 초현실 합성 베이스용.',
    aspects: ['3:4', '7:9', '2:3', '1:1', '4:3', '3:2', '9:16', '16:9', '21:9'],
    resolutions: ['2k', '1k'],
    edit: false,
    build: (o) => ({
      prompt: o.prompt.slice(0, 800),
      aspect_ratio: o.aspect,
      resolution: o.resolution,
      prompt_extend: o.enhance,
      ...seedOf(o),
    }),
  },
  {
    id: 'marketing-studio/image',
    label: 'Marketing Studio Image',
    price: '$0.014/장',
    note: '참고 사진을 넣어 고쳐 그리기(edit)가 돼요. 4K까지.',
    aspects: ['3:4', '2:3', '1:1', '4:3', '3:2', '9:16', '16:9', '21:9', 'auto'],
    resolutions: ['2k', '1k', '4k'],
    edit: true,
    build: (o) => ({
      prompt: o.prompt,
      aspect_ratio: o.aspect,
      resolution: o.resolution,
      enhance_prompt: false,
      ...(o.imageUrls.length ? { image_urls: o.imageUrls } : {}),
    }),
  },
  {
    id: 'xai/grok-imagine-image-2.0',
    label: 'Grok Imagine 2.0',
    price: '$0.04/장',
    note: '참고 사진 편집 가능. 기괴하고 강한 장면에 강해요.',
    aspects: ['3:4', '2:3', '1:1', '4:3', '3:2', '9:16', '16:9', '1:2', '2:1', 'auto'],
    resolutions: ['2k', '1k'],
    edit: true,
    build: (o) => ({
      prompt: o.prompt,
      aspect_ratio: o.aspect,
      resolution: o.resolution,
      quality: 'medium',
      ...(o.imageUrls.length ? { image_urls: o.imageUrls } : {}),
    }),
  },
];

/** Closest supported aspect ratio for the tool's output format. */
export function nearestAspect(format: string, options: string[]): string {
  const target = (() => {
    const [a, b] = format.split(':').map(Number);
    return a / b;
  })();
  let best = options[0];
  let bestD = Infinity;
  for (const o of options) {
    if (o === 'auto') continue;
    const [a, b] = o.split(':').map(Number);
    const d = Math.abs(Math.log(a / b / target));
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}
