import { useState, useCallback, useEffect, useRef } from 'react';
import { PlanState, BaselineCheckpoint } from '../../core/types.js';

const MAX_HISTORY_DEPTH = 10;
const MAX_BASELINES_DEPTH = 10;

export interface UsePlanHistoryReturn {
  // Tier 1: Action-level Undo/Redo
  present: PlanState;
  past: PlanState[];
  future: PlanState[];
  canUndo: boolean;
  canRedo: boolean;
  isDirty: boolean;
  pushAction: (newState: PlanState) => void;
  undo: () => void;
  redo: () => void;

  // Tier 2: Saved Baseline Checkpoints
  baselines: BaselineCheckpoint[];
  activeBaselineId: string;
  saveBaseline: (label?: string) => Promise<boolean>;
  revertToBaseline: (baselineId: string) => void;
  discardToActiveBaseline: () => void;
  syncExternalReload: (newState: PlanState, newBaselines?: BaselineCheckpoint[]) => void;

  // Status
  isSaving: boolean;
  saveError: string | null;
}

export function usePlanHistory(initialState: PlanState, initialBaselines: BaselineCheckpoint[] = []): UsePlanHistoryReturn {
  const defaultBaselines: BaselineCheckpoint[] = initialBaselines.length > 0 ? initialBaselines : [
    {
      id: 'baseline-0',
      timestamp: Date.now(),
      label: 'Initial Agent Plan',
      snapshot: JSON.parse(JSON.stringify(initialState)),
    }
  ];

  const [baselines, setBaselines] = useState<BaselineCheckpoint[]>(defaultBaselines);
  const [activeBaselineId, setActiveBaselineId] = useState<string>(defaultBaselines[defaultBaselines.length - 1].id);

  // Tier 1 State
  const [past, setPast] = useState<PlanState[]>([]);
  const [present, setPresent] = useState<PlanState>(initialState);
  const [future, setFuture] = useState<PlanState[]>([]);

  const presentRef = useRef<PlanState>(initialState);
  presentRef.current = present;

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const activeBaseline = baselines.find(b => b.id === activeBaselineId) || baselines[0];
  const isDirty = JSON.stringify(present) !== JSON.stringify(activeBaseline?.snapshot);

  // Push new action to Tier 1 history stack
  const pushAction = useCallback((newState: PlanState) => {
    const current = presentRef.current;
    setPast((prevPast) => {
      const nextPast = [...prevPast, current];
      if (nextPast.length > MAX_HISTORY_DEPTH) {
        return nextPast.slice(nextPast.length - MAX_HISTORY_DEPTH);
      }
      return nextPast;
    });
    presentRef.current = newState;
    setPresent(newState);
    setFuture([]);
  }, []);

  // Undo (Tier 1)
  const undo = useCallback(() => {
    setPast((prevPast) => {
      if (prevPast.length === 0) return prevPast;
      const previous = prevPast[prevPast.length - 1];
      const current = presentRef.current;
      const newPast = prevPast.slice(0, prevPast.length - 1);

      setFuture((prevFuture) => {
        const nextFuture = [current, ...prevFuture];
        return nextFuture.slice(0, MAX_HISTORY_DEPTH);
      });

      presentRef.current = previous;
      setPresent(previous);
      return newPast;
    });
  }, []);

  // Redo (Tier 1)
  const redo = useCallback(() => {
    setFuture((prevFuture) => {
      if (prevFuture.length === 0) return prevFuture;
      const next = prevFuture[0];
      const current = presentRef.current;
      const newFuture = prevFuture.slice(1);

      setPast((prevPast) => {
        const nextPast = [...prevPast, current];
        return nextPast.slice(nextPast.length > MAX_HISTORY_DEPTH ? 1 : 0);
      });

      presentRef.current = next;
      setPresent(next);
      return newFuture;
    });
  }, []);

  // Save Baseline (Tier 2) - Explicit Save to disk
  const saveBaseline = useCallback(async (label?: string): Promise<boolean> => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const autoLabel = label || `Draft #${baselines.length}`;
      const current = presentRef.current;
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planState: current,
          label: autoLabel,
        }),
      });

      if (!res.ok) {
        throw new Error(`Failed to save draft (${res.status})`);
      }

      const data = await res.json();
      const newCheckpoint: BaselineCheckpoint = {
        id: data.baselineId || `baseline-${Date.now()}`,
        timestamp: data.savedAt || Date.now(),
        label: autoLabel,
        snapshot: JSON.parse(JSON.stringify(current)),
      };

      setBaselines((prev) => {
        const next = [...prev, newCheckpoint];
        if (next.length > MAX_BASELINES_DEPTH) {
          return next.slice(next.length - MAX_BASELINES_DEPTH);
        }
        return next;
      });

      setActiveBaselineId(newCheckpoint.id);
      setIsSaving(false);
      return true;
    } catch (err: any) {
      setSaveError(err.message);
      setIsSaving(false);
      return false;
    }
  }, [baselines.length]);

  // Revert to historical baseline (Tier 2)
  const revertToBaseline = useCallback((baselineId: string) => {
    const target = baselines.find(b => b.id === baselineId);
    if (!target) return;

    pushAction(JSON.parse(JSON.stringify(target.snapshot)));
    setActiveBaselineId(target.id);
  }, [baselines, pushAction]);

  // Discard working draft back to active baseline
  const discardToActiveBaseline = useCallback(() => {
    if (!activeBaseline) return;
    const restored = JSON.parse(JSON.stringify(activeBaseline.snapshot));
    presentRef.current = restored;
    setPresent(restored);
    setPast([]);
    setFuture([]);
  }, [activeBaseline]);

  // External reload when plan file changes on disk
  const syncExternalReload = useCallback((newState: PlanState, newBaselines?: BaselineCheckpoint[]) => {
    const current = presentRef.current;
    setPast((prevPast) => {
      const nextPast = [...prevPast, current];
      return nextPast.length > MAX_HISTORY_DEPTH
        ? nextPast.slice(nextPast.length - MAX_HISTORY_DEPTH)
        : nextPast;
    });
    presentRef.current = newState;
    setPresent(newState);
    setFuture([]);

    if (newBaselines && newBaselines.length > 0) {
      setBaselines(newBaselines.slice(-MAX_BASELINES_DEPTH));
      setActiveBaselineId(newBaselines[newBaselines.length - 1].id);
    }
  }, []);

  // Keyboard shortcuts: ⌘Z (Undo), ⌘⇧Z / Ctrl+Y (Redo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && !target.dataset.allowGlobalUndo) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (cmdOrCtrl && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      } else if (
        (cmdOrCtrl && e.shiftKey && e.key.toLowerCase() === 'z') ||
        (!isMac && cmdOrCtrl && e.key.toLowerCase() === 'y')
      ) {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  return {
    present,
    past,
    future,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    isDirty,
    pushAction,
    undo,
    redo,
    baselines,
    activeBaselineId,
    saveBaseline,
    revertToBaseline,
    discardToActiveBaseline,
    syncExternalReload,
    isSaving,
    saveError,
  };
}
