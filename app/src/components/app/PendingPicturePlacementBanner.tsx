import { MapPin } from 'lucide-react';
import type { PendingPicturePlacement } from '@/types';
import { useI18n } from '@/i18n/useI18n';

interface PendingPicturePlacementBannerProps {
  pendingPlacement: PendingPicturePlacement;
  totalPendingPlacements: number;
  onCancelAll: () => void;
  onSkip: () => void;
  onUseTimestamp?: () => void;
}

export function PendingPicturePlacementBanner({
  pendingPlacement,
  totalPendingPlacements,
  onCancelAll,
  onSkip,
  onUseTimestamp,
}: PendingPicturePlacementBannerProps) {
  const { t } = useI18n();
  // A clip and a photo are placed by the same click, but the copy has to say
  // which one is waiting — and a <video> cannot be previewed with an <img>.
  const isVideo = pendingPlacement.mediaKind === 'video';
  const suffix = isVideo ? 'Video' : '';
  const hintKey = {
    'missing-gps': `media.manualPlacementHintMissingGps${suffix}`,
    'route-mismatch': `media.manualPlacementHintRouteMismatch${suffix}`,
    'no-timed-route': `media.manualPlacementHintNoTimedRoute${suffix}`,
    'timestamp-out-of-range': `media.manualPlacementHintTimestampOutOfRange${suffix}`,
  }[pendingPlacement.placementReason];

  return (
    <div className="absolute right-4 top-4 z-40 w-[min(24rem,calc(100%-2rem))] rounded-2xl border border-[var(--evergreen)]/15 bg-[var(--canvas)]/95 p-3 shadow-xl backdrop-blur">
      <div className="flex items-start gap-3">
        {isVideo ? (
          <video
            src={pendingPlacement.url}
            className="h-16 w-16 flex-shrink-0 rounded-xl border border-[var(--evergreen)]/10 object-cover"
            muted
            playsInline
            preload="metadata"
          />
        ) : (
          <img
            src={pendingPlacement.url}
            alt={pendingPlacement.file.name}
            className="h-16 w-16 flex-shrink-0 rounded-xl border border-[var(--evergreen)]/10 object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2 text-[var(--trail-orange)]">
            <MapPin className="h-4 w-4" />
            <p className="text-sm font-semibold text-[var(--evergreen)]">
              {t(isVideo ? 'media.manualPlacementTitleVideo' : 'media.manualPlacementTitle')}
            </p>
          </div>
          <p className="text-xs leading-relaxed text-[var(--evergreen-60)]">
            {t(hintKey)}
          </p>
          <p className="mt-1 truncate text-[11px] text-[var(--evergreen-60)]">
            {pendingPlacement.file.name}
          </p>
          <div className="mt-2 grid gap-1 text-[11px] text-[var(--evergreen-60)]">
            <p>
              {t('media.manualPlacementMetadataGps', {
                status: pendingPlacement.hasGpsMetadata
                  ? t('media.manualPlacementMetadataFound')
                  : t('media.manualPlacementMetadataMissing'),
              })}
            </p>
            <p>
              {t('media.manualPlacementMetadataTimestamp', {
                status: pendingPlacement.hasTimestampMetadata
                  ? t('media.manualPlacementMetadataFound')
                  : t('media.manualPlacementMetadataMissing'),
              })}
            </p>
          </div>
          {pendingPlacement.mismatchDistanceMeters !== undefined && (
            <p className="mt-1 text-[11px] font-medium text-[var(--trail-orange)]">
              {t('media.manualPlacementDistance', {
                distance: Math.round(pendingPlacement.mismatchDistanceMeters),
              })}
            </p>
          )}
          <p className="mt-2 text-[11px] uppercase tracking-[0.08em] text-[var(--evergreen-60)]">
            {t(isVideo ? 'media.manualPlacementCountVideo' : 'media.manualPlacementCount', {
              current: 1,
              total: totalPendingPlacements,
            })}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        {pendingPlacement.timestampAlternative && onUseTimestamp && (
          <button
            onClick={onUseTimestamp}
            className="rounded-lg border border-[var(--trail-orange)]/20 px-3 py-1.5 text-xs font-medium text-[var(--trail-orange)] hover:bg-[var(--trail-orange)]/5"
          >
            {t('media.manualPlacementUseTimestamp')}
          </button>
        )}
        <button
          onClick={onSkip}
          className="rounded-lg border border-[var(--evergreen)]/15 px-3 py-1.5 text-xs font-medium text-[var(--evergreen)] hover:bg-[var(--evergreen)]/5"
        >
          {t(isVideo ? 'media.manualPlacementSkipVideo' : 'media.manualPlacementSkip')}
        </button>
        <button
          onClick={onCancelAll}
          className="rounded-lg bg-[var(--evergreen)] px-3 py-1.5 text-xs font-medium text-[var(--canvas)] hover:bg-[var(--evergreen)]/90"
        >
          {t('media.manualPlacementCancelAll')}
        </button>
      </div>
    </div>
  );
}
