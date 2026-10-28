import { useState } from 'react';
import { Brush, Crosshair, Eraser, Scissors, Sparkles, Trash, Waves } from 'lucide-react';
import { EFFECT_MAP } from '../engine/effects';
import { SELECTION_COLORS } from '../engine/masks';
import type { Layer, Selection } from '../engine/types';
import { Section, Seg, Slider } from './kit';
import { usersOf } from './SelectPanel';
import type { BrushState } from './TargetPanel';

export interface TrackUI {
  /** the base is a video, so tracking is possible */
  available: boolean;
  /** tracked masks are loaded for this selection */
  hasData: boolean;
  progress: { done: number; total: number } | null;
  onStart: (mode: 'object' | 'person', fps: number) => void;
  onCancel: () => void;
  onClear: () => void;
}

export type RefineOp = 'grow' | 'shrink' | 'soften' | 'invert' | 'clear' | 'fill' | 'steps';

interface Props {
  sel: Selection;
  layers: Layer[];
  brush: BrushState;
  setBrush: (b: BrushState) => void;
  onRename: (name: string) => void;
  onColor: (c: string) => void;
  onRefine: (op: RefineOp) => void;
  onAddEffect: () => void;
  onCutout: () => void;
  onFlow: () => void;
  onDelete: () => void;
  onOpenLayer: (id: string) => void;
  track: TrackUI;
}

export function SelectionInspector({ sel, layers, brush, setBrush, onRename, onColor, onRefine, onAddEffect, onCutout, onFlow, onDelete, onOpenLayer, track }: Props) {
  const users = usersOf(layers, sel.id);
  const [mode, setMode] = useState<'object' | 'person'>(sel.track?.mode ?? 'object');
  const [fps, setFps] = useState(String(sel.track?.fps ?? 12));
  return (
    <div className="inspector">
      <div className="insp-top">
        <i className="dot big" style={{ background: sel.color }} />
        <input className="name-input" value={sel.name} onChange={(e) => onRename(e.target.value)} aria-label="선택 이름" />
      </div>
      <div className="cta-col">
        <button className="primary wide" onClick={onAddEffect}>
          <Sparkles size={16} /> 이 물체에 효과 넣기
        </button>
        <button className="ghost wide" onClick={onFlow}>
          <Waves size={16} /> 흐르게 하기 (폭포·물·구름)
        </button>
        <button className="ghost wide" onClick={onCutout}>
          <Scissors size={16} /> 오려서 띄우기·복제
        </button>
      </div>

      {track.available && (
        <Section title="영상에서 따라가기 (로토스코프)">
          <p className="hint">지금 화면에 보이는 프레임의 선택을 기준으로, 영상 앞뒤로 이 물체를 따라가며 프레임마다 마스크를 만들어요. 기준 프레임에서 선택을 먼저 잘 다듬어 두세요.</p>
          <Seg
            value={mode}
            onChange={setMode}
            options={[
              { value: 'object', label: '물체' },
              { value: 'person', label: '사람' },
            ]}
          />
          <Seg
            small
            value={fps}
            onChange={setFps}
            options={[
              { value: '8', label: '빠르게 (초당 8)' },
              { value: '12', label: '보통 (12)' },
              { value: '24', label: '정밀 (24)' },
            ]}
          />
          {track.progress ? (
            <div className="track-progress">
              <div className="progress">
                <div style={{ width: `${(track.progress.done / track.progress.total) * 100}%` }} />
              </div>
              <div className="row-between">
                <span className="muted small">
                  따라가는 중… {track.progress.done}/{track.progress.total}
                </span>
                <button className="ghost small" onClick={track.onCancel}>
                  취소
                </button>
              </div>
            </div>
          ) : (
            <button className="primary wide" onClick={() => track.onStart(mode, Number(fps))}>
              <Crosshair size={15} /> {sel.track ? '다시 따라가기' : '따라가기 시작'}
            </button>
          )}
          {sel.track && track.hasData && !track.progress && (
            <div className="row-between">
              <span className="muted small">✓ 추적됨 · {sel.track.frames}프레임 · 초당 {sel.track.fps}</span>
              <button className="ghost small" onClick={track.onClear}>
                추적 지우기
              </button>
            </div>
          )}
          {sel.track && !track.hasData && !track.progress && <p className="hint warn-text">추적한 마스크가 없어요 (새로고침하면 사라져요). 다시 따라가기를 누르거나, 프로젝트 파일로 저장해 두세요.</p>}
          {sel.track && <p className="hint">브러시·다듬기는 기준 프레임의 선택만 바꿔요. 고친 뒤 다시 따라가기를 누르세요.</p>}
        </Section>
      )}

      <Section title="다듬기">
        <div className="btn-grid">
          <button className="ghost small" onClick={() => onRefine('grow')}>넓히기</button>
          <button className="ghost small" onClick={() => onRefine('shrink')}>좁히기</button>
          <button className="ghost small" onClick={() => onRefine('soften')}>가장자리 부드럽게</button>
          <button className="ghost small" onClick={() => onRefine('invert')}>반전</button>
          <button className="ghost small" onClick={() => onRefine('steps')} title="경계를 픽셀 블록처럼 계단 모양으로">계단 경계</button>
          <button className="ghost small" onClick={() => onRefine('fill')}>전체 채우기</button>
          <button className="ghost small" onClick={() => onRefine('clear')}>전체 비우기</button>
        </div>
      </Section>

      <Section title="브러시로 고치기">
        <p className="hint">왼쪽에서 “브러시”를 고른 뒤 캔버스를 드래그하세요. Option(Alt)을 누르면 지우개가 돼요.</p>
        <Seg
          value={brush.erase ? 'erase' : 'paint'}
          onChange={(v) => setBrush({ ...brush, erase: v === 'erase' })}
          options={[
            { value: 'paint', label: <><Brush size={14} /> 칠하기</> },
            { value: 'erase', label: <><Eraser size={14} /> 지우기</> },
          ]}
        />
        <Slider label="크기" value={brush.size} min={1} max={30} step={0.5} format={(v) => `${v}%`} onChange={(size) => setBrush({ ...brush, size })} />
        <Slider label="부드럽기" value={brush.softness} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(softness) => setBrush({ ...brush, softness })} />
      </Section>

      <Section title="표시 색" open={false}>
        <div className="swatches">
          {SELECTION_COLORS.map((c) => (
            <button key={c} className={`swatch-btn ${c === sel.color ? 'on' : ''}`} style={{ background: c }} onClick={() => onColor(c)} aria-label={c} />
          ))}
        </div>
      </Section>

      <Section title={`이 선택을 쓰는 레이어 (${users.length})`} open={users.length > 0}>
        {users.length === 0 ? (
          <p className="hint">아직 없어요. “이 물체에 효과 넣기”를 눌러보세요.</p>
        ) : (
          <ul className="mini-list">
            {users.map((l) => (
              <li key={l.id}>
                <button className="link" onClick={() => onOpenLayer(l.id)}>
                  {l.name || EFFECT_MAP[l.type]?.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <button className="ghost danger wide" onClick={onDelete}>
        <Trash size={15} /> 이 선택 삭제
      </button>
    </div>
  );
}
