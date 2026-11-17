import { Component, lazy, Suspense, useEffect, useEffectEvent, useRef, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useI18n } from '@/i18n/useI18n';
import { reportBrowserFailure } from '@/utils/browserMonitoring';
import { exposeStoryProbe, isProbeEnabled } from '@/utils/probeBridge';
import type { StoryDebugFrame } from './view/StoryView';
import { storyScroller, useStoryPreview } from './storyPreview';

const StoryPreviewDialog = lazy(() => import('./StoryPreviewDialog').then((module) => ({ default: module.StoryPreviewDialog })));

// The dialog sits at the App root, where an uncaught error (a stale chunk after a deploy, no WebGL for the
// reader's map) would unmount the whole editor and its unsaved work. Failing closes the preview instead.
class PreviewErrorBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() { this.props.onError(); }

  render() { return this.state.failed ? null : this.props.children; }
}

/**
 * Mounted once at the App root. `onOpen` runs on every open, before the reader shows, and again right after
 * showModal(): the first open waits for the dialog chunk with the page still interactive, so Space or Play can
 * start the video in between. App passes pause() and cancelHolds(), so no photo or clip hold resumes it later.
 */
export function StoryPreviewHost({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n();
  const isOpen = useStoryPreview((state) => state.isOpen);
  const handleOpen = useEffectEvent(onOpen);
  const probe = isProbeEnabled();
  const lastFrame = useRef<StoryDebugFrame | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    handleOpen();
    // Cleared on close, not on open: the reader's first frame can arrive before this effect runs.
    return () => { lastFrame.current = null; };
  }, [isOpen]);

  useEffect(() => {
    if (!probe) return;
    const preview = useStoryPreview.getState;
    return exposeStoryProbe({
      isOpen: () => preview().isOpen,
      open: () => preview().open(document.activeElement instanceof HTMLElement ? document.activeElement : document.body),
      close: () => preview().close(),
      last: () => lastFrame.current && { ...lastFrame.current, scroller: storyScroller(document.querySelector('dialog[data-story-preview]')) },
    });
  }, [probe]);

  if (!isOpen) return null;
  // Unmounted on close, so the next open starts with a fresh boundary. It does not retry a failed chunk:
  // React.lazy caches the rejection, so only a page reload loads it again (the toast says to reload).
  const fail = () => {
    reportBrowserFailure('react_panel');
    toast.error(t('story.previewFailed'), { description: t('sidebar.panelLoadErrorHelp') });
    useStoryPreview.getState().close();
  };
  return (
    <PreviewErrorBoundary onError={fail}>
      <Suspense fallback={null}>
        <StoryPreviewDialog onOpen={onOpen} onDebugFrame={probe ? (debug) => { lastFrame.current = debug; } : undefined} />
      </Suspense>
    </PreviewErrorBoundary>
  );
}
