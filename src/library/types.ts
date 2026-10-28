/** [title (Korean), look id, AI base prompt (English)] — one per feed post, in feed order. */
export type Entry = [title: string, look: string, prompt: string];

export type Era = 'land' | 'circuit' | 'glass' | 'early';

export const ERAS: { id: Era; label: string; from: number; to: number }[] = [
  { id: 'land', label: '풍경 합성·데이터', from: 0, to: 119 },
  { id: 'circuit', label: '회로·사이버 콜라주', from: 120, to: 329 },
  { id: 'glass', label: '유리 몸·그로테스크', from: 330, to: 479 },
  { id: 'early', label: '초기 AI 초상', from: 480, to: 9999 },
];

export const eraOf = (i: number): Era => ERAS.find((e) => i >= e.from && i <= e.to)!.id;

export interface FeedPreset {
  /** position in the feed, 0 = newest */
  i: number;
  /** Instagram permalink to the post this preset was modelled on */
  url: string;
  reel: boolean;
  era: Era;
  title: string;
  look: string;
  prompt: string;
}
