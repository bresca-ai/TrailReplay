import { useEffect, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import type { VideoConfig } from './replayComposition';
import { getLayout } from './replayComposition';
import { getCompositionVideoTime } from './compositionVideoTime';

interface CompositionVideoProps {
  blockId: string;
  config: VideoConfig;
  source: { id: string; url?: string; durationSeconds?: number; isPlaceholder?: boolean };
  currentTime: number;
  fps: number;
  progress: number;
}

function CompositionVideo({ blockId, config, source, currentTime, fps, progress }: CompositionVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!element || source.isPlaceholder) return;

    const seek = () => {
      const duration = Number.isFinite(element.duration) ? element.duration : source.durationSeconds ?? 0;
      const desired = getCompositionVideoTime({
        config,
        duration,
        progress,
        timelineSeconds: currentTime / 1000,
      });
      element.dataset.compositionDesiredTime = String(desired);
      if (Math.abs(element.currentTime - desired) > 1 / Math.max(24, fps)) {
        try {
          element.currentTime = desired;
        } catch {
          // Metadata may still be loading. loadedmetadata retries the seek.
        }
      }
    };

    seek();
    element.addEventListener('loadedmetadata', seek, { once: true });
    return () => element.removeEventListener('loadedmetadata', seek);
  }, [config, currentTime, fps, progress, source]);

  if (source.isPlaceholder || !source.url) return null;

  return (
    <video
      ref={videoRef}
      className="tr-composition-action-video"
      data-composition-block-id={blockId}
      data-composition-source-id={source.id}
      src={source.url}
      muted
      playsInline
      preload="auto"
      aria-hidden="true"
      style={{
        position: 'fixed',
        left: '-4px',
        top: '-4px',
        width: '2px',
        height: '2px',
        opacity: 0.001,
        pointerEvents: 'none',
      }}
    />
  );
}

/**
 * Keeps the selected action-camera clip decoded at the current replay time.
 * The element stays off-screen and is painted directly by the export canvas,
 * so it never competes with the interactive map preview.
 */
export function CompositionVideoBridge() {
  const exportSettings = useAppStore((state) => state.videoExportSettings);
  const videos = useAppStore((state) => state.videos);
  const playback = useAppStore((state) => state.playback);
  const layout = getLayout(exportSettings.composition, exportSettings.aspectRatio);
  return layout.blocks.flatMap((block) => {
    if (block.kind !== 'video' || !block.visible) return [];
    const config = block.config as VideoConfig;
    if (!config.source) return [];
    const source = videos.find((video) => video.id === config.source);
    if (!source) return [];
    return [<CompositionVideo
      key={block.id}
      blockId={block.id}
      config={config}
      source={source}
      currentTime={playback.currentTime}
      fps={exportSettings.fps}
      progress={playback.progress}
    />];
  });
}
