import { useCallback, useEffect, useRef, useState } from 'react';
import { CircleQuestionMark, FolderOpen, Redo2, Save, Shuffle, Undo2 } from 'lucide-react';
import { defaultParams, EFFECT_MAP, selectionParam } from './engine/effects';
import { LOOK_MAP } from './engine/looks';
import {
  blankMask,
  combine,
  coverage,
  encode,
  ensureMasks,
  ensureUrls,
  fillMask,
  growShrink,
  invertMask,
  stepEdges,
  maskCanvas,
  maskFor,
  maskSize,
  SELECTION_COLORS,
  type MaskOp,
} from './engine/masks';
import { randomStack, RECIPES, type Recipe } from './engine/presets';
import { uid } from './engine/random';
import { getFormat } from './engine/renderer';
import { getTrack, onTracksChanged, setTrack } from './engine/track';
import { trackSelection } from './engine/trackRun';
import { clipTime } from './engine/video';
import { baseFrame, sampleColor, selectColor, selectLuma, selectObject, selectPerson, selectSky, soften } from './engine/select';
import type { Layer, ParamValue, Rect, Selection, SourceImage } from './engine/types';
import type { FeedPreset } from './library/types';
import { EffectGallery, layerFor } from './ui/EffectGallery';
import { EffectsPanel } from './ui/EffectsPanel';
import { ExportDialog } from './ui/ExportDialog';
import { Generate, type PromptRequest } from './ui/Generate';
import { NanoBanana } from './ui/NanoBanana';
import { Guide, HelpModal } from './ui/Guide';
import { loadFiles, loadSamples } from './ui/images';
import { Inspector } from './ui/Inspector';
import { PanelHeader, Seg } from './ui/kit';
import { LibraryModal } from './ui/LibraryModal';
import { PhotoPanel } from './ui/PhotoPanel';
import { PresetsPanel } from './ui/PresetsPanel';
import { loadProject, saveProject } from './ui/projectFile';
import { SelectionInspector, type RefineOp } from './ui/SelectionInspector';
import { SelectPanel, usersOf, type QuickSelect, type SelectMode } from './ui/SelectPanel';
import { Stage, type MarqueeShape, type PickMods } from './ui/Stage';
import type { BrushState } from './ui/TargetPanel';
import { Timeline } from './ui/Timeline';
import { TOOLS, ToolRail, type Tool } from './ui/ToolRail';
import { persist, useProject } from './ui/useProject';

/** Pipeline position for newly added effects: composites first, grain last. */
function weightOf(type: string): number {
  if (type === 'film') return 6;
  if (type === 'text' || type === 'editorial') return 5;
  if (type === 'lightLeak' || type === 'glints') return 4.5;
  if (type === 'colorGrade') return 4;
  const cat = EFFECT_MAP[type]?.category;
  if (cat === 'atmosphere') return 4.2;
  if (cat === 'camera') return 3;
  if (cat === 'data') return 2;
  return 1;
}

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

/** The rect the arrow keys nudge: the region mask if set, otherwise the effect's first area. */
function nudgeTarget(l: Layer): string | null {
  if (l.mask && (l.mask.shape === 'rect' || l.mask.shape === 'ellipse')) return 'mask';
  return EFFECT_MAP[l.type]?.params.find((d) => d.type === 'rect')?.key ?? null;
}

/** "하늘", then "하늘 2"…; numbered prefixes ("물체") always get a number. */
function uniqueName(selections: Selection[], base: string, numbered: boolean): string {
  const taken = new Set(selections.map((s) => s.name));
  if (!numbered && !taken.has(base)) return base;
  for (let n = numbered ? 1 : 2; ; n++) if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
}

type Focus = 'layer' | 'selection' | null;

export default function App() {
  const { project, update, setLayers, setSelections, setDoc, undo, redo } = useProject();
  const [tool, setTool] = useState<Tool>(() => (project.layers.length ? 'effects' : 'photo'));
  const [panelOpen, setPanelOpen] = useState(true);
  const [focus, setFocus] = useState<Focus>(null);
  const [layerId, setLayerId] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [quality, setQuality] = useState(0.5);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [gallery, setGallery] = useState<{ target: string | null } | null>(null);
  const [toast, setToast] = useState('');
  const [aiRequest, setAiRequest] = useState<PromptRequest | null>(null);
  const [brush, setBrush] = useState<BrushState>({ size: 5, softness: 0.5, erase: false });
  const [selectMode, setSelectMode] = useState<SelectMode>('click');
  const [colorTol, setColorTol] = useState(0.3);
  const [showSelections, setShowSelections] = useState(true);
  const [peekSel, setPeekSel] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [aiProvider, setAiProvider] = useState<'hf' | 'nano'>(() => {
    try {
      return localStorage.getItem('surreal-land/ai-provider') === 'nano' ? 'nano' : 'hf';
    } catch {
      return 'hf';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('surreal-land/ai-provider', aiProvider);
    } catch {
      // per-viewer convenience only
    }
  }, [aiProvider]);
  const [tracking, setTracking] = useState<{ selId: string; done: number; total: number; ctrl: AbortController } | null>(null);
  const [, setTrackTick] = useState(0);
  useEffect(() => onTracksChanged(() => setTrackTick((n) => n + 1)), []);
  const [photoBusy, setPhotoBusy] = useState('');
  const [dropping, setDropping] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const projectInput = useRef<HTMLInputElement>(null);

  const layer = project.layers.find((l) => l.id === layerId) ?? null;
  const layerIndex = layer ? project.layers.indexOf(layer) : -1;
  const activeSel = project.selections.find((s) => s.id === selId) ?? null;
  const fmt = getFormat(project.format);
  const hasPhoto = !!project.baseImageId;

  useEffect(() => persist(project), [project]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 3200);
    return () => clearTimeout(id);
  }, [toast]);

  // playback clock
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const start = performance.now() - time * 1000;
    const loop = (now: number) => {
      setTime(((now - start) / 1000) % project.duration);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // `time` is only the starting point; re-running on every tick would reset the clock
  }, [playing, project.duration]);

  // ---------- navigation ----------

  const openTool = useCallback(
    (t: Tool) => {
      setTool(t);
      setPanelOpen(true);
      if (t === 'select') setFocus(selId ? 'selection' : null);
      else if (t === 'effects') setFocus(layerId ? 'layer' : null);
    },
    [tool, panelOpen, selId, layerId],
  );

  const selectLayer = useCallback((id: string | null) => {
    setLayerId(id);
    setFocus(id ? 'layer' : null);
  }, []);

  const activateSel = useCallback((id: string | null) => {
    setSelId(id);
    setFocus(id ? 'selection' : null);
  }, []);

  const goSelect = () => {
    setTool('select');
    setPanelOpen(true);
    setSelectMode('click');
    setFocus(selId ? 'selection' : null);
  };

  // ---------- photos ----------

  /** A video base sets the timeline to the clip's length (so the loop matches the footage). */
  const durationFor = (src: SourceImage | undefined, current: number) =>
    src?.video && src.duration ? Math.min(30, Math.max(1, Math.round(src.duration * 10) / 10)) : current;

  const addImages = useCallback(
    (imgs: SourceImage[], makeBase = false) => {
      if (!imgs.length) return;
      const first = !project.baseImageId;
      update((p) => {
        const becomesBase = makeBase || !p.baseImageId;
        return {
          ...p,
          images: [...p.images, ...imgs],
          baseImageId: becomesBase ? imgs[0].id : p.baseImageId,
          crop: becomesBase ? { zoom: 1, x: 0.5, y: 0.5 } : p.crop,
          duration: becomesBase ? durationFor(imgs[0], p.duration) : p.duration,
        };
      });
      if (first) setToast(imgs[0].video ? `영상 준비 완료 (${imgs[0].duration?.toFixed(1)}초) — 효과를 넣고 ▶로 확인하세요` : '사진 준비 완료 — 이제 “선택”에서 물체를 클릭하거나 “효과”를 넣어보세요');
    },
    [update, project.baseImageId],
  );

  const addFiles = async (files: FileList | File[]) => {
    setPhotoBusy('불러오는 중…');
    const { sources, failed } = await loadFiles(files);
    setPhotoBusy('');
    if (failed.length) setToast(`읽지 못한 파일: ${failed.join(', ')} (영상은 MP4·WebM·MOV)`);
    else if (!sources.length) setToast('사진이나 영상 파일이 아니에요');
    addImages(sources);
  };

  const addSamples = async () => {
    setPhotoBusy('샘플 받는 중…');
    const imgs = await loadSamples();
    setPhotoBusy('');
    if (!imgs.length) return setToast('샘플을 받지 못했어요 (네트워크 확인)');
    addImages(imgs);
  };

  const removeImage = (id: string) => {
    update((p) => {
      const img = p.images.find((i) => i.id === id);
      if (img) {
        URL.revokeObjectURL(img.url);
        if (img.video) {
          img.video.pause();
          img.video.removeAttribute('src');
          img.video.load();
          if (img.videoUrl) URL.revokeObjectURL(img.videoUrl);
        }
        img.bitmap.close();
      }
      const images = p.images.filter((i) => i.id !== id);
      return { ...p, images, baseImageId: p.baseImageId === id ? (images[0]?.id ?? null) : p.baseImageId };
    });
  };

  const setBase = (id: string) => {
    if (id === project.baseImageId) return;
    update((p) => ({ ...p, baseImageId: id, crop: { zoom: 1, x: 0.5, y: 0.5 }, duration: durationFor(p.images.find((i) => i.id === id), p.duration) }));
    if (project.selections.length) setToast('베이스 사진이 바뀌었어요. 저장된 선택은 이전 사진 기준이라 다시 고르는 게 좋아요');
  };

  // ---------- layers ----------

  const patchLayer = useCallback(
    (id: string, patch: Partial<Layer>, coalesce?: string) => setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)), coalesce),
    [setLayers],
  );

  /** Insert after the focused layer, or at its natural pipeline position. */
  const insertLayer = (l: Layer) => {
    const w = weightOf(l.type);
    setLayers((ls) => {
      const sel = focus === 'layer' ? ls.findIndex((x) => x.id === layerId) : -1;
      let at = 0;
      if (sel >= 0) at = sel + 1;
      else
        ls.forEach((x, i) => {
          if (weightOf(x.type) <= w) at = i + 1;
        });
      return [...ls.slice(0, at), l, ...ls.slice(at)];
    });
    setTool('effects');
    setPanelOpen(true);
    selectLayer(l.id);
    if (!playing) setTime(project.duration * 0.5);
  };

  const removeLayer = useCallback(
    (id: string) => {
      setLayers((ls) => ls.filter((l) => l.id !== id));
      if (layerId === id) selectLayer(null);
      setToast('효과를 지웠어요 · ⌘Z로 되돌리기');
    },
    [setLayers, layerId, selectLayer],
  );

  const duplicateLayer = useCallback(
    (id: string) => {
      const copyId = uid();
      setLayers((ls) => {
        const i = ls.findIndex((l) => l.id === id);
        if (i < 0) return ls;
        const copy: Layer = { ...structuredClone(ls[i]), id: copyId, name: ls[i].name ? `${ls[i].name} 복사` : undefined };
        return [...ls.slice(0, i + 1), copy, ...ls.slice(i + 1)];
      });
      selectLayer(copyId);
    },
    [setLayers, selectLayer],
  );

  const moveLayer = (from: number, to: number) =>
    setLayers((ls) => {
      if (to < 0 || to >= ls.length) return ls;
      const next = [...ls];
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next;
    });

  const setParam = (key: string, value: ParamValue) => {
    if (!layer) return;
    const id = layer.id;
    // read params from the latest state so quick successive edits don't undo each other
    setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, params: { ...l.params, [key]: value } } : l)), `${id}:${key}`);
  };

  const setRect = (key: string, r: Rect) => {
    if (!layer) return;
    if (key === 'mask') patchLayer(layer.id, { mask: { ...layer.mask!, rect: r } }, `${layer.id}:mask`);
    else setParam(key, r);
  };

  const layerPaintOp = async (op: 'fill' | 'clear' | 'invert') => {
    if (!layer) return;
    const { w, h } = maskSize(fmt);
    await ensureMasks([layer]);
    let out: HTMLCanvasElement;
    if (op === 'invert') out = invertMask(maskCanvas(layer) ?? blankMask(w, h));
    else {
      out = blankMask(w, h);
      fillMask(out, op === 'fill');
    }
    patchLayer(layer.id, { mask: { ...layer.mask!, shape: 'paint', paint: encode(out) } });
  };

  const applyLayers = (layers: Layer[], msg: string) => {
    setLayers(() => layers);
    selectLayer(null);
    if (!playing) setTime(project.duration * 0.6);
    setToast(msg);
  };

  const applyRecipe = (r: Recipe) => applyLayers(r.build(), `레시피 “${r.name}” 적용 · ⌘Z로 되돌리기`);
  const applyRandom = () => applyLayers(randomStack(), '랜덤 조합을 만들었어요. 다시 누르거나 ⌘Z');

  const applyFeedPreset = (p: FeedPreset, what: 'both' | 'layers' | 'prompt') => {
    if (what !== 'prompt') {
      const look = LOOK_MAP[p.look];
      if (look) applyLayers(look.build(), `#${p.i} “${p.title}” 적용`);
    }
    if (what !== 'layers') {
      setAiRequest({ prompt: p.prompt, nonce: Date.now() });
      setTool('ai');
      setPanelOpen(true);
      setToast(what === 'prompt' ? `#${p.i} 프롬프트를 AI 생성에 넣었어요` : `#${p.i} “${p.title}” 적용 · 프롬프트도 AI 생성에 넣었어요`);
    }
    setLibraryOpen(false);
  };

  const pickEffect = (type: string) => {
    const target = gallery?.target ? (project.selections.find((s) => s.id === gallery.target) ?? null) : null;
    setGallery(null);
    if (type === 'cutout' && !target && !project.selections.length) {
      goSelect();
      setToast('먼저 오려낼 물체를 사진에서 클릭하세요');
      return;
    }
    const l = layerFor(type, target, activeSel ?? project.selections[0]);
    insertLayer(l);
    const label = EFFECT_MAP[type].label;
    setToast(target ? `“${target.name}”에 ${label} 넣음` : `${label} 추가 · 오른쪽에서 조절하세요`);
  };

  const cutoutSel = (sel: Selection) => {
    insertLayer(layerFor('cutout', sel));
    setToast(`“${sel.name}”을 오려 띄웠어요 — 오른쪽에서 위치·크기·복제를 조절하세요`);
  };

  const flowSel = (sel: Selection) => {
    insertLayer(layerFor('flow', sel));
    if (!playing) setPlaying(true);
    setToast(`“${sel.name}” 흐르는 중 — 오른쪽에서 방향·빠르기를 조절하세요`);
  };

  // ---------- selections ----------

  const addSelection = (name: string, mask: HTMLCanvasElement): Selection => {
    const sel: Selection = { id: uid(), name, color: SELECTION_COLORS[project.selections.length % SELECTION_COLORS.length], paint: encode(mask) };
    setSelections((ss) => [...ss, sel]);
    activateSel(sel.id);
    return sel;
  };

  const patchSel = (id: string, patch: Partial<Selection>, coalesce?: string) =>
    setSelections((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s)), coalesce);

  const selCanvas = async (sel: Selection) => {
    await ensureUrls([sel.paint]);
    const { w, h } = maskSize(fmt);
    return maskFor(sel.id, sel.paint) ?? blankMask(w, h);
  };

  const modifySel = async (sel: Selection, mask: HTMLCanvasElement, op: MaskOp) => {
    const out = combine(await selCanvas(sel), mask, op);
    patchSel(sel.id, { paint: encode(out) });
  };

  /** A dragged box (or ellipse) becomes a new selection, or is added to / cut from the active one. */
  const onMarquee = async (shape: MarqueeShape, mods: PickMods) => {
    const { w, h } = maskSize(fmt);
    const mask = blankMask(w, h);
    const ctx = mask.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    if (shape.kind === 'lasso') {
      shape.points.forEach((q, i) => (i ? ctx.lineTo(q.x * w, q.y * h) : ctx.moveTo(q.x * w, q.y * h)));
      ctx.closePath();
    } else {
      const r = shape.rect;
      if (shape.kind === 'ellipse') ctx.ellipse((r.x + r.w / 2) * w, (r.y + r.h / 2) * h, (r.w / 2) * w, (r.h / 2) * h, 0, 0, Math.PI * 2);
      else ctx.rect(r.x * w, r.y * h, r.w * w, r.h * h);
    }
    ctx.fill();
    const editing = mods.add || mods.subtract ? activeSel : null;
    if (mods.subtract && !editing) return setToast('뺄 선택이 없어요. 먼저 선택을 하나 만드세요');
    if (editing) {
      await modifySel(editing, mask, mods.subtract ? 'subtract' : 'add');
      setToast(mods.subtract ? `“${editing.name}”에서 뺐어요` : `“${editing.name}”에 더했어요`);
    } else {
      const sel = addSelection(uniqueName(project.selections, { rect: '네모', ellipse: '원', lasso: '라쏘' }[shape.kind], true), mask);
      setToast(`“${sel.name}” 선택됨 — 아래 버튼으로 효과를 넣거나 오려 띄워보세요`);
    }
  };

  const onPick = async (x: number, y: number, mods: PickMods) => {
    const base = baseFrame(project);
    if (!base) return;
    const editing = mods.add || mods.subtract ? activeSel : null;
    if (mods.subtract && !editing) return setToast('뺄 선택이 없어요. 먼저 물체를 클릭하세요');
    try {
      let mask: HTMLCanvasElement;
      if (selectMode === 'color') mask = selectColor(base, sampleColor(base, x, y), colorTol);
      else {
        setBusy('물체를 찾는 중… (처음엔 모델을 받느라 몇 초 걸려요)');
        mask = await selectObject(base, x, y);
      }
      if (coverage(mask) < 0.0008) return setToast('여기서는 물체를 찾지 못했어요. 조금 옆을 눌러보세요');
      if (editing) {
        await modifySel(editing, mask, mods.subtract ? 'subtract' : 'add');
        setToast(mods.subtract ? `“${editing.name}”에서 뺐어요` : `“${editing.name}”에 더했어요`);
      } else {
        const sel = addSelection(uniqueName(project.selections, selectMode === 'color' ? '색' : '물체', true), mask);
        setToast(`“${sel.name}” 선택됨 — 아래 버튼으로 효과를 넣거나 오려 띄워보세요`);
      }
    } catch (err) {
      setToast(`선택하지 못했어요: ${(err as Error).message}`);
    } finally {
      setBusy('');
    }
  };

  const quickSelect = async (k: QuickSelect) => {
    const { w, h } = maskSize(fmt);
    if (k === 'empty') {
      addSelection(uniqueName(project.selections, '선택', true), blankMask(w, h));
      setSelectMode('brush');
      setToast('빈 선택을 만들었어요. 캔버스를 드래그해서 칠하세요');
      return;
    }
    const base = baseFrame(project);
    if (!base) return;
    const names: Record<Exclude<QuickSelect, 'empty'>, string> = { sky: '하늘', person: '사람', bright: '밝은 곳', dark: '어두운 곳' };
    try {
      let mask: HTMLCanvasElement;
      if (k === 'sky') mask = selectSky(base);
      else if (k === 'bright') mask = selectLuma(base, 0.62, 1.1);
      else if (k === 'dark') mask = selectLuma(base, -0.1, 0.32);
      else {
        setBusy('사람을 찾는 중… (처음엔 모델을 받느라 몇 초 걸려요)');
        mask = await selectPerson(base);
      }
      if (coverage(mask) < 0.002) return setToast(k === 'person' ? '사람을 찾지 못했어요. 인물이 크게 나온 사진에서 잘 돼요' : `${names[k]}을 찾지 못했어요`);
      const sel = addSelection(uniqueName(project.selections, names[k], false), mask);
      setToast(`“${sel.name}” 선택됨`);
    } catch (err) {
      setToast(`선택하지 못했어요: ${(err as Error).message}`);
    } finally {
      setBusy('');
    }
  };

  const refineSel = async (op: RefineOp) => {
    if (!activeSel) return;
    const { w, h } = maskSize(fmt);
    const cur = await selCanvas(activeSel);
    let out: HTMLCanvasElement;
    if (op === 'grow') out = growShrink(cur, 0.5);
    else if (op === 'shrink') out = growShrink(cur, -0.5);
    else if (op === 'soften') out = soften(cur, 0.35);
    else if (op === 'invert') out = invertMask(cur);
    else if (op === 'steps') out = stepEdges(cur);
    else {
      out = blankMask(w, h);
      fillMask(out, op === 'fill');
    }
    patchSel(activeSel.id, { paint: encode(out) });
  };

  /** Rotoscope: follow the active selection through the base video. */
  const startTrack = async (mode: 'object' | 'person', fps: number) => {
    const sel = activeSel;
    const base = project.images.find((i) => i.id === project.baseImageId);
    if (!sel || !base?.video || tracking) return;
    const ctrl = new AbortController();
    setPlaying(false);
    setTracking({ selId: sel.id, done: 0, total: 1, ctrl });
    try {
      const data = await trackSelection(project, sel, {
        mode,
        fps,
        anchorTime: time,
        signal: ctrl.signal,
        onProgress: (done, total) => setTracking((t) => (t ? { ...t, done, total } : t)),
      });
      setTrack(sel.id, data);
      patchSel(sel.id, { track: { sourceId: base.id, fps, frames: data.frames.length, anchor: clipTime(base, time), mode } });
      setToast(`“${sel.name}”을 영상 끝까지 따라갔어요 — ▶로 확인하세요`);
    } catch (err) {
      const e = err as Error;
      setToast(e.name === 'AbortError' ? '따라가기를 취소했어요' : `따라가지 못했어요: ${e.message}`);
    } finally {
      setTracking(null);
    }
  };

  const clearTrack = (id: string) => {
    setTrack(id, null);
    patchSel(id, { track: undefined });
  };

  const deleteSel = (id: string) => {
    const users = usersOf(project.layers, id).length;
    setDoc((d) => ({
      selections: d.selections.filter((s) => s.id !== id),
      layers: d.layers.map((l) => {
        const own = selectionParam(l.type);
        if (own && l.params[own] === id) return { ...l, params: { ...l.params, [own]: '' } };
        if (l.mask?.shape === 'selection' && l.mask.selectionId === id) return { ...l, mask: { ...l.mask, shape: 'full', selectionId: undefined } };
        return l;
      }),
    }));
    if (selId === id) activateSel(null);
    setTrack(id, null);
    setToast(users ? `선택을 지웠어요. 쓰던 효과 ${users}개는 화면 전체로 바뀌었어요 · ⌘Z` : '선택을 지웠어요 · ⌘Z');
  };

  // ⌘V anywhere (outside text fields) adds a copied picture — e.g. an image copied from Gemini or Higgsfield
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target)) return;
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'));
      if (!files.length) return;
      e.preventDefault();
      void addFiles(files).then(() => setToast('붙여넣은 사진을 추가했어요'));
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  // ---------- keyboard ----------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        if (isTyping(e.target)) return;
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (isTyping(e.target) || gallery || exportOpen || libraryOpen || helpOpen) return;
      const n = Number(e.key);
      if (!mod && !e.altKey && n >= 1 && n <= TOOLS.length) {
        openTool(TOOLS[n - 1].id);
      } else if (mod && e.key.toLowerCase() === 'd' && focus === 'layer' && layerId) {
        e.preventDefault();
        duplicateLayer(layerId);
      } else if (e.code === 'Space') {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (focus === 'layer' && layerId) {
          e.preventDefault();
          removeLayer(layerId);
        } else if (focus === 'selection' && selId) {
          e.preventDefault();
          deleteSel(selId);
        }
      } else if (e.key === 'Escape') {
        if (tool === 'select' && selId) activateSel(null);
        else setFocus(null);
      } else if (e.key.startsWith('Arrow') && focus === 'layer' && layer) {
        const key = nudgeTarget(layer);
        if (!key) return;
        e.preventDefault();
        const step = e.shiftKey ? 0.025 : 0.005;
        const r = key === 'mask' ? layer.mask!.rect : (layer.params[key] as Rect);
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        const moved = {
          ...r,
          x: Math.round(Math.min(1 - r.w, Math.max(0, r.x + dx)) * 1000) / 1000,
          y: Math.round(Math.min(1 - r.h, Math.max(0, r.y + dy)) * 1000) / 1000,
        };
        if (key === 'mask') patchLayer(layer.id, { mask: { ...layer.mask!, rect: moved } }, `${layer.id}:nudge`);
        else patchLayer(layer.id, { params: { ...layer.params, [key]: moved } }, `${layer.id}:nudge`);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---------- render ----------

  const right =
    focus === 'layer' && layer ? (
      <Inspector
        layer={layer}
        project={project}
        index={layerIndex}
        count={project.layers.length}
        onChange={setParam}
        onLayer={(patch, coalesce) => patchLayer(layer.id, patch, coalesce)}
        onReset={() =>
          patchLayer(layer.id, {
            params: { ...defaultParams(EFFECT_MAP[layer.type]), ...(selectionParam(layer.type) ? { [selectionParam(layer.type)!]: layer.params[selectionParam(layer.type)!] } : {}) },
            opacity: undefined,
            blend: undefined,
            tin: undefined,
            tout: undefined,
            fade: undefined,
          })
        }
        onMove={(dir) => moveLayer(layerIndex, layerIndex + dir)}
        onDuplicate={() => duplicateLayer(layer.id)}
        onShuffle={() => patchLayer(layer.id, { seed: Math.floor(Math.random() * 1e6) })}
        onRemove={() => removeLayer(layer.id)}
        target={{ brush, setBrush, onNewSelection: goSelect, onPaintOp: (op) => void layerPaintOp(op), onPeek: setPeekSel }}
      />
    ) : focus === 'selection' && activeSel ? (
      <SelectionInspector
        sel={activeSel}
        layers={project.layers}
        brush={brush}
        setBrush={setBrush}
        onRename={(name) => patchSel(activeSel.id, { name }, `${activeSel.id}:name`)}
        onColor={(color) => patchSel(activeSel.id, { color })}
        onRefine={(op) => void refineSel(op)}
        onAddEffect={() => setGallery({ target: activeSel.id })}
        onCutout={() => cutoutSel(activeSel)}
        onFlow={() => flowSel(activeSel)}
        onDelete={() => deleteSel(activeSel.id)}
        onOpenLayer={(id) => {
          setTool('effects');
          setPanelOpen(true);
          selectLayer(id);
        }}
        track={{
          available: !!project.images.find((i) => i.id === project.baseImageId)?.video,
          hasData: !!getTrack(activeSel.id),
          progress: tracking && tracking.selId === activeSel.id ? { done: tracking.done, total: tracking.total } : null,
          onStart: (mode, fps) => void startTrack(mode, fps),
          onCancel: () => tracking?.ctrl.abort(),
          onClear: () => clearTrack(activeSel.id),
        }}
      />
    ) : (
      <Guide
        hasPhoto={hasPhoto}
        selections={project.selections.length}
        layers={project.layers.length}
        onGo={openTool}
        onAddEffect={() => setGallery({ target: null })}
        onExport={() => setExportOpen(true)}
      />
    );

  return (
    <div
      className={`app ${panelOpen ? '' : 'panel-closed'}`}
      onDragOver={(e) => {
        if (![...e.dataTransfer.items].some((i) => i.kind === 'file')) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(e) => e.relatedTarget === null && setDropping(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDropping(false);
        if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
      }}
    >
      <header className="topbar">
        <div className="brand">
          <span className="logo">SURREAL LAND</span>
        </div>
        <span className="tagline">사진 → 물체 선택 → 효과 → 아트워크 · image / video surreal effects</span>
        <div className="top-controls">
          <button className="icon-btn" onClick={undo} title="되돌리기 (⌘Z)">
            <Undo2 size={17} />
          </button>
          <button className="icon-btn" onClick={redo} title="다시 (⇧⌘Z)">
            <Redo2 size={17} />
          </button>
          <span className="top-sep" />
          <button className="icon-btn" title="모든 효과의 무작위 배치를 새로 섞기" onClick={() => update((p) => ({ ...p, seed: Math.floor(Math.random() * 99999) }))}>
            <Shuffle size={17} />
          </button>
          <button
            className="icon-btn"
            title="프로젝트 저장 (레이어·선택·사진을 파일 하나로)"
            onClick={() => {
              setToast('프로젝트 파일을 만드는 중…');
              saveProject(project).then(() => setToast('프로젝트를 저장했어요'));
            }}
          >
            <Save size={17} />
          </button>
          <button className="icon-btn" onClick={() => projectInput.current?.click()} title="프로젝트 열기">
            <FolderOpen size={17} />
          </button>
          <button className="icon-btn" onClick={() => setHelpOpen(true)} title="사용법">
            <CircleQuestionMark size={17} />
          </button>
          <button
            className="primary"
            onClick={() => {
              setPlaying(false);
              setExportOpen(true);
            }}
          >
            내보내기 ↓
          </button>
        </div>
      </header>

      <aside className="side">
        <ToolRail
          tool={tool}
          onTool={openTool}
          badges={{ photo: project.images.length, presets: RECIPES.length, effects: project.layers.length, select: project.selections.length }}
        />
        {tool === 'photo' && (
          <PhotoPanel
            project={project}
            busy={photoBusy}
            onUpload={() => fileInput.current?.click()}
            onFiles={(f) => void addFiles(f)}
            onSamples={() => void addSamples()}
            onSelect={setBase}
            onRemove={removeImage}
            onCrop={(crop) => update((p) => ({ ...p, crop }))}
            onFormat={(format) => update((p) => ({ ...p, format }))}
          />
        )}
        {/* stays mounted so running generations keep polling while other tools are open */}
        <div className="panel" hidden={tool !== 'ai'}>
          <PanelHeader
            title="AI로 사진 만들기"
            sub={aiProvider === 'hf' ? 'Higgsfield로 베이스 사진을 만들어요. 결과는 사진 목록에 들어가요.' : 'Google 나노바나나로 새로 만들거나, 지금 사진·캔버스를 글로 고쳐요. 결과는 사진 목록에 들어가요.'}
          />
          <Seg
            value={aiProvider}
            onChange={setAiProvider}
            options={[
              { value: 'hf', label: 'Higgsfield' },
              { value: 'nano', label: '나노바나나 (Google)' },
            ]}
          />
          <div hidden={aiProvider !== 'hf'}>
            <Generate project={project} onAdd={addImages} incoming={aiProvider === 'hf' ? aiRequest : null} />
          </div>
          <div hidden={aiProvider !== 'nano'}>
            <NanoBanana project={project} time={time} onAdd={addImages} incoming={aiProvider === 'nano' ? aiRequest : null} />
          </div>
        </div>
        {tool === 'presets' && <PresetsPanel project={project} onApply={applyRecipe} onLibrary={() => setLibraryOpen(true)} onRandom={applyRandom} />}
        {tool === 'effects' && (
          <EffectsPanel
            layers={project.layers}
            selections={project.selections}
            selectedId={focus === 'layer' ? layerId : null}
            onSelect={selectLayer}
            onAdd={() => setGallery({ target: null })}
            onToggle={(id) => setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, enabled: !l.enabled } : l)))}
            onRemove={removeLayer}
            onDuplicate={duplicateLayer}
            onMove={moveLayer}
            onRandom={applyRandom}
            onClear={() => applyLayers([], '효과를 모두 지웠어요 · ⌘Z로 되돌리기')}
            onPresets={() => openTool('presets')}
          />
        )}
        {tool === 'select' && (
          <SelectPanel
            selections={project.selections}
            layers={project.layers}
            activeId={selId}
            mode={selectMode}
            colorTol={colorTol}
            showOverlay={showSelections}
            busy={busy}
            hasPhoto={hasPhoto}
            onMode={setSelectMode}
            onColorTol={setColorTol}
            onShowOverlay={setShowSelections}
            onActivate={(id) => activateSel(id === selId && focus === 'selection' ? null : id)}
            onQuick={(k) => void quickSelect(k)}
            onAddEffect={(id) => setGallery({ target: id })}
            onCutout={(id) => {
              const s = project.selections.find((x) => x.id === id);
              if (s) cutoutSel(s);
            }}
            onFlow={(id) => {
              const s = project.selections.find((x) => x.id === id);
              if (s) flowSel(s);
            }}
            onDelete={deleteSel}
          />
        )}
      </aside>

      <main className="center">
        <Stage
          project={project}
          time={time}
          scale={quality}
          tool={tool}
          selectMode={selectMode}
          layer={focus === 'layer' ? layer : null}
          activeSel={activeSel}
          peekSel={peekSel}
          showSelections={showSelections}
          busy={busy || (tracking ? `물체를 따라가는 중… ${tracking.done}/${tracking.total} 프레임` : '')}
          brush={brush}
          playing={playing}
          canTrack={!!project.images.find((i) => i.id === project.baseImageId)?.video}
          onSelTrack={() => {
            setFocus('selection');
            void startTrack(activeSel?.track?.mode ?? 'object', activeSel?.track?.fps ?? 12);
          }}
          onRectChange={setRect}
          onCrop={(crop) => update((p) => ({ ...p, crop }))}
          onPick={(x, y, mods) => void onPick(x, y, mods)}
          onMarquee={(shape, mods) => void onMarquee(shape, mods)}
          onLayerPaint={(url) => layer && patchLayer(layer.id, { mask: { ...layer.mask!, paint: url } })}
          onSelectionPaint={(id, url) => patchSel(id, { paint: url })}
          onNewBlankSelection={(url) => {
            const sel: Selection = { id: uid(), name: uniqueName(project.selections, '브러시', true), color: SELECTION_COLORS[project.selections.length % SELECTION_COLORS.length], paint: url };
            setSelections((ss) => [...ss, sel]);
            activateSel(sel.id);
            return sel.id;
          }}
          onUpload={() => fileInput.current?.click()}
          onSamples={() => void addSamples()}
          onAI={() => openTool('ai')}
          onSelAddEffect={() => activeSel && setGallery({ target: activeSel.id })}
          onSelCutout={() => activeSel && cutoutSel(activeSel)}
          onSelFlow={() => activeSel && flowSel(activeSel)}
          onSelInvert={() => void refineSel('invert')}
          onSelDelete={() => activeSel && deleteSel(activeSel.id)}
        />
        <Timeline
          time={time}
          duration={project.duration}
          fps={project.fps}
          playing={playing}
          quality={quality}
          layers={project.layers}
          selectedId={focus === 'layer' ? layerId : null}
          open={timelineOpen}
          onToggleOpen={() => setTimelineOpen((o) => !o)}
          onPlay={() => setPlaying((p) => !p)}
          onSeek={(t) => {
            setPlaying(false);
            setTime(Math.max(0, Math.min(project.duration, t)));
          }}
          onDuration={(d) => {
            update((p) => ({ ...p, duration: d }));
            setTime((t) => Math.min(t, d));
          }}
          onFps={(f) => update((p) => ({ ...p, fps: f }))}
          onQuality={setQuality}
          onSelect={(id) => {
            selectLayer(id);
            if (tool !== 'effects') {
              setTool('effects');
              setPanelOpen(true);
            }
          }}
          onTiming={(id, tin, tout) => patchLayer(id, { tin, tout }, `${id}:timing`)}
        />
      </main>

      <aside className="right">{right}</aside>

      <input
        ref={fileInput}
        type="file"
        accept="image/*,video/*,.mov,.m4v"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void addFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={projectInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            const p = await loadProject(f);
            update(() => p);
            selectLayer(null);
            setSelId(null);
            setToast('프로젝트를 불러왔어요');
          } catch (err) {
            setToast((err as Error).message);
          }
        }}
      />

      {gallery && (
        <EffectGallery
          project={project}
          target={gallery.target ? (project.selections.find((s) => s.id === gallery.target) ?? null) : null}
          onPick={pickEffect}
          onClose={() => setGallery(null)}
        />
      )}
      {libraryOpen && <LibraryModal project={project} onApply={applyFeedPreset} onClose={() => setLibraryOpen(false)} />}
      {exportOpen && <ExportDialog project={project} time={time} onClose={() => setExportOpen(false)} />}
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
      {dropping && <div className="drop-veil">여기에 놓으면 사진이 추가돼요</div>}
      {toast && <div className="sl-toast">{toast}</div>}
    </div>
  );
}
