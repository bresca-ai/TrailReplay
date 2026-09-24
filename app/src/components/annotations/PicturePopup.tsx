import { useCallback, useEffect, useRef, useState } from 'react';
import type { PictureAnnotation } from '@/types';
import { useAppStore } from '@/store/useAppStore';
import { useI18n } from '@/i18n/useI18n';
import {
  getPicturePopupLayout,
  type PicturePopupExportFrame,
} from '@/utils/picturePopup';
import { MapPin, Calendar, ImageOff, Link2 } from 'lucide-react';

interface PicturePopupProps {
  picture: PictureAnnotation;
  onClose?: () => void;
  exportFrame?: PicturePopupExportFrame | null;
  playbackCurrentTime?: number;
}

// How long the "fake zoom" grows in / shrinks out. Kept shorter than
// `displayDuration` so there's always a visible held-still window in between.
const ZOOM_ENTER_MS = 450;
const ZOOM_EXIT_MS = 350;
const ZOOM_ENTER_SCALE = 0.15;
const ZOOM_EXIT_SCALE = 0.85;

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

function easeInCubic(t: number) {
  return t ** 3;
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
function getZoomStyle(elapsed: number, displayDuration: number): { opacity: number; scale: number } {
  const clamped = Math.max(0, elapsed);
  if (clamped < ZOOM_ENTER_MS) {
    const t = easeOutCubic(Math.min(1, clamped / ZOOM_ENTER_MS));
    return { opacity: t, scale: ZOOM_ENTER_SCALE + (1 - ZOOM_ENTER_SCALE) * t };
  }
  const exitStart = displayDuration - ZOOM_EXIT_MS;
  if (clamped > exitStart) {
    const t = easeInCubic(Math.min(1, (clamped - exitStart) / ZOOM_EXIT_MS));
    return { opacity: 1 - t, scale: 1 - (1 - ZOOM_EXIT_SCALE) * t };
  }
  return { opacity: 1, scale: 1 };
}

export function PicturePopup({ picture, onClose, exportFrame, playbackCurrentTime }: PicturePopupProps) {
  const { t } = useI18n();
  const relinkPictureFile = useAppStore((state) => state.relinkPictureFile);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [displayProgress, setDisplayProgress] = useState(0);
  const [imageSrc, setImageSrc] = useState(picture.url);
  const progressIntervalRef = useRef<number | null>(null);
  const fallbackImageUrlRef = useRef<string | null>(null);
  const playbackPopupStartTimeRef = useRef<number | null>(null);
  const hasClosedRef = useRef(false);
  const relinkInputRef = useRef<HTMLInputElement>(null);

  const displayDuration = picture.displayDuration || 3000;
  const { imageBoxWidth, imageBoxHeight, isExportSafe, popupStyle } = getPicturePopupLayout(exportFrame);

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
      const progress = Math.min((elapsed / displayDuration) * 100, 100);
      setDisplayProgress(progress);
      setElapsedMs(elapsed);

      if (elapsed >= displayDuration) {
        requestClose();
      }
    }, 30);

    return () => {
      clearProgressInterval();
      if (fallbackImageUrlRef.current !== null) {
        URL.revokeObjectURL(fallbackImageUrlRef.current);
      }
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
    const progress = Math.min((elapsed / displayDuration) * 100, 100);
    setDisplayProgress(progress);
    setElapsedMs(elapsed);

    if (elapsed >= displayDuration) {
      requestClose();
    }
  }, [displayDuration, playbackCurrentTime, requestClose]);

  const { opacity, scale } = getZoomStyle(elapsedMs, displayDuration);

  return (
    <div className="absolute z-[200]" style={{ ...popupStyle, width: imageBoxWidth, height: imageBoxHeight }}>
      {/* Near-fullscreen box: fills the sized wrapper above, rounded,
          overflow-hidden. object-contain keeps the whole photo visible
          (never cropped) regardless of its aspect ratio vs. the box's — any
          letterbox gap is transparent, showing the map behind it, rather
          than a solid fill. This box also carries the "fake zoom"
          scale/opacity, driven directly from elapsed time (see
          `getZoomStyle`) rather than a CSS transition.
          Note: the size lives on the *outer* wrapper (whose percentage
          values resolve against the map container, a definite-size
          ancestor) rather than here — an absolutely-positioned box with no
          explicit size shrink-wraps its content, and shrink-to-fit sizing
          treats percentage-width children as 0, which collapsed the photo
          to nothing. */}
      <div
        // No box-shadow here: html2canvas approximates box-shadow by
        // painting a filled shape behind the element, and since this box
        // has no background of its own (transparent, letterboxed), that
        // shadow fill was bleeding through as a solid black patch in the
        // exported video's letterbox gaps.
        className="tr-picture-popup relative w-full h-full overflow-hidden rounded-xl origin-bottom"
        style={{ opacity, transform: `scale(${scale})` }}
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
          <img
            src={imageSrc}
            alt={picture.title || t('media.trailPictureAlt')}
            className="absolute inset-0 w-full h-full object-contain"
            onError={() => {
              if (picture.displayFile && imageSrc === picture.url) {
                fallbackImageUrlRef.current = URL.createObjectURL(picture.displayFile);
                setImageSrc(fallbackImageUrlRef.current);
                return;
              }
              setImageSrc('');
            }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--evergreen)]/10 text-[var(--evergreen-60)] text-sm">
            {t('media.imageUnavailable')}
          </div>
        )}

        {/* Progress Bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-black/20 z-10">
          <div
            className="h-full bg-[var(--trail-orange)] transition-all duration-50"
            style={{ width: `${displayProgress}%` }}
          />
        </div>

        {/* Caption + metadata overlay */}
        {(picture.title || picture.description || (picture.lat !== undefined && picture.lon !== undefined) || picture.timestamp) && (
          <div className="absolute bottom-0 left-0 right-0 px-4 pt-10 pb-3 bg-gradient-to-t from-black/75 to-transparent">
            {picture.title && (
              <p className={`font-medium text-white ${isExportSafe ? 'text-xs' : 'text-base'}`}>{picture.title}</p>
            )}
            {picture.description && (
              <p className={`text-white/85 mt-0.5 ${isExportSafe ? 'text-[11px]' : 'text-sm'}`}>{picture.description}</p>
            )}
            {(picture.lat !== undefined && picture.lon !== undefined || picture.timestamp) && (
              <div className={`flex items-center gap-3 text-white/70 mt-1.5 ${isExportSafe ? 'text-[10px]' : 'text-xs'}`}>
                {picture.lat !== undefined && picture.lon !== undefined && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {picture.lat.toFixed(4)}, {picture.lon.toFixed(4)}
                  </span>
                )}
                {picture.timestamp && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {picture.timestamp.toLocaleDateString()}
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
