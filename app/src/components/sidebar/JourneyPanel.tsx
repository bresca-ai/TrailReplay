import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import type { TransportMode } from '@/types';
import { formatDistance, formatDuration } from '@/utils/units';
import { useI18n } from '@/i18n/useI18n';
import { createId } from '@/utils/id';
import { TrackSegmentItem, TransportSegmentItem } from './journey/JourneySegmentItems';
import { TRANSPORT_MODES, renderJourneyTransportIcon } from './journey/journeyTransport';
import { createTransportSegment } from './journey/createTransportSegment';
import { trackEvent } from '@/utils/analytics';
import { JourneyComparisonEditor } from './journey/JourneyComparisonEditor';
import { renderActivityIcon } from '@/utils/activityIcons';
import {
  Plus,
  Clock,
  ChevronDown,
  ArrowRight,
  Library,
  Route,
  GitCompareArrows,
} from 'lucide-react';

const DEFAULT_TRACK_SEGMENT_DURATION_MS = 30_000;
const VIDEO_DURATION_OPTIONS = [15, 30, 60, 90] as const;

export function JourneyPanel() {
  const { t } = useI18n();
  const tracks = useAppStore((state) => state.tracks);
  const journeySegments = useAppStore((state) => state.journeySegments);
  const comparisonTracks = useAppStore((state) => state.comparisonTracks);
  const addJourneySegment = useAppStore((state) => state.addJourneySegment);
  const removeJourneySegment = useAppStore((state) => state.removeJourneySegment);
  const reorderJourneySegments = useAppStore((state) => state.reorderJourneySegments);
  const updateJourneySegmentDuration = useAppStore((state) => state.updateJourneySegmentDuration);
  const clearJourney = useAppStore((state) => state.clearJourney);
  const settings = useAppStore((state) => state.settings);
  const setSettings = useAppStore((state) => state.setSettings);
  const routeTimingMode = useAppStore((state) => state.playback.routeTimingMode);
  const setRouteTimingMode = useAppStore((state) => state.setRouteTimingMode);
  const seekToProgress = useAppStore((state) => state.seekToProgress);
  
  const setActivePanel = useAppStore((state) => state.setActivePanel);
  const [editorMode, setEditorMode] = useState<'sequence' | 'compare'>(comparisonTracks.length > 0 ? 'compare' : 'sequence');
  const [showTransportMenu, setShowTransportMenu] = useState(false);
  const [selectedTransportIndex, setSelectedTransportIndex] = useState<number | null>(null);
  const [editingSegment, setEditingSegment] = useState<string | null>(null);
  // '' while the input is cleared mid-edit, so the field doesn't snap to a
  // forced minimum the instant the user deletes all the digits.
  const [customDuration, setCustomDuration] = useState<number | ''>(30);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const setVideoDuration = (seconds: number) => {
    const totalMilliseconds = seconds * 1000;
    const currentTotal = journeySegments.reduce((total, segment) => total + Math.max(segment.duration || 0, 0), 0);
    const fallbackWeight = journeySegments.length > 0 ? 1 / journeySegments.length : 0;
    let assigned = 0;

    reorderJourneySegments(journeySegments.map((segment, index) => {
      const isLast = index === journeySegments.length - 1;
      const weight = currentTotal > 0 ? (segment.duration || 0) / currentTotal : fallbackWeight;
      const duration = isLast ? totalMilliseconds - assigned : Math.round(totalMilliseconds * weight);
      assigned += duration;
      return { ...segment, duration };
    }));
  };
  
  // Calculate total journey stats
  const totalDistance = journeySegments.reduce((sum, seg) => {
    if (seg.type === 'track') {
      const track = tracks.find((t) => t.id === seg.trackId);
      return sum + (track?.totalDistance || 0);
    }
    return sum + (seg.distance || 0);
  }, 0);
  
  const totalDuration = journeySegments.reduce((sum, seg) => {
    return sum + (seg.duration || 0);
  }, 0);
  
  // Calculate progress for each segment
  const getSegmentProgress = (index: number): number => {
    let progress = 0;
    for (let i = 0; i < index; i++) {
      progress += (journeySegments[i].duration || 0) / totalDuration;
    }
    return progress;
  };
  
  const addTrackToJourney = (trackId: string) => {
    const track = tracks.find((t) => t.id === trackId);
    if (!track) return;

    addJourneySegment({
      id: createId('track-seg'),
      type: 'track',
      trackId: track.id,
      duration: DEFAULT_TRACK_SEGMENT_DURATION_MS,
    });
  };

  const addAllTracksToJourney = () => {
    tracks.forEach((track) => {
      const isInJourney = journeySegments.some(
        (segment) => segment.type === 'track' && segment.trackId === track.id
      );
      if (!isInJourney) {
        addTrackToJourney(track.id);
      }
    });
  };
  
  const addTransport = (mode: TransportMode) => {
    if (selectedTransportIndex === null) return;

    const prevSegment = journeySegments[selectedTransportIndex];
    const nextSegment = journeySegments[selectedTransportIndex + 1];

    let from = { lat: 0, lon: 0 };
    let to = { lat: 0, lon: 0 };

    if (prevSegment?.type === 'track') {
      const prevTrack = tracks.find((t) => t.id === prevSegment.trackId);
      if (prevTrack) {
        const lastPoint = prevTrack.points[prevTrack.points.length - 1];
        from = { lat: lastPoint.lat, lon: lastPoint.lon };
      }
    }

    if (nextSegment?.type === 'track') {
      const nextTrack = tracks.find((t) => t.id === nextSegment.trackId);
      if (nextTrack) {
        const firstPoint = nextTrack.points[0];
        to = { lat: firstPoint.lat, lon: firstPoint.lon };
      }
    }

    const newTransportSegment = createTransportSegment(mode, from, to);

    // Insert the transport segment at the correct position
    const newSegments = [...journeySegments];
    newSegments.splice(selectedTransportIndex + 1, 0, newTransportSegment);
    reorderJourneySegments(newSegments);
    trackEvent('transport_added', {
      transport_mode: mode,
      journey_segment_count: newSegments.length,
      journey_track_count: newSegments.filter((segment) => segment.type === 'track').length,
    });

    setShowTransportMenu(false);
    setSelectedTransportIndex(null);
  };
  
  const updateSegmentDuration = (segmentId: string, duration: number | '') => {
    const boundedDuration = Math.max(1, duration || 1);
    updateJourneySegmentDuration(segmentId, boundedDuration * 1000);
    setEditingSegment(null);
  };
  
  // Drag and drop handlers
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };
  
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    
    const newSegments = [...journeySegments];
    const draggedItem = newSegments[draggedIndex];
    newSegments.splice(draggedIndex, 1);
    newSegments.splice(index, 0, draggedItem);
    
    reorderJourneySegments(newSegments);
    setDraggedIndex(index);
  };
  
  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 rounded-xl border border-[var(--evergreen)]/15 bg-[var(--evergreen)]/5 p-1" aria-label={t('journey.editor.replayMode')}>
        {(['sequence', 'compare'] as const).map((mode) => {
          const Icon = mode === 'sequence' ? Route : GitCompareArrows;
          return <button key={mode} type="button" onClick={() => setEditorMode(mode)} aria-pressed={editorMode === mode}
            className={`flex items-center justify-center gap-2 rounded-lg px-2 py-2.5 text-xs font-semibold transition-colors ${editorMode === mode ? 'bg-[var(--trail-orange)] text-white shadow-sm' : 'text-[var(--evergreen-70)] hover:bg-white/40'}`}>
            <Icon className="h-3.5 w-3.5" />{t(mode === 'sequence' ? 'journey.editor.sequence' : 'journey.editor.compare')}
            {mode === 'compare' && comparisonTracks.length > 0 && <span className="text-[10px] opacity-70">{comparisonTracks.length + 1}</span>}
          </button>;
        })}
      </div>

      <section className="border-b border-[var(--evergreen)]/15 pb-4">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <label htmlFor="journey-total-duration" className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--evergreen)]"><Clock className="h-3.5 w-3.5" />{t('journey.editor.videoDuration')}</label>
          <div className="flex items-center gap-1.5 rounded-md border border-[var(--evergreen)]/15 bg-white/40 px-2 py-1">
            <input id="journey-total-duration" key={totalDuration} type="number" min={Math.max(1, journeySegments.length)} max="86400" defaultValue={Math.round(totalDuration / 1000)} disabled={journeySegments.length === 0}
              onBlur={(event) => { const seconds = Number(event.target.value); if (Number.isFinite(seconds) && seconds > 0) { if (seconds !== Math.round(totalDuration / 1000)) setVideoDuration(Math.max(journeySegments.length, seconds)); } else event.target.value = String(Math.round(totalDuration / 1000)); }}
              onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
              className="w-12 bg-transparent text-right text-xs font-bold tabular-nums text-[var(--evergreen)] outline-none" />
            <span className="text-[10px] text-[var(--evergreen-60)]">{t('common.secondsShort')}</span>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {VIDEO_DURATION_OPTIONS.map((seconds) => <button key={seconds} type="button" disabled={journeySegments.length === 0} onClick={() => setVideoDuration(seconds)} aria-pressed={Math.round(totalDuration / 1000) === seconds}
            className={`rounded-md border px-2 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-40 ${Math.round(totalDuration / 1000) === seconds ? 'border-[var(--trail-orange)] bg-[var(--trail-orange)] text-white' : 'border-[var(--evergreen)]/10 bg-[var(--evergreen)]/5 text-[var(--evergreen-70)] hover:border-[var(--trail-orange)]'}`}>
            {seconds} {t('common.secondsShort')}
          </button>)}
        </div>
      </section>

      {editorMode === 'compare' ? <JourneyComparisonEditor onReturnToSequence={() => setEditorMode('sequence')} /> : (
        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-[var(--evergreen)]">{t('journey.editor.sequenceRoutes')}</h3>
            <span className="text-[9px] text-[var(--evergreen-60)]">{t('journey.dragToReorder')}</span>
          </div>
          {journeySegments.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--evergreen)]/20 px-4 py-6 text-center text-[var(--evergreen-60)]">
              <Route className="mx-auto mb-2 h-6 w-6 opacity-50" />
              <p className="text-xs font-semibold">{t('journey.emptyTitle')}</p>
              <p className="mt-1 text-[10px]">{t('journey.emptySubtitle')}</p>
            </div>
          ) : <div className="space-y-2">
            {journeySegments.map((segment, index) => (
              <div key={segment.id} className={draggedIndex === index ? 'opacity-50' : ''} draggable
                onDragStart={() => handleDragStart(index)} onDragOver={(event) => handleDragOver(event, index)} onDragEnd={handleDragEnd}>
                {segment.type === 'track' ? <TrackSegmentItem segment={segment} index={index}
                  onRemove={() => removeJourneySegment(segment.id)}
                  onEditDuration={() => { setEditingSegment(segment.id); setCustomDuration((segment.duration || 30000) / 1000); }}
                  onSeek={() => seekToProgress(getSegmentProgress(index))} /> :
                  <TransportSegmentItem segment={segment} index={index}
                    onRemove={() => removeJourneySegment(segment.id)}
                    onEditDuration={() => { setEditingSegment(segment.id); setCustomDuration((segment.duration || 5000) / 1000); }}
                    onSeek={() => seekToProgress(getSegmentProgress(index))} />}
                {index < journeySegments.length - 1 && segment.type === 'track' && journeySegments[index + 1].type === 'track' && (
                  <div className="ml-6 border-l border-[var(--evergreen)]/20 py-2 pl-4">
                    <button type="button" onClick={() => { setSelectedTransportIndex(index); setShowTransportMenu(true); }}
                      className="flex items-center gap-1.5 text-[10px] font-semibold text-[var(--evergreen-60)] hover:text-[var(--trail-orange)]">
                      <Plus className="h-3.5 w-3.5 rounded-full border border-current p-0.5" />{t('journey.addTransport')}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>}
          <div className="mt-3 flex items-center justify-between gap-2">
            <button type="button" onClick={addAllTracksToJourney} className="flex items-center gap-1.5 rounded-lg border border-[var(--evergreen)]/20 px-2.5 py-2 text-[10px] font-semibold text-[var(--evergreen)] hover:bg-[var(--evergreen)]/5"><Plus className="h-3 w-3" />{t('journey.addAllTracks')}</button>
            {journeySegments.length > 0 && <button type="button" onClick={clearJourney} className="px-2 py-2 text-[10px] text-red-600 hover:underline">{t('journey.clearJourney')}</button>}
          </div>
          {comparisonTracks.length > 0 && <button type="button" onClick={() => setEditorMode('compare')} className="mt-3 flex w-full items-center gap-2 rounded-lg bg-[var(--evergreen)]/5 px-3 py-2 text-left text-[10px] text-[var(--evergreen-70)]"><GitCompareArrows className="h-3.5 w-3.5 shrink-0" /><span className="flex-1">{t('journey.runsSimultaneously')} · {comparisonTracks.length}</span><ArrowRight className="h-3 w-3" /></button>}
        </section>
      )}

      {journeySegments.length > 0 && <div className="grid grid-cols-3 divide-x divide-[var(--evergreen)]/15 border-y border-[var(--evergreen)]/15 py-3 text-center">
        <div><span className="block text-xs font-bold text-[var(--evergreen)]">{formatDistance(totalDistance, settings.unitSystem)}</span><span className="mt-1 block text-[9px] text-[var(--evergreen-60)]">{t('journey.totalDistance').replace(':', '')}</span></div>
        <div><span className="block text-xs font-bold text-[var(--evergreen)]">{formatDuration(totalDuration / 1000)}</span><span className="mt-1 block text-[9px] text-[var(--evergreen-60)]">{t('journey.editor.videoDuration')}</span></div>
        <div><span className="block text-xs font-bold text-[var(--evergreen)]">{journeySegments.length}</span><span className="mt-1 block text-[9px] text-[var(--evergreen-60)]">{t('journey.totalSegments').replace(':', '')}</span></div>
      </div>}

      <details className="group rounded-xl border border-[var(--evergreen)]/15 bg-white/20">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-3 text-[11px] font-bold text-[var(--evergreen)]"><Clock className="h-3.5 w-3.5" /><span className="flex-1">{t('journey.editor.paceAndStats')}</span><ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" /></summary>
        <div className="space-y-4 border-t border-[var(--evergreen)]/10 p-3">
          <div><h4 className="text-[10px] font-semibold uppercase tracking-wide text-[var(--evergreen-60)]">{t('journey.routeTiming')}</h4>
            <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg border border-[var(--evergreen)]/15 p-1">{(['recorded', 'uniform'] as const).map((mode) => <button key={mode} type="button" onClick={() => setRouteTimingMode(mode)} aria-pressed={routeTimingMode === mode}
              className={`rounded-md px-1 py-2 text-[10px] font-semibold ${routeTimingMode === mode ? 'bg-[var(--evergreen)] text-[var(--canvas)]' : 'text-[var(--evergreen-60)]'}`}>{t(mode === 'recorded' ? 'journey.routeTimingRecorded' : 'journey.routeTimingUniform')}</button>)}</div>
            <p className="mt-2 text-[10px] leading-relaxed text-[var(--evergreen-60)]">{t('journey.routeTimingHint')}</p>
          </div>
          <div><h4 className="text-[10px] font-semibold uppercase tracking-wide text-[var(--evergreen-60)]">{t('journey.statsMode')}</h4>
            <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg border border-[var(--evergreen)]/15 p-1">{(['cumulative', 'per-track'] as const).map((mode) => <button key={mode} type="button" onClick={() => setSettings({ journeyStatsMode: mode })} aria-pressed={settings.journeyStatsMode === mode}
              className={`rounded-md px-1 py-2 text-[10px] font-semibold ${settings.journeyStatsMode === mode ? 'bg-[var(--evergreen)] text-[var(--canvas)]' : 'text-[var(--evergreen-60)]'}`}>{t(mode === 'cumulative' ? 'journey.statsModeCumulative' : 'journey.statsModePerTrack')}</button>)}</div>
            <p className="mt-2 text-[10px] leading-relaxed text-[var(--evergreen-60)]">{t('journey.statsModeHint')}</p>
          </div>
        </div>
      </details>

      <details className="group rounded-xl border border-[var(--evergreen)]/15" open={journeySegments.length === 0 ? true : undefined}>
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-3 text-[11px] font-bold text-[var(--evergreen)]"><Library className="h-3.5 w-3.5" /><span className="flex-1">{t('journey.editor.loadedRoutes')} ({tracks.length})</span><ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" /></summary>
        <div className="space-y-1 border-t border-[var(--evergreen)]/10 p-2">
          {tracks.map((track) => {
            const isInJourney = journeySegments.some((segment) => segment.type === 'track' && segment.trackId === track.id);
            return <button key={track.id} type="button" onClick={() => addTrackToJourney(track.id)} disabled={isInJourney}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[var(--evergreen)] hover:bg-[var(--evergreen)]/5 disabled:opacity-55">
              {renderActivityIcon(track.activityIcon, { size: 23, color: track.color })}
              <span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-semibold" title={track.name}>{track.name}</span><span className="text-[9px] text-[var(--evergreen-60)]">{formatDistance(track.totalDistance, settings.unitSystem)}</span></span>
              {isInJourney ? <span className="text-[9px]">{t('journey.added')}</span> : <Plus className="h-3.5 w-3.5" />}
            </button>;
          })}
        </div>
      </details>

      <details className="text-[var(--evergreen-60)]"><summary className="cursor-pointer text-[10px]">{t('journey.quickStart')}</summary><p className="mt-2 text-[10px] leading-relaxed">{t('journey.quickStartHint')}</p><p className="mt-2 text-[10px] leading-relaxed">{t('journey.customDurationHint')}</p></details>
      <button type="button" onClick={() => setActivePanel('annotations')} className="tr-btn tr-btn-primary flex w-full items-center justify-center gap-2 text-xs">{t('workflow.next', { step: t('sidebar.tabs.annotations') })}<ArrowRight className="h-3.5 w-3.5" /></button>

      {/* Transport Mode Selector */}
      {showTransportMenu && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--canvas)] border-2 border-[var(--evergreen)] rounded-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold text-[var(--evergreen)] mb-2">
              {t('journey.selectTransportTitle')}
            </h3>
            <p className="text-sm text-[var(--evergreen-60)] mb-4">
              {t('journey.selectTransportHint')}
            </p>
            <div className="grid grid-cols-3 gap-3">
              {TRANSPORT_MODES.map(({ mode, labelKey, color }) => (
                <button
                  key={mode}
                  onClick={() => addTransport(mode)}
                  className="flex flex-col items-center gap-2 p-3 border-2 border-[var(--evergreen)]/20 rounded-lg hover:border-[var(--trail-orange)] hover:bg-[var(--trail-orange-15)] transition-colors"
                >
                  {renderJourneyTransportIcon(mode, 24, color)}
                  <span className="text-xs text-[var(--evergreen)]">{t(labelKey)}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                setShowTransportMenu(false);
                setSelectedTransportIndex(null);
              }}
              className="mt-4 w-full tr-btn tr-btn-secondary"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
      
      {/* Duration Editor Modal */}
      {editingSegment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--canvas)] border-2 border-[var(--evergreen)] rounded-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold text-[var(--evergreen)] mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5" />
              {t('journey.editDurationTitle')}
            </h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="journey-segment-duration" className="text-sm text-[var(--evergreen-60)] mb-1 block">
                  {t('journey.durationSeconds')}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="journey-segment-duration"
                    type="number"
                    value={customDuration}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === '') {
                        setCustomDuration('');
                        return;
                      }
                      const parsed = parseInt(raw, 10);
                      if (!Number.isNaN(parsed)) {
                        setCustomDuration(Math.max(1, parsed));
                      }
                    }}
                    onBlur={() => {
                      if (customDuration === '') setCustomDuration(1);
                    }}
                    className="flex-1 px-3 py-2 border-2 border-[var(--evergreen)]/30 rounded-lg bg-[var(--canvas)] text-[var(--evergreen)]"
                    min="1"
                    autoFocus
                  />
                  <span className="text-sm text-[var(--evergreen-60)]">{t('common.secondsShort')}</span>
                </div>
                <p className="text-xs text-[var(--evergreen-60)] mt-2">
                  {t('journey.durationHint')}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingSegment(null)}
                  className="flex-1 tr-btn tr-btn-secondary"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={() => updateSegmentDuration(editingSegment, customDuration)}
                  className="flex-1 tr-btn tr-btn-primary"
                >
                  {t('common.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
