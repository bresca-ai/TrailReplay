import { useState } from 'react';
import {
  Clock,
  Eye,
  EyeOff,
  GripVertical,
  Mountain,
  Navigation,
  Palette,
  Play,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import type { AppSettings, GPXTrack } from '@/types';
import { useI18n } from '@/i18n/useI18n';
import { formatDistance, formatDuration, formatElevation, formatSpeedFromKmh } from '@/utils/units';
import { TRACK_COLORS } from './constants';

interface TrackItemProps {
  track: GPXTrack;
  index: number;
  isActive: boolean;
  onActivate: () => void;
  onRemove: () => void;
  onToggleVisibility: () => void;
  onColorChange: (color: string) => void;
  onNameChange: (name: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  settings: AppSettings;
}

export function TrackItem({
  track,
  index,
  isActive,
  onActivate,
  onRemove,
  onToggleVisibility,
  onColorChange,
  onNameChange,
  onReorder,
  settings,
}: TrackItemProps) {
  const { t } = useI18n();
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(track.name);

  const handleDragStart = (event: React.DragEvent) => {
    setIsDragging(true);
    event.dataTransfer.setData('trackIndex', index.toString());
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const fromIndex = Number.parseInt(event.dataTransfer.getData('trackIndex'), 10);
    if (fromIndex !== index) {
      onReorder(fromIndex, index);
    }
  };

  const pace = track.avgMovingSpeed > 0
    ? settings.unitSystem === 'metric'
      ? 60 / track.avgMovingSpeed
      : 60 / (track.avgMovingSpeed * 0.621371)
    : 0;

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={() => setIsDragging(false)}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      }}
      onDrop={handleDrop}
      className={`
        cursor-move overflow-hidden rounded-xl border bg-white/70 shadow-[0_8px_20px_rgba(27,42,32,0.06)] transition-colors
        ${isActive ? 'border-[var(--trail-orange)] bg-[var(--trail-orange-15)] shadow-[0_10px_24px_rgba(193,101,47,0.13)]' : 'border-[var(--evergreen)]/16 hover:border-[var(--evergreen)]/30'}
        ${isDragging ? 'opacity-50' : ''}
      `}
    >
      <div className="flex items-stretch gap-3 p-3">
        <div className="flex w-4 shrink-0 flex-col items-center gap-2 pt-0.5">
          <GripVertical className="h-4 w-4 text-[var(--evergreen-40)]" />
          <span className="min-h-8 w-1 flex-1 rounded-full" style={{ backgroundColor: track.color }} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleVisibility}
              className="shrink-0 rounded-md p-1 text-[var(--evergreen-60)] transition-colors hover:bg-[var(--evergreen)]/8 hover:text-[var(--evergreen)]"
              aria-label={track.visible ? 'Hide track' : 'Show track'}
              title={track.visible ? 'Hide track' : 'Show track'}
            >
              {track.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>

            {isEditingName ? (
              <input
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                onBlur={() => {
                  if (editName.trim()) onNameChange(editName.trim());
                  setIsEditingName(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    if (editName.trim()) onNameChange(editName.trim());
                    setIsEditingName(false);
                  } else if (event.key === 'Escape') {
                    setEditName(track.name);
                    setIsEditingName(false);
                  }
                }}
                autoFocus
                className="min-w-0 flex-1 rounded border border-[var(--trail-orange)] bg-[var(--canvas)] px-1 py-0 text-sm font-medium outline-none"
                style={{ color: track.color }}
              />
            ) : (
              <span
                className="flex-1 cursor-text truncate text-sm font-medium decoration-dotted hover:underline"
                style={{ color: track.color }}
                onClick={() => {
                  setEditName(track.name);
                  setIsEditingName(true);
                }}
                title={t('tracks.clickRename')}
              >
                {track.name}
              </span>
            )}

            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowColorPicker(!showColorPicker)}
                className="rounded-md p-1 transition-colors hover:bg-[var(--evergreen)]/10"
                aria-label="Change track color"
                title="Change track color"
              >
                <Palette className="h-4 w-4 text-[var(--evergreen-60)]" />
              </button>

              <button
                onClick={onActivate}
                className={`
                  rounded-md p-1 transition-colors
                  ${isActive
                    ? 'bg-[var(--trail-orange)] text-[var(--canvas)]'
                    : 'hover:bg-[var(--evergreen)]/10'}
                `}
                aria-label="Use this track"
                title="Use this track"
              >
                <Play className="h-4 w-4" />
              </button>

              <button
                onClick={onRemove}
                className="rounded-md p-1 text-red-500 transition-colors hover:bg-red-100"
                aria-label="Remove track"
                title="Remove track"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <dl className="mt-3 grid grid-cols-2 overflow-hidden rounded-lg border border-[var(--evergreen)]/12 bg-[var(--evergreen)]/[0.035] text-xs">
            <TrackMetric icon={<Navigation className="h-3.5 w-3.5" />} label={t('tracks.distance')} value={formatDistance(track.totalDistance, settings.unitSystem)} />
            <TrackMetric icon={<Clock className="h-3.5 w-3.5" />} label={t('tracks.time')} value={formatDuration(track.totalTime || track.movingTime)} className="border-l border-[var(--evergreen)]/10" />
            <TrackMetric icon={<TrendingUp className="h-3.5 w-3.5" />} label={t('tracks.speed')} value={formatSpeedFromKmh(track.avgMovingSpeed || track.avgSpeed, settings.unitSystem)} detail={pace > 0 ? `${Math.floor(pace)}:${String(Math.round((pace % 1) * 60)).padStart(2, '0')}/km` : undefined} className="border-t border-[var(--evergreen)]/10" />
            <TrackMetric icon={<Mountain className="h-3.5 w-3.5" />} label={t('tracks.gain')} value={formatElevation(track.elevationGain, settings.unitSystem)} detail={`${formatElevation(track.elevationLoss, settings.unitSystem)} ${t('tracks.loss')}`} className="border-l border-t border-[var(--evergreen)]/10" />
          </dl>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-medium text-[var(--evergreen-60)]">
            <span>{t('tracks.max')} {formatSpeedFromKmh(track.maxSpeed, settings.unitSystem)}</span>
            <span>{track.points.length.toLocaleString()} {t('tracks.points')}</span>
          </div>
        </div>
      </div>

      {showColorPicker && (
        <div className="flex flex-wrap gap-1.5 border-t border-[var(--evergreen)]/10 bg-[var(--evergreen)]/[0.025] px-3 py-2.5 pl-10">
          {TRACK_COLORS.map((color) => (
            <button
              key={color}
              onClick={() => {
                onColorChange(color);
                setShowColorPicker(false);
              }}
              className={`
                h-6 w-6 rounded-full border-2
                ${track.color === color ? 'border-[var(--evergreen)]' : 'border-transparent'}
              `}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TrackMetric({ icon, label, value, detail, className = '' }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail?: string;
  className?: string;
}) {
  return (
    <div className={`min-w-0 px-2.5 py-2 ${className}`}>
      <dt className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--evergreen-60)]">
        {icon}
        <span className="truncate">{label}</span>
      </dt>
      <dd className="mt-1 truncate text-sm font-semibold tabular-nums text-[var(--evergreen)]">{value}</dd>
      {detail && <p className="mt-0.5 truncate text-[10px] tabular-nums text-[var(--evergreen-60)]">{detail}</p>}
    </div>
  );
}
