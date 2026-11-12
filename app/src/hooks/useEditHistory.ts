import { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { createEditHistory, historyShortcut, isTextEditingTarget } from '@/store/editHistory';

// The cover has its own camera-aware history while its editor is mounted.
let coverEditors = 0;
export function enterCoverHistory() { coverEditors += 1; return () => { coverEditors = Math.max(0, coverEditors - 1); }; }

export function useEditHistory() {
  useEffect(() => {
    let nativeHistory = false;
    const history = createEditHistory(useAppStore, () => coverEditors === 0 && !nativeHistory);
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
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('beforeinput', beforeInput, true); window.removeEventListener('input', afterInput); history.dispose(); };
  }, []);
}
