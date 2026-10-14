import type { ElevationSectionMetrics } from './ElevationProfileChart';

interface ElevationProfileLabelsProps {
  sectionMetrics: ElevationSectionMetrics | null;
  focusAmount: number;
  progress: number;
  markerPosition: number;
  currentElevation: number;
  elevationUnit: string;
  transportMode: string | null;
  tall: boolean;
}

const transportIcons: Record<string, string> = {
  car: '🚗',
  bus: '🚌',
  train: '🚆',
  plane: '✈️',
  bike: '🚲',
  walk: '🚶',
  ferry: '⛴️',
};

export function ElevationProfileLabels({
  sectionMetrics,
  focusAmount,
  progress,
  markerPosition,
  currentElevation,
  elevationUnit,
  transportMode,
  tall,
}: ElevationProfileLabelsProps) {
  if (sectionMetrics) {
    return (
      <div
        data-export-elevation-dynamic
        className="pointer-events-none absolute inset-0 text-white transition-opacity"
        style={{ opacity: focusAmount }}
      >
        <span
          data-export-elevation-change-label
          className={`absolute left-1/2 top-0.5 -translate-x-1/2 font-bold tabular-nums ${tall ? 'text-[18px]' : 'text-[13px]'}`}
          style={{ textShadow: '0 2px 7px rgba(0, 0, 0, 0.9)' }}
        >
          {sectionMetrics.change}
        </span>
        <span
          data-export-elevation-start-label
          className={`absolute left-1 font-bold tabular-nums ${
            sectionMetrics.kind === 'climb' ? 'bottom-0' : 'top-0'
          } ${tall ? 'text-[20px]' : 'text-[14px]'}`}
          style={{ textShadow: '0 2px 6px rgba(0, 0, 0, 0.95)' }}
        >
          {sectionMetrics.start}
        </span>
        <span
          data-export-elevation-end-label
          className={`absolute right-1 font-bold tabular-nums ${
            sectionMetrics.kind === 'climb' ? 'top-0' : 'bottom-0'
          } ${tall ? 'text-[20px]' : 'text-[14px]'}`}
          style={{ textShadow: '0 2px 6px rgba(0, 0, 0, 0.95)' }}
        >
          {sectionMetrics.end}
        </span>
        <span
          data-export-elevation-distance-label
          className={`absolute bottom-0 left-1/2 -translate-x-1/2 font-bold tabular-nums ${tall ? 'text-[17px]' : 'text-[12px]'}`}
          style={{ textShadow: '0 2px 7px rgba(0, 0, 0, 0.9)' }}
        >
          {sectionMetrics.distance}
        </span>
      </div>
    );
  }

  if (progress <= 0) return null;
  return (
    <div
      data-export-elevation-dynamic
      data-export-elevation-label
      className={`absolute -translate-x-1/2 whitespace-nowrap ${tall ? 'bottom-2' : 'bottom-1'}`}
      style={{
        left: `${markerPosition * 100}%`,
        textShadow: tall
          ? '0 3px 10px rgba(0, 0, 0, 0.72), 0 1px 3px rgba(0, 0, 0, 0.9)'
          : '0 2px 6px rgba(0, 0, 0, 0.75)',
      }}
    >
      {transportMode ? (
        <span className={`block text-white ${tall ? 'text-[18px]' : 'text-[12px]'} leading-none`}>
          {transportIcons[transportMode]}
        </span>
      ) : (
        <span className={`inline-flex items-baseline font-bold text-white ${tall ? 'gap-1.5' : 'gap-1'}`}>
          <span className={tall ? 'text-[22px] leading-none tracking-[-0.03em]' : 'text-[14px] leading-none'}>
            {currentElevation}
          </span>
          <span className={`font-semibold uppercase ${tall ? 'text-[14px]' : 'text-[9px]'} leading-none`}>
            {elevationUnit}
          </span>
        </span>
      )}
    </div>
  );
}
