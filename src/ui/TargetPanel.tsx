import { useState } from 'react';
import { Brush, Circle, Eraser, Maximize, MousePointerClick, Plus, Square, SunDim } from 'lucide-react';
import type { LayerMask, MaskGradient, Rect, Selection } from '../engine/types';
import { Seg, Slider, Toggle } from './kit';

export interface BrushState {
  /** radius as % of frame width */
  size: number;
  softness: number;
  erase: boolean;
}

type Tab = 'full' | 'selection' | 'shape' | 'paint';

interface Props {
  mask: LayerMask;
  setMask: (patch: Partial<LayerMask>, key?: string) => void;
  selections: Selection[];
  brush: BrushState;
  setBrush: (b: BrushState) => void;
  /** go to the selection tool to make a new selection */
  onNewSelection: () => void;
  /** fill / clear / invert the layer's painted mask */
  onPaintOp: (op: 'fill' | 'clear' | 'invert') => void;
  /** highlight a selection on the canvas while hovering its chip */
  onPeek: (id: string | null) => void;
}

const tabOf = (shape: LayerMask['shape']): Tab =>
  shape === 'full' ? 'full' : shape === 'selection' ? 'selection' : shape === 'paint' ? 'paint' : 'shape';

const SIDES: { value: MaskGradient['side']; label: string }[] = [
  { value: 'top', label: '위' },
  { value: 'bottom', label: '아래' },
  { value: 'left', label: '왼쪽' },
  { value: 'right', label: '오른쪽' },
  { value: 'center', label: '가운데' },
  { value: 'edges', label: '가장자리' },
];

const pct = (v: number) => Math.round(v * 1000) / 10;

export function RectFields({ value, onChange }: { value: Rect; onChange: (v: Rect) => void }) {
  return (
    <div className="rect-fields">
      {(['x', 'y', 'w', 'h'] as const).map((k) => (
        <label key={k} className="rect-field">
          <span>{k.toUpperCase()}</span>
          <input
            type="number"
            step={0.5}
            value={pct(value[k])}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!Number.isNaN(v)) onChange({ ...value, [k]: v / 100 });
            }}
          />
        </label>
      ))}
    </div>
  );
}

/** Where a layer applies: everywhere, a saved selection, a simple shape, or a hand-painted mask. */
export function TargetPanel({ mask, setMask, selections, brush, setBrush, onNewSelection, onPaintOp, onPeek }: Props) {
  // "selection" can be opened before any selection is chosen; the mask only changes on a pick
  const [wanted, setWanted] = useState<Tab | null>(null);
  const tab = wanted ?? tabOf(mask.shape);
  const grad: MaskGradient = mask.gradient ?? { side: 'top', from: 0.35, to: 0.65 };
  const setGrad = (g: Partial<MaskGradient>) => setMask({ gradient: { ...grad, ...g } }, 'gradient');

  const pickTab = (t: Tab) => {
    setWanted(null);
    if (t === 'full') return setMask({ shape: 'full' }, 'shape');
    if (t === 'paint') return setMask({ shape: 'paint', feather: Math.min(mask.feather, 0.1) }, 'shape');
    if (t === 'shape') return setMask({ shape: mask.shape === 'ellipse' || mask.shape === 'gradient' ? mask.shape : 'rect' }, 'shape');
    const id = selections.some((s) => s.id === mask.selectionId) ? mask.selectionId : selections.length === 1 ? selections[0].id : undefined;
    if (id) setMask({ shape: 'selection', selectionId: id, feather: Math.min(mask.feather, 0.06) }, 'shape');
    else setWanted('selection');
  };

  return (
    <div className="target">
      <div className="target-tabs" role="group">
        {(
          [
            ['full', '화면 전체', <Maximize key="i" size={15} />],
            ['selection', '선택한 물체', <MousePointerClick key="i" size={15} />],
            ['shape', '모양', <Square key="i" size={15} />],
            ['paint', '직접 칠하기', <Brush key="i" size={15} />],
          ] as [Tab, string, React.ReactNode][]
        ).map(([t, label, icon]) => (
          <button key={t} aria-pressed={tab === t} onClick={() => pickTab(t)}>
            {icon}
            <span>{label}</span>
          </button>
        ))}
      </div>

      {tab === 'selection' && (
        <div className="target-body">
          {selections.length === 0 ? (
            <div className="empty-box small">
              <span>아직 선택한 물체가 없어요.</span>
              <button className="primary small" onClick={onNewSelection}>
                <MousePointerClick size={14} /> 사진에서 물체 고르기
              </button>
            </div>
          ) : (
            <>
              <div className="sel-chips">
                {selections.map((s) => (
                  <button
                    key={s.id}
                    className={`sel-chip ${mask.shape === 'selection' && mask.selectionId === s.id ? 'on' : ''}`}
                    onClick={() => {
                      setWanted(null);
                      setMask({ shape: 'selection', selectionId: s.id, feather: Math.min(mask.feather, 0.06) }, 'shape');
                    }}
                    onMouseEnter={() => onPeek(s.id)}
                    onMouseLeave={() => onPeek(null)}
                  >
                    <i className="dot" style={{ background: s.color }} />
                    {s.name}
                  </button>
                ))}
                <button className="sel-chip add" onClick={onNewSelection}>
                  <Plus size={13} /> 새로 선택
                </button>
              </div>
              {wanted === 'selection' && <p className="hint">어느 물체에 넣을지 골라주세요.</p>}
            </>
          )}
        </div>
      )}

      {tab === 'shape' && (
        <div className="target-body">
          <Seg
            small
            value={mask.shape === 'ellipse' ? 'ellipse' : mask.shape === 'gradient' ? 'gradient' : 'rect'}
            onChange={(shape) => setMask({ shape }, 'shape')}
            options={[
              { value: 'rect', label: <><Square size={13} /> 네모</> },
              { value: 'ellipse', label: <><Circle size={13} /> 원</> },
              { value: 'gradient', label: <><SunDim size={13} /> 그라디언트</> },
            ]}
          />
          {mask.shape === 'gradient' ? (
            <>
              <Seg small value={grad.side} onChange={(side) => setGrad({ side })} options={SIDES} />
              <Slider label="흐려지기 시작" value={grad.from} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(from) => setGrad({ from: Math.min(from, grad.to - 0.02) })} />
              <Slider label="완전히 사라짐" value={grad.to} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(to) => setGrad({ to: Math.max(to, grad.from + 0.02) })} />
            </>
          ) : (
            <>
              <p className="hint">캔버스의 흰 점선 상자를 끌어서 옮기고, 모서리로 크기를 바꿔요.</p>
              <RectFields value={mask.rect} onChange={(rect) => setMask({ rect })} />
              <div className="btn-row">
                <button className="ghost small" onClick={() => setMask({ rect: { ...mask.rect, x: (1 - mask.rect.w) / 2, y: (1 - mask.rect.h) / 2 } })}>
                  가운데로
                </button>
                <button className="ghost small" onClick={() => setMask({ rect: { x: 0, y: 0, w: 1, h: 1 } })}>
                  화면 가득
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'paint' && (
        <div className="target-body">
          <p className="hint">캔버스를 드래그해서 효과가 들어갈 곳을 칠해요. 빨갛게 보이는 곳에 적용돼요.</p>
          <Seg
            small
            value={brush.erase ? 'erase' : 'paint'}
            onChange={(v) => setBrush({ ...brush, erase: v === 'erase' })}
            options={[
              { value: 'paint', label: <><Brush size={13} /> 칠하기</> },
              { value: 'erase', label: <><Eraser size={13} /> 지우기</> },
            ]}
          />
          <Slider label="브러시 크기" value={brush.size} min={1} max={30} step={0.5} format={(v) => `${v}%`} onChange={(size) => setBrush({ ...brush, size })} />
          <Slider label="부드럽기" value={brush.softness} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(softness) => setBrush({ ...brush, softness })} />
          <div className="btn-row">
            <button className="ghost small" onClick={() => onPaintOp('fill')}>전체 칠하기</button>
            <button className="ghost small" onClick={() => onPaintOp('clear')}>전체 지우기</button>
            <button className="ghost small" onClick={() => onPaintOp('invert')}>반전</button>
          </div>
        </div>
      )}

      {mask.shape !== 'full' && tab !== 'full' && (
        <div className="target-body">
          <Slider label="가장자리 흐림" value={Math.round(mask.feather * 100)} min={0} max={100} step={1} format={(v) => `${v}`} onChange={(v) => setMask({ feather: v / 100 }, 'feather')} />
          <Toggle label="반대로 (선택 밖에만 적용)" checked={mask.invert} onChange={(invert) => setMask({ invert }, 'invert')} />
        </div>
      )}
    </div>
  );
}
