import { useRef, type PointerEvent, type KeyboardEvent } from 'react';
import { GripVertical, Maximize2 } from 'lucide-react';
import type { ComparisonTrack, GPXTrack } from '@/types';
import { useAppStore } from '@/store/useAppStore';
import { overlayFontFamily } from '@/utils/typography';
import type { CropPreviewMetrics } from '@/utils/crop';
import { useI18n } from '@/i18n/useI18n';
import { buildTrackTimeIndex, trackPositionAtTime } from '@/utils/trackPositionAtTime';

interface Props {
  primaryTrack: GPXTrack | null | undefined;
  comparisonTracks: ComparisonTrack[];
  currentTime: Date | null;
  interactive?: boolean;
  frame?: CropPreviewMetrics | null;
}

function progressAt(track: GPXTrack, currentTime: Date | null) {
  const index = buildTrackTimeIndex(track);
  if (!index || !currentTime) return null;
  const position = trackPositionAtTime(track, index, currentTime.getTime());
  const total = track.points.at(-1)?.distance ?? 0;
  return total > 0 ? Math.max(0, Math.min(1, position.distance / total)) : null;
}

export function ComparisonLeaderboard({ primaryTrack, comparisonTracks, currentTime, interactive = true, frame }: Props) {
  const { t } = useI18n();
  const settings = useAppStore((state) => state.settings);
  const setSettings = useAppStore((state) => state.setSettings);
  const gesture = useRef<{ mode: 'move' | 'resize'; x: number; y: number; left: number; top: number; width: number; height: number; parentWidth: number; parentHeight: number; scale: number } | null>(null);
  const scale = settings.leaderboardScale;
  const position = settings.leaderboardPosition;
  const panel = settings.leaderboardBackground !== 'transparent';

  const startGesture = (event: PointerEvent<HTMLDivElement>, mode: 'move' | 'resize') => {
    if (!interactive || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const element = event.currentTarget;
    const rect = element.getBoundingClientRect();
    const parent = element.parentElement!.getBoundingClientRect();
    gesture.current = { mode, x: event.clientX, y: event.clientY, left: rect.left - parent.left, top: rect.top - parent.top, width: rect.width, height: rect.height, parentWidth: parent.width, parentHeight: parent.height, scale };
    setSettings({ leaderboardPosition: { x: (rect.left - parent.left) / Math.max(1, parent.width - rect.width), y: (rect.top - parent.top) / Math.max(1, parent.height - rect.height) } });
    element.setPointerCapture?.(event.pointerId);
  };
  const moveGesture = (event: PointerEvent<HTMLDivElement>) => {
    const start = gesture.current;
    if (!start) return;
    if (start.mode === 'resize') {
      const next = Math.max(0.6, Math.min(3, start.scale * (start.width + event.clientX - start.x) / start.width));
      const nextScale = Math.round(Math.min(next, start.scale * (start.parentWidth - start.left) / start.width, start.scale * (start.parentHeight - start.top) / start.height) * 100) / 100;
      setSettings({ leaderboardScale: nextScale, leaderboardPosition: {
        x: start.left / Math.max(1, start.parentWidth - start.width * nextScale / start.scale),
        y: start.top / Math.max(1, start.parentHeight - start.height * nextScale / start.scale),
      } });
    } else {
      setSettings({ leaderboardPosition: {
        x: Math.max(0, Math.min(start.parentWidth - start.width, start.left + event.clientX - start.x)) / Math.max(1, start.parentWidth - start.width),
        y: Math.max(0, Math.min(start.parentHeight - start.height, start.top + event.clientY - start.y)) / Math.max(1, start.parentHeight - start.height),
      } });
    }
  };
  const moveWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const parent = event.currentTarget.parentElement!.getBoundingClientRect();
    const step = event.shiftKey ? 20 : 4;
    setSettings({ leaderboardPosition: {
      x: Math.max(0, Math.min(parent.width - rect.width, rect.left - parent.left + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0))) / Math.max(1, parent.width - rect.width),
      y: Math.max(0, Math.min(parent.height - rect.height, rect.top - parent.top + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0))) / Math.max(1, parent.height - rect.height),
    } });
  };
  if (!settings.showLeaderboard || !primaryTrack || !currentTime || comparisonTracks.length === 0) return null;
  const entries = [
    { id: primaryTrack.id, name: primaryTrack.name, color: primaryTrack.color, progress: progressAt(primaryTrack, currentTime) },
    ...comparisonTracks.filter((track) => track.visible && (!track.groupId || track.groupId === primaryTrack.id)).map((track) => ({
      id: track.id, name: track.name, color: track.color, progress: progressAt(track.track, currentTime),
    })),
  ].filter((entry): entry is typeof entry & { progress: number } => entry.progress !== null)
    .sort((a, b) => b.progress - a.progress);
  if (entries.length < 2) return null;
  const leaderProgress = entries[0].progress;
  const durationSeconds = (track: GPXTrack) => {
    const index = buildTrackTimeIndex(track);
    return index ? (index.times.at(-1)! - index.times[0]) / 1000 : 0;
  };
  const leaderTrack = entries[0].id === primaryTrack.id ? primaryTrack : comparisonTracks.find((track) => track.id === entries[0].id)?.track;
  const leaderDuration = leaderTrack ? durationSeconds(leaderTrack) : 0;

  return (
    <div
      className={`tr-comparison-leaderboard group absolute z-20 w-60 max-w-[calc(100%-2rem)] rounded-xl text-white ${panel ? 'border border-white/15 bg-[rgba(9,14,19,0.9)] shadow-lg backdrop-blur-sm' : ''}`}
      data-leaderboard-background={panel ? 'panel' : 'transparent'}
      role="group" aria-label={t('tracks.leaderboard')} tabIndex={interactive ? 0 : undefined}
      title={interactive ? t('tracks.leaderboardMove') : undefined}
      style={{
        fontFamily: overlayFontFamily(settings.trailStyle.overlayFont),
        left: position ? `${position.x * 100}%` : undefined,
        right: position ? undefined : (frame?.right ?? 0) + 16,
        top: position ? `${position.y * 100}%` : (frame?.frameTop ?? 0) + 16,
        maxWidth: frame && !position ? Math.max(1, (frame.frameWidth - 32) / scale) : `calc(${100 / scale}% - ${32 / scale}px)`,
        transform: position ? `scale(${scale}) translate(${-position.x * 100}%, ${-position.y * 100}%)` : `scale(${scale})`, transformOrigin: position ? 'top left' : 'top right',
        cursor: interactive ? 'grab' : undefined, touchAction: 'none', userSelect: 'none',
        textShadow: panel ? undefined : '0 1px 4px rgba(0,0,0,0.95)',
      }}
      onPointerDown={(event) => startGesture(event, (event.target as Element).closest('[data-leaderboard-resize]') ? 'resize' : 'move')}
      onPointerMove={moveGesture} onPointerUp={() => { gesture.current = null; }} onPointerCancel={() => { gesture.current = null; }}
      onKeyDown={moveWithKeyboard}
    >
      <div className={`flex items-center gap-1 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-white/65 ${panel ? 'border-b border-white/10' : ''}`}>
        <GripVertical aria-hidden="true" className={`h-3 w-3 shrink-0 opacity-0 ${interactive ? 'group-hover:opacity-100 group-focus-within:opacity-100' : ''}`} />
        <span data-leaderboard-text>{t('tracks.leaderboard')}</span>
      </div>
      <ol className="space-y-1 p-2">
        {entries.map((entry, index) => {
          const secondsBehind = Math.round(Math.max(0, leaderProgress - entry.progress) * leaderDuration);
          return <li key={entry.id} className="flex items-center gap-2 rounded-md px-1.5 py-1 text-xs">
            <span data-leaderboard-text className="w-4 font-bold text-white/50">{index + 1}</span>
            <span data-leaderboard-color={entry.color} className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
            <span data-leaderboard-text className="min-w-0 flex-1 truncate">{entry.name}</span>
            {index === 0 ? <span data-leaderboard-text className="text-[10px] font-semibold text-emerald-300">{t('tracks.leader')}</span> : <span data-leaderboard-text className="whitespace-nowrap text-[10px] text-white/65">+{secondsBehind}s</span>}
          </li>;
        })}
      </ol>
      {interactive && <span data-leaderboard-resize aria-label={t('tracks.leaderboardResize')} title={t('tracks.leaderboardResize')}
        className="absolute -bottom-1 -right-1 flex h-5 w-5 cursor-nwse-resize items-center justify-center rounded bg-white/90 text-black opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"><Maximize2 className="h-3 w-3" /></span>}
    </div>
  );
}
