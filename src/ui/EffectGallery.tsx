import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { CATEGORY_LABELS, CATEGORY_ORDER, EFFECTS, makeLayer, selectionParam } from '../engine/effects';
import { ensureMasks } from '../engine/masks';
import { Renderer } from '../engine/renderer';
import type { EffectCategory, EffectDef, Layer, Project, Selection } from '../engine/types';

interface Props {
  project: Project;
  /** when set, the effect goes only on this selection (previews show that too) */
  target: Selection | null;
  onPick: (type: string) => void;
  onClose: () => void;
}

/** A single layer of `type` aimed at `target`, used for previews and for the real insert. */
export function layerFor(type: string, target: Selection | null, fallbackSel?: Selection): Layer {
  const own = selectionParam(type);
  // cutout needs an object; flow without one moves the whole frame
  if (own) return makeLayer(type, { [own]: (target ?? (type === 'cutout' ? fallbackSel : undefined))?.id ?? '' });
  if (!target) return makeLayer(type);
  return makeLayer(type, {}, { mask: { shape: 'selection', selectionId: target.id, rect: { x: 0.2, y: 0.2, w: 0.6, h: 0.6 }, feather: 0.03, invert: false } });
}

type Cat = EffectCategory | 'all';

/** Full-screen effect picker; each card is rendered on the user's photo. */
export function EffectGallery({ project, target, onPick, onClose }: Props) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<Cat>('all');
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const input = useRef<HTMLInputElement>(null);
  const hasPhoto = !!project.baseImageId;

  useEffect(() => {
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // previews: the bare photo plus just this effect, at thumbnail size, one per tick
  useEffect(() => {
    if (!hasPhoto) return;
    let cancelled = false;
    const run = async () => {
      await ensureMasks([], project.selections);
      const r = new Renderer();
      const base: Project = { ...project, layers: [] };
      const done = new Set<string>();
      setThumbs({});
      while (!cancelled) {
        // render for ~30ms per tick (whatever is on screen first), then yield to the UI
        const batch: Record<string, string> = {};
        const t0 = performance.now();
        while (performance.now() - t0 < 30) {
          const type = prio.current.find((t) => !done.has(t)) ?? EFFECTS.find((e) => !done.has(e.type))?.type;
          if (!type) break;
          done.add(type);
          const layer = layerFor(type, target, project.selections[0]);
          batch[type] = r.render({ ...base, layers: [layer] }, project.duration * 0.55, 0.2).toDataURL('image/jpeg', 0.7);
        }
        if (cancelled || !Object.keys(batch).length) return;
        setThumbs((t) => ({ ...t, ...batch }));
        await new Promise((res) => setTimeout(res, 0));
      }
    };
    const id = setTimeout(run, 60);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
    // previews depend only on the photo, framing and target
  }, [project.baseImageId, project.crop, project.format, target?.id, target?.paint]);

  const needle = q.trim().toLowerCase();
  const list = useMemo(
    () =>
      EFFECTS.filter(
        (e) => (cat === 'all' || e.category === cat) && (!needle || `${e.label} ${e.english} ${e.description}`.toLowerCase().includes(needle)),
      ),
    [cat, needle],
  );
  const prio = useRef<string[]>([]);
  prio.current = list.map((e) => e.type);
  const counts = useMemo(() => {
    const m: Partial<Record<EffectCategory, number>> = {};
    for (const e of EFFECTS) m[e.category] = (m[e.category] ?? 0) + 1;
    return m;
  }, []);

  const card = (e: EffectDef) => {
    const needsSel = e.type === 'cutout' && !target && project.selections.length === 0;
    return (
      <button key={e.type} className="fx-card" onClick={() => onPick(e.type)} title={e.description}>
        <div className="fx-thumb">
          {thumbs[e.type] ? <img src={thumbs[e.type]} alt="" /> : <span className="fx-ph">{e.english}</span>}
          {needsSel && <span className="fx-flag">물체 선택 필요</span>}
        </div>
        <div className="fx-body">
          <div className="fx-name">{e.label}</div>
          <div className="fx-en">{e.english}</div>
          <div className="fx-desc">{e.description}</div>
        </div>
      </button>
    );
  };

  return createPortal(
    <div className="sl-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sl-modal fx-modal" role="dialog" aria-label="효과 고르기">
        <div className="fx-head">
          <div>
            <h2>효과 고르기</h2>
            {target ? (
              <p>
                <i className="dot" style={{ background: target.color }} /> <b>{target.name}</b>에만 들어가요. 미리보기도 그 부분에만 보여줘요.
              </p>
            ) : (
              <p>{hasPhoto ? '내 사진에 바로 적용한 미리보기예요. 누르면 레이어로 추가돼요.' : '사진을 고르면 미리보기가 내 사진으로 바뀌어요.'}</p>
            )}
          </div>
          <label className="fx-search">
            <Search size={15} />
            <input
              ref={input}
              placeholder="찾기: 열화상, 소용돌이, glitch…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && list[0] && onPick(list[0].type)}
            />
          </label>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </div>
        <div className="fx-main">
          <nav className="fx-cats">
            <button aria-pressed={cat === 'all'} onClick={() => setCat('all')}>
              전체 <em>{EFFECTS.length}</em>
            </button>
            {CATEGORY_ORDER.filter((c) => counts[c]).map((c) => (
              <button key={c} aria-pressed={cat === c} onClick={() => setCat(c)}>
                {CATEGORY_LABELS[c]} <em>{counts[c]}</em>
              </button>
            ))}
          </nav>
          <div className="fx-scroll">
            {list.length === 0 ? (
              <div className="empty-box">“{q}”에 맞는 효과가 없어요.</div>
            ) : (
              <div className="fx-grid">{list.map(card)}</div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
