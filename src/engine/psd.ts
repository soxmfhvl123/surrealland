import { download } from './export';
import { ensureUrls, maskFor } from './masks';
import { drawCover, getFormat } from './renderer';
import type { Project, Selection } from './types';

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Bounding box of the non-transparent pixels, or null when the canvas is empty. */
function bounds(c: HTMLCanvasElement) {
  const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width;
  let y0 = c.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (d[(y * c.width + x) * 4 + 3] < 4) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * A Photoshop file of the photo split into layers: the original at the bottom (hidden), then
 * one layer per selection, cut out with its mask and left where it sits in the frame. Opens
 * in Photoshop, Photopea, Procreate and Affinity with every piece on its own layer.
 */
export async function exportLayersPsd(project: Project, sels: Selection[]): Promise<number> {
  const { writePsd } = await import('ag-psd');
  const src = project.images.find((i) => i.id === project.baseImageId);
  if (!src) return 0;
  const { width: W, height: H } = getFormat(project.format);
  const photo = canvas(W, H);
  drawCover(photo.getContext('2d')!, src, W, H, project.crop);
  await ensureUrls(sels.map((s) => s.paint));

  const children: { name: string; canvas: HTMLCanvasElement; left?: number; top?: number; hidden?: boolean }[] = [{ name: '원본', canvas: photo, hidden: true }];
  for (const s of sels) {
    const mask = maskFor(s.id, s.paint);
    if (!mask) continue;
    const cut = canvas(W, H);
    const ctx = cut.getContext('2d', { willReadFrequently: true })!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(mask, 0, 0, W, H);
    ctx.globalCompositeOperation = 'source-in';
    ctx.drawImage(photo, 0, 0);
    const box = bounds(cut);
    if (!box) continue;
    const layer = canvas(box.w, box.h);
    layer.getContext('2d')!.drawImage(cut, -box.x, -box.y);
    children.push({ name: s.name, canvas: layer, left: box.x, top: box.y });
  }

  const buf = writePsd({ width: W, height: H, canvas: photo, children }, { generateThumbnail: true, noBackground: true });
  download(new Blob([buf], { type: 'image/vnd.adobe.photoshop' }), `surreal-land-layers-${Date.now().toString(36)}.psd`);
  return children.length - 1;
}
