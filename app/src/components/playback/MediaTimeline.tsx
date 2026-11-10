import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type DragEvent, type PointerEvent } from 'react';
import { Image as ImageIcon, Video } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useI18n } from '@/i18n/useI18n';
import { importMediaAtPlacement, movePlacedMedia, PENDING_MEDIA_DRAG_TYPE, PLACED_MEDIA_DRAG_TYPE, placePendingMedia, placementAtProgress } from '@/utils/pendingMediaPlacement';
import { buildMediaTimeline, progressToTimelineTime, timelineTimeToProgress } from '@/utils/mediaTimeline';
import { resolveSharedRouteMoments } from '@/utils/sharedRouteMoments';
import { formatDuration } from '@/utils/units';
import { getMediaHoldClock, subscribeMediaHoldClock } from '@/utils/mediaHoldClock';

type MediaId = { kind: 'picture' | 'video'; id: string };
type Gesture = { item: MediaId; mode: 'move' | 'start' | 'end'; clientX: number; startMs: number; endMs: number; width: number; totalMs: number; startScroll: number };
const MIN_PICTURE_MS = 500;

export function MediaTimeline() {
  const { t } = useI18n();
  const pictures = useAppStore((state) => state.pictures);
  const videos = useAppStore((state) => state.videos);
  const playback = useAppStore((state) => state.playback);
  const annotations = useAppStore((state) => state.textAnnotations);
  const segments = useAppStore((state) => state.journeySegments);
  const tracks = useAppStore((state) => state.tracks);
  const seek = useAppStore((state) => state.seekToProgress);
  const setError = useAppStore((state) => state.setError);
  const updateDuration = useAppStore((state) => state.updatePictureDuration);
  const selectPicture = useAppStore((state) => state.setSelectedPictureId);
  const selectVideo = useAppStore((state) => state.setSelectedVideoId);
  const clock = useSyncExternalStore(subscribeMediaHoldClock, getMediaHoldClock, getMediaHoldClock);
  const [zoom, setZoom] = useState(48);
  const [viewport, setViewport] = useState({ left: 0, width: 800 });
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<MediaId | null>(null);
  const [hovering, setHovering] = useState(false);
  const [dragDelta, setDragDelta] = useState<number | null>(null);
  const [previewGesture, setPreviewGesture] = useState<Gesture | null>(null);
  const laneRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    const update = () => setViewport({ left: node.scrollLeft, width: node.clientWidth });
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const routeDuration = playback.totalDuration;
  const moments = useMemo(() => resolveSharedRouteMoments(annotations, segments, tracks, playback.routeTimingMode), [annotations, segments, tracks, playback.routeTimingMode]);
  const timeline = useMemo(() => buildMediaTimeline(routeDuration, moments, pictures, videos), [routeDuration, moments, pictures, videos]);
  const items = useMemo(() => [
    ...pictures.map((item) => ({ ...item, kind: 'picture' as const })),
    ...videos.map((item) => ({ ...item, kind: 'video' as const })),
  ], [pictures, videos]);
  const selectedItem = items.find((item) => item.id === selected?.id && item.kind === selected.kind);
  const total = Math.max(timeline.totalMs, 1);
  const moveToTime = (item: MediaId, timeMs: number) => {
    // Remove the item's own hold before translating its new output time.
    const without = buildMediaTimeline(routeDuration, moments, pictures.filter((p) => item.kind !== 'picture' || p.id !== item.id), videos.filter((v) => item.kind !== 'video' || v.id !== item.id));
    const progress = timelineTimeToProgress(timeMs, routeDuration, moments, without.blocks);
    const placement = placementAtProgress(progress);
    if (!placement) { setError(t('media.bulkNoTimelinePosition')); return false; }
    movePlacedMedia(item.kind, item.id, placement);
    return true;
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    const raw = event.dataTransfer.getData(PENDING_MEDIA_DRAG_TYPE);
    const placed = event.dataTransfer.getData(PLACED_MEDIA_DRAG_TYPE);
    const files = Array.from(event.dataTransfer.files ?? []);
    if (!raw && !placed && !files.length) return;
    event.preventDefault(); setHovering(false);
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !Number.isFinite(event.clientX)) return;
    try {
      const time = Math.max(0, Math.min(total, (event.clientX - bounds.left) / bounds.width * total));
      if (placed) {
        const item: unknown = JSON.parse(placed);
        if (item && typeof item === 'object' && 'kind' in item && 'id' in item && (item.kind === 'picture' || item.kind === 'video') && typeof item.id === 'string') { moveToTime(item as MediaId, time); setSelected(item as MediaId); }
        return;
      }
      const placement = placementAtProgress(timelineTimeToProgress(time, routeDuration, moments, timeline.blocks));
      if (!placement) { setError(t('media.bulkNoTimelinePosition')); return; }
      if (files.length) { void importMediaAtPlacement(files, placement).catch(() => setError(t('media.timelineImportError'))); return; }
      const ids: unknown = JSON.parse(raw);
      if (Array.isArray(ids) && ids.every((id) => typeof id === 'string')) placePendingMedia(ids, placement);
    } catch { /* Ignore unrelated drag data. */ }
  };
  const begin = (event: PointerEvent<HTMLElement>, item: MediaId, mode: Gesture['mode'], startMs: number, endMs: number) => {
    if (event.button !== 0 || !laneRef.current) return;
    event.preventDefault(); event.stopPropagation();
    const width = laneRef.current.getBoundingClientRect().width;
    if (!width) return;
    gesture.current = { item, mode, clientX: event.clientX, startMs, endMs, width, totalMs: total, startScroll: scrollerRef.current?.scrollLeft ?? 0 };
    setPreviewGesture(gesture.current);
    setSelected(item);
    setDragDelta(0);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const end = (event: PointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    setPreviewGesture(null);
    setDragDelta(null);
    const delta = (event.clientX - g.clientX + (scrollerRef.current?.scrollLeft ?? 0) - g.startScroll) / g.width * g.totalMs;
    if (!Number.isFinite(delta) || Math.abs(delta) < 1) return;
    if (g.mode === 'move') moveToTime(g.item, Math.max(0, g.startMs + delta));
    else if (g.mode === 'end') updateDuration(g.item.id, Math.max(MIN_PICTURE_MS, Math.round(g.endMs + delta - g.startMs)));
    else {
      const nextStart = Math.max(0, Math.min(g.endMs - MIN_PICTURE_MS, g.startMs + delta));
      if (moveToTime(g.item, nextStart)) updateDuration(g.item.id, Math.max(MIN_PICTURE_MS, Math.round(g.endMs - nextStart)));
    }
  };
  const activeBlock = clock && timeline.blocks.find((block) => block.kind === clock.kind && block.id === clock.id);
  const playhead = activeBlock && clock ? activeBlock.startMs + Math.min(activeBlock.durationMs, Math.max(0, clock.elapsedMs)) : progressToTimelineTime(playback.progress, routeDuration, moments, timeline.blocks);
  const laneWidth = Math.max(viewport.width, Math.ceil(total / 1000 * zoom));
  const pixelsPerSecond = laneWidth / (total / 1000);
  const firstTick = Math.max(0, Math.floor(viewport.left / pixelsPerSecond) - 1);
  const lastTick = Math.min(Math.floor(total / 1000), Math.ceil((viewport.left + viewport.width) / pixelsPerSecond) + 1);
  const ticks = Array.from({ length: Math.max(0, lastTick - firstTick + 1) }, (_, index) => (firstTick + index) * 1000);
  const scrollAtEdge = (clientX: number) => {
    const node = scrollerRef.current;
    if (!node) return;
    const bounds = node.getBoundingClientRect();
    if (clientX < bounds.left + 35) node.scrollLeft -= 18;
    else if (clientX > bounds.right - 35) node.scrollLeft += 18;
  };
  const scrollByPage = (direction: number) => scrollerRef.current?.scrollBy({ left: direction * viewport.width * 0.8, behavior: 'smooth' });
  return (
    <section aria-label={t('media.timelineTitle')} className="shrink-0 border-t border-[var(--evergreen)]/20 bg-[var(--canvas)] px-3 py-2 sm:px-4">
      <div className="flex items-center justify-between gap-2 text-xs"><h2 className="font-semibold text-[var(--evergreen)]">{t('media.timelineTitle')}</h2><span className="text-[var(--evergreen-60)]">{formatDuration(playhead / 1000)} / {t('media.timelineDuration', { duration: formatDuration(total / 1000) })}</span></div>
      <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">
        <button type="button" className="rounded border border-[var(--evergreen)]/20 px-2 py-1" onClick={() => scrollByPage(-1)} aria-label={t('media.timelineScrollBack')}>←</button>
        <button type="button" className="rounded border border-[var(--evergreen)]/20 px-2 py-1" onClick={() => scrollByPage(1)} aria-label={t('media.timelineScrollForward')}>→</button>
        <button type="button" className="rounded border border-[var(--evergreen)]/20 px-2 py-1" onClick={() => scrollerRef.current?.scrollTo({ left: Math.max(0, playhead / total * laneWidth - viewport.width / 2), behavior: 'smooth' })}>{t('media.timelineFindPlayhead')}</button>
        <button type="button" className="rounded border border-[var(--evergreen)]/20 px-2 py-1" disabled={zoom <= 32} onClick={() => setZoom((value) => Math.max(32, value - 16))} aria-label={t('media.timelineZoomOut')}>−</button>
        <button type="button" className="rounded border border-[var(--evergreen)]/20 px-2 py-1" disabled={zoom >= 128} onClick={() => setZoom((value) => Math.min(128, value + 16))} aria-label={t('media.timelineZoomIn')}>+</button>
      </div>
      <div ref={scrollerRef} onScroll={(event) => setViewport({ left: event.currentTarget.scrollLeft, width: event.currentTarget.clientWidth })} className="overflow-x-auto pb-2">
        <div className="relative" style={{ width: `${laneWidth}px` }}>
          <div className="relative mt-1 h-5 text-[10px] text-[var(--evergreen-60)]" aria-hidden="true">{ticks.map((ms) => <span key={ms} className="absolute border-l border-[var(--evergreen)]/30 pl-1" style={{ left: `${ms / total * 100}%` }}>{formatDuration(ms / 1000)}</span>)}</div>
          <div ref={laneRef} className={`relative h-16 rounded-lg border border-dashed ${hovering ? 'border-[var(--trail-orange)] bg-[var(--trail-orange)]/10' : 'border-[var(--evergreen)]/25 bg-[var(--evergreen)]/5'}`}
            aria-label={t('media.timelineDrop')} onClick={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); if (bounds.width) seek(timelineTimeToProgress((event.clientX - bounds.left) / bounds.width * total, routeDuration, moments, timeline.blocks)); }}
            onDragOver={(event) => { if ((event.dataTransfer.types.includes(PENDING_MEDIA_DRAG_TYPE) || event.dataTransfer.types.includes(PLACED_MEDIA_DRAG_TYPE) || event.dataTransfer.types.includes('Files'))) { event.preventDefault(); event.dataTransfer.dropEffect = event.dataTransfer.types.includes(PLACED_MEDIA_DRAG_TYPE) ? 'move' : 'copy'; setHovering(true); scrollAtEdge(event.clientX); } }}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHovering(false); }} onDrop={onDrop}>
            <div className="pointer-events-none absolute inset-y-0 z-30 w-0.5 bg-[var(--trail-orange)]" style={{ left: `${playhead / total * 100}%` }} />
            {items.length === 0 && <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-[var(--evergreen-60)]">{t('media.timelineEmpty')}</p>}
            {timeline.blocks.map((block, index) => {
              const item = items.find((entry) => entry.id === block.id && entry.kind === block.kind);
              if (!item) return null;
              const name = item.file?.name ?? item.originalFileName ?? item.id;
              const active = previewGesture?.item.id === block.id && previewGesture.item.kind === block.kind ? previewGesture : null;
              const delta = active && dragDelta !== null ? dragDelta : 0;
              const displayStart = active?.mode === 'move' ? Math.max(0, block.startMs + delta) : active?.mode === 'start' ? Math.max(0, Math.min(block.endMs - MIN_PICTURE_MS, block.startMs + delta)) : block.startMs;
              const displayEnd = active?.mode === 'move' ? displayStart + block.durationMs : active?.mode === 'end' ? Math.max(block.startMs + MIN_PICTURE_MS, block.endMs + delta) : block.endMs;
              return <div key={`${block.kind}-${block.id}`} role="button" tabIndex={0} aria-label={t('media.timelineMarker', { name, percent: Math.round(item.progress * 100) })} title={`${name} · ${(block.durationMs / 1000).toFixed(1)}s`}
                onPointerDown={(event) => begin(event, item, 'move', block.startMs, block.endMs)} onPointerMove={(event) => { const g = gesture.current; if (g) { scrollAtEdge(event.clientX); setDragDelta((event.clientX - g.clientX + (scrollerRef.current?.scrollLeft ?? 0) - g.startScroll) / g.width * g.totalMs); } }} onPointerUp={end} onPointerCancel={() => { gesture.current = null; setPreviewGesture(null); setDragDelta(null); }}
                onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); moveToTime(item, block.startMs + (event.key === 'ArrowLeft' ? -1000 : 1000)); } }}
                className={`absolute top-1 flex h-14 min-w-2 touch-none select-none overflow-hidden rounded-md border-2 bg-[var(--evergreen)] text-white shadow-sm focus:z-20 ${selected?.id === item.id && selected.kind === item.kind ? 'border-[var(--trail-orange)]' : 'border-white'}`}
                style={{ left: `${displayStart / total * 100}%`, width: `${Math.max(0, displayEnd - displayStart) / total * 100}%`, zIndex: index + 1 }}>
                {item.kind === 'picture' && <span role="slider" tabIndex={0} aria-label={t('media.timelineResizeStart', { name })} aria-valuetext={`${(block.durationMs / 1000).toFixed(1)}s`} onPointerDown={(event) => begin(event, item, 'start', block.startMs, block.endMs)} onPointerUp={end} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const delta = event.key === 'ArrowLeft' ? -500 : 500; const next = Math.max(0, Math.min(block.endMs - MIN_PICTURE_MS, block.startMs + delta)); if (moveToTime(item, next)) updateDuration(item.id, block.endMs - next); } }} className="z-10 w-2 shrink-0 cursor-ew-resize bg-white/65" />}
                <span className="flex min-w-0 flex-1 cursor-grab items-center gap-1 overflow-hidden">{item.url ? item.kind === 'picture' ? <img src={item.url} alt="" className="h-full w-10 shrink-0 object-cover" draggable={false} /> : <video src={item.url} muted preload="metadata" className="h-full w-10 shrink-0 object-cover" /> : item.kind === 'picture' ? <ImageIcon size={16} /> : <Video size={16} />}<span className="truncate text-[10px]">{name}</span></span>
                {item.kind === 'picture' && <span role="slider" tabIndex={0} aria-label={t('media.timelineResizeEnd', { name })} aria-valuetext={`${(block.durationMs / 1000).toFixed(1)}s`} onPointerDown={(event) => begin(event, item, 'end', block.startMs, block.endMs)} onPointerUp={end} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); updateDuration(item.id, Math.max(MIN_PICTURE_MS, block.durationMs + (event.key === 'ArrowLeft' ? -500 : 500))); } }} className="z-10 w-2 shrink-0 cursor-ew-resize bg-white/65" />}
              </div>;
            })}
          </div>
          {moments.length > 0 && <div aria-label={t('media.timelineAnnotations')} className="relative mt-1 h-8 rounded border border-[var(--evergreen)]/15 bg-[var(--evergreen)]/5">
            {moments.map((annotation, index) => {
              const arrival = annotation.progress * routeDuration;
              const startRoute = Math.max(0, arrival - (annotation.presentation === 'side-panel' ? 500 : Math.max(0, annotation.displayDuration)));
              const endRoute = annotation.presentation === 'side-panel' ? Math.min(routeDuration, arrival + 500) : arrival;
              const start = progressToTimelineTime(routeDuration ? startRoute / routeDuration : 0, routeDuration, moments, timeline.blocks);
              const end = progressToTimelineTime(routeDuration ? endRoute / routeDuration : 0, routeDuration, moments, timeline.blocks);
              return <button key={`${annotation.id}-${index}`} type="button" title={annotation.title} aria-label={t('media.timelineAnnotation', { name: annotation.title })} onClick={() => seek(annotation.progress)} className="absolute top-0.5 h-6 min-w-6 overflow-hidden rounded border border-white/60 px-1 text-left text-[10px] text-white" style={{ left: `${start / total * 100}%`, width: `${Math.max(0, end - start) / total * 100}%`, backgroundColor: annotation.color || '#385b4d' }}>{annotation.title}</button>;
            })}
            <div className="pointer-events-none absolute inset-y-0 z-30 w-0.5 bg-[var(--trail-orange)]" style={{ left: `${playhead / total * 100}%` }} />
          </div>}
        </div>
      </div>
      {items.length > 0 && <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
        <select aria-label={t('media.timelineSelect')} value={selectedItem ? `${selectedItem.kind}:${selectedItem.id}` : ''} onChange={(event) => { const item = items.find((entry) => `${entry.kind}:${entry.id}` === event.target.value); setSelected(item ? { id: item.id, kind: item.kind } : null); }} className="min-w-0 max-w-48 flex-1 rounded border border-[var(--evergreen)]/20 bg-transparent px-1 py-1"><option value="">{t('media.timelineSelect')}</option>{timeline.blocks.map((block) => { const item = items.find((entry) => entry.kind === block.kind && entry.id === block.id)!; return <option key={`${item.kind}:${item.id}`} value={`${item.kind}:${item.id}`}>{item.file?.name ?? item.originalFileName ?? item.id} · {formatDuration(block.startMs / 1000)}</option>; })}</select>
        {selectedItem && <><button className="rounded border border-[var(--evergreen)]/20 px-2 py-1" onClick={() => { if (selectedItem.kind === 'picture') selectPicture(selectedItem.id); else selectVideo(selectedItem.id); }}>{t('media.timelinePreview')}</button><button className="rounded border border-[var(--evergreen)]/20 px-2 py-1" onClick={() => seek(selectedItem.progress)}>{t('media.timelineSeek')}</button><button className="rounded border border-[var(--evergreen)]/20 px-2 py-1" onClick={() => { const placement = placementAtProgress(playback.progress); if (placement) movePlacedMedia(selectedItem.kind, selectedItem.id, placement); }}>{t('media.bulkAtPlayhead')}</button></>}
      </div>}
    </section>
  );
}
