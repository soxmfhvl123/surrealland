import { ArrowDown, ArrowUp, Copy, Dices, MousePointerClick, RotateCcw, Trash } from 'lucide-react';
import { EFFECT_MAP, selectionParam } from '../engine/effects';
import type { Layer, LayerMask, ParamDef, ParamValue, Project, Rect } from '../engine/types';
import { Section, Seg, Slider, Toggle } from './kit';
import { RectFields, TargetPanel } from './TargetPanel';

type TargetTools = Pick<Parameters<typeof TargetPanel>[0], 'brush' | 'setBrush' | 'onNewSelection' | 'onPaintOp' | 'onPeek'>;

interface Props {
  layer: Layer;
  project: Project;
  index: number;
  count: number;
  onChange: (key: string, value: ParamValue) => void;
  onLayer: (patch: Partial<Layer>, coalesce?: string) => void;
  onReset: () => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onShuffle: () => void;
  onRemove: () => void;
  target: TargetTools;
}

export const BLENDS: { value: GlobalCompositeOperation; label: string }[] = [
  { value: 'source-over', label: '보통' },
  { value: 'screen', label: '스크린 (밝게 더하기)' },
  { value: 'multiply', label: '곱하기 (어둡게)' },
  { value: 'overlay', label: '오버레이' },
  { value: 'soft-light', label: '소프트 라이트' },
  { value: 'lighten', label: '밝은 쪽' },
  { value: 'darken', label: '어두운 쪽' },
  { value: 'difference', label: '차이' },
  { value: 'exclusion', label: '제외' },
  { value: 'color-dodge', label: '닷지' },
  { value: 'hue', label: '색조만' },
  { value: 'color', label: '색만' },
  { value: 'luminosity', label: '밝기만' },
];

function Control({ def, value, project, onChange, onNewSelection }: { def: ParamDef; value: ParamValue; project: Project; onChange: (v: ParamValue) => void; onNewSelection: () => void }) {
  switch (def.type) {
    case 'range':
      return <Slider label={def.label} value={value as number} min={def.min} max={def.max} step={def.step} unit={def.unit} def={def.default} onChange={onChange} />;
    case 'rect':
      return (
        <div className="ctl">
          <div className="ctl-head">
            <label>
              <i className="swatch" style={{ background: def.color }} />
              {def.label}
            </label>
            <span className="muted tiny">캔버스에서 드래그</span>
          </div>
          <RectFields value={value as Rect} onChange={onChange} />
        </div>
      );
    case 'select':
      return def.options.length <= 3 ? (
        <div className="ctl">
          <div className="ctl-head">
            <label>{def.label}</label>
          </div>
          <Seg value={value as string} options={def.options} onChange={onChange} />
        </div>
      ) : (
        <div className="ctl">
          <div className="ctl-head">
            <label>{def.label}</label>
          </div>
          <select value={value as string} onChange={(e) => onChange(e.target.value)}>
            {def.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      );
    case 'selection':
      return (
        <div className="ctl">
          <div className="ctl-head">
            <label>{def.label}</label>
          </div>
          {project.selections.length === 0 ? (
            <button className="primary small wide" onClick={onNewSelection}>
              <MousePointerClick size={14} /> 사진에서 물체 고르기
            </button>
          ) : (
            <div className="sel-chips">
              {def.none !== undefined && (
                <button className={`sel-chip ${!value ? 'on' : ''}`} onClick={() => onChange('')}>
                  {def.none}
                </button>
              )}
              {project.selections.map((s) => (
                <button key={s.id} className={`sel-chip ${value === s.id ? 'on' : ''}`} onClick={() => onChange(s.id)}>
                  <i className="dot" style={{ background: s.color }} />
                  {s.name}
                </button>
              ))}
              <button className="sel-chip add" onClick={onNewSelection}>
                + 새로 선택
              </button>
            </div>
          )}
        </div>
      );
    case 'image':
      return (
        <div className="ctl">
          <div className="ctl-head">
            <label>{def.label}</label>
          </div>
          <div className="minithumbs">
            <button className={`mini text ${value === 'current' ? 'on' : ''}`} onClick={() => onChange('current')}>
              지금까지
              <br />
              결과
            </button>
            <button className={`mini text ${value === 'base' ? 'on' : ''}`} onClick={() => onChange('base')}>
              원본
              <br />
              사진
            </button>
            {project.images.map((img) => (
              <button key={img.id} className={`mini ${value === img.id ? 'on' : ''}`} onClick={() => onChange(img.id)} title={img.name}>
                <img src={img.url} alt={img.name} />
              </button>
            ))}
          </div>
        </div>
      );
    case 'bool':
      return <Toggle label={def.label} checked={value as boolean} onChange={onChange} />;
    case 'text':
      return (
        <div className="ctl">
          <div className="ctl-head">
            <label>{def.label}</label>
          </div>
          {def.multiline ? (
            <textarea rows={4} value={value as string} onChange={(e) => onChange(e.target.value)} />
          ) : (
            <input className="text-input" type="text" value={value as string} onChange={(e) => onChange(e.target.value)} />
          )}
        </div>
      );
    case 'color':
      return (
        <div className="ctl color-row">
          <label>{def.label}</label>
          <span className="color-pick">
            <input type="color" value={value as string} onChange={(e) => onChange(e.target.value)} />
            <code>{(value as string).toUpperCase()}</code>
          </span>
        </div>
      );
  }
}

const DEFAULT_MASK: LayerMask = { shape: 'full', rect: { x: 0.2, y: 0.2, w: 0.6, h: 0.6 }, feather: 0.3, invert: false };

export function Inspector({ layer, project, index, count, onChange, onLayer, onReset, onMove, onDuplicate, onShuffle, onRemove, target }: Props) {
  const def = EFFECT_MAP[layer.type];
  const groups = new Map<string, ParamDef[]>();
  for (const d of def.params) {
    const g = d.group ?? '설정';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(d);
  }
  const mask = layer.mask ?? DEFAULT_MASK;
  const setMask = (patch: Partial<LayerMask>, key = 'mask') => onLayer({ mask: { ...mask, ...patch } }, `${layer.id}:${key}`);
  const dur = project.duration;
  const tin = layer.tin ?? 0;
  const tout = layer.tout ?? 1;
  const hasOwnTarget = !!selectionParam(layer.type);

  return (
    <div className="inspector">
      <div className="insp-top">
        <div className="insp-title">
          <input
            className="name-input"
            value={layer.name ?? ''}
            placeholder={def.label}
            onChange={(e) => onLayer({ name: e.target.value || undefined }, `${layer.id}:name`)}
            aria-label="레이어 이름"
          />
          <div className="insp-en">{def.english}</div>
        </div>
      </div>
      <div className="icon-row">
        <button className="icon-btn" onClick={() => onMove(-1)} disabled={index <= 0} title="위로 (먼저 적용)">
          <ArrowUp size={15} />
        </button>
        <button className="icon-btn" onClick={() => onMove(1)} disabled={index >= count - 1} title="아래로 (나중에 적용)">
          <ArrowDown size={15} />
        </button>
        <button className="icon-btn" onClick={onDuplicate} title="복제 (⌘D)">
          <Copy size={15} />
        </button>
        <button className="icon-btn" onClick={onShuffle} title="무작위 배치만 새로 섞기">
          <Dices size={15} />
        </button>
        <button className="icon-btn" onClick={onReset} title="기본값으로">
          <RotateCcw size={15} />
        </button>
        <span className="spacer" />
        <button className="icon-btn danger" onClick={onRemove} title="삭제 (Delete)">
          <Trash size={15} />
        </button>
      </div>
      <p className="insp-desc">{def.description}</p>

      {!hasOwnTarget && (
        <Section title="적용 대상">
          <TargetPanel key={layer.id} mask={mask} setMask={setMask} selections={project.selections} {...target} />
        </Section>
      )}

      {[...groups.entries()].map(([g, defs], i) => (
        <Section key={`${layer.id}:${g}`} title={g} open={i < 2}>
          {defs.map((d) => (
            <Control key={d.key} def={d} value={layer.params[d.key]} project={project} onChange={(v) => onChange(d.key, v)} onNewSelection={target.onNewSelection} />
          ))}
        </Section>
      ))}

      <Section key={`${layer.id}:mix`} title="합성" open={false}>
        <Slider label="진하기" value={Math.round((layer.opacity ?? 1) * 100)} min={0} max={100} step={1} unit="%" def={100} onChange={(v) => onLayer({ opacity: v / 100 }, `${layer.id}:opacity`)} />
        <div className="ctl">
          <div className="ctl-head">
            <label>섞는 방식</label>
          </div>
          <select value={layer.blend ?? def.defaultBlend ?? 'source-over'} onChange={(e) => onLayer({ blend: e.target.value as GlobalCompositeOperation })}>
            {BLENDS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </div>
      </Section>

      <Section key={`${layer.id}:time`} title="등장 시간" open={false}>
        <Slider label="등장" value={tin} min={0} max={1} step={0.005} format={(v) => `${(v * dur).toFixed(1)}s`} onChange={(v) => onLayer({ tin: Math.min(v, tout - 0.02) }, `${layer.id}:tin`)} />
        <Slider label="퇴장" value={tout} min={0} max={1} step={0.005} format={(v) => `${(v * dur).toFixed(1)}s`} onChange={(v) => onLayer({ tout: Math.max(v, tin + 0.02) }, `${layer.id}:tout`)} />
        <Slider label="서서히 (페이드)" value={layer.fade ?? 0} min={0} max={0.3} step={0.005} format={(v) => `${(v * dur).toFixed(1)}s`} onChange={(v) => onLayer({ fade: v }, `${layer.id}:fade`)} />
        <p className="hint">아래 타임라인의 막대를 끌어도 바뀌어요.</p>
      </Section>
    </div>
  );
}
