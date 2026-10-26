import { useMemo } from 'react';
import { ArrowLeft, GitCompareArrows, Plus, Ungroup } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useI18n } from '@/i18n/useI18n';
import { renderActivityIcon } from '@/utils/activityIcons';
import { formatDistance } from '@/utils/units';
import { getComparisonAvailability } from '@/utils/comparisonAvailability';

export function JourneyComparisonEditor({ onReturnToSequence }: { onReturnToSequence: () => void }) {
  const { t } = useI18n();
  const tracks = useAppStore((state) => state.tracks);
  const activeTrackId = useAppStore((state) => state.activeTrackId);
  const comparisons = useAppStore((state) => state.comparisonTracks);
  const mode = useAppStore((state) => state.comparisonMode);
  const setMode = useAppStore((state) => state.setComparisonMode);
  const slowdown = useAppStore((state) => state.comparisonSlowdown);
  const setSlowdown = useAppStore((state) => state.setComparisonSlowdown);
  const setActiveTrack = useAppStore((state) => state.setActiveTrack);
  const compare = useAppStore((state) => state.moveTrackToComparison);
  const ungroup = useAppStore((state) => state.ungroupComparisonTrack);
  const settings = useAppStore((state) => state.settings);
  const primary = tracks.find((track) => track.id === activeTrackId) ?? tracks[0];
  const candidates = tracks.filter((track) => track.id !== primary?.id);
  const hasVisibleComparison = comparisons.some((track) => track.visible);
  const availability = useMemo(() => getComparisonAvailability(primary, comparisons.filter((track) => track.visible).map((track) => track.track)), [primary, comparisons]);

  if (!primary) return <p className="text-xs text-[var(--evergreen-60)]">{t('journey.emptySubtitle')}</p>;

  return (
    <section className="space-y-4" aria-label={t('journey.editor.comparisonRoutes')}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold text-[var(--evergreen)]">{t('journey.editor.comparisonRoutes')}</h3>
        <span className="text-[10px] text-[var(--evergreen-60)]">{comparisons.length + 1} {t('sidebar.tabs.tracks').toLowerCase()}</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--evergreen)]/15 bg-white/30">
        <div className="flex items-center gap-2.5 p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${primary.color}18` }}>
            {renderActivityIcon(primary.activityIcon, { size: 25, color: primary.color })}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-[var(--evergreen)]" title={primary.name}>{primary.name}</p>
            <span className="text-[10px] text-[var(--evergreen-60)]">{formatDistance(primary.totalDistance, settings.unitSystem)}</span>
          </div>
          <span className="rounded bg-[var(--trail-orange-15)] px-1.5 py-1 text-[9px] font-bold text-[var(--trail-orange)]">{t('journey.editor.primary')}</span>
        </div>
        {comparisons.map((comparison) => (
          <div key={comparison.id} className="flex items-center gap-2.5 border-t border-[var(--evergreen)]/10 p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${comparison.color}18` }}>
              {renderActivityIcon(comparison.track.activityIcon, { size: 25, color: comparison.color })}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-[var(--evergreen)]" title={comparison.name}>{comparison.name}</p>
              <span className="text-[10px] text-[var(--evergreen-60)]">{formatDistance(comparison.track.totalDistance, settings.unitSystem)} · {t('journey.fullJourney')}</span>
            </div>
            <button type="button" onClick={() => ungroup(comparison.id)} title={t('tracks.ungroupTooltip')} aria-label={`${t('journey.editor.separate')}: ${comparison.name}`}
              className="rounded-md border border-[var(--evergreen)]/15 p-2 text-[var(--evergreen-60)] hover:bg-[var(--evergreen)]/5">
              <Ungroup className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {candidates.length > 0 && (
        <div className="space-y-2 rounded-xl border border-dashed border-[var(--trail-orange)]/40 bg-[var(--trail-orange-15)]/30 p-3">
          <p className="text-[11px] leading-relaxed text-[var(--evergreen-70)]">{t('journey.editor.compareLoadedHint')}</p>
          {comparisons.length === 0 && tracks.length > 1 && (
            <label className="block text-[10px] text-[var(--evergreen-60)]">
              {t('journey.editor.primary')}
              <select value={primary.id} onChange={(event) => setActiveTrack(event.target.value)} className="mt-1 w-full rounded-md border border-[var(--evergreen)]/15 bg-[var(--canvas)] px-2 py-2 text-xs text-[var(--evergreen)]">
                {tracks.map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}
              </select>
            </label>
          )}
          {candidates.map((track) => (
            <button key={track.id} type="button" onClick={() => compare(track.id, primary.id)} aria-label={`${t('journey.editor.compare')}: ${track.name}`}
              className="flex w-full items-center gap-2 rounded-lg border border-[var(--evergreen)]/15 bg-[var(--canvas)] px-2 py-2.5 text-left hover:border-[var(--trail-orange)]">
              {renderActivityIcon(track.activityIcon, { size: 22, color: track.color })}
              <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-[var(--evergreen)]" title={track.name}>{track.name}</span>
              <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold text-[var(--trail-orange)]"><Plus className="h-3 w-3" />{t('journey.editor.compare')}</span>
            </button>
          ))}
        </div>
      )}
      {comparisons.length === 0 && candidates.length === 0 && <p className="text-xs text-[var(--evergreen-60)]">{t('journey.editor.needTwoRoutes')}</p>}

      <div>
        <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-[var(--evergreen)]"><GitCompareArrows className="h-3.5 w-3.5" />{t('journey.editor.comparisonType')}</h4>
        <div className="flex rounded-lg border border-[var(--evergreen)]/20 p-1">
          {(['time', 'route'] as const).map((value) => <button key={value} type="button" onClick={() => setMode(value)} aria-pressed={mode === value}
            aria-disabled={hasVisibleComparison && !availability[value]}
            className={`flex-1 rounded-md px-2 py-2 text-xs font-semibold transition-colors ${mode === value ? 'bg-[var(--evergreen)] text-[var(--canvas)]' : 'text-[var(--evergreen-60)] hover:bg-[var(--evergreen)]/5'} ${hasVisibleComparison && !availability[value] ? 'opacity-45' : ''}`}>
            {t(value === 'time' ? 'journey.editor.time' : 'journey.editor.route')}
          </button>)}
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-[var(--evergreen-60)]">{t(mode === 'time' ? 'tracks.compareTimeHint' : 'tracks.compareRouteHint')}</p>
        {availability.timeIssue && <p role="alert" className="mt-2 rounded-lg bg-[var(--trail-orange-15)] px-3 py-2 text-[10px] leading-relaxed text-[var(--evergreen-80)]">{t('journey.editor.missingTiming')}</p>}
        {availability.routeIssue && <p role="alert" className="mt-2 rounded-lg bg-[var(--trail-orange-15)] px-3 py-2 text-[10px] leading-relaxed text-[var(--evergreen-80)]">{t('journey.editor.noSharedRoute')}</p>}
        {mode === 'route' && availability.route && <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-500/5 px-3 py-2 text-[10px] text-[var(--evergreen-70)]"><span className="h-2 w-5 rounded-full bg-red-500" />{t('journey.editor.divergenceLegend')}</div>}
        {mode === 'route' && availability.route && <div className="mt-4 rounded-xl border border-[var(--evergreen)]/15 p-3">
          <label htmlFor="comparison-slowdown" className="text-[11px] font-semibold text-[var(--evergreen)]">{t('journey.editor.slowdown')}</label>
          <select id="comparison-slowdown" value={slowdown} onChange={(event) => setSlowdown(Number(event.target.value))}
            className="mt-2 w-full rounded-lg border border-[var(--evergreen)]/20 bg-[var(--canvas)] px-2 py-2 text-xs text-[var(--evergreen)]">
            <option value={1}>{t('journey.editor.slowdownOff')}</option>
            <option value={0.5}>{t('journey.editor.slowdownGentle')}</option>
            <option value={0.25}>{t('journey.editor.slowdownMedium')}</option>
            <option value={0.1}>{t('journey.editor.slowdownStrong')}</option>
          </select>
          <p className="mt-2 text-[10px] leading-relaxed text-[var(--evergreen-60)]">{t('journey.editor.slowdownHint')}</p>
        </div>}
      </div>

      {comparisons.length > 0 && <button type="button" onClick={() => {
        comparisons.forEach((track) => ungroup(track.id));
        onReturnToSequence();
      }} className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--evergreen)]/20 px-3 py-2 text-[11px] font-semibold text-[var(--evergreen)] hover:bg-[var(--evergreen)]/5">
        <ArrowLeft className="h-3.5 w-3.5" />{t('journey.editor.returnToSequence')}
      </button>}
    </section>
  );
}
