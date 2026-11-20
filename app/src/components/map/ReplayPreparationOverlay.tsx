import { useI18n } from '@/i18n/useI18n';

interface ReplayPreparationOverlayProps {
  terrainLoading: boolean;
  boundariesLoading: boolean;
  onStartNow: () => void;
}

export function ReplayPreparationOverlay({ terrainLoading, boundariesLoading, onStartNow }: ReplayPreparationOverlayProps) {
  const { t } = useI18n();
  const detail = terrainLoading && boundariesLoading
    ? t('map.preparingTerrainAndPlaces')
    : terrainLoading
      ? t('map.preparingTerrain')
      : boundariesLoading
        ? t('map.preparingPlaces')
        : t('map.preparingTiles');

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-[rgba(9,14,19,0.55)] px-4 backdrop-blur-[1px]">
      <div className="w-full max-w-sm rounded-2xl border border-white/12 bg-[rgba(9,14,19,0.92)] p-5 text-white shadow-[0_16px_36px_rgba(0,0,0,0.28)]">
        <div className="flex items-center gap-3" role="status" aria-live="polite">
          <div aria-hidden="true" className="h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-[var(--trail-orange)] border-t-transparent" />
          <div>
            <p className="font-semibold">{t('map.preparingReplay')}</p>
            <p className="mt-1 text-sm text-white/75">{detail}</p>
          </div>
        </div>
        <button type="button" onClick={onStartNow} className="mt-5 w-full rounded-lg bg-[var(--trail-orange)] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
          {t('map.startReplayNow')}
        </button>
        <p className="mt-2 text-center text-xs leading-relaxed text-white/65">{t('map.startReplayNowHint')}</p>
      </div>
    </div>
  );
}
