import { useCallback, useEffect, useRef, useState } from 'react';
import type { PictureAnnotation } from '@/types';
import { useAppStore } from '@/store/useAppStore';
import { useI18n } from '@/i18n/useI18n';
import {
  getPicturePopupLayout,
  type PicturePopupExportFrame,
} from '@/utils/picturePopup';
import { ImageOff, Link2 } from 'lucide-react';

interface PicturePopupProps {
  picture: PictureAnnotation;
  onClose?: () => void;
  exportFrame?: PicturePopupExportFrame | null;
  playbackCurrentTime?: number;
}

// A large, calm reveal reads better than the previous thumbnail-like pop.
// Keep both phases inside the photo hold so there is a clear still moment.
const REVEAL_MS = 700;
const EXIT_MS = 300;
const REVEAL_SCALE = 0.965;

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

// Computes scale/opacity directly from elapsed time instead of toggling CSS
// classes through a `transition` and letting the browser interpolate in real
// wall-clock time. That worked fine for the live preview, but during video
// export each encoded frame can take far longer than its nominal slot to
// capture (DOM-overlay rasterization isn't free) — the CSS transition would
// often finish before more than one or two frames had even been captured,
// making the zoom look like an abrupt jump-cut instead of a smooth animation
// in the output. Deriving the values from `elapsed` directly makes the
// animation a pure function of the (possibly synthetic, export-driven) clock
// passed in, independent of how long each frame actually took to render.
function getZoomStyle(elapsed: number, displayDuration: number): { opacity: number; scale: number; translateY: number } {
  const clamped = Math.max(0, elapsed);
  if (clamped < REVEAL_MS) {
    const t = easeOutCubic(Math.min(1, clamped / REVEAL_MS));
    return { opacity: t, scale: REVEAL_SCALE + (1 - REVEAL_SCALE) * t, translateY: 10 * (1 - t) };
  }
  const exitStart = Math.max(REVEAL_MS, displayDuration - EXIT_MS);
  if (clamped > exitStart) {
    const t = Math.min(1, (clamped - exitStart) / EXIT_MS);
    return { opacity: 1 - t, scale: 1 - 0.01 * t, translateY: 0 };
  }
  return { opacity: 1, scale: 1, translateY: 0 };
}

export function PicturePopup({ picture, onClose, exportFrame, playbackCurrentTime }: PicturePopupProps) {
  const { t } = useI18n();
  const relinkPictureFile = useAppStore((state) => state.relinkPictureFile);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [imageSrc, setImageSrc] = useState(picture.url);
  const progressIntervalRef = useRef<number | null>(null);
  const fallbackImageUrlRef = useRef<string | null>(null);
  const playbackPopupStartTimeRef = useRef<number | null>(null);
  const hasClosedRef = useRef(false);
  const relinkInputRef = useRef<HTMLInputElement>(null);

  const displayDuration = picture.displayDuration || 3000;
  const { imageBoxWidth, imageBoxHeight, popupStyle } = getPicturePopupLayout(exportFrame);

  useEffect(() => () => {
    if (fallbackImageUrlRef.current !== null) {
      URL.revokeObjectURL(fallbackImageUrlRef.current);
      fallbackImageUrlRef.current = null;
    }
  }, []);

  const clearProgressInterval = useCallback(() => {
    if (progressIntervalRef.current !== null) {
      window.clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  const requestClose = useCallback(() => {
    if (hasClosedRef.current) return;
    hasClosedRef.current = true;
    clearProgressInterval();
    onClose?.();
  }, [clearProgressInterval, onClose]);

  // Wall-clock path: drives the live preview when playback isn't a
  // deterministic export. Ticks on an interval instead of currentTime.
  useEffect(() => {
    if (playbackCurrentTime !== undefined) return;

    const startTime = Date.now();
    progressIntervalRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      setElapsedMs(elapsed);

      if (elapsed >= displayDuration) {
        requestClose();
      }
    }, 30);

    return () => {
      clearProgressInterval();
    };
  }, [clearProgressInterval, displayDuration, playbackCurrentTime, requestClose]);

  // Deterministic-export path: driven off the replay clock so the zoom
  // animation bakes into exported frames instead of jumping straight to
  // "visible" the way the previous implementation did.
  useEffect(() => {
    if (playbackCurrentTime === undefined) return;

    if (playbackPopupStartTimeRef.current === null) {
      playbackPopupStartTimeRef.current = playbackCurrentTime;
    }

    const elapsed = Math.max(0, playbackCurrentTime - playbackPopupStartTimeRef.current);
    setElapsedMs(elapsed);

    if (elapsed >= displayDuration) {
      requestClose();
    }
  }, [displayDuration, playbackCurrentTime, requestClose]);

  const { opacity, scale, translateY } = getZoomStyle(elapsedMs, displayDuration);

  return (
    <div className="absolute z-[200]" style={{ ...popupStyle, width: imageBoxWidth, height: imageBoxHeight }}>
      {/* Near-fullscreen box: fills the sized wrapper above with a clean
          light edge. The photo fills the box for an uninterrupted image.
          Opacity, scale, and position are derived from the replay clock (see
          `getZoomStyle`) rather than a CSS transition.
          Note: the size lives on the *outer* wrapper (whose percentage
          values resolve against the map container, a definite-size
          ancestor) rather than here — an absolutely-positioned box with no
          explicit size shrink-wraps its content, and shrink-to-fit sizing
          treats percentage-width children as 0, which collapsed the photo
          to nothing. */}
      <div
        className="tr-picture-popup relative w-full h-full overflow-hidden rounded-xl border-[3px] border-white/90 bg-black/40 origin-center"
        style={{ opacity, transform: `translateY(${translateY}px) scale(${scale})` }}
      >
        {picture.isPlaceholder ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[var(--evergreen)]/10 text-[var(--evergreen-60)] text-sm">
            <ImageOff className="w-6 h-6" />
            <span className="px-3 text-center text-xs">{t('media.placeholderFile')}</span>
            <button
              type="button"
              onClick={() => relinkInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-full bg-[var(--trail-orange)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--trail-orange)]/80"
            >
              <Link2 className="w-3.5 h-3.5" />
              {t('media.relinkFile')}
            </button>
            <input
              ref={relinkInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) relinkPictureFile(picture.id, file);
              }}
            />
          </div>
        ) : imageSrc ? (
          <>
            <img
              src={imageSrc}
              alt={picture.title || t('media.trailPictureAlt')}
              className="absolute inset-1 w-[calc(100%-0.5rem)] h-[calc(100%-0.5rem)] rounded-lg object-cover"
              onError={() => {
                if (picture.displayFile && imageSrc === picture.url) {
                  fallbackImageUrlRef.current = URL.createObjectURL(picture.displayFile);
                  setImageSrc(fallbackImageUrlRef.current);
                  return;
                }
                setImageSrc('');
              }}
            />
            {picture.description?.trim() && (
              <div className="absolute inset-x-1 bottom-1 rounded-b-lg bg-gradient-to-t from-black/75 via-black/40 to-transparent px-5 pb-4 pt-12 sm:px-7 sm:pb-6 sm:pt-16 pointer-events-none">
                <p className="mx-auto max-w-3xl text-center text-sm font-medium leading-relaxed text-white drop-shadow-md sm:text-base [text-wrap:pretty] line-clamp-2">
                  {picture.description.trim()}
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--evergreen)]/10 text-[var(--evergreen-60)] text-sm">
            {t('media.imageUnavailable')}
          </div>
        )}

      </div>
    </div>
  );
}
