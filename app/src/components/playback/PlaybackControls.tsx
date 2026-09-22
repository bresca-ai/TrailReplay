import { reportPlaybackStart } from '@/utils/replayUsageAnalytics';
import { useCallback } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Slider } from '@/components/ui/slider';
import { useIsMobile } from '@/hooks/use-mobile';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  RotateCcw
} from 'lucide-react';
import { useI18n } from '@/i18n/useI18n';
import { formatDuration } from '@/utils/units';
import { getProgressBucket, trackEvent } from '@/utils/analytics';
import { usePlaybackToggle } from '@/hooks/usePlaybackToggle';
import { usePlayPauseShortcut } from '@/hooks/usePlayPauseShortcut';

const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4, 8];

export function PlaybackControls() {
  const { t } = useI18n();
  const isMobile = useIsMobile();
  const playback = useAppStore((state) => state.playback);
  const play = useAppStore((state) => state.play);
  const seekToProgress = useAppStore((state) => state.seekToProgress);
  const setSpeed = useAppStore((state) => state.setSpeed);
  const handleSliderChange = useCallback((value: number[]) => {
    seekToProgress(value[0] / 100);
  }, [seekToProgress]);

  const trackSeek = (
    method: 'slider' | 'skip_forward' | 'skip_backward' | 'restart',
    progress = playback.progress,
  ) => {
    trackEvent('playback_seeked', {
      seek_method: method,
      playback_progress_bucket: getProgressBucket(progress * 100),
    });
  };
  
  const skipForward = () => {
    const nextProgress = Math.min(playback.progress + 0.05, 1);
    seekToProgress(nextProgress);
    trackSeek('skip_forward', nextProgress);
  };
  
  const skipBackward = () => {
    const nextProgress = Math.max(playback.progress - 0.05, 0);
    seekToProgress(nextProgress);
    trackSeek('skip_backward', nextProgress);
  };
  
  const restart = () => {
    seekToProgress(0);
    play();
    trackSeek('restart', 0);
    reportPlaybackStart(useAppStore.getState(), 'restart_button');
  };

  const togglePlayback = usePlaybackToggle();

  // Space does the same thing from anywhere on the page.
  usePlayPauseShortcut();

  return (
    <div className="h-full flex items-center gap-2 sm:gap-4 px-2 sm:px-4 min-w-0">
      {/* Time Display */}
      <div className={`flex-shrink-0 text-sm font-mono text-[var(--evergreen)] ${isMobile ? 'hidden' : ''}`}>
        <span className="font-bold">{formatDuration(playback.currentTime / 1000 / playback.speed)}</span>
        <span className="text-[var(--evergreen-60)] mx-1">/</span>
        <span className="text-[var(--evergreen-60)]">{formatDuration(playback.totalDuration / 1000 / playback.speed)}</span>
      </div>
      
      {/* Progress Slider */}
      <div className="flex-1 min-w-[4rem]">
        <Slider
          value={[playback.progress * 100]}
          onValueChange={handleSliderChange}
          onValueCommit={(value) => trackSeek('slider', value[0] / 100)}
          max={100}
          step={0.1}
          className="w-full"
        />
      </div>
      
      {/* Controls */}
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        {/* Speed Selector */}
        <div className={`items-center gap-1 bg-[var(--evergreen)]/10 rounded-lg p-1 ${isMobile ? 'hidden' : 'flex'}`}>
          {SPEED_OPTIONS.map((speed) => (
            <button
              key={speed}
              onClick={() => {
                if (playback.speed === speed) return;
                setSpeed(speed);
                trackEvent('playback_speed_changed', { playback_speed: speed });
              }}
              className={`
                px-2 py-1 text-xs font-medium rounded transition-colors
                ${playback.speed === speed
                  ? 'bg-[var(--trail-orange)] text-[var(--canvas)]'
                  : 'text-[var(--evergreen)] hover:bg-[var(--evergreen)]/20'
                }
              `}
            >
              {speed}x
            </button>
          ))}
        </div>
        
        {/* Skip Backward */}
        <button
          onClick={skipBackward}
          className="p-1.5 sm:p-2 hover:bg-[var(--evergreen)]/10 rounded-lg transition-colors"
          aria-label={t('playback.skipBackward')}
          title={t('playback.skipBackward')}
        >
          <SkipBack className="w-4 h-4 sm:w-5 sm:h-5 text-[var(--evergreen)]" />
        </button>
        
        {/* Restart */}
        <button
          onClick={restart}
          className={`p-1.5 sm:p-2 hover:bg-[var(--evergreen)]/10 rounded-lg transition-colors ${isMobile ? 'hidden' : 'inline-flex'}`}
          aria-label={t('playback.restart')}
          title={t('playback.restart')}
        >
          <RotateCcw className="w-5 h-5 text-[var(--evergreen)]" />
        </button>
        
        {/* Play/Pause */}
        <button
          onClick={() => togglePlayback('play_button')}
          className="tr-playback-btn shrink-0"
          style={isMobile ? { width: '48px', height: '48px' } : undefined}
          aria-label={playback.isPlaying ? t('playback.pause') : t('playback.play')}
          title={playback.isPlaying ? t('playback.pause') : t('playback.play')}
        >
          {playback.isPlaying ? (
            <Pause className={`${isMobile ? 'w-5 h-5' : 'w-6 h-6'}`} />
          ) : (
            <Play className={`${isMobile ? 'w-5 h-5 ml-0.5' : 'w-6 h-6 ml-1'}`} />
          )}
        </button>
        
        {/* Skip Forward */}
        <button
          onClick={skipForward}
          className="p-1.5 sm:p-2 hover:bg-[var(--evergreen)]/10 rounded-lg transition-colors"
          aria-label={t('playback.skipForward')}
          title={t('playback.skipForward')}
        >
          <SkipForward className="w-4 h-4 sm:w-5 sm:h-5 text-[var(--evergreen)]" />
        </button>
      </div>
    </div>
  );
}
