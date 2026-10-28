import { normalizeLayers } from '../engine/effects';
import type { Project, SourceImage } from '../engine/types';
import { download } from '../engine/export';
import { toSource } from './images';
import { loadVideo } from '../engine/video';
import { decodeTrack, encodeTrack, getTrack, setTrack, type SavedTrack } from '../engine/track';

interface SavedProject extends Omit<Project, 'images'> {
  version: 1;
  images: { id: string; name: string; data: string; video?: boolean }[];
  /** per-frame masks of selections tracked through a video */
  tracks?: Record<string, SavedTrack>;
}

const blobToDataUrl = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });

/** One JSON file with layers, settings and every photo, so work can resume anywhere. */
export async function saveProject(p: Project) {
  const images = await Promise.all(
    p.images.map(async (img) => ({
      id: img.id,
      name: img.name,
      data: await blobToDataUrl(await (await fetch(img.videoUrl ?? img.url)).blob()),
      ...(img.video ? { video: true } : {}),
    })),
  );
  const tracks: Record<string, SavedTrack> = {};
  for (const s of p.selections) {
    const t = s.track && getTrack(s.id);
    if (t) tracks[s.id] = encodeTrack(t);
  }
  const out: SavedProject = { ...p, version: 1, images, tracks };
  const stamp = new Date().toISOString().slice(0, 10);
  download(new Blob([JSON.stringify(out)], { type: 'application/json' }), `surreal-land-${stamp}.json`);
}

export async function loadProject(file: File): Promise<Project> {
  const j = JSON.parse(await file.text()) as SavedProject;
  if (j.version !== 1 || !Array.isArray(j.layers)) throw new Error('Surreal Land 프로젝트 파일이 아니에요.');
  const images: SourceImage[] = [];
  for (const im of j.images ?? []) {
    const blob = await (await fetch(im.data)).blob();
    images.push(im.video ? await loadVideo(blob, im.name, im.id) : await toSource(blob, im.name, im.id));
  }
  for (const [id, t] of Object.entries(j.tracks ?? {})) setTrack(id, await decodeTrack(t));
  return {
    images,
    selections: Array.isArray(j.selections) ? j.selections : [],
    baseImageId: images.some((i) => i.id === j.baseImageId) ? j.baseImageId : (images[0]?.id ?? null),
    format: j.format,
    crop: j.crop,
    layers: normalizeLayers(j.layers),
    seed: j.seed,
    duration: j.duration,
    fps: j.fps,
  };
}
