import { useCallback, useRef, useState } from 'react';
import { normalizeLayers } from '../engine/effects';
import type { Layer, Project, Selection } from '../engine/types';

const STORAGE_KEY = 'surreal-land/v1';

type Saved = Pick<Project, 'format' | 'layers' | 'seed' | 'duration' | 'fps' | 'selections'>;

function loadSaved(): Partial<Saved> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const saved = JSON.parse(raw) as Saved;
    return { ...saved, layers: normalizeLayers(saved.layers ?? []), selections: saved.selections ?? [] };
  } catch {
    return {};
  }
}

export function persist(p: Project) {
  try {
    const saved: Saved = { format: p.format, layers: p.layers, seed: p.seed, duration: p.duration, fps: p.fps, selections: p.selections };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // storage may be unavailable or full; the tool still works without it
  }
}

const initial = (): Project => ({
  images: [],
  selections: [],
  baseImageId: null,
  format: '4:5',
  crop: { zoom: 1, x: 0.5, y: 0.5 },
  layers: [],
  seed: 7,
  duration: 6,
  fps: 30,
  ...loadSaved(),
});

interface Snapshot {
  layers: Layer[];
  selections: Selection[];
}

/**
 * Project state with undo/redo for layers and selections. Rapid edits with the same
 * `coalesce` key (e.g. dragging one slider) become a single undo step.
 */
export function useProject() {
  const [project, setProject] = useState<Project>(initial);
  const ref = useRef(project);
  const hist = useRef({ past: [] as Snapshot[], future: [] as Snapshot[], lastKey: '', lastAt: 0 });

  const update = useCallback((fn: (p: Project) => Project) => {
    const next = fn(ref.current);
    ref.current = next;
    setProject(next);
  }, []);

  const record = useCallback((coalesce?: string) => {
    const h = hist.current;
    const now = Date.now();
    const merge = coalesce && coalesce === h.lastKey && now - h.lastAt < 900;
    if (!merge) {
      h.past.push({ layers: ref.current.layers, selections: ref.current.selections });
      if (h.past.length > 100) h.past.shift();
    }
    h.future = [];
    h.lastKey = coalesce ?? '';
    h.lastAt = now;
  }, []);

  const setLayers = useCallback(
    (fn: (layers: Layer[]) => Layer[], coalesce?: string) => {
      record(coalesce);
      update((p) => ({ ...p, layers: fn(p.layers) }));
    },
    [record, update],
  );

  const setSelections = useCallback(
    (fn: (sels: Selection[]) => Selection[], coalesce?: string) => {
      record(coalesce);
      update((p) => ({ ...p, selections: fn(p.selections) }));
    },
    [record, update],
  );

  /** Change layers and selections together as one undo step (e.g. deleting a selection that layers use). */
  const setDoc = useCallback(
    (fn: (d: Snapshot) => Snapshot, coalesce?: string) => {
      record(coalesce);
      update((p) => ({ ...p, ...fn({ layers: p.layers, selections: p.selections }) }));
    },
    [record, update],
  );

  const restore = useCallback(
    (from: Snapshot[], to: Snapshot[]) => {
      const snap = from.pop();
      if (!snap) return;
      to.push({ layers: ref.current.layers, selections: ref.current.selections });
      hist.current.lastKey = '';
      update((p) => ({ ...p, ...snap }));
    },
    [update],
  );

  const undo = useCallback(() => restore(hist.current.past, hist.current.future), [restore]);
  const redo = useCallback(() => restore(hist.current.future, hist.current.past), [restore]);

  return { project, update, setLayers, setSelections, setDoc, undo, redo };
}
