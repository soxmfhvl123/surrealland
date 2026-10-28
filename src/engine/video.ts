import type { Project, SourceImage } from './types';

/**
 * Video sources. A video is a SourceImage whose `video` element supplies the frame
 * (its `bitmap` is a poster frame used until the video can draw). The video loops
 * inside the project's timeline: frame time = project time mod video length.
 */

export const isVideo = (s: SourceImage | undefined): s is SourceImage & { video: HTMLVideoElement } => !!s?.video;

/** Where in the clip the project time `t` (seconds) lands. */
export function clipTime(src: SourceImage, t: number): number {
  const d = src.duration ?? 0;
  if (!d) return 0;
  // stay a hair inside the clip so the last frame is never "ended"
  return Math.min(d - 0.001, ((t % d) + d) % d);
}

/** What to draw for a source right now, plus its pixel size. */
export function frameOf(src: SourceImage): { img: CanvasImageSource; w: number; h: number } {
  const v = src.video;
  if (v && v.readyState >= 2 && v.videoWidth) return { img: v, w: v.videoWidth, h: v.videoHeight };
  return { img: src.bitmap, w: src.bitmap.width, h: src.bitmap.height };
}

let seekingNonce = 0;

/**
 * Cache key part that changes whenever a video shows a different frame. While a seek is
 * in flight `currentTime` already reports the target but the old frame is still drawn,
 * so that state gets a one-off key and the landed frame is drawn fresh afterwards.
 */
export function frameKey(src: SourceImage): string {
  const v = src.video;
  if (!v) return '';
  if (v.seeking || v.readyState < 2) return `@pending${++seekingNonce}`;
  return `@${v.currentTime.toFixed(3)}`;
}

/** Videos the current project actually draws (the base and any layer that picks one as its source). */
export function usedVideos(p: Project): (SourceImage & { video: HTMLVideoElement })[] {
  const ids = new Set<string>();
  if (p.baseImageId) ids.add(p.baseImageId);
  for (const l of p.layers) for (const v of Object.values(l.params)) if (typeof v === 'string') ids.add(v);
  return p.images.filter((s): s is SourceImage & { video: HTMLVideoElement } => isVideo(s) && ids.has(s.id));
}

function seek(v: HTMLVideoElement, t: number): Promise<void> {
  if (Math.abs(v.currentTime - t) < 1e-4 && v.readyState >= 2) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      v.removeEventListener('seeked', done);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, 4000);
    v.addEventListener('seeked', done);
    v.currentTime = t;
  });
}

/** Export: put every used video on the exact frame for project time `t` and wait until it is decoded. */
export async function seekVideos(p: Project, t: number) {
  await Promise.all(
    usedVideos(p).map((s) => {
      s.video.pause();
      return seek(s.video, clipTime(s, t));
    }),
  );
}

/**
 * Preview: while playing, let the videos play natively and only correct large drift;
 * while paused or scrubbing, seek to the exact frame.
 */
export function syncVideos(p: Project, t: number, playing: boolean) {
  const used = usedVideos(p);
  for (const s of used) {
    const v = s.video;
    const target = clipTime(s, t);
    if (playing) {
      if (v.paused) v.play().catch(() => {});
      if (Math.abs(v.currentTime - target) > 0.3) v.currentTime = target;
    } else {
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - target) > 0.01) v.currentTime = target;
    }
  }
  // videos nobody uses should not keep decoding
  for (const s of p.images) if (s.video && !s.video.paused && !used.some((u) => u.id === s.id)) s.video.pause();
}

/** Load a video file as a source: muted, inline, with a poster bitmap from its first frame. */
export async function loadVideo(blob: Blob, name: string, id: string): Promise<SourceImage> {
  const videoUrl = URL.createObjectURL(blob);
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.loop = false;
  v.src = videoUrl;
  await new Promise<void>((resolve, reject) => {
    v.onloadeddata = () => resolve();
    v.onerror = () => reject(new Error(`${name}: 이 영상 형식은 브라우저에서 열 수 없어요 (MP4·WebM·MOV 권장)`));
  });
  await seek(v, Math.min(0.05, (v.duration || 1) / 2));
  const bitmap = await createImageBitmap(v);
  // a small JPEG poster for thumbnails
  const c = document.createElement('canvas');
  const k = Math.min(1, 480 / Math.max(v.videoWidth, v.videoHeight));
  c.width = Math.round(v.videoWidth * k);
  c.height = Math.round(v.videoHeight * k);
  c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
  const poster = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.8));
  return {
    id,
    name,
    bitmap,
    url: poster ? URL.createObjectURL(poster) : videoUrl,
    width: v.videoWidth,
    height: v.videoHeight,
    video: v,
    videoUrl,
    duration: isFinite(v.duration) ? v.duration : 0,
  };
}
