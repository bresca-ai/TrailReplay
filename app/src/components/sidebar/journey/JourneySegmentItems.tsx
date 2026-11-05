import { useState } from 'react';
import { useI18n } from '@/i18n/useI18n';
import { useAppStore } from '@/store/useAppStore';
import type { JourneySegment } from '@/types';
import { formatDistance, formatDuration } from '@/utils/units';
import { ACTIVITY_ICONS, isSvgActivityIcon, renderActivityIcon } from '@/utils/activityIcons';
import { ChevronDown, Clock, Edit3, GripVertical, Play, SlidersHorizontal, Trash2 } from 'lucide-react';
import { transitionSettings } from '@/utils/cameraTransition';
import { TRANSPORT_MODES, renderJourneyTransportIcon } from './journeyTransport';

interface SegmentItemProps {
  segment: JourneySegment;
  index: number;
  onRemove: () => void;
  onEditDuration: () => void;
  onSeek: () => void;
  onCameraSettingChange?: (key: 'cameraTransitionZoom' | 'cameraTransitionPitch', value: number) => void;
}

export function TrackSegmentItem({
  segment,
  index,
  onRemove,
  onEditDuration,
  onSeek,
}: SegmentItemProps) {
  const { t } = useI18n();
  const tracks = useAppStore((state) => state.tracks);
  const settings = useAppStore((state) => state.settings);
  const updateTrackIcon = useAppStore((state) => state.updateTrackIcon);
  const [showIconPicker, setShowIconPicker] = useState(false);

  if (segment.type !== 'track') return null;

  const track = tracks.find((trackItem) => trackItem.id === segment.trackId);
  if (!track) return null;

  const durationSeconds = (segment.duration || 0) / 1000;

  return (
    <div className="group flex cursor-move items-center gap-1.5 rounded-xl border border-[var(--evergreen)]/15 bg-white/30 p-2.5">
      <GripVertical className="h-3 w-3 shrink-0 text-[var(--evergreen-40)]" />

      <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--evergreen)] text-[9px] font-bold text-[var(--canvas)]">
        {index + 1}
      </div>

      <button
        type="button"
        onClick={() => setShowIconPicker(true)}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
        style={{ backgroundColor: `${track.color}30` }}
        title={t('journey.changeTrackIcon')}
      >
        {renderActivityIcon(track.activityIcon, {
          size: 22,
          color: isSvgActivityIcon(track.activityIcon) ? track.color : undefined,
        })}
      </button>

      <div className="flex-1 min-w-0">
        <p className="line-clamp-2 text-[11px] font-semibold leading-relaxed text-[var(--evergreen)]" title={track.name}>{track.name}</p>

        <button
          onClick={onEditDuration}
          className="mt-1 flex items-center gap-1 rounded-md border border-[var(--evergreen)]/10 bg-[var(--canvas)] px-1.5 py-0.5 text-[10px] text-[var(--evergreen)] transition-colors hover:border-[var(--trail-orange)]"
        >
          <Clock className="w-3 h-3" />
          <span className="font-semibold">{formatDuration(durationSeconds)}</span>
          <Edit3 className="w-3 h-3 ml-1 opacity-50" />
        </button>

        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-[var(--evergreen-60)] mt-1">
          <span>{formatDistance(track.totalDistance, settings.unitSystem)}</span>
          <span>↑{formatDistance(track.elevationGain, settings.unitSystem)}</span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={onSeek}
          className="p-1.5 hover:bg-[var(--evergreen)]/10 rounded"
          title={t('journey.goToSegment')}
        >
          <Play className="w-4 h-4 text-[var(--evergreen-60)]" />
        </button>
        <button onClick={onRemove} aria-label={`${t('common.remove')}: ${track.name}`} className="p-1.5 hover:bg-red-100 text-red-500 rounded">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {showIconPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--canvas)] border-2 border-[var(--evergreen)] rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-[var(--evergreen)] mb-4">
              {t('annotations.selectIcon')}
            </h3>
            <div className="grid grid-cols-6 gap-2 mb-6">
              {ACTIVITY_ICONS.map(({ value, labelKey }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    updateTrackIcon(track.id, value);
                    setShowIconPicker(false);
                  }}
                  title={t(labelKey)}
                  className={`
                    flex items-center justify-center p-2 rounded-lg border-2 transition-colors
                    ${track.activityIcon === value
                      ? 'border-[var(--trail-orange)] bg-[var(--trail-orange-15)]'
                      : 'border-[var(--evergreen)]/20 hover:border-[var(--trail-orange)]/50'
                    }
                  `}
                >
                  {renderActivityIcon(value, {
                    size: 24,
                    color: isSvgActivityIcon(value) ? track.color : undefined,
                  })}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowIconPicker(false)}
              className="w-full tr-btn tr-btn-secondary"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function TransportSegmentItem({
  segment,
  index,
  onRemove,
  onEditDuration,
  onSeek,
  onCameraSettingChange,
}: SegmentItemProps) {
  const { t } = useI18n();
  if (segment.type !== 'transport') return null;

  const durationSeconds = (segment.duration || 0) / 1000;
  const modeInfo = TRANSPORT_MODES.find((transportMode) => transportMode.mode === segment.mode);
  const modeLabel = t(`stats.transportLabels.${segment.mode}`);

  if (segment.mode === 'camera') {
    const { zoom, pitch } = transitionSettings(segment);
    return (
      <div className="ml-4 overflow-hidden rounded-xl border border-[var(--evergreen)]/15 bg-[var(--canvas)]">
        <div className="flex items-center gap-2 px-3 py-2.5">
          <GripVertical className="h-3.5 w-3.5 shrink-0 text-[var(--evergreen-40)]" />
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--evergreen)]/10 text-[var(--evergreen)]">
            {renderJourneyTransportIcon(segment.mode, 17)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-[var(--evergreen)]">{modeLabel}</p>
            <button type="button" onClick={onEditDuration} className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-[var(--evergreen-60)] hover:text-[var(--trail-orange)]">
              <Clock className="h-3 w-3" />{formatDuration(durationSeconds)}<Edit3 className="h-2.5 w-2.5" />
            </button>
          </div>
          <button type="button" onClick={onSeek} aria-label={t('journey.goToSegment')} className="rounded-md p-2 text-[var(--evergreen-60)] hover:bg-[var(--evergreen)]/10"><Play className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={onRemove} aria-label={`${t('common.remove')}: ${modeLabel}`} className="rounded-md p-2 text-[var(--evergreen-60)] hover:bg-red-100 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
        <details className="group border-t border-[var(--evergreen)]/10" onPointerDown={(event) => event.stopPropagation()}>
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-[10px] font-semibold text-[var(--evergreen-70)] hover:bg-[var(--evergreen)]/5">
            <SlidersHorizontal className="h-3.5 w-3.5" /><span className="flex-1">{t('journey.cameraSettings')}</span>
            <span className="font-normal text-[var(--evergreen-40)]">{zoom.toFixed(1)} · {pitch}°</span><ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-4 px-3 pb-3 pt-1">
            <label className="block text-[10px] text-[var(--evergreen)]">
              <span className="flex items-center justify-between font-semibold"><span>{t('journey.cameraTransitionZoom')}</span><span className="tabular-nums">{zoom.toFixed(1)}</span></span>
              <input type="range" min="0" max="18" step="0.5" value={zoom} onChange={(event) => onCameraSettingChange?.('cameraTransitionZoom', Number(event.target.value))} className="mt-1 w-full accent-[var(--trail-orange)]" />
              <span className="mt-0.5 flex justify-between text-[9px] text-[var(--evergreen-60)]"><span>{t('journey.cameraZoomWide')}</span><span>{t('journey.cameraZoomClose')}</span></span>
            </label>
            <label className="block text-[10px] text-[var(--evergreen)]">
              <span className="flex items-center justify-between font-semibold"><span>{t('journey.cameraTransitionPitch')}</span><span className="tabular-nums">{pitch}°</span></span>
              <input type="range" min="0" max="60" step="5" value={pitch} onChange={(event) => onCameraSettingChange?.('cameraTransitionPitch', Number(event.target.value))} className="mt-1 w-full accent-[var(--trail-orange)]" />
              <span className="mt-0.5 flex justify-between text-[9px] text-[var(--evergreen-60)]"><span>{t('journey.cameraPitchTopDown')}</span><span>{t('journey.cameraPitchTilted')}</span></span>
            </label>
          </div>
        </details>
      </div>
    );
  }

  return (
    <div className="bg-[var(--evergreen)]/10 border-2 border-dashed border-[var(--evergreen)]/30 rounded-lg flex items-center gap-2 group cursor-move p-2 ml-4">
      <GripVertical className="w-4 h-4 text-[var(--evergreen-40)]" />

      <div className="w-6 h-6 rounded-full bg-[var(--evergreen)]/30 text-[var(--evergreen)] flex items-center justify-center text-xs font-bold flex-shrink-0">
        {index + 1}
      </div>

      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
        style={{ backgroundColor: modeInfo ? `${modeInfo.color}30` : '#888' }}
      >
        {renderJourneyTransportIcon(segment.mode, 24, modeInfo?.color)}
      </div>

      <div className="flex-1">
        <p className="font-medium text-sm text-[var(--evergreen)]">
          {t('journey.transportSegment', { mode: modeLabel })}
        </p>

        <button
          onClick={onEditDuration}
          className="flex items-center gap-1 text-xs bg-[var(--trail-orange-15)] text-[var(--trail-orange)] px-2 py-0.5 rounded-full hover:bg-[var(--trail-orange)]/20 transition-colors mt-1"
        >
          <Clock className="w-3 h-3" />
          <span className="font-semibold">{formatDuration(durationSeconds)}</span>
          <Edit3 className="w-3 h-3 ml-1 opacity-50" />
        </button>

      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={onSeek}
          className="p-1.5 hover:bg-[var(--evergreen)]/10 rounded"
          title={t('journey.goToSegment')}
        >
          <Play className="w-4 h-4 text-[var(--evergreen-60)]" />
        </button>
        <button onClick={onRemove} aria-label={`${t('common.remove')}: ${modeLabel}`} className="p-1.5 hover:bg-red-100 text-red-500 rounded">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
