import {
  BufferTarget,
  CanvasSource,
  getFirstEncodableVideoCodec,
  Mp4OutputFormat,
  Output,
  Quality,
  WebMOutputFormat,
} from 'mediabunny';
import { ensureMasks } from './masks';
import { ensureFonts, getFormat, Renderer } from './renderer';
import type { Project } from './types';
import { seekVideos } from './video';

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

export async function exportPng(project: Project, time: number, scale: number) {
  await Promise.all([ensureFonts(), ensureMasks(project.layers, project.selections), seekVideos(project, time)]);
  const r = new Renderer();
  const canvas = r.render(project, time, scale);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error('PNG 변환에 실패했습니다.');
  download(blob, `surreal-land-${stamp()}.png`);
}

export interface VideoProgress {
  frame: number;
  total: number;
}

export interface VideoOptions {
  scale: number;
  quality: 'high' | 'max';
  onProgress: (p: VideoProgress) => void;
  signal: AbortSignal;
}

/** Render every frame offline (not real time) and encode to MP4, falling back to WebM. */
export async function exportVideo(project: Project, opts: VideoOptions): Promise<string> {
  await Promise.all([ensureFonts(), ensureMasks(project.layers, project.selections)]);
  const fmt = getFormat(project.format);
  // H.264 needs even dimensions
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  const width = even(fmt.width * opts.scale);
  const height = even(fmt.height * opts.scale);
  // Explicit bitrate: quantizer-based quality makes animated grain balloon to ~60 Mbps.
  // ~16 Mbps (high) / ~30 Mbps (max) at 1080×1350 @ 30fps, scaled by pixel rate.
  const bitsPerPixel = opts.quality === 'max' ? 0.7 : 0.37;
  const bitrate = Math.round(width * height * project.fps * bitsPerPixel);
  const quality = new Quality({ bitrate, bitrateMode: 'variable' });

  let format: Mp4OutputFormat | WebMOutputFormat = new Mp4OutputFormat({ fastStart: 'in-memory' });
  let codec = await getFirstEncodableVideoCodec(['avc', 'hevc'], { width, height, quality });
  if (!codec) {
    format = new WebMOutputFormat();
    codec = await getFirstEncodableVideoCodec(['vp9', 'av1', 'vp8'], { width, height, quality });
  }
  if (!codec) throw new Error('이 브라우저는 영상 인코딩(WebCodecs)을 지원하지 않습니다. 최신 Chrome에서 열어주세요.');

  const renderer = new Renderer();
  const frameCanvas = document.createElement('canvas');
  frameCanvas.width = width;
  frameCanvas.height = height;
  const fctx = frameCanvas.getContext('2d')!;

  const target = new BufferTarget();
  const output = new Output({ format, target });
  const source = new CanvasSource(frameCanvas, { codec, quality, keyFrameInterval: 1 });
  output.addVideoTrack(source, { frameRate: project.fps });
  await output.start();

  const total = Math.max(1, Math.round(project.duration * project.fps));
  try {
    for (let i = 0; i < total; i++) {
      if (opts.signal.aborted) throw new DOMException('canceled', 'AbortError');
      const time = (i / total) * project.duration;
      await seekVideos(project, time);
      const frame = renderer.render(project, time, width / fmt.width);
      fctx.drawImage(frame, 0, 0, width, height);
      await source.add(i / project.fps, 1 / project.fps);
      opts.onProgress({ frame: i + 1, total });
      // let the progress bar paint
      if (i % 2 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    await output.finalize();
  } catch (err) {
    await output.cancel().catch(() => {});
    throw err;
  }

  const ext = format instanceof Mp4OutputFormat ? 'mp4' : 'webm';
  download(new Blob([target.buffer!], { type: format.mimeType }), `surreal-land-${stamp()}.${ext}`);
  const mb = (target.buffer!.byteLength / 1e6).toFixed(1);
  return `${ext.toUpperCase()} · ${codec.toUpperCase()} · ${width}×${height} · ${project.fps}fps · ${mb}MB`;
}
