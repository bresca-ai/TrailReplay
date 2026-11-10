import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useI18n } from '@/i18n/useI18n';
import { useMediaPlacement } from '@/hooks/useMediaPlacement';
import { PENDING_MEDIA_DRAG_TYPE, placePendingMedia, placementAtProgress } from '@/utils/pendingMediaPlacement';

export function PendingPicturePlacementBanner() {
  const { t } = useI18n();
  const pending = useAppStore((state) => state.pendingPicturePlacements);
  const selected = useAppStore((state) => state.selectedPendingMediaIds);
  const setSelected = useAppStore((state) => state.setSelectedPendingMediaIds);
  const remove = useAppStore((state) => state.removePendingPicturePlacement);
  const mapActive = useAppStore((state) => state.pendingMediaMapPlacementActive);
  const setMapActive = useAppStore((state) => state.setPendingMediaMapPlacementActive);
  const progress = useAppStore((state) => state.playback.progress);
  const { findPositionOnRoute } = useMediaPlacement();
  const [coordinates, setCoordinates] = useState('');
  const [error, setError] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const selectedSet = new Set(selected);
  const applyCoordinates = () => {
    const parts = coordinates.trim().split(/\s*,\s*/);
    const lat = Number(parts[0]);
    const lon = Number(parts[1]);
    if (parts.length !== 2 || !parts[0] || !parts[1] || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      setError(t('media.bulkInvalidCoordinates')); return;
    }
    const placement = findPositionOnRoute(lat, lon);
    if (!placement) { setError(t('media.manualPlacementNoRoute')); return; }
    placePendingMedia(selected, placement);
    setMapActive(false);
    setError('');
  };
  const applyPlayhead = () => {
    const placement = placementAtProgress(progress);
    if (!placement) { setError(t('media.bulkNoTimelinePosition')); return; }
    placePendingMedia(selected, placement);
    setMapActive(false);
    setError('');
  };
  const button = 'rounded-lg border border-[var(--evergreen)]/20 px-2 py-1.5 text-xs font-medium text-[var(--evergreen)] hover:bg-[var(--evergreen)]/5 disabled:opacity-40';
  return (
    <section aria-label={t('media.bulkTitle')} className="absolute right-4 top-4 z-40 w-[min(25rem,calc(100%-2rem))] rounded-2xl border border-[var(--evergreen)]/15 bg-[var(--canvas)]/95 p-3 shadow-xl backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--evergreen)]">{t('media.bulkTitle')} ({pending.length})</h2>
        <button className={button} onClick={() => setCollapsed(!collapsed)}>{t(collapsed ? 'media.bulkShow' : 'media.bulkHide')}</button>
      </div>
      {!collapsed && <>
        <p className="mt-1 text-xs text-[var(--evergreen-60)]">{t('media.bulkHint')}</p>
        <label className="mt-2 flex items-center gap-2 text-xs font-medium"><input type="checkbox" checked={pending.length > 0 && selected.length === pending.length} onChange={(event) => setSelected(event.target.checked ? pending.map((item) => item.id) : [])} />{t('media.bulkSelectAll')}</label>
        <div className="mt-2 max-h-36 overflow-y-auto rounded-lg border border-[var(--evergreen)]/10">
          {pending.map((item) => <div key={item.id} draggable={selectedSet.has(item.id)} onDragStart={(event) => { event.dataTransfer.setData(PENDING_MEDIA_DRAG_TYPE, JSON.stringify(selected)); event.dataTransfer.effectAllowed = 'copyMove'; }} className="flex items-center gap-2 border-b border-[var(--evergreen)]/10 p-2 last:border-0">
            <input aria-label={t('media.bulkSelectFile', { name: item.file.name })} type="checkbox" checked={selectedSet.has(item.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, item.id] : selected.filter((id) => id !== item.id))} />
            {item.mediaKind === 'video' ? <video src={item.url} muted preload="metadata" className="h-9 w-9 rounded object-cover" /> : <img src={item.url} alt="" className="h-9 w-9 rounded object-cover" />}
            <span className="min-w-0 flex-1 truncate text-xs">{item.file.name}</span>
            {item.timestampAlternative && <button className={button} onClick={() => placePendingMedia([item.id], item.timestampAlternative!, 'timestamp')}>{t('media.manualPlacementUseTimestamp')}</button>}
            <button className={button} aria-label={t('media.bulkRemoveFile', { name: item.file.name })} onClick={() => remove(item.id)}>×</button>
          </div>)}
        </div>
        <p className="mt-2 text-xs text-[var(--evergreen-60)]">{t('media.bulkActionsHint')}</p>
        <div className="mt-2 flex gap-2"><button className={button} disabled={!selected.length && !mapActive} onClick={() => setMapActive(!mapActive)}>{t(mapActive ? 'media.bulkCancelMap' : 'media.bulkOnMap')}</button><button className={button} disabled={!selected.length} onClick={applyPlayhead}>{t('media.bulkAtPlayhead')}</button></div>
        <form className="mt-2 flex gap-2" onSubmit={(event) => { event.preventDefault(); applyCoordinates(); }}>
          <input aria-label={t('media.bulkCoordinates')} placeholder={t('media.bulkCoordinatesPlaceholder')} value={coordinates} onChange={(event) => setCoordinates(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-[var(--evergreen)]/20 bg-transparent px-2 py-1.5 text-xs" />
          <button className={button} disabled={!selected.length} type="submit">{t('media.bulkPlace')}</button>
        </form>
        {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
      </>}
    </section>
  );
}
