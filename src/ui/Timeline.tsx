import { useRef } from 'react';
import { ChevronDown, Pause, Play } from 'lucide-react';
import type { Layer } from '../engine/types';
import { layerName } from './EffectsPanel';

interface Props {
  time: number;
  duration: number;
  fps: number;
  playing: boolean;
  quality: number;
  layers: Layer[];
  selectedId: string | null;
  onPlay: () => void;
  onSeek: (t: number) => void;
  onDuration: (d: number) => void;
  onFps: (f: number) => void;
  onQuality: (q: number) => void;
  onSelect: (id: string) => void;
  onTiming: (id: string, tin: number, tout: number) => void;
  open: boolean;
  onToggleOpen: () => void;
}

const fmtTime = (t: number) => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
};

type DragMode = 'move' | 'start' | 'end';

export function Timeline(props: Props) {
  const { time, duration, fps, playing, quality, layers, selectedId } = props;
  const tracks = useRef<HTMLDivElement>(null);

  const startDrag = (e: React.PointerEvent, layer: Layer, mode: DragMode) => {
    e.preventDefault();
    e.stopPropagation();
    props.onSelect(layer.id);
    const track = (e.currentTarget as HTMLElement).closest('.tl-track') as HTMLElement;
    const width = track.getBoundingClientRect().width;
    const x0 = e.clientX;
    const tin0 = layer.tin ?? 0;
    const tout0 = layer.tout ?? 1;
    const MIN = 0.02;
    const move = (ev: PointerEvent) => {
      const d = (ev.clientX - x0) / width;
      let tin = tin0;
      let tout = tout0;
      if (mode === 'move') {
        const len = tout0 - tin0;
        tin = Math.min(1 - len, Math.max(0, tin0 + d));
        tout = tin + len;
      } else if (mode === 'start') tin = Math.min(tout0 - MIN, Math.max(0, tin0 + d));
      else tout = Math.max(tin0 + MIN, Math.min(1, tout0 + d));
      const snap = (v: number) => Math.round(v * duration * 10) / (duration * 10);
      props.onTiming(layer.id, snap(tin), snap(tout));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const playhead = `${(Math.min(time, duration) / duration) * 100}%`;

  return (
    <div className="timeline-wrap">
      <div className="timeline">
        <button className="play" onClick={props.onPlay} aria-label={playing ? '정지' : '재생'}>
          {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
        </button>
        <span className="mono time">{fmtTime(time)}</span>
        <input
          className="scrub"
          type="range"
          min={0}
          max={duration}
          step={1 / fps}
          value={Math.min(time, duration)}
          onChange={(e) => props.onSeek(parseFloat(e.target.value))}
          style={{ ['--fill' as string]: playhead }}
        />
        <span className="mono time dim">{fmtTime(duration)}</span>
        <label className="tl-select">
          길이
          <select value={duration} onChange={(e) => props.onDuration(+e.target.value)}>
            {[...new Set([3, 4, 5, 6, 8, 10, 12, 15, 20, 30, duration])].sort((a, b) => a - b).map((d) => (
              <option key={d} value={d}>
                {Number.isInteger(d) ? d : d.toFixed(1)}초
              </option>
            ))}
          </select>
        </label>
        <label className="tl-select">
          FPS
          <select value={fps} onChange={(e) => props.onFps(+e.target.value)}>
            {[24, 25, 30, 60].map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label className="tl-select">
          미리보기
          <select value={quality} onChange={(e) => props.onQuality(+e.target.value)}>
            <option value={0.33}>빠르게</option>
            <option value={0.5}>보통</option>
            <option value={0.75}>선명</option>
            <option value={1}>원본 해상도</option>
          </select>
        </label>
        <button className={`ghost small tl-toggle ${props.open ? 'active' : ''}`} onClick={props.onToggleOpen} disabled={!layers.length} title="레이어별 등장 시간">
          시간 막대 <ChevronDown size={13} className={props.open ? 'flip' : ''} />
        </button>
      </div>
      {props.open && layers.length > 0 && (
        <div className="tl-tracks" ref={tracks}>
          {layers.map((l) => {
            const tin = l.tin ?? 0;
            const tout = l.tout ?? 1;
            return (
              <div
                key={l.id}
                className={`tl-row ${l.id === selectedId ? 'sel' : ''} ${l.enabled ? '' : 'off'}`}
                onClick={() => props.onSelect(l.id)}
              >
                <span className="tl-name" title={layerName(l)}>
                  {layerName(l)}
                </span>
                <div
                  className="tl-track"
                  onPointerDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    const r = e.currentTarget.getBoundingClientRect();
                    props.onSeek(((e.clientX - r.left) / r.width) * duration);
                  }}
                >
                  <div
                    className="tl-bar"
                    style={{ left: `${tin * 100}%`, width: `${(tout - tin) * 100}%` }}
                    onPointerDown={(e) => startDrag(e, l, 'move')}
                    title={`${(tin * duration).toFixed(1)}s – ${(tout * duration).toFixed(1)}s`}
                  >
                    <i className="tl-handle l" onPointerDown={(e) => startDrag(e, l, 'start')} />
                    <i className="tl-handle r" onPointerDown={(e) => startDrag(e, l, 'end')} />
                  </div>
                  <div className="tl-playhead" style={{ left: playhead }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
