import { useCallback, useEffect, useRef, useState } from 'react';
import type { VideoAnnotation } from '@/types';
import { useAppStore } from '@/store/useAppStore';
import { useI18n } from '@/i18n/useI18n';
import {
  getPicturePopupLayout,
  type PicturePopupExportFrame,
} from '@/utils/picturePopup';
import { Calendar, Link2, MapPin, VideoOff } from 'lucide-react';

interface VideoPopupProps {
  video: VideoAnnotation;
  onClose?: () => void;
  exportFrame?: PicturePopupExportFrame | null;
  /**
   * Set only during a deterministic export. The clip is then paused and seeked
   * to this point for every encoded frame, so the exported video contains the
   * frame the timeline asked for rather than whatever real-time playback had
   * reached while the encoder was busy.
   */
  exportCurrentTimeSeconds?: number | null;
}

/** How long past a clip's own length the replay waits before giving up on it. */
const PLAYBACK_GRACE_MS = 2000;

export function VideoPopup({ video, onClose, exportFrame, exportCurrentTimeSeconds }: VideoPopupProps) {
  const { t } = useI18n();
  const relinkVideoFile = useAppStore((state) => state.relinkVideoFile);
  const videoElementRef = useRef<HTMLVideoElement>(null);
  const relinkInputRef = useRef<HTMLInputElement>(null);
  const hasClosedRef = useRef(false);
  const [displayProgress, setDisplayProgress] = useState(0);
  const [failed, setFailed] = useState(false);
  // The import may not have got a length out of the browser (a hidden tab
  // never decodes), so the element that plays the clip is asked again.
  const [resolvedDuration, setResolvedDuration] = useState(video.durationSeconds ?? 0);

  const isExportDriven = exportCurrentTimeSeconds !== undefined && exportCurrentTimeSeconds !== null;
  const { imageBoxWidth, imageBoxHeight, isExportSafe, popupStyle } = getPicturePopupLayout(exportFrame);

  const requestClose = useCallback(() => {
    if (hasClosedRef.current) return;
    hasClosedRef.current = true;
    onClose?.();
  }, [onClose]);

  // Live path: play the clip, then hand control back to the replay.
  useEffect(() => {
    if (isExportDriven || video.isPlaceholder) return;

    const element = videoElementRef.current;
    if (!element) return;

    // Autoplay with sound is blocked unless the page has strong enough user
    // activation, and a rejected play() would otherwise leave a frozen first
    // frame on screen for the whole hold. Retry muted rather than showing a
    // clip that never moves.
    element.play().catch(() => {
      element.muted = true;
      element.play().catch(() => setFailed(true));
    });
  }, [isExportDriven, video.isPlaceholder]);

  // A clip that never fires `ended` — a truncated file, a codec the browser
  // gives up on mid-way — must not strand the replay, so its own length is the
  // deadline. Until the length is known the deadline is only the grace period,
  // which is re-armed as soon as the element reports one.
  useEffect(() => {
    if (isExportDriven || video.isPlaceholder) return;

    const deadlineMs = (resolvedDuration * 1000) + PLAYBACK_GRACE_MS;
    const timeoutId = window.setTimeout(requestClose, Math.max(PLAYBACK_GRACE_MS, deadlineMs));

    return () => window.clearTimeout(timeoutId);
  }, [isExportDriven, requestClose, resolvedDuration, video.isPlaceholder]);

  // Export path: the popup is a still, seeked frame. `useVideoExportRecorder`
  // waits for the seek to land before it captures.
  useEffect(() => {
    if (!isExportDriven) return;

    const element = videoElementRef.current;
    if (!element) return;

    element.pause();
    const target = Math.max(0, exportCurrentTimeSeconds ?? 0);
    if (Math.abs(element.currentTime - target) > 0.001) {
      element.currentTime = target;
    }
  }, [exportCurrentTimeSeconds, isExportDriven]);

  // During an export the bar is a pure function of the frame being encoded, so
  // it is derived here rather than tracked as state.
  const clipDuration = resolvedDuration;
  const progressPercent = isExportDriven
    ? (clipDuration > 0 ? Math.min(100, ((exportCurrentTimeSeconds ?? 0) / clipDuration) * 100) : 0)
    : displayProgress;

  const isUnavailable = video.isPlaceholder || failed;

  return (
    <div className="absolute z-[200]" style={{ ...popupStyle, width: imageBoxWidth, height: imageBoxHeight }}>
      {/* Same box as the picture popup — see PicturePopup for why the size
          lives on the wrapper and why there is no box-shadow here. */}
      <div className="tr-video-popup relative w-full h-full overflow-hidden rounded-xl origin-bottom">
        {isUnavailable ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[var(--evergreen)]/10 text-[var(--evergreen-60)] text-sm">
            <VideoOff className="w-6 h-6" />
            <span className="px-3 text-center text-xs">
              {video.isPlaceholder ? t('media.placeholderFile') : t('media.videoUnavailable')}
            </span>
            {video.isPlaceholder && (
              <button
                type="button"
                onClick={() => relinkInputRef.current?.click()}
                className="flex items-center gap-1.5 rounded-full bg-[var(--trail-orange)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--trail-orange)]/80"
              >
                <Link2 className="w-3.5 h-3.5" />
                {t('media.relinkFile')}
              </button>
            )}
            <input
              ref={relinkInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) relinkVideoFile(video.id, file);
              }}
            />
          </div>
        ) : (
          <video
            ref={videoElementRef}
            src={video.url}
            className="absolute inset-0 w-full h-full object-contain"
            playsInline
            // Exported video carries no audio track, so a clip that is loud in
            // the preview and silent in the export would be a surprise at the
            // worst moment. Both are silent.
            muted
            preload="auto"
            onLoadedMetadata={(event) => {
              const duration = event.currentTarget.duration;
              if (Number.isFinite(duration) && duration > 0) setResolvedDuration(duration);
            }}
            onTimeUpdate={(event) => {
              if (isExportDriven) return;
              const element = event.currentTarget;
              const duration = element.duration || resolvedDuration;
              setDisplayProgress(duration > 0 ? Math.min(100, (element.currentTime / duration) * 100) : 0);
            }}
            onEnded={() => {
              if (!isExportDriven) requestClose();
            }}
            onError={() => setFailed(true)}
          />
        )}

        {/* Progress Bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-black/20 z-10">
          <div
            className="h-full bg-[var(--trail-orange)]"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {(video.title || video.description || (video.lat !== undefined && video.lon !== undefined) || video.timestamp) && (
          <div className="absolute bottom-0 left-0 right-0 px-4 pt-10 pb-3 bg-gradient-to-t from-black/75 to-transparent">
            {video.title && (
              <p className={`font-medium text-white ${isExportSafe ? 'text-xs' : 'text-base'}`}>{video.title}</p>
            )}
            {video.description && (
              <p className={`text-white/85 mt-0.5 ${isExportSafe ? 'text-[11px]' : 'text-sm'}`}>{video.description}</p>
            )}
            {((video.lat !== undefined && video.lon !== undefined) || video.timestamp) && (
              <div className={`flex items-center gap-3 text-white/70 mt-1.5 ${isExportSafe ? 'text-[10px]' : 'text-xs'}`}>
                {video.lat !== undefined && video.lon !== undefined && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {video.lat.toFixed(4)}, {video.lon.toFixed(4)}
                  </span>
                )}
                {video.timestamp && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {video.timestamp.toLocaleDateString()}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
