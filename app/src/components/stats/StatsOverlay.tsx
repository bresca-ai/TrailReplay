import { useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useComputedJourney } from '@/hooks/useComputedJourney';
import { useAvailableStats } from '@/hooks/useAvailableStats';
import { formatDistance, formatPace, formatStatsDuration, formatElevation, formatSpeedFromKmh } from '@/utils/units';
import { useI18n } from '@/i18n/useI18n';
import type { StatId } from '@/types';
import { calculateCurrentLiveStats, elapsedTrackTime } from './liveStats';
import {
  Route,
  Timer,
  TimerReset,
  Clock,
  Mountain,
  Heart,
  Zap,
  ArrowUp,
} from 'lucide-react';

interface StatsOverlayProps {
  compact?: boolean;
  layout?: 'default' | 'narrow' | 'horizontal' | 'vertical';
  variant?: 'default' | 'export';
}

export function StatsOverlay({ compact = false, layout = 'default', variant = 'default' }: StatsOverlayProps) {
  const { t } = useI18n();
  const tracks = useAppStore((state) => state.tracks);
  const journeySegments = useAppStore((state) => state.journeySegments);
  const playback = useAppStore((state) => state.playback);
  const settings = useAppStore((state) => state.settings);
  const { visibleStats: availableStats } = useAvailableStats();
  const isNarrowLayout = compact || layout === 'narrow';
  const isHorizontalLayout = layout === 'horizontal';
  const isVerticalLayout = layout === 'vertical';
  const isExportVariant = variant === 'export';

  const {
    currentPosition,
    isInTransport,
    totalDistance,
    segmentTimings,
    activeTrack,
    computedJourney,
  } = useComputedJourney();

  const currentStats = useMemo(() => {
    if (!currentPosition) return null;
    return calculateCurrentLiveStats({
      activeTrack,
      computedJourney,
      currentPosition,
      playbackProgress: playback.progress,
      restartPerTrack: settings.journeyStatsMode === 'per-track',
      segmentTimings,
      totalDistance,
      tracks,
      videoDurationSeconds: playback.totalDuration / 1000,
    });
  }, [activeTrack, computedJourney, currentPosition, playback.progress, playback.totalDuration, segmentTimings, settings.journeyStatsMode, totalDistance, tracks]);

  /**
   * Breite, die jede Kachel dauerhaft freihaelt.
   *
   * Die Box richtete sich bisher nach dem gerade angezeigten Text. Aus "0:00"
   * wird "42:28", aus "345 m" wird "1018 m" - jede zusaetzliche Ziffer machte
   * die Box breiter, und sie zappelte waehrend der ganzen Wiedergabe. Am
   * Anfang war sie ausserdem unangenehm schmal.
   *
   * Die Endwerte der Tour stehen aber von vornherein fest. Wir halten deshalb
   * gleich zu Beginn so viel Platz frei, wie der breiteste Wert spaeter
   * braucht. Tempo und Puls bleiben aussen vor: Fuer sie gibt es keinen
   * verlaesslichen Hoechstwert, ihre Texte sind aber ohnehin gleich lang.
   */
  const reserveValues = useMemo<Partial<Record<StatId, string>>>(() => {
    const journeyTrackIds = new Set(
      segmentTimings
        .filter((timing) => timing.type === 'track' && timing.trackId)
        .map((timing) => timing.trackId as string),
    );
    const journeyTracks = journeyTrackIds.size > 0
      ? tracks.filter((track) => journeyTrackIds.has(track.id))
      : activeTrack
        ? [activeTrack]
        : [];

    const totalElevationGain = journeyTracks.reduce((sum, track) => sum + (track.elevationGain || 0), 0);
    const highestPoint = journeyTracks.reduce((highest, track) => Math.max(highest, track.maxElevation || 0), 0);
    const fastest = journeyTracks.reduce((highest, track) => Math.max(highest, track.maxSpeed || 0), 0);

    return {
      duration: formatStatsDuration(elapsedTrackTime(segmentTimings, tracks, activeTrack, 1, playback.totalDuration / 1000, 'total')),
      movingDuration: formatStatsDuration(elapsedTrackTime(segmentTimings, tracks, activeTrack, 1, playback.totalDuration / 1000, 'moving')),
      distance: formatDistance(totalDistance, settings.unitSystem),
      elevation: formatElevation(totalElevationGain, settings.unitSystem),
      altitude: formatElevation(highestPoint, settings.unitSystem),
      speed: formatSpeedFromKmh(fastest, settings.unitSystem),
    };
  }, [activeTrack, playback.totalDuration, segmentTimings, settings.unitSystem, totalDistance, tracks]);

  if (!currentStats || journeySegments.length === 0) return null;

  const iconCls = isExportVariant ? 'w-3 h-3 text-white' : isNarrowLayout ? 'w-3.5 h-3.5 text-white' : 'w-4 h-4 text-white';

  const ALL_STATS: Array<{ id: StatId; icon: React.ReactNode; label: string; value: string | null }> = [
    {
      id: 'duration',
      icon: <Timer className={iconCls} />,
      label: t('stats.duration'),
      value: formatStatsDuration(currentStats.duration),
    },
    {
      id: 'movingDuration',
      icon: <TimerReset className={iconCls} />,
      label: t('stats.movingDuration'),
      value: formatStatsDuration(currentStats.movingDuration),
    },
    {
      id: 'distance',
      icon: <Route className={iconCls} />,
      label: t('stats.distance'),
      value: formatDistance(currentStats.distance, settings.unitSystem),
    },
    {
      id: 'pace',
      icon: <Clock className={iconCls} />,
      label: settings.paceMode === 'per-km' ? t('stats.pace') : t('stats.avgPace'),
      value: isInTransport ? '--' : formatPace(
        settings.paceMode === 'per-km' ? currentStats.rollingSpeed : currentStats.averageSpeed,
        settings.unitSystem,
      ),
    },
    {
      id: 'elevation',
      icon: <Mountain className={iconCls} />,
      label: t('stats.elev'),
      value: isInTransport ? '--' : formatElevation(currentStats.elevationGain, settings.unitSystem),
    },
    {
      id: 'speed',
      icon: <Zap className={iconCls} />,
      label: t('stats.speed'),
      value: formatSpeedFromKmh(currentStats.currentSpeed, settings.unitSystem),
    },
    {
      id: 'altitude',
      icon: <ArrowUp className={iconCls} />,
      label: t('stats.altitude'),
      value: currentStats.altitude != null ? formatElevation(currentStats.altitude, settings.unitSystem) : '--',
    },
    {
      id: 'heartRate',
      icon: <Heart className={iconCls} />,
      label: t('stats.heartRateShort'),
      value: currentStats.heartRate ? `${Math.round(currentStats.heartRate)} ${t('stats.bpm')}` : null,
    },
  ];

  const visibleStats = ALL_STATS.filter(
    (s) => availableStats.includes(s.id) && s.value !== null,
  );

  if (visibleStats.length === 0) return null;

  const configuredColumns = Number.isFinite(settings.statsColumns)
    ? Math.max(1, Math.min(visibleStats.length, Math.round(settings.statsColumns ?? 1)))
    : null;
  const cols = configuredColumns ?? (isVerticalLayout
    ? 1
    : isHorizontalLayout
      ? visibleStats.length
      : isExportVariant || isNarrowLayout
        ? Math.min(visibleStats.length, 2)
        : Math.min(visibleStats.length, 4));

  const trackCount = segmentTimings.filter((s) => s.type === 'track').length;
  const transportCount = segmentTimings.filter((s) => s.type === 'transport').length;

  return (
    <div
      className={`tr-stats-overlay ${
        isExportVariant
          ? 'tr-stats-overlay--compact tr-stats-overlay--export'
          : isNarrowLayout
            ? 'tr-stats-overlay--compact tr-stats-overlay--narrow'
            : ''
      } ${settings.statsBackground === 'transparent' ? 'tr-stats-overlay--plain' : ''}`}
    >
      <div
        className={`grid w-max ${isExportVariant || isNarrowLayout ? 'gap-x-1.5 gap-y-1.5 mb-0' : 'gap-2 mb-0'}`}
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(max-content, 1fr))` }}
      >
        {visibleStats.map((stat, index) => {
          const remainder = visibleStats.length % cols;
          const firstIncompleteRowIndex = visibleStats.length - remainder;
          const centerOffset = remainder > 0 ? Math.ceil((cols - remainder) / 2) : 0;
          return (
          <StatItem
            key={stat.id}
            statId={stat.id}
            icon={stat.icon}
            label={stat.label}
            value={stat.value!}
            reserve={reserveValues[stat.id]}
            compact={isNarrowLayout}
            exportCompact={isExportVariant}
            gridColumnStart={index === firstIncompleteRowIndex && remainder > 0 ? centerOffset + 1 : undefined}
          />
          );
        })}
      </div>

      {!isExportVariant && segmentTimings.length > 1 && (
        <div className={`flex items-center justify-center ${isNarrowLayout ? 'mt-2' : 'mt-3'}`}>
          <span className={`text-white bg-white/10 px-2.5 py-1 rounded-full ${isNarrowLayout ? 'text-[9px]' : 'text-xs'}`}>
            {trackCount} {trackCount === 1 ? t('stats.trackSingle') : t('stats.trackPlural')}
            {transportCount > 0 && ` + ${transportCount} ${transportCount === 1 ? t('stats.transportSingle') : t('stats.transportPlural')}`}
          </span>
        </div>
      )}
    </div>
  );
}

interface StatItemProps {
  statId: StatId;
  icon: React.ReactNode;
  label: string;
  value: string;
  /** Breitester Text, den diese Kachel im Lauf der Tour zeigen wird. */
  reserve?: string;
  compact?: boolean;
  exportCompact?: boolean;
  gridColumnStart?: number;
}

function StatItem({ statId, icon, label, value, reserve, compact = false, exportCompact = false, gridColumnStart }: StatItemProps) {
  return (
    <div
      className={`min-w-max text-center ${exportCompact ? 'px-0.5 py-0.5' : compact ? 'px-1 py-0.5' : 'px-1 py-0.5'}`}
      style={gridColumnStart ? { gridColumnStart } : undefined}
    >
      <div data-export-stat-header className={`flex items-center justify-center min-w-0 ${
        exportCompact ? 'gap-1 mb-0.5' : compact ? 'gap-1 mb-1' : 'gap-1.5 mb-1.5'
      }`}>
        <span className={`flex items-center justify-center ${
          exportCompact ? 'text-white/95 w-4.5 h-4.5' : `text-white/92 ${compact ? 'w-5 h-5' : 'w-6 h-6'}`
        }`}>
          {icon}
        </span>
        <span className={`block min-w-0 whitespace-nowrap ${
          exportCompact ? 'text-[7px] text-white' : compact ? 'text-[9px] text-white' : 'text-[10px] text-white'
        } font-semibold uppercase tracking-[0.08em] leading-[1.1]`}>
          {label}
        </span>
      </div>
      <div
        className={`tr-stat-value grid min-h-[1.2rem] items-center justify-items-center whitespace-nowrap px-0.5 text-center font-semibold tabular-nums tracking-[-0.03em] ${
          exportCompact ? 'text-[9px] leading-[1.05] text-white' : compact ? 'text-[11px] leading-[1.1]' : 'text-[12px] leading-[1.1]'
        }`}
        title={value}
      >
        {/* Haelt die Breite des spaeteren Hoechstwerts frei, damit die Box
            waehrend der Wiedergabe nicht mitwaechst. Liegt in derselben
            Rasterzelle wie der Wert und ist unsichtbar. */}
        {reserve && (
          <span aria-hidden className="invisible col-start-1 row-start-1">
            {reserve}
          </span>
        )}
        <span
          className="col-start-1 row-start-1"
          data-export-stat-value={statId}
        >
          {value}
        </span>
      </div>
    </div>
  );
}
