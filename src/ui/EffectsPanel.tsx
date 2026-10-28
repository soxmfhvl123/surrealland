import { useState } from 'react';
import { Copy, Dices, Eye, EyeOff, GripVertical, Layers, Plus, Trash, X } from 'lucide-react';
import { CATEGORY_LABELS, EFFECT_MAP, selectionParam } from '../engine/effects';
import type { Layer, Selection } from '../engine/types';
import { PanelHeader } from './kit';

interface Props {
  layers: Layer[];
  selections: Selection[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
  onMove: (from: number, to: number) => void;
  onRandom: () => void;
  onClear: () => void;
  onPresets: () => void;
}

export const layerName = (l: Layer) => l.name || EFFECT_MAP[l.type]?.label || l.type;

/** Short label for where a layer applies. */
export function targetOf(l: Layer, selections: Selection[]): { label: string; color?: string } {
  const own = selectionParam(l.type);
  if (own) {
    const s = selections.find((x) => x.id === l.params[own]);
    if (s) return { label: s.name, color: s.color };
    return { label: l.type === 'cutout' ? '선택 없음' : '전체' };
  }
  const m = l.mask;
  if (!m || m.shape === 'full') return { label: '전체' };
  const inv = m.invert ? ' 밖' : '';
  if (m.shape === 'selection') {
    const s = selections.find((x) => x.id === m.selectionId);
    return s ? { label: s.name + inv, color: s.color } : { label: '선택 없음' };
  }
  if (m.shape === 'paint') return { label: '칠한 곳' + inv };
  if (m.shape === 'gradient') return { label: '그라디언트' };
  return { label: (m.shape === 'ellipse' ? '원' : '네모') + inv };
}

export function EffectsPanel(p: Props) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const { layers } = p;

  return (
    <div className="panel">
      <PanelHeader
        title="효과"
        sub="위에서부터 차례로 쌓여요. 끌어서 순서를 바꾸세요."
        actions={
          <button className="icon-btn" onClick={p.onRandom} title="랜덤 조합 (⌘Z로 되돌리기)">
            <Dices size={17} />
          </button>
        }
      />
      <button className="primary wide big" onClick={p.onAdd}>
        <Plus size={17} /> 효과 추가
      </button>

      {layers.length === 0 ? (
        <div className="empty-box">
          <Layers size={22} />
          <span>아직 효과가 없어요.</span>
          <div className="btn-row center">
            <button className="ghost small" onClick={p.onAdd}>
              효과 고르기
            </button>
            <button className="ghost small" onClick={p.onPresets}>
              프리셋으로 시작
            </button>
          </div>
        </div>
      ) : (
        <>
          <ol className="layers">
            {layers.map((l, i) => {
              const def = EFFECT_MAP[l.type];
              const tg = targetOf(l, p.selections);
              const timed = (l.tin ?? 0) > 0 || (l.tout ?? 1) < 1;
              return (
                <li
                  key={l.id}
                  className={[
                    'layer',
                    l.id === p.selectedId ? 'selected' : '',
                    !l.enabled ? 'off' : '',
                    dragOver === i && dragFrom !== null && dragFrom !== i ? (dragFrom < i ? 'drop-below' : 'drop-above') : '',
                  ].join(' ')}
                  draggable
                  onDragStart={(e) => {
                    setDragFrom(i);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(i);
                  }}
                  onDragEnd={() => {
                    setDragFrom(null);
                    setDragOver(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragFrom !== null && dragFrom !== i) p.onMove(dragFrom, i);
                    setDragFrom(null);
                    setDragOver(null);
                  }}
                  onClick={() => p.onSelect(l.id)}
                >
                  <GripVertical size={14} className="grip" />
                  <button
                    className="eye"
                    title={l.enabled ? '끄기' : '켜기'}
                    onClick={(e) => {
                      e.stopPropagation();
                      p.onToggle(l.id);
                    }}
                  >
                    {l.enabled ? <Eye size={15} /> : <EyeOff size={15} />}
                  </button>
                  <span className="layer-main">
                    <span className="layer-name">{layerName(l)}</span>
                    <span className="layer-sub">
                      <span className={`target-chip ${tg.color ? 'sel' : ''}`}>
                        {tg.color && <i className="dot" style={{ background: tg.color }} />}
                        {tg.label}
                      </span>
                      <em>{CATEGORY_LABELS[def?.category ?? 'finish']}</em>
                      {timed && <em>⏱</em>}
                    </span>
                  </span>
                  <span className="layer-actions">
                    <button
                      title="복제 (⌘D)"
                      onClick={(e) => {
                        e.stopPropagation();
                        p.onDuplicate(l.id);
                      }}
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      title="삭제 (Delete)"
                      onClick={(e) => {
                        e.stopPropagation();
                        p.onRemove(l.id);
                      }}
                    >
                      <X size={15} />
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>
          <button className="ghost small danger-text" onClick={p.onClear}>
            <Trash size={13} /> 효과 모두 지우기
          </button>
        </>
      )}
    </div>
  );
}
