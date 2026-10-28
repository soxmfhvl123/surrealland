import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LOOK_MAP, LOOKS } from '../engine/looks';
import { Renderer } from '../engine/renderer';
import type { Project } from '../engine/types';
import { ERAS, type Era, type FeedPreset } from '../library/types';

interface Props {
  project: Project;
  onApply: (p: FeedPreset, what: 'both' | 'layers' | 'prompt') => void;
  onClose: () => void;
}

/** Look previews rendered once per look on the current base photo, shared by all cards. */
function useLookThumbs(project: Project) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const queue = useRef<Set<string>>(new Set());
  const done = useRef<Set<string>>(new Set());
  const busy = useRef(false);
  const { images, selections, baseImageId, crop, format, seed, duration, fps } = project;

  useEffect(() => {
    setThumbs({});
    queue.current.clear();
    done.current.clear();
  }, [images, baseImageId, crop, format]);

  const request = (look: string) => {
    if (!baseImageId || done.current.has(look) || queue.current.has(look)) return;
    queue.current.add(look);
    if (busy.current) return;
    busy.current = true;
    const r = new Renderer();
    const pump = () => {
      const next = [...queue.current][0];
      if (!next) {
        busy.current = false;
        return;
      }
      queue.current.delete(next);
      done.current.add(next);
      const def = LOOK_MAP[next];
      if (def) {
        const c = r.render({ images, selections, baseImageId, crop, format, seed, duration, fps, layers: def.build() }, duration * 0.6, 0.16);
        const url = c.toDataURL('image/jpeg', 0.7);
        setThumbs((t) => ({ ...t, [next]: url }));
      }
      setTimeout(pump, 0);
    };
    setTimeout(pump, 0);
  };
  return { thumbs, request };
}

function Card({ p, thumb, onVisible, onApply }: { p: FeedPreset; thumb?: string; onVisible: () => void; onApply: Props['onApply'] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && onVisible(), { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [onVisible]);
  return (
    <div className="lib-card" ref={ref}>
      <button className="lib-thumb" onClick={() => onApply(p, 'both')} title="레이어 + AI 프롬프트 적용">
        {thumb ? <img src={thumb} alt="" /> : <span>{LOOK_MAP[p.look]?.name}</span>}
        <em>#{p.i}</em>
      </button>
      <div className="lib-body">
        <div className="lib-title">{p.title}</div>
        <div className="lib-look">{LOOK_MAP[p.look]?.name ?? p.look}</div>
        <div className="lib-prompt" title={p.prompt}>
          {p.prompt}
        </div>
        <div className="lib-actions">
          <button className="primary small" onClick={() => onApply(p, 'both')}>
            적용
          </button>
          <button className="ghost small" onClick={() => onApply(p, 'layers')} title="레이어만 바꾸기">
            레이어
          </button>
          <button className="ghost small" onClick={() => onApply(p, 'prompt')} title="AI 생성 칸에 프롬프트만 넣기">
            프롬프트
          </button>
          <a className="ghost small" href={p.url} target="_blank" rel="noreferrer" title="참고한 원본 게시물 (Instagram)">
            원본 ↗
          </a>
        </div>
      </div>
    </div>
  );
}

const PAGE = 60;

export function LibraryModal({ project, onApply, onClose }: Props) {
  const [all, setAll] = useState<FeedPreset[] | null>(null);
  const [q, setQ] = useState('');
  const [era, setEra] = useState<Era | 'all'>('all');
  const [look, setLook] = useState('all');
  const [limit, setLimit] = useState(PAGE);
  const { thumbs, request } = useLookThumbs(project);

  useEffect(() => {
    import('../library').then((m) => setAll(m.FEED_PRESETS));
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    if (!all) return [];
    const needle = q.trim().toLowerCase();
    return all.filter(
      (p) =>
        (era === 'all' || p.era === era) &&
        (look === 'all' || p.look === look) &&
        (!needle || `${p.i} ${p.title} ${p.prompt} ${LOOK_MAP[p.look]?.name ?? ''}`.toLowerCase().includes(needle)),
    );
  }, [all, q, era, look]);

  useEffect(() => setLimit(PAGE), [q, era, look]);

  const usedLooks = useMemo(() => {
    const count = new Map<string, number>();
    for (const p of all ?? []) count.set(p.look, (count.get(p.look) ?? 0) + 1);
    return LOOKS.filter((l) => count.has(l.id)).map((l) => ({ ...l, n: count.get(l.id)! }));
  }, [all]);

  return createPortal(
    <div className="sl-backdrop" onClick={onClose}>
      <div className="sl-modal lib" onClick={(e) => e.stopPropagation()}>
        <div className="sl-modal-head">
          <div>
            <h2>피드 프리셋 {all ? all.length : '…'}개</h2>
            <p className="muted small">@mezotes 게시물 하나마다 만든 프리셋이에요. AI 원본 프롬프트 + 이펙트 레이어 + 참고 게시물 링크.</p>
          </div>
          <button className="ghost small" onClick={onClose}>
            닫기
          </button>
        </div>
        <div className="lib-filters">
          <input className="text-input" placeholder="검색 (예: 하늘, chrome, 거울, #120)" value={q} onChange={(e) => setQ(e.target.value.replace(/^#/, ''))} />
          <div className="seg small">
            <button aria-pressed={era === 'all'} onClick={() => setEra('all')}>
              전체
            </button>
            {ERAS.map((e) => (
              <button key={e.id} aria-pressed={era === e.id} onClick={() => setEra(e.id)}>
                {e.label}
              </button>
            ))}
          </div>
          <select value={look} onChange={(e) => setLook(e.target.value)}>
            <option value="all">모든 룩</option>
            {usedLooks.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.n})
              </option>
            ))}
          </select>
          <span className="muted tiny">{filtered.length}개</span>
        </div>
        {!project.baseImageId && <p className="muted small">사진을 고르면 카드마다 내 사진으로 미리보기가 나와요.</p>}
        <div
          className="lib-scroll"
          onScroll={(e) => {
            // load the next page as the list nears the bottom
            const el = e.currentTarget;
            if (limit < filtered.length && el.scrollTop + el.clientHeight > el.scrollHeight - 400) setLimit((n) => n + PAGE);
          }}
        >
          <div className="lib-grid">
            {filtered.slice(0, limit).map((p) => (
              <Card key={p.i} p={p} thumb={thumbs[p.look]} onVisible={() => request(p.look)} onApply={onApply} />
            ))}
          </div>
          {limit < filtered.length && (
            <button className="ghost lib-more" onClick={() => setLimit((n) => n + PAGE)}>
              {Math.min(PAGE, filtered.length - limit)}개 더 보기 ({filtered.length - limit}개 남음)
            </button>
          )}
          {filtered.length === 0 && all && <p className="muted small">조건에 맞는 프리셋이 없어요.</p>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
