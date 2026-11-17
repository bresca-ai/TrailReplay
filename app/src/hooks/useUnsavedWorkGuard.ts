import { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { hasUnsavedProjectContent } from '@/utils/projectFile/hasUnsavedWork';

/**
 * Warns the user via the browser's native "leave site?" dialog when closing the
 * tab, refreshing, or navigating away would discard an in-progress project (no
 * autosave exists — see Save Project). Browsers ignore any custom message and
 * only offer Leave/Cancel, so this can't show our own "Save first?" prompt —
 * canceling gives the user the chance to click Save Project themselves.
 */
export function useUnsavedWorkGuard() {
  // A boolean selector, so App (which has no memo boundary) re-renders only when the answer flips, not on every story keystroke.
  const shouldWarn = useAppStore((state) => state.isExporting || hasUnsavedProjectContent(state));

  useEffect(() => {
    if (!shouldWarn) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [shouldWarn]);
}
