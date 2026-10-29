import { Brush, Cloud, Download, MousePointerClick, Moon, Pipette, Plus, Scissors, Sparkles, Sun, Trash, User, Wand2, Waves } from 'lucide-react';
import type { SplitDetail } from '../engine/autoSplit';
import type { Layer, Selection } from '../engine/types';
import { PanelHeader, Seg, Slider, Toggle } from './kit';

export type SelectMode = 'click' | 'brush' | 'rect' | 'ellipse' | 'lasso' | 'color';
export type QuickSelect = 'sky' | 'person' | 'bright' | 'dark' | 'empty';

interface Props {
  selections: Selection[];
  layers: Layer[];
  activeId: string | null;
  mode: SelectMode;
  colorTol: number;
  showOverlay: boolean;
  busy: string;
  hasPhoto: boolean;
  onMode: (m: SelectMode) => void;
  onColorTol: (v: number) => void;
  onShowOverlay: (v: boolean) => void;
  onActivate: (id: string) => void;
  onQuick: (k: QuickSelect) => void;
  onAddEffect: (id: string) => void;
  onCutout: (id: string) => void;
  onFlow: (id: string) => void;
  onDelete: (id: string) => void;
  splitDetail: SplitDetail;
  splitLayers: boolean;
  onSplitDetail: (d: SplitDetail) => void;
  onSplitLayers: (v: boolean) => void;
  onAutoSplit: () => void;
  onExportPsd: () => void;
}

const HINT: Record<SelectMode, string> = {
  click: '사진에서 물체를 클릭하세요. Shift+클릭은 지금 선택에 더하기, Option(Alt)+클릭은 빼기예요.',
  brush: '드래그해서 지금 선택을 칠해요. Option(Alt)을 누르고 드래그하면 지워져요.',
  rect: '드래그해서 네모로 선택해요. Shift+드래그는 지금 선택에 더하기, Option(Alt)+드래그는 빼기예요.',
  ellipse: '드래그해서 원(타원)으로 선택해요. Shift+드래그는 더하기, Option(Alt)+드래그는 빼기예요.',
  lasso: '클릭할 때마다 점이 찍혀 모양이 그려져요. 첫 점을 다시 누르거나 더블클릭·Enter로 닫으면 선택돼요. 누른 채 드래그하면 자유롭게 그려져요. ⌫는 한 점 되돌리기, Esc는 취소. 첫 점을 Shift로 찍으면 더하기, Option(Alt)이면 빼기예요.',
  color: '사진에서 색을 클릭하면 비슷한 색이 모두 선택돼요. Shift+클릭은 더하기.',
};

/** Layers that use a selection, either as their target or as an effect input. */
export function usersOf(layers: Layer[], id: string) {
  return layers.filter((l) => (l.mask?.shape === 'selection' && l.mask.selectionId === id) || Object.values(l.params).includes(id));
}

export function SelectPanel(p: Props) {
  return (
    <div className="panel">
      <PanelHeader title="물체 선택" sub="사진에서 물체를 골라 이름을 붙여두면, 어떤 효과든 그 물체에만 넣을 수 있어요." />

      {!p.hasPhoto && <div className="notice">먼저 사진을 골라주세요.</div>}

      <div className="block">
        <div className="block-title">선택 방법</div>
        <Seg
          value={p.mode}
          onChange={p.onMode}
          options={[
            { value: 'click', label: <><MousePointerClick size={14} /> 클릭</> },
            { value: 'brush', label: <><Brush size={14} /> 브러시</> },
            { value: 'rect', label: '네모' },
            { value: 'ellipse', label: '원' },
            { value: 'lasso', label: '라쏘' },
            { value: 'color', label: <><Pipette size={14} /> 색</> },
          ]}
        />
        <p className="hint">{HINT[p.mode]}</p>
        {p.mode === 'color' && <Slider label="색 허용 범위" value={p.colorTol} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={p.onColorTol} />}
        {p.busy && <p className="hint warn-text">{p.busy}</p>}
      </div>

      <div className="block">
        <div className="block-title">자동 누끼</div>
        <p className="hint">버튼 한 번이면 사진 속 물체를 전부 찾아 윤곽대로 조각조각 누끼를 따요. 조각은 선택으로 저장되고, 켜두면 조각마다 레이어가 생겨 캔버스에서 끌어 옮길 수 있어요. 처음 한 번은 누끼 모델(약 80MB)을 받아요.</p>
        <Seg
          value={p.splitDetail}
          onChange={p.onSplitDetail}
          options={[
            { value: 'low', label: '크게' },
            { value: 'mid', label: '보통' },
            { value: 'high', label: '잘게' },
          ]}
        />
        <Toggle label="조각마다 레이어로도 나누기" checked={p.splitLayers} onChange={p.onSplitLayers} />
        <button className="primary wide" onClick={p.onAutoSplit} disabled={!p.hasPhoto || !!p.busy}>
          <Wand2 size={15} /> {p.selections.some((s) => s.group) ? '다시 자동 누끼 따기' : '자동 누끼 따기'}
        </button>
        {p.selections.some((s) => s.group) && <p className="hint">다시 따면 지난 자동 누끼 조각과 그 레이어가 새 결과로 바뀌어요. ⌘Z로 되돌릴 수 있어요.</p>}
        <button className="ghost wide" onClick={p.onExportPsd} disabled={!p.hasPhoto || !p.selections.length || !!p.busy}>
          <Download size={15} /> 레이어 PSD로 받기
        </button>
      </div>

      <div className="block">
        <div className="block-title">한 번에 선택</div>
        <div className="quick-grid">
          <button className="tile-btn" onClick={() => p.onQuick('sky')} disabled={!p.hasPhoto || !!p.busy}>
            <Cloud size={18} />
            하늘
          </button>
          <button className="tile-btn" onClick={() => p.onQuick('person')} disabled={!p.hasPhoto || !!p.busy}>
            <User size={18} />
            사람
          </button>
          <button className="tile-btn" onClick={() => p.onQuick('bright')} disabled={!p.hasPhoto || !!p.busy}>
            <Sun size={18} />
            밝은 곳
          </button>
          <button className="tile-btn" onClick={() => p.onQuick('dark')} disabled={!p.hasPhoto || !!p.busy}>
            <Moon size={18} />
            어두운 곳
          </button>
          <button className="tile-btn" onClick={() => p.onQuick('empty')} disabled={!p.hasPhoto}>
            <Plus size={18} />
            빈 선택
          </button>
        </div>
      </div>

      <div className="block grow">
        <div className="block-title">
          저장된 선택 <span className="count">{p.selections.length}</span>
        </div>
        {p.selections.length === 0 ? (
          <div className="empty-box">
            <MousePointerClick size={22} />
            <span>사진에서 물체를 클릭해 보세요.
              <br />
              선택이 여기에 쌓여요.</span>
          </div>
        ) : (
          <ul className="sel-list">
            {p.selections.map((s) => {
              const users = usersOf(p.layers, s.id).length;
              return (
                <li key={s.id} className={`sel-row ${s.id === p.activeId ? 'active' : ''}`} onClick={() => p.onActivate(s.id)}>
                  <i className="dot" style={{ background: s.color }} />
                  <span className="sel-name">{s.name}</span>
                  {users > 0 && <span className="badge-soft">효과 {users}</span>}
                  <span className="row-actions">
                    <button title="이 물체에 효과 넣기" onClick={(e) => (e.stopPropagation(), p.onAddEffect(s.id))}>
                      <Sparkles size={15} />
                    </button>
                    <button title="흐르게 하기" onClick={(e) => (e.stopPropagation(), p.onFlow(s.id))}>
                      <Waves size={15} />
                    </button>
                    <button title="오려서 띄우기" onClick={(e) => (e.stopPropagation(), p.onCutout(s.id))}>
                      <Scissors size={15} />
                    </button>
                    <button title="삭제" onClick={(e) => (e.stopPropagation(), p.onDelete(s.id))}>
                      <Trash size={15} />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <Toggle label="사진 위에 선택 영역 보이기" checked={p.showOverlay} onChange={p.onShowOverlay} />
        <p className="hint">“사람”은 인물이 크게 나온 사진에서 잘 돼요. 클릭 선택과 사람 선택은 처음에 모델을 받느라 몇 초 걸려요.</p>
      </div>
    </div>
  );
}
