import { uid } from '../engine/random';
import type { SourceImage } from '../engine/types';
import { loadVideo } from '../engine/video';

/** Long-side cap so huge camera files don't exhaust memory. */
const MAX_SIDE = 3200;

export async function toSource(blob: Blob, name: string, id = uid()): Promise<SourceImage> {
  let bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const long = Math.max(bitmap.width, bitmap.height);
  if (long > MAX_SIDE) {
    const k = MAX_SIDE / long;
    const resized = await createImageBitmap(bitmap, {
      resizeWidth: Math.round(bitmap.width * k),
      resizeHeight: Math.round(bitmap.height * k),
      resizeQuality: 'high',
    });
    bitmap.close();
    bitmap = resized;
  }
  return {
    id,
    name,
    bitmap,
    url: URL.createObjectURL(blob),
    width: bitmap.width,
    height: bitmap.height,
  };
}

const VIDEO_EXT = /\.(mp4|m4v|mov|webm|ogv)$/i;
export const isVideoFile = (f: File) => f.type.startsWith('video/') || VIDEO_EXT.test(f.name);

/** Photos and videos from a file picker or drop. Unreadable files are reported, not thrown. */
export async function loadFiles(files: FileList | File[]): Promise<{ sources: SourceImage[]; failed: string[] }> {
  const list = Array.from(files).filter((f) => f.type.startsWith('image/') || isVideoFile(f));
  const sources: SourceImage[] = [];
  const failed: string[] = [];
  for (const f of list) {
    const name = f.name.replace(/\.[^.]+$/, '');
    try {
      sources.push(isVideoFile(f) ? await loadVideo(f, name, uid()) : await toSource(f, name));
    } catch (err) {
      console.warn('파일을 읽지 못했습니다', f.name, err);
      failed.push(f.name);
    }
  }
  return { sources, failed };
}

/** Free sample photos from picsum.photos (Unsplash images, CORS enabled). */
export const SAMPLES = [
  { id: 1015, name: '강 계곡' },
  { id: 1018, name: '산맥' },
  { id: 1039, name: '폭포' },
  { id: 1067, name: '도시' },
  { id: 1043, name: '협곡' },
  { id: 1031, name: '빌딩' },
];

export async function loadSamples(): Promise<SourceImage[]> {
  const results = await Promise.allSettled(
    SAMPLES.map(async (s) => {
      const res = await fetch(`https://picsum.photos/id/${s.id}/1600/2000`);
      if (!res.ok) throw new Error(`${res.status}`);
      return toSource(await res.blob(), s.name);
    }),
  );
  return results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
}
