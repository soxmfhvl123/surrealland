import posts from './posts.json';
import { S00 } from './sheets/s00';
import { S01 } from './sheets/s01';
import { S02 } from './sheets/s02';
import { S03 } from './sheets/s03';
import { S04 } from './sheets/s04';
import { S05 } from './sheets/s05';
import { S06 } from './sheets/s06';
import { S07 } from './sheets/s07';
import { S08 } from './sheets/s08';
import { S09 } from './sheets/s09';
import { S10 } from './sheets/s10';
import { S11 } from './sheets/s11';
import { S12 } from './sheets/s12';
import { S13 } from './sheets/s13';
import { S14 } from './sheets/s14';
import { S15 } from './sheets/s15';
import { S16 } from './sheets/s16';
import { S17 } from './sheets/s17';
import { S18 } from './sheets/s18';
import { S19 } from './sheets/s19';
import { S20 } from './sheets/s20';
import { eraOf, type Entry, type FeedPreset } from './types';

const ENTRIES: Entry[] = [
  ...S00, ...S01, ...S02, ...S03, ...S04, ...S05, ...S06, ...S07, ...S08, ...S09, ...S10,
  ...S11, ...S12, ...S13, ...S14, ...S15, ...S16, ...S17, ...S18, ...S19, ...S20,
];

/** posts.json holds the post paths in feed order, e.g. "/mezotes/p/ABC123/" (reels contain "/reel/"). */
const PATHS = posts as string[];

export const FEED_PRESETS: FeedPreset[] = ENTRIES.map(([title, look, prompt], i) => ({
  i,
  url: PATHS[i] ? `https://www.instagram.com${PATHS[i]}` : 'https://www.instagram.com/mezotes/',
  reel: !!PATHS[i]?.includes('/reel/'),
  era: eraOf(i),
  title,
  look,
  prompt,
}));
