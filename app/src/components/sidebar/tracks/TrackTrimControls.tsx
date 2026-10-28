import { useEffect, useMemo, type KeyboardEvent } from 'react';
import { Download, RotateCcw, Scissors } from 'lucide-react';
import type { GPXTrack, UnitSystem } from '@/types';
import { useAppStore } from '@/store/useAppStore';
import { hasTrackTrimDependencies } from '@/store/slices/trackTrimSlice';
import { useI18n } from '@/i18n/useI18n';
import { Slider } from '@/components/ui/slider';
import { buildTrackTrimAxis, trackTrimRangeForValues, trimTrack, type TrackTrimRange } from '@/utils/gpx/trimTrack';
import { downloadTrimmedTrack } from '@/utils/gpx/downloadTrack';
import { formatDistance, formatDuration } from '@/utils/units';

interface Props {
  track: GPXTrack;
  unitSystem: UnitSystem;
}

export function TrackTrimControls({ track, unitSystem }: Props) {
  const { t } = useI18n();
  const range = useAppStore((state) => state.trackTrimPreview);
  const setPreview = useAppStore((state) => state.setTrackTrimPreview);
  const restore = useAppStore((state) => state.restoreTrackTrim);
  const setActiveTrack = useAppStore((state) => state.setActiveTrack);
  const hasOriginal = useAppStore((state) => Boolean(state.trackTrimOriginals[track.id]));
  const isExporting = useAppStore((state) => state.isExporting);
  const hasDependencies = useAppStore(hasTrackTrimDependencies);
  const isOpen = range?.trackId === track.id;

  // The sidebar is lazy-mounted. Leaving it must also remove the map preview.
  useEffect(() => () => {
    if (useAppStore.getState().trackTrimPreview?.trackId === track.id) setPreview(null);
  }, [track.id, setPreview]);

  return (
    <div className="border-t border-[var(--evergreen)]/10 px-3 py-2 cursor-default">
      <div className={`grid gap-2 ${hasOriginal ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <button
          type="button"
          className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border border-[var(--evergreen)]/20 px-2 py-1.5 text-xs font-semibold text-[var(--evergreen)] transition-colors hover:border-[var(--trail-orange)]/60 hover:bg-[var(--trail-orange-15)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trail-orange)] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isExporting || track.points.length < 2}
          aria-expanded={isOpen}
          onClick={() => {
            if (isOpen) setPreview(null);
            else {
              setActiveTrack(track.id);
              setPreview({ trackId: track.id, startIndex: 0, endIndex: track.points.length - 1 });
            }
          }}
        >
          <Scissors className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{t('trackTrim.title')}
        </button>
        {hasOriginal && (
          <button
            type="button"
            className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border border-[var(--evergreen)]/20 px-2 py-1.5 text-xs font-semibold text-[var(--evergreen)] transition-colors hover:border-[var(--trail-orange)]/60 hover:bg-[var(--trail-orange-15)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trail-orange)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isExporting || hasDependencies}
            title={t(hasDependencies ? 'trackTrim.dependencies' : 'trackTrim.restoreHint')}
            onClick={() => restore(track.id)}
          >
            <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{t('trackTrim.restore')}
          </button>
        )}
      </div>
      {isOpen && <TrackTrimEditor track={track} range={range} unitSystem={unitSystem} />}
    </div>
  );
}

function TrackTrimEditor({ track, range, unitSystem }: Props & { range: TrackTrimRange }) {
  const { t, language } = useI18n();
  const setPreview = useAppStore((state) => state.setTrackTrimPreview);
  const apply = useAppStore((state) => state.applyTrackTrim);
  const hasDependencies = useAppStore(hasTrackTrimDependencies);
  const isExporting = useAppStore((state) => state.isExporting);
  const axis = useMemo(() => buildTrackTrimAxis(track), [track]);
  const { startIndex, endIndex } = range;
  const fullRange = startIndex === 0 && endIndex === track.points.length - 1;
  const start = track.points[startIndex];
  const end = track.points[endIndex];
  const distance = end.distance - start.distance;
  const label = (index: number) => axis.mode === 'time'
    ? new Intl.DateTimeFormat(language, { dateStyle: 'short', timeStyle: 'medium' }).format(track.points[index].time!)
    : axis.mode === 'distance'
      ? formatDistance(axis.values[index], unitSystem)
      : t('trackTrim.point', { count: index + 1 });

  // Slider keyboard steps follow actual recorded points, including duplicate
  // timestamps/stationary points that share the same position on the axis.
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.getAttribute('role') !== 'slider') return;
    const isStart = target.getAttribute('aria-label') === t('trackTrim.start');
    const current = isStart ? startIndex : endIndex;
    const low = isStart ? 0 : startIndex + 1;
    const high = isStart ? endIndex - 1 : track.points.length - 1;
    const page = Math.max(1, Math.floor(track.points.length / 10));
    const next = ({
      ArrowRight: current + 1, ArrowUp: current + 1,
      ArrowLeft: current - 1, ArrowDown: current - 1,
      PageUp: current + page, PageDown: current - page, Home: low, End: high,
    } as Record<string, number>)[event.key];
    if (next === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    const index = Math.max(low, Math.min(high, next));
    setPreview({ ...range, ...(isStart ? { startIndex: index } : { endIndex: index }) });
  };

  return (
    <section className="mt-3 space-y-3 text-xs text-[var(--evergreen)]" aria-label={t('trackTrim.title')}>
      <p className="text-[var(--evergreen-60)]">{t(`trackTrim.${axis.mode}Hint`)}</p>
      <div className="space-y-1.5 tabular-nums">
        <div className="flex justify-between gap-2"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-600" />{t('trackTrim.start')}</span><span>{label(startIndex)}</span></div>
        <div className="flex justify-between gap-2"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-600" />{t('trackTrim.end')}</span><span>{label(endIndex)}</span></div>
      </div>
      <div onKeyDownCapture={handleKeyDown}>
        <Slider
          value={[axis.values[startIndex], axis.values[endIndex]]}
          max={axis.max}
          step={axis.mode === 'points' ? 1 : 0.001}
          thumbLabels={[t('trackTrim.start'), t('trackTrim.end')]}
          disabled={isExporting}
          onValueChange={([from, to]) => {
            const [startIndex, endIndex] = trackTrimRangeForValues(axis, from, to);
            setPreview({ trackId: track.id, startIndex, endIndex });
          }}
          className="min-h-10 [&_[data-slot=slider-thumb]]:size-6"
        />
      </div>
      <p className="font-medium tabular-nums" role="status">
        {t('trackTrim.selection', { distance: formatDistance(distance, unitSystem), count: endIndex - startIndex + 1 })}
        {axis.mode === 'time' && ` · ${formatDuration((end.time!.getTime() - start.time!.getTime()) / 1000)}`}
      </p>
      <p className="text-[var(--evergreen-60)]">{t('trackTrim.snapHint')}</p>
      {hasDependencies && <p className="rounded-md bg-amber-50 p-2 text-amber-900">{t('trackTrim.dependencies')}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="tr-btn tr-btn-primary text-xs disabled:opacity-50" disabled={fullRange || hasDependencies || isExporting} onClick={() => apply(track.id, startIndex, endIndex)}>{t('trackTrim.apply')}</button>
        <button type="button" className="tr-btn tr-btn-secondary gap-1.5 text-xs disabled:opacity-50" disabled={isExporting} onClick={() => downloadTrimmedTrack(trimTrack(track, startIndex, endIndex))}><Download className="h-3.5 w-3.5" />{t('trackTrim.download')}</button>
        <button type="button" className="tr-btn tr-btn-secondary text-xs" onClick={() => setPreview(null)}>{t('trackTrim.cancel')}</button>
      </div>
      <p className="text-[10px] text-[var(--evergreen-60)]">{t('trackTrim.restoreHint')}</p>
    </section>
  );
}
