import { Component, lazy, Suspense, useEffect, useEffectEvent, useRef, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useI18n } from '@/i18n/useI18n';
import { reportBrowserFailure } from '@/utils/browserMonitoring';
import { exposeStoryProbe, isProbeEnabled } from '@/utils/probeBridge';
import type { StoryDebugFrame } from './view/StoryView';
import { storyScroller, useStoryPreview } from './storyPreview';

const StoryPreviewDialog = lazy(() => import('./StoryPreviewDialog').then((module) => ({ default: module.StoryPreviewDialog })));

class PreviewErrorBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() { this.props.onError(); }

  render() { return this.state.failed ? null : this.props.children; }
}

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
  // React.lazy caches a rejected import: only a page reload retries a failed chunk, so the toast says to reload.
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
