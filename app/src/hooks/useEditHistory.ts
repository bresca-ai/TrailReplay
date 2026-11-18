import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { createEditHistory, historyShortcut, isTextEditingTarget } from '@/store/editHistory';

// The cover has its own camera-aware history while its editor is mounted.
let coverEditors = 0;
type CoverHistory = { canUndo: () => boolean; canRedo: () => boolean; undo: () => void; redo: () => void };
let coverHistory: CoverHistory | null = null;
const coverListeners = new Set<() => void>();
const notifyCover = () => coverListeners.forEach(listener => listener());
export function notifyCoverHistory() { notifyCover(); }
export function enterCoverHistory(history?: CoverHistory) {
  coverEditors += 1;
  if (history) coverHistory = history;
  notifyCover();
  return () => { coverEditors = Math.max(0, coverEditors - 1); if (coverHistory === history) coverHistory = null; notifyCover(); };
}

export function useEditHistory() {
  const historyRef = useRef<ReturnType<typeof createEditHistory> | null>(null);
  const [availability, setAvailability] = useState({ canUndo: false, canRedo: false });
  const isExporting = useAppStore(state => state.isExporting);
  const isLoading = useAppStore(state => state.isLoading);
  useEffect(() => {
    let nativeHistory = false;
    const history = createEditHistory(useAppStore, () => coverEditors === 0 && !nativeHistory);
    historyRef.current = history;
    const update = () => setAvailability({ canUndo: coverEditors ? !!coverHistory?.canUndo() : history.canUndo(), canRedo: coverEditors ? !!coverHistory?.canRedo() : history.canRedo() });
    const unsubscribe = history.subscribe(update);
    coverListeners.add(update);
    update();
    const beforeInput = (event: Event) => {
      const input = event as InputEvent;
      if (input.inputType === 'historyUndo' || input.inputType === 'historyRedo') { nativeHistory = true; window.setTimeout(() => { nativeHistory = false; }, 0); }
    };
    const afterInput = () => { nativeHistory = false; };
    window.addEventListener('beforeinput', beforeInput, true);
    window.addEventListener('input', afterInput);
    const handleKeyDown = (event: KeyboardEvent) => {
      const action = historyShortcut(event);
      if (!action || event.defaultPrevented || coverEditors || event.isComposing) return;
      if (isTextEditingTarget(event.target)) {
        // Leave ordinary text undo and standard redo to the browser. Ctrl/Cmd+R
        // normally reloads, so explicitly invoke the browser's text redo.
        if (event.key.toLowerCase() === 'r') {
          event.preventDefault();
          document.execCommand?.('redo');
        }
        return;
      }
      event.preventDefault();
      history[action]();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('beforeinput', beforeInput, true); window.removeEventListener('input', afterInput); unsubscribe(); coverListeners.delete(update); historyRef.current = null; history.dispose(); };
  }, []);
  return {
    canUndo: availability.canUndo && !isExporting && !isLoading,
    canRedo: availability.canRedo && !isExporting && !isLoading,
    undo: () => { if (coverEditors) coverHistory?.undo(); else historyRef.current?.undo(); },
    redo: () => { if (coverEditors) coverHistory?.redo(); else historyRef.current?.redo(); },
  };
}
