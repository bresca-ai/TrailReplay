import { useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useComputedJourney } from '@/hooks/useComputedJourney';
import { useAvailableStats } from '@/hooks/useAvailableStats';
import { formatDistance, formatPace, formatStatsDuration, formatElevation, formatSpeedFromKmh } from '@/utils/units';
import { useI18n } from '@/i18n/useI18n';
import type { StatId } from '@/types';
import { calculateCurrentLiveStats } from './liveStats';
import { getStatGridPlacement } from './statGridPlacement';
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

  if (!currentStats || journeySegments.length === 0) return null;

  const iconCls = isExportVariant ? 'w-3 h-3' : isNarrowLayout ? 'w-3.5 h-3.5' : 'w-4 h-4';

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
      value: currentStats.heartRate ? `${Math.round(currentStats.heartRate)} ${t('stats.bpm')}` : '--',
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
      style={{ backgroundColor: settings.statsBackground === 'transparent' ? 'transparent' : `${settings.statsPanelColor || '#091412'}e6`, color: settings.statsTextColor || '#ffffff' }}
      className={`tr-stats-overlay ${
        isExportVariant
          ? 'tr-stats-overlay--compact tr-stats-overlay--export'
          : isNarrowLayout
            ? 'tr-stats-overlay--compact tr-stats-overlay--narrow'
            : ''
      } ${settings.statsBackground === 'transparent' ? 'tr-stats-overlay--plain' : ''}`}
    >
      <div
        className={`grid w-max ${isExportVariant || isNarrowLayout ? 'gap-x-2 gap-y-2 mb-0' : 'gap-x-3 gap-y-3 mb-0'}`}
        style={{ gridTemplateColumns: `repeat(${cols}, ${isExportVariant ? 6 : isNarrowLayout ? 7 : 8}rem)` }}
      >
        {visibleStats.map((stat, index) => {
          return (
          <StatItem
            key={stat.id}
            statId={stat.id}
            icon={stat.icon}
            iconColor={settings.statsIconColor || '#ff9248'}
            label={stat.label}
            value={stat.value!}
            compact={isNarrowLayout}
            exportCompact={isExportVariant}
            {...getStatGridPlacement(index, visibleStats.length, cols)}
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
  iconColor: string;
  label: string;
  value: string;
  compact?: boolean;
  exportCompact?: boolean;
  gridColumnStart?: number;
  offsetHalfColumn?: boolean;
}

function StatItem({ statId, icon, iconColor, label, value, compact = false, exportCompact = false, gridColumnStart, offsetHalfColumn = false }: StatItemProps) {
  return (
    <div
      className={`tr-stat-cell min-w-0 text-center ${exportCompact ? 'w-[6rem] px-2 py-1' : compact ? 'w-[7rem] px-2.5 py-1.5' : 'w-[8rem] px-3 py-1.5'}`}
      style={{ gridColumnStart, transform: offsetHalfColumn ? `translateX(calc(-50% - ${(exportCompact || compact) ? 0.25 : 0.375}rem))` : undefined }}
    >
      <div data-export-stat-header className={`grid grid-cols-[minmax(0,1fr)_max-content_minmax(0,1fr)] items-center min-w-0 ${
        exportCompact ? 'gap-1 mb-1' : compact ? 'gap-1 mb-1.5' : 'gap-1.5 mb-2'
      }`}>
        <span style={{ color: iconColor }} className={`flex items-center justify-center justify-self-end ${
          exportCompact ? 'w-4.5 h-4.5' : compact ? 'w-5 h-5' : 'w-6 h-6'
        }`}>
          {icon}
        </span>
        <span data-export-stat-label style={{ fontSize: `${(exportCompact ? 7 : compact ? 9 : 10) * Math.min(1, 12 / Math.max(1, label.length))}px` }} className={`block whitespace-nowrap ${
          exportCompact ? 'text-[7px]' : compact ? 'text-[9px]' : 'text-[10px]'
        } font-semibold uppercase tracking-[0.08em] leading-[1.1]`}>
          {label}
        </span>
        <span aria-hidden="true" />
      </div>
      <div
        className={`tr-stat-value grid min-h-[1.2rem] items-center justify-items-center whitespace-nowrap px-0.5 text-center font-semibold tabular-nums tracking-[-0.03em] ${
          exportCompact ? 'text-[11px] leading-[1.05]' : compact ? 'text-[14px] leading-[1.1]' : 'text-[16px] leading-[1.1]'
        }`}
        title={value}
      >
        <span
          className="col-start-1 row-start-1"
          data-export-stat-value={statId}
          style={{ fontSize: `${Math.min(1, 11 / Math.max(1, value.length))}em` }}
        >
          {value}
        </span>
      </div>
    </div>
  );
}
