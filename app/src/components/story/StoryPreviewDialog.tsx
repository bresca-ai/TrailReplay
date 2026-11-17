import { useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useI18n } from '@/i18n/useI18n';
import { compileStory } from '@/utils/story/compileStory';
import { StoryView, type StoryDebugFrame, type StoryStrings } from './view/StoryView';
import { storyScroller, useStoryPreview } from './storyPreview';
import { storyCompileInput } from './useCompiledStory';

const stopPropagation = (event: Event) => event.stopPropagation();
const swallow = (event: Event) => { event.stopPropagation(); event.preventDefault(); };

export function StoryPreviewDialog({ onOpen, onDebugFrame }: { onOpen: () => void; onDebugFrame?: (debug: StoryDebugFrame) => void }) {
  const { t } = useI18n();
  const close = useStoryPreview((state) => state.close);
  const [story] = useState(() => compileStory(storyCompileInput(useAppStore.getState())));
  const dialogRef = useRef<HTMLDialogElement>(null);
  const opened = useEffectEvent(onOpen);
  const strings = useMemo<StoryStrings>(() => ({
    exit: t('story.reader.exit'),
    mapLabel: t('story.reader.mapLabel'),
    start: t('story.reader.start'),
    finish: t('story.reader.finish'),
    distance: t('story.reader.distance'),
    elevationGain: t('story.reader.elevationGain'),
    placeholder: (fileName) => t('story.reader.placeholder', { fileName }),
  }), [t]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      close();
      return;
    }
    dialog.addEventListener('keydown', stopPropagation);
    dialog.addEventListener('dragover', swallow);
    dialog.addEventListener('drop', swallow);
    dialog.showModal();
    opened();
    storyScroller(dialog)?.focus({ preventScroll: true });
    return () => {
      dialog.removeEventListener('keydown', stopPropagation);
      dialog.removeEventListener('dragover', swallow);
      dialog.removeEventListener('drop', swallow);
      if (dialog.open) dialog.close();
      const { trigger } = useStoryPreview.getState();
      if (trigger?.isConnected) trigger.focus();
    };
  }, [close]);

  if (!story) return null;

  return (
    <dialog ref={dialogRef} data-story-preview="" aria-label={story.title || t('story.title')}
      onCancel={(event) => { event.preventDefault(); close(); }}
      // A browser may close on Escape without a cancel event; a close queued before a StrictMode remount
      // arrives after showModal() reopened the dialog, so only a dialog that is really closed counts.
      onClose={(event) => { if (!event.currentTarget.open) close(); }}
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none overflow-hidden border-0 bg-[var(--canvas)] p-0 text-[var(--evergreen)]">
      <StoryView story={story} strings={strings} onExit={close} onDebugFrame={onDebugFrame} />
    </dialog>
  );
}
