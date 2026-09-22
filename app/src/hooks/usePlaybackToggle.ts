import { reportPlaybackStart } from '@/utils/replayUsageAnalytics';
import { useCallback } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { getProgressBucket, trackEvent } from '@/utils/analytics';

/** How playback was started, for analytics. */
export type PlaybackSource = 'play_button' | 'keyboard_shortcut' | 'restart_button';

/**
 * Start or stop playback, with the reporting that goes with it.
 *
 * Shared so the play button and the space-bar shortcut cannot drift apart:
 * they are the same action, and the only thing that differs is what gets
 * recorded as having triggered it.
 */
export function usePlaybackToggle() {
  const isPlaying = useAppStore((state) => state.playback.isPlaying);
  const progress = useAppStore((state) => state.playback.progress);
  const play = useAppStore((state) => state.play);
  const pause = useAppStore((state) => state.pause);

  return useCallback((source: PlaybackSource) => {
    if (isPlaying) {
      pause();
      trackEvent('playback_paused', {
        playback_progress_bucket: getProgressBucket(progress * 100),
      });
      return;
    }

    play();
    reportPlaybackStart(useAppStore.getState(), source);
  }, [isPlaying, pause, play, progress]);
}
