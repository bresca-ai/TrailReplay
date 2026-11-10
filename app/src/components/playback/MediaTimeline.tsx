import { useMemo, useState, type DragEvent } from 'react';
import { Image as ImageIcon, Video } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useI18n } from '@/i18n/useI18n';
import { movePlacedMedia, PENDING_MEDIA_DRAG_TYPE, placePendingMedia, placementAtProgress } from '@/utils/pendingMediaPlacement';

const PLACED_DRAG_TYPE = 'application/x-trailreplay-placed-media';
type MediaId = { kind: 'picture' | 'video'; id: string };

export function MediaTimeline() {
  const { t } = useI18n();
  const pictures = useAppStore((state) => state.pictures);
  const videos = useAppStore((state) => state.videos);
  const progress = useAppStore((state) => state.playback.progress);
  const seek = useAppStore((state) => state.seekToProgress);
  const setError = useAppStore((state) => state.setError);
  const selectPicture = useAppStore((state) => state.setSelectedPictureId);
  const selectVideo = useAppStore((state) => state.setSelectedVideoId);
  const [selected, setSelected] = useState<MediaId | null>(null);
  const [hovering, setHovering] = useState(false);
  const items = useMemo(() => [
    ...pictures.map((item) => ({ ...item, kind: 'picture' as const })),
    ...videos.map((item) => ({ ...item, kind: 'video' as const })),
  ], [pictures, videos]);
  const selectedItem = items.find((item) => item.id === selected?.id && item.kind === selected.kind);
  const move = (item: MediaId, target: number) => {
    const placement = placementAtProgress(target);
    if (!placement) { setError(t('media.bulkNoTimelinePosition')); return; }
    movePlacedMedia(item.kind, item.id, placement);
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    const pending = event.dataTransfer.getData(PENDING_MEDIA_DRAG_TYPE);
    const placed = event.dataTransfer.getData(PLACED_DRAG_TYPE);
    if (!pending && !placed) return;
    event.preventDefault();
    setHovering(false);
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !Number.isFinite(event.clientX)) return;
    const target = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    try {
      if (pending) {
        const ids: unknown = JSON.parse(pending);
        if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) return;
        const placement = placementAtProgress(target);
        if (!placement) { setError(t('media.bulkNoTimelinePosition')); return; }
        placePendingMedia(ids, placement);
      } else {
        const item: unknown = JSON.parse(placed);
        if (item && typeof item === 'object' && 'kind' in item && 'id' in item && (item.kind === 'picture' || item.kind === 'video') && typeof item.id === 'string') {
          move(item as MediaId, target);
          setSelected(item as MediaId);
        }
      }
    } catch { /* Ignore malformed drag data. */ }
  };
  return (
    <section aria-label={t('media.timelineTitle')} className="shrink-0 border-t border-[var(--evergreen)]/20 bg-[var(--canvas)] px-3 py-2 sm:px-4">
      <div className="flex items-center justify-between gap-2 text-xs">
        <h2 className="font-semibold text-[var(--evergreen)]">{t('media.timelineTitle')}</h2>
        <span className="text-[var(--evergreen-60)]">{t('media.timelineHint')}</span>
      </div>
      <div className={`relative mt-2 h-14 rounded-lg border border-dashed ${hovering ? 'border-[var(--trail-orange)] bg-[var(--trail-orange)]/10' : 'border-[var(--evergreen)]/25 bg-[var(--evergreen)]/5'}`}
        aria-label={t('media.timelineDrop')} onClick={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); if (bounds.width) seek(Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width))); }} onDragOver={(event) => {
          if (event.dataTransfer.types.includes(PENDING_MEDIA_DRAG_TYPE) || event.dataTransfer.types.includes(PLACED_DRAG_TYPE)) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setHovering(true); }
        }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHovering(false); }} onDrop={onDrop}>
        <div className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-[var(--trail-orange)]" style={{ left: `${progress * 100}%` }} />
        {items.length === 0 && <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-[var(--evergreen-60)]">{t('media.timelineEmpty')}</p>}
        {items.map((item, index) => {
          const name = item.file?.name ?? item.originalFileName ?? t(item.kind === 'picture' ? 'media.picturesTab' : 'media.videosTab', { count: 1 });
          const samePosition = items.filter((other) => Math.abs(other.progress - item.progress) < 0.002);
          const stackIndex = samePosition.findIndex((other) => other.id === item.id && other.kind === item.kind);
          return <button key={`${item.kind}-${item.id}`} type="button" draggable onDragStart={(event) => { event.dataTransfer.setData(PLACED_DRAG_TYPE, JSON.stringify({ kind: item.kind, id: item.id })); event.dataTransfer.effectAllowed = 'move'; }}
            onClick={(event) => { event.stopPropagation(); setSelected({ kind: item.kind, id: item.id }); }}
            onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); move(item, item.progress + (event.key === 'ArrowLeft' ? -0.01 : 0.01)); } }}
            aria-label={t('media.timelineMarker', { name, percent: Math.round(item.progress * 100) })} title={name}
            className={`absolute top-1 h-11 w-11 overflow-hidden rounded-md border-2 bg-[var(--canvas)] shadow-sm focus:z-30 focus:outline-2 focus:outline-[var(--trail-orange)] ${selected?.id === item.id && selected.kind === item.kind ? 'border-[var(--trail-orange)] z-20' : 'border-white'}`}
            style={{ left: `clamp(0px, calc(${Math.max(0, Math.min(1, item.progress)) * 100}% - 22px + ${stackIndex * 8}px), calc(100% - 44px))`, zIndex: selected?.id === item.id ? 20 : index + 1 }}>
            {item.url ? item.kind === 'picture' ? <img src={item.url} alt="" className="h-full w-full object-cover" draggable={false} /> : <video src={item.url} muted preload="metadata" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center">{item.kind === 'picture' ? <ImageIcon size={18} /> : <Video size={18} />}</span>}
          </button>;
        })}
      </div>
      {items.length > 0 && <div className="mt-1 flex items-center gap-2 text-xs">
        <select aria-label={t('media.timelineSelect')} value={selectedItem ? `${selectedItem.kind}:${selectedItem.id}` : ''} onChange={(event) => { const item = items.find((entry) => `${entry.kind}:${entry.id}` === event.target.value); setSelected(item ? { id: item.id, kind: item.kind } : null); }} className="min-w-0 max-w-48 flex-1 rounded border border-[var(--evergreen)]/20 bg-transparent px-1 py-1">
          <option value="">{t('media.timelineSelect')}</option>
          {items.map((item) => <option key={`${item.kind}:${item.id}`} value={`${item.kind}:${item.id}`}>{item.file?.name ?? item.originalFileName ?? item.id} · {Math.round(item.progress * 100)}%</option>)}
        </select>
        {selectedItem && <><button className="rounded border border-[var(--evergreen)]/20 px-2 py-1" onClick={() => { if (selectedItem.kind === 'picture') selectPicture(selectedItem.id); else selectVideo(selectedItem.id); }}>{t('media.timelinePreview')}</button><button className="rounded border border-[var(--evergreen)]/20 px-2 py-1" onClick={() => seek(selectedItem.progress)}>{t('media.timelineSeek')}</button><button className="rounded border border-[var(--evergreen)]/20 px-2 py-1" onClick={() => move(selectedItem, progress)}>{t('media.bulkAtPlayhead')}</button></>}
      </div>}
    </section>
  );
}
