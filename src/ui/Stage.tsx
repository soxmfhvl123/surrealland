import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Crosshair, Eye, Loader, Scissors, Sparkles, Trash, Waves } from 'lucide-react';
import { onTracksChanged, selectionMaskAt } from '../engine/track';
import { EFFECT_MAP } from '../engine/effects';
import { beginLive, blankMask, commitLive, encode, liveCanvas, maskCanvas, maskSize, onMasksChanged, strokeSegment } from '../engine/masks';
import { getFormat, Renderer } from '../engine/renderer';
import { syncVideos, usedVideos } from '../engine/video';
import type { Crop, Layer, Project, Rect, Selection } from '../engine/types';
import type { SelectMode } from './SelectPanel';
import type { BrushState } from './TargetPanel';

export interface PickMods {
  add: boolean;
  subtract: boolean;
}

interface Props {
  project: Project;
  time: number;
  scale: number;
  /** what canvas clicks do */
  tool: string;
  selectMode: SelectMode;
  layer: Layer | null;
  activeSel: Selection | null;
  /** selection briefly highlighted from elsewhere (hovering a chip) */
  peekSel: string | null;
  showSelections: boolean;
  busy: string;
  brush: BrushState;
  playing: boolean;
  /** the base is a video, so the active selection can be tracked */
  canTrack: boolean;
  onSelTrack: () => void;
  onRectChange: (key: string, r: Rect) => void;
  onCrop: (c: Crop) => void;
  onPick: (x: number, y: number, mods: PickMods) => void;
  /** a rectangle or ellipse dragged out in the select tool (normalized frame coords) */
  onMarquee: (r: Rect, shape: 'rect' | 'ellipse', mods: PickMods) => void;
  /** a finished brush stroke on the layer's own painted mask */
  onLayerPaint: (url: string) => void;
  /** brush on the active selection; creates one first if there is none */
  onSelectionPaint: (id: string, url: string) => void;
  onNewBlankSelection: (url: string) => string;
  onUpload: () => void;
  onSamples: () => void;
  onAI: () => void;
  onSelAddEffect: () => void;
  onSelCutout: () => void;
  onSelFlow: () => void;
  onSelInvert: () => void;
  onSelDelete: () => void;
}

type Mode = 'move' | 'nw' | 'ne' | 'sw' | 'se';
const MIN = 0.02;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function applyDrag(r: Rect, mode: Mode, dx: number, dy: number, lockRatio: number | null): Rect {
  let { x, y, w, h } = r;
  if (mode === 'move') {
    x = Math.min(1 - w, Math.max(0, x + dx));
    y = Math.min(1 - h, Math.max(0, y + dy));
    return { x, y, w, h };
  }
  let x2 = x + w;
  let y2 = y + h;
  if (mode === 'nw' || mode === 'sw') x = Math.min(x2 - MIN, clamp01(x + dx));
  if (mode === 'ne' || mode === 'se') x2 = Math.max(x + MIN, clamp01(x2 + dx));
  if (mode === 'nw' || mode === 'ne') y = Math.min(y2 - MIN, clamp01(y + dy));
  if (mode === 'sw' || mode === 'se') y2 = Math.max(y + MIN, clamp01(y2 + dy));
  if (lockRatio) {
    const nh = (x2 - x) / lockRatio;
    if (mode === 'nw' || mode === 'ne') y = y2 - nh;
    else y2 = y + nh;
  }
  return { x, y, w: x2 - x, h: y2 - y };
}

const round = (r: Rect): Rect => ({
  x: Math.round(r.x * 1000) / 1000,
  y: Math.round(r.y * 1000) / 1000,
  w: Math.round(r.w * 1000) / 1000,
  h: Math.round(r.h * 1000) / 1000,
});

/** Tint `src` (a white-alpha mask) with a color at the given opacity, plus a crisp outline. */
function drawTinted(ctx: CanvasRenderingContext2D, src: HTMLCanvasElement, color: string, fill: number, edge: number, tmp: HTMLCanvasElement) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const t = tmp.getContext('2d')!;
  if (fill > 0) {
    t.globalCompositeOperation = 'source-over';
    t.clearRect(0, 0, w, h);
    t.drawImage(src, 0, 0, w, h);
    t.globalCompositeOperation = 'source-in';
    t.fillStyle = color;
    t.fillRect(0, 0, w, h);
    ctx.globalAlpha = fill;
    ctx.drawImage(tmp, 0, 0);
    ctx.globalAlpha = 1;
  }
  if (edge > 0) {
    // outline = mask minus the mask shrunk by intersecting shifted copies
    t.globalCompositeOperation = 'source-over';
    t.clearRect(0, 0, w, h);
    t.drawImage(src, 0, 0, w, h);
    t.globalCompositeOperation = 'destination-in';
    const d = 1.6;
    for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) t.drawImage(src, dx, dy, w, h);
    const ring = blankMask(w, h);
    const r = ring.getContext('2d')!;
    r.drawImage(src, 0, 0, w, h);
    r.globalCompositeOperation = 'destination-out';
    r.drawImage(tmp, 0, 0);
    r.globalCompositeOperation = 'source-in';
    r.fillStyle = color;
    r.fillRect(0, 0, w, h);
    ctx.globalAlpha = edge;
    ctx.drawImage(ring, 0, 0);
    ctx.globalAlpha = 1;
  }
  t.globalCompositeOperation = 'source-over';
}

export function Stage(p: Props) {
  const { project, time, scale, tool, selectMode, layer, activeSel, brush } = p;
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const tmpRef = useRef<HTMLCanvasElement | null>(null);
  const renderer = useRef<Renderer | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [compare, setCompare] = useState(false);
  const [fontTick, setFontTick] = useState(0);
  const [maskTick, setMaskTick] = useState(0);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [alt, setAlt] = useState(false);
  const fmt = getFormat(project.format);
  const hasPhoto = !!project.baseImageId;

  const selecting = tool === 'select' && hasPhoto;
  const selBrush = selecting && selectMode === 'brush';
  const layerBrush = !selecting && !!layer && layer.mask?.shape === 'paint';
  const brushing = selBrush || layerBrush;
  const marqueeMode = selecting && (selectMode === 'rect' || selectMode === 'ellipse');
  const picking = selecting && (selectMode === 'click' || selectMode === 'color');
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const erase = brush.erase !== alt;

  useEffect(() => onMasksChanged(() => setMaskTick((n) => n + 1)), []);
  useEffect(() => onTracksChanged(() => setMaskTick((n) => n + 1)), []);

  // videos: follow the timeline, and redraw when a seek lands on a new frame
  const [frameTick, setFrameTick] = useState(0);
  useEffect(() => syncVideos(project, time, p.playing), [project, time, p.playing]);
  const videoIds = usedVideos(project).map((s) => s.id).join(',');
  useEffect(() => {
    const vids = usedVideos(project).map((s) => s.video);
    const bump = () => setFrameTick((n) => n + 1);
    vids.forEach((v) => {
      v.addEventListener('seeked', bump);
      v.addEventListener('loadeddata', bump);
    });
    return () =>
      vids.forEach((v) => {
        v.removeEventListener('seeked', bump);
        v.removeEventListener('loadeddata', bump);
      });
    // re-bind only when the set of videos changes
  }, [videoIds]);

  // Option/Alt flips brush ↔ eraser (and click-add ↔ subtract)
  useEffect(() => {
    const on = (e: KeyboardEvent) => setAlt(e.altKey);
    const off = () => setAlt(false);
    window.addEventListener('keydown', on);
    window.addEventListener('keyup', on);
    window.addEventListener('blur', off);
    return () => {
      window.removeEventListener('keydown', on);
      window.removeEventListener('keyup', on);
      window.removeEventListener('blur', off);
    };
  }, []);

  // overlay: selections in the select tool, a peeked selection, or the layer's painted mask
  useEffect(() => {
    const c = overlayRef.current;
    if (!c) return;
    const size = maskSize(fmt);
    if (c.width !== size.w || c.height !== size.h) {
      c.width = size.w;
      c.height = size.h;
    }
    if (!tmpRef.current) tmpRef.current = blankMask(size.w, size.h);
    const tmp = tmpRef.current;
    if (tmp.width !== size.w || tmp.height !== size.h) {
      tmp.width = size.w;
      tmp.height = size.h;
    }
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    if (compare) return;

    if (tool === 'select' && p.showSelections) {
      for (const s of project.selections) {
        const src = selectionMaskAt(s, project, time)?.canvas;
        if (!src) continue;
        const active = s.id === activeSel?.id;
        drawTinted(ctx, src, s.color, active ? 0.42 : 0, active ? 1 : 0.55, tmp);
      }
    }
    if (p.peekSel && tool !== 'select') {
      const s = project.selections.find((x) => x.id === p.peekSel);
      const src = s && selectionMaskAt(s, project, time)?.canvas;
      if (s && src) drawTinted(ctx, src, s.color, 0.4, 1, tmp);
    }
    if (layerBrush && layer) {
      const src = maskCanvas(layer);
      if (layer.mask!.invert) {
        ctx.fillStyle = 'rgba(255,40,60,0.5)';
        ctx.fillRect(0, 0, c.width, c.height);
        if (src) {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.drawImage(src, 0, 0, c.width, c.height);
          ctx.globalCompositeOperation = 'source-over';
        }
      } else if (src) drawTinted(ctx, src, '#ff2a40', 0.5, 0.9, tmp);
    }
  }, [project, time, activeSel, p.peekSel, p.showSelections, tool, layer, layerBrush, maskTick, fmt, compare]);

  // fit the frame inside the canvas area (between the hint row and the action bar), keeping the format's aspect ratio
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const pad = 12;
      const aw = el.clientWidth - pad * 2;
      const ah = el.clientHeight - pad * 2;
      const k = Math.min(aw / fmt.width, ah / fmt.height);
      setBox({ w: Math.max(50, Math.floor(fmt.width * k)), h: Math.max(50, Math.floor(fmt.height * k)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fmt.width, fmt.height]);

  useEffect(() => {
    const bump = () => setFontTick((n) => n + 1);
    document.fonts.addEventListener('loadingdone', bump);
    return () => document.fonts.removeEventListener('loadingdone', bump);
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (!renderer.current) renderer.current = new Renderer(canvasRef.current);
    const id = requestAnimationFrame(() => {
      renderer.current!.render(compare ? { ...project, layers: [] } : project, time, scale);
    });
    return () => cancelAnimationFrame(id);
  }, [project, time, scale, compare, fontTick, maskTick, frameTick]);

  const rects: { key: string; label: string; color: string; value: Rect; mask?: boolean }[] = [];
  if (layer && !selecting) {
    for (const d of EFFECT_MAP[layer.type].params) {
      if (d.type === 'rect') rects.push({ key: d.key, label: d.label, color: d.color, value: layer.params[d.key] as Rect });
    }
    if (layer.mask && (layer.mask.shape === 'rect' || layer.mask.shape === 'ellipse')) {
      rects.push({ key: 'mask', label: layer.mask.invert ? '적용 범위 (밖)' : '적용 범위', color: '#ffffff', value: layer.mask.rect, mask: true });
    }
  }

  const toNorm = (e: { clientX: number; clientY: number }) => {
    const r = frameRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  const startDrag = (e: React.PointerEvent, key: string, start: Rect, mode: Mode) => {
    e.preventDefault();
    e.stopPropagation();
    const frame = frameRef.current!.getBoundingClientRect();
    const px = e.clientX;
    const py = e.clientY;
    const ratio = start.w / start.h;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - px) / frame.width;
      const dy = (ev.clientY - py) / frame.height;
      p.onRectChange(key, round(applyDrag(start, mode, dx, dy, ev.shiftKey ? ratio : null)));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const startPaint = (e: React.PointerEvent) => {
    e.preventDefault();
    const ms = maskSize(fmt);
    let ownerId: string;
    let url: string | undefined;
    if (selBrush) {
      if (activeSel) {
        ownerId = activeSel.id;
        url = activeSel.paint;
      } else {
        url = encode(blankMask(ms.w, ms.h));
        ownerId = p.onNewBlankSelection(url);
      }
    } else {
      ownerId = layer!.id;
      url = layer!.mask?.paint;
    }
    const mask = beginLive(ownerId, url, ms.w, ms.h);
    const radius = (brush.size / 100) * ms.w;
    const er = brush.erase !== e.altKey;
    let last = toNorm(e);
    strokeSegment(mask, last.x * ms.w, last.y * ms.h, last.x * ms.w, last.y * ms.h, radius, brush.softness, er);
    const pointer = e.pointerId;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointer) return;
      const q = toNorm(ev);
      strokeSegment(mask, last.x * ms.w, last.y * ms.h, q.x * ms.w, q.y * ms.h, radius, brush.softness, er);
      last = q;
    };
    const forSelection = selBrush;
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pointer) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (!liveCanvas(ownerId)) return;
      const out = commitLive(ownerId);
      if (!out) return;
      if (forSelection) p.onSelectionPaint(ownerId, out);
      else p.onLayerPaint(out);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  // dragging the photo pans it inside the frame (photo tool only, so other tools never move it by accident)
  const startPan = (e: React.PointerEvent) => {
    e.preventDefault();
    const frame = frameRef.current!.getBoundingClientRect();
    const px = e.clientX;
    const py = e.clientY;
    const c0 = project.crop;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - px) / frame.width;
      const dy = (ev.clientY - py) / frame.height;
      p.onCrop({ ...c0, x: clamp01(c0.x - dx * 1.6 * (c0.flip ? -1 : 1)), y: clamp01(c0.y - dy * 1.6) });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // drag out a box; on release it becomes (or edits) a selection
  const startMarquee = (e: React.PointerEvent) => {
    e.preventDefault();
    const a = toNorm(e);
    const mods = { add: e.shiftKey, subtract: e.altKey };
    const shape = selectMode === 'ellipse' ? 'ellipse' : 'rect';
    const pointer = e.pointerId;
    let r: Rect = { x: clamp01(a.x), y: clamp01(a.y), w: 0, h: 0 };
    setMarquee(r);
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointer) return;
      const b = toNorm(ev);
      const x0 = clamp01(Math.min(a.x, b.x));
      const y0 = clamp01(Math.min(a.y, b.y));
      r = { x: x0, y: y0, w: clamp01(Math.max(a.x, b.x)) - x0, h: clamp01(Math.max(a.y, b.y)) - y0 };
      setMarquee(r);
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pointer) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setMarquee(null);
      if (r.w > 0.01 && r.h > 0.01) p.onMarquee(round(r), shape, mods);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !hasPhoto || compare) return;
    if (marqueeMode) {
      if (!p.busy) startMarquee(e);
      return;
    }
    if (picking) {
      e.preventDefault();
      if (p.busy) return;
      const q = toNorm(e);
      p.onPick(clamp01(q.x), clamp01(q.y), { add: e.shiftKey, subtract: e.altKey });
      return;
    }
    if (brushing) return startPaint(e);
    if (tool === 'photo') startPan(e);
  };

  const frameClass = ['frame', brushing ? 'brushing' : '', picking || marqueeMode ? (alt ? 'picking sub' : 'picking') : '', tool === 'photo' && hasPhoto ? 'panning' : ''].join(' ');

  const hint = p.busy
    ? null
    : selecting
      ? selectMode === 'brush'
        ? alt
          ? '지우는 중 — Option을 떼면 칠하기'
          : '드래그해서 칠하기 · Option 누르고 드래그하면 지우기'
        : marqueeMode
          ? `드래그해서 ${selectMode === 'ellipse' ? '원' : '네모'}로 선택 · Shift+드래그 더하기 · Option+드래그 빼기`
          : selectMode === 'color'
          ? '클릭한 색과 비슷한 곳을 선택 · Shift 더하기 · Option 빼기'
          : alt
            ? '클릭한 물체를 지금 선택에서 빼요'
            : '물체를 클릭하세요 · Shift+클릭 더하기 · Option+클릭 빼기'
      : layerBrush
        ? '드래그해서 효과가 들어갈 곳을 칠하기 · Option 누르고 드래그하면 지우기'
        : null;

  return (
    <div className="stage">
      <div className="stage-top">
        {p.busy ? (
          <div className="stage-pill busy">
            <Loader size={14} className="spin" /> {p.busy}
          </div>
        ) : (
          hint && <div className="stage-pill">{hint}</div>
        )}
      </div>
      <div className="stage-canvas" ref={stageRef}>
      <div
        className={frameClass}
        ref={frameRef}
        style={{ width: box.w, height: box.h, visibility: box.w ? 'visible' : 'hidden' }}
        onPointerDown={onPointerDown}
        onPointerMove={(e) => brushing && setCursor(toNorm(e))}
        onPointerLeave={() => setCursor(null)}
      >
        <canvas ref={canvasRef} />
        <canvas ref={overlayRef} className="sel-overlay" />
        {brushing && cursor && (
          <div
            className={`brush-cursor ${erase ? 'erase' : ''}`}
            style={{ left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%`, width: `${brush.size * 2}%` }}
          />
        )}
        {marquee && (
          <div
            className={`marquee ${selectMode === 'ellipse' ? 'ellipse' : ''} ${alt ? 'sub' : ''}`}
            style={{ left: `${marquee.x * 100}%`, top: `${marquee.y * 100}%`, width: `${marquee.w * 100}%`, height: `${marquee.h * 100}%` }}
          />
        )}
        {!hasPhoto && (
          <div className="empty-frame">
            <button className="drop-box" onClick={p.onUpload}>
              <strong>사진·영상을 끌어놓거나, 클릭해서 올리기 ↑</strong>
              <span>PNG, JPG, WEBP · MP4, WEBM, MOV</span>
            </button>
            <div className="drop-box alt">
              <span>또는 이렇게 시작</span>
              <div className="text-links">
                <button onClick={p.onSamples}>샘플 사진 ↓</button>
                <button onClick={p.onAI}>AI로 만들기 ↗</button>
              </div>
            </div>
          </div>
        )}
        {!compare &&
          rects.map(({ key, label, color, value, mask }) => (
            <div
              key={key}
              className={`rect-handle ${mask ? 'mask' : ''}`}
              style={{
                left: `${value.x * 100}%`,
                top: `${value.y * 100}%`,
                width: `${value.w * 100}%`,
                height: `${value.h * 100}%`,
                ['--c' as string]: color,
                borderRadius: mask && layer?.mask?.shape === 'ellipse' ? '50%' : undefined,
              }}
              onPointerDown={(e) => startDrag(e, key, value, 'move')}
            >
              <span className="rect-label">{label}</span>
              {(['nw', 'ne', 'sw', 'se'] as Mode[]).map((m) => (
                <i key={m} className={`corner ${m}`} onPointerDown={(e) => startDrag(e, key, value, m)} />
              ))}
            </div>
          ))}
      </div>
      </div>

      <div className="stage-bar">
        <div className="bar-side">
          <button
            className={`ghost small ${compare ? 'active' : ''}`}
            onPointerDown={() => setCompare(true)}
            onPointerUp={() => setCompare(false)}
            onPointerLeave={() => setCompare(false)}
            disabled={!hasPhoto}
          >
            <Eye size={14} /> 원본 보기
          </button>
        </div>
      {selecting && activeSel && !p.busy ? (
        <div className="float-bar">
          <span className="float-name">
            <i className="dot" style={{ background: activeSel.color }} />
            {activeSel.name}
          </span>
          <button className="primary small" onClick={p.onSelAddEffect}>
            <Sparkles size={14} /> 효과 넣기
          </button>
          <button className="ghost small" onClick={p.onSelFlow} title="폭포·물·구름처럼 흐르게">
            <Waves size={14} /> 흐르게
          </button>
          <button className="ghost small" onClick={p.onSelCutout}>
            <Scissors size={14} /> 오려서 띄우기
          </button>
          {p.canTrack && (
            <button className="ghost small" onClick={p.onSelTrack} title="영상 앞뒤로 이 물체를 따라가며 마스크 만들기">
              <Crosshair size={14} /> {activeSel.track ? '다시 따라가기' : '따라가기'}
            </button>
          )}
          <button className="ghost small" onClick={p.onSelInvert} title="선택 반전">
            반전
          </button>
          <button className="icon-btn" onClick={p.onSelDelete} title="선택 삭제">
            <Trash size={15} />
          </button>
        </div>
      ) : (
        <div />
      )}
        <div className="bar-side right">
          <span className="muted tiny mono">
            {fmt.width}×{fmt.height}
          </span>
        </div>
      </div>
    </div>
  );
}
