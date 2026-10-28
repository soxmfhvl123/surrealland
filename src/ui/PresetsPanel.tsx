import { useEffect, useState } from 'react';
import { Dices, LibraryBig } from 'lucide-react';
import { RECIPES, type Recipe } from '../engine/presets';
import { Renderer } from '../engine/renderer';
import type { Project } from '../engine/types';
import { PanelHeader } from './kit';

interface Props {
  project: Project;
  onApply: (r: Recipe) => void;
  onLibrary: () => void;
  onRandom: () => void;
}

/** Recipe cards previewed on the user's own photo, plus the 854-post feed library. */
export function PresetsPanel({ project, onApply, onLibrary, onRandom }: Props) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const { images, selections, baseImageId, crop, format, seed, duration, fps } = project;

  useEffect(() => {
    if (!baseImageId) {
      setThumbs({});
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const r = new Renderer();
      let i = 0;
      while (!cancelled && i < RECIPES.length) {
        // ~30ms of rendering per tick, then let the UI breathe
        const batch: Record<string, string> = {};
        const t0 = performance.now();
        while (i < RECIPES.length && performance.now() - t0 < 30) {
          const recipe = RECIPES[i++];
          const canvas = r.render({ images, selections, baseImageId, crop, format, seed, duration, fps, layers: recipe.build() }, duration * 0.6, 0.18);
          batch[recipe.id] = canvas.toDataURL('image/jpeg', 0.72);
        }
        if (cancelled) return;
        setThumbs((t) => ({ ...t, ...batch }));
        await new Promise((res) => setTimeout(res, 0));
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [images, baseImageId, crop, format, seed, duration]);

  return (
    <div className="panel">
      <PanelHeader title="프리셋" sub="누르면 효과 묶음이 한 번에 깔려요. 지금 효과는 바뀌지만 ⌘Z로 되돌릴 수 있어요." />

      <button className="lib-banner" onClick={onLibrary}>
        <LibraryBig size={22} />
        <span>
          <strong>@mezotes 피드 프리셋 854</strong>
          <em>게시물마다 하나씩 · 검색·시대별 보기 · AI 프롬프트 포함</em>
        </span>
      </button>

      <div className="block">
        <div className="block-title">
          레시피 <span className="count">{RECIPES.length}</span>
          <span className="spacer" />
          <button className="ghost small" onClick={onRandom}>
            <Dices size={13} /> 랜덤
          </button>
        </div>
        <div className="recipes">
          {RECIPES.map((r) => (
            <button key={r.id} className="recipe" onClick={() => onApply(r)} title={`${r.english} · ${r.hint}`}>
              <div className="recipe-img">{thumbs[r.id] ? <img src={thumbs[r.id]} alt="" /> : <div className="recipe-ph">{r.english}</div>}</div>
              <div className="recipe-name">{r.name}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
