import type { ComparisonTrack, GPXTrack } from '@/types';
import { useI18n } from '@/i18n/useI18n';
import { buildTrackTimeIndex, trackPositionAtTime } from '@/utils/trackPositionAtTime';

interface Props {
  primaryTrack: GPXTrack | null | undefined;
  comparisonTracks: ComparisonTrack[];
  currentTime: Date | null;
}

function progressAt(track: GPXTrack, currentTime: Date | null) {
  const index = buildTrackTimeIndex(track);
  if (!index || !currentTime) return null;
  const position = trackPositionAtTime(track, index, currentTime.getTime());
  const total = track.points.at(-1)?.distance ?? 0;
  return total > 0 ? Math.max(0, Math.min(1, position.distance / total)) : null;
}

export function ComparisonLeaderboard({ primaryTrack, comparisonTracks, currentTime }: Props) {
  const { t } = useI18n();
  if (!primaryTrack || !currentTime || comparisonTracks.length === 0) return null;
  const entries = [
    { id: primaryTrack.id, name: primaryTrack.name, color: primaryTrack.color, progress: progressAt(primaryTrack, currentTime) },
    ...comparisonTracks.filter((track) => track.visible).map((track) => ({
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
    <div className="absolute right-4 top-4 z-20 w-60 max-w-[calc(100%-2rem)] overflow-hidden rounded-xl border border-white/15 bg-[rgba(9,14,19,0.9)] text-white shadow-lg backdrop-blur-sm">
      <div className="border-b border-white/10 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-white/65">{t('tracks.leaderboard')}</div>
      <ol className="space-y-1 p-2">
        {entries.map((entry, index) => {
          const secondsBehind = Math.round(Math.max(0, leaderProgress - entry.progress) * leaderDuration);
          return <li key={entry.id} className="flex items-center gap-2 rounded-md px-1.5 py-1 text-xs">
            <span className="w-4 font-bold text-white/50">{index + 1}</span>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="min-w-0 flex-1 truncate">{entry.name}</span>
            {index === 0 ? <span className="text-[10px] font-semibold text-emerald-300">{t('tracks.leader')}</span> : <span className="whitespace-nowrap text-[10px] text-white/65">+{secondsBehind}s</span>}
          </li>;
        })}
      </ol>
    </div>
  );
}
