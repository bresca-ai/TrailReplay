import { useEffect, useMemo, useRef } from 'react';
import { useI18n } from '@/i18n/useI18n';
import { useAppStore } from '@/store/useAppStore';
import { buildComputedJourney } from '@/utils/journeyUtils';
import { importWaypoints, type WaypointPresentation } from '@/utils/gpx/importWaypoints';
import { useWaypointImportQueue } from '@/utils/gpx/waypointImportQueue';

export function WaypointImportDialog() {
  const { t } = useI18n();
  const batch = useWaypointImportQueue((state) => state.batches[0]);
  const dismiss = useWaypointImportQueue((state) => state.dismiss);
  const tracks = useAppStore((state) => state.tracks);
  const segments = useAppStore((state) => state.journeySegments);
  const timingMode = useAppStore((state) => state.playback.routeTimingMode);
  const dialog = useRef<HTMLDialogElement>(null);
  const candidates = useMemo(() => batch
    ? importWaypoints(batch.tracks, tracks, buildComputedJourney(segments, tracks), 'map-card', timingMode, new Map(batch.groups))
    : [], [batch, tracks, segments, timingMode]);

  useEffect(() => {
    const element = dialog.current;
    if (!element || !batch) return;
    element.showModal();
    return () => element.close();
  }, [batch]);

  if (!batch) return null;

  const choose = (presentation?: WaypointPresentation) => {
    if (presentation) {
      const state = useAppStore.getState();
      const journey = buildComputedJourney(state.journeySegments, state.tracks);
      importWaypoints(batch.tracks, state.tracks, journey, presentation, state.playback.routeTimingMode, new Map(batch.groups))
        .forEach(state.addTextAnnotation);
    }
    dismiss();
  };

  return (
    <dialog ref={dialog} aria-labelledby="waypoint-import-title" aria-describedby="waypoint-import-description"
      onCancel={(event) => event.preventDefault()}
      className="m-auto w-[min(90vw,30rem)] rounded-2xl border-2 border-[var(--evergreen)] bg-[var(--canvas)] p-6 text-[var(--evergreen)] shadow-xl backdrop:bg-black/50">
      <h2 id="waypoint-import-title" className="text-xl font-bold">{t('annotations.waypointImportTitle')}</h2>
      <p id="waypoint-import-description" className="mt-2 text-sm text-[var(--evergreen-60)]">{t('annotations.waypointImportDescription', { count: candidates.length })}</p>
      <div className="mt-5 grid gap-2">
        <button type="button" autoFocus onClick={() => choose('map-card')} className="rounded-lg border border-[var(--evergreen)]/30 px-4 py-3 text-left hover:bg-[var(--evergreen)]/10 focus-visible:outline-2">
          <span className="block font-bold">{t('annotations.presentationMapCard')}</span>
          <span className="block text-sm text-[var(--evergreen-60)]">{t('annotations.mapCaptionExplanation')}</span>
        </button>
        <button type="button" onClick={() => choose('side-panel')} className="rounded-lg border border-[var(--evergreen)]/30 px-4 py-3 text-left hover:bg-[var(--evergreen)]/10 focus-visible:outline-2">
          <span className="block font-bold">{t('annotations.presentationSidePanel')}</span>
          <span className="block text-sm text-[var(--evergreen-60)]">{t('annotations.fieldNoteExplanation')}</span>
        </button>
        <button type="button" onClick={() => choose()} className="mt-2 rounded-lg px-4 py-2 text-sm underline hover:bg-[var(--evergreen)]/10 focus-visible:outline-2">{t('annotations.waypointImportDiscard')}</button>
      </div>
    </dialog>
  );
}
