import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type DragEvent, type PointerEvent } from 'react';
import { Image as ImageIcon, Video } from 'lucide-react';
import * as maplibregl from 'maplibre-gl';
import { mapGlobalRef } from '@/utils/mapRef';
import { useAppStore } from '@/store/useAppStore';
import { useI18n } from '@/i18n/useI18n';
import { ANNOTATION_DRAG_TYPE, importMediaAtPlacement, movePlacedMedia, moveTimelineAnnotation, PENDING_MEDIA_DRAG_TYPE, PLACED_MEDIA_DRAG_TYPE, placePendingMedia, placementAtProgress } from '@/utils/pendingMediaPlacement';
import { buildMediaTimeline, progressToTimelineTime, timelineTimeToProgress } from '@/utils/mediaTimeline';
import { resolveSharedRouteMoments } from '@/utils/sharedRouteMoments';
import { formatDuration } from '@/utils/units';
import { getMediaHoldClock, subscribeMediaHoldClock } from '@/utils/mediaHoldClock';
import { getTimelineDraggedPicture, setTimelineDraggedPicture, subscribeTimelineDraggedPicture } from '@/utils/timelineDragPicture';

type MediaId = { kind: 'picture' | 'video' | 'annotation'; id: string; anchorProgress?: number };
type Gesture = { item: MediaId; mode: 'move' | 'start' | 'end'; clientX: number; startMs: number; endMs: number; width: number; totalMs: number; startScroll: number; arrivalMs?: number };
const MIN_PICTURE_MS = 500;

export function MediaTimeline() {
  const { t } = useI18n();
  const pictures = useAppStore((state) => state.pictures);
  const videos = useAppStore((state) => state.videos);
  const playback = useAppStore((state) => state.playback);
  const annotations = useAppStore((state) => state.textAnnotations);
  const defaultHold = useAppStore((state) => state.settings.annotationHoldDuration ?? 5000);
  const segments = useAppStore((state) => state.journeySegments);
  const tracks = useAppStore((state) => state.tracks);
  const seek = useAppStore((state) => state.seekToProgress);
  const setError = useAppStore((state) => state.setError);
  const updateDuration = useAppStore((state) => state.updatePictureDuration);
  const updateAnnotation = useAppStore((state) => state.updateTextAnnotation);
  const clock = useSyncExternalStore(subscribeMediaHoldClock, getMediaHoldClock, getMediaHoldClock);
  const draggedPictureId = useSyncExternalStore(subscribeTimelineDraggedPicture, getTimelineDraggedPicture, getTimelineDraggedPicture);
  const [zoom, setZoom] = useState<number | null>(48);
  const [collapsed, setCollapsed] = useState(false);
  const [previewPosition, setPreviewPosition] = useState<{ lat: number; lon: number } | null>(null);
  const [viewport, setViewport] = useState({ left: 0, width: 800 });
  const scrollerRef = useRef<HTMLDivElement>(null);
  const followPlayhead = useRef(true);
  const expectedScroll = useRef<number | null>(null);
  const wasPlaying = useRef(playback.isPlaying);
  const wasHoldingMedia = useRef(false);
  const [selected, setSelected] = useState<MediaId | null>(null);
  const [hovering, setHovering] = useState(false);
  const [dragDelta, setDragDelta] = useState<number | null>(null);
  const [previewGesture, setPreviewGesture] = useState<Gesture | null>(null);
  const laneRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  useEffect(() => () => { setTimelineDraggedPicture(null); }, []);
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
  }, [collapsed]);
  useEffect(() => {
    const map = mapGlobalRef.current;
    if (!map || !previewPosition) return;
    const element = document.createElement('div');
    element.style.cssText = 'width: 36px; height: 36px; border: 3px solid white; border-radius: 50%; background: #c1652f; box-shadow: 0 2px 8px #0008; overflow: hidden; pointer-events: none';
    const photo = draggedPictureId ? pictures.find((item) => item.id === draggedPictureId) : null;
    if (photo?.url) {
      const thumbnail = document.createElement('img');
      thumbnail.src = photo.url;
      thumbnail.alt = '';
      thumbnail.style.cssText = 'width: 100%; height: 100%; object-fit: cover';
      element.appendChild(thumbnail);
    }
    const marker = new maplibregl.Marker({ element, anchor: 'bottom' }).setLngLat([previewPosition.lon, previewPosition.lat]).addTo(map);
    const pixel = map.project([previewPosition.lon, previewPosition.lat]);
    const canvas = map.getCanvas();
    if (pixel.x < 30 || pixel.y < 30 || pixel.x > canvas.clientWidth - 30 || pixel.y > canvas.clientHeight - 30) map.jumpTo({ center: [previewPosition.lon, previewPosition.lat] });
    return () => { marker.remove(); };
  }, [previewPosition, draggedPictureId, pictures]);
  const routeDuration = playback.totalDuration;
  const moments = useMemo(() => resolveSharedRouteMoments(annotations, segments, tracks, playback.routeTimingMode).map((annotation) => ({ ...annotation, holdDuration: annotation.holdDuration ?? defaultHold })), [annotations, segments, tracks, playback.routeTimingMode, defaultHold]);
  const timeline = useMemo(() => buildMediaTimeline(routeDuration, moments, pictures, videos), [routeDuration, moments, pictures, videos]);
  const items = useMemo(() => [
    ...pictures.map((item) => ({ ...item, kind: 'picture' as const })),
    ...videos.map((item) => ({ ...item, kind: 'video' as const })),
  ], [pictures, videos]);
  const total = Math.max(timeline.totalMs, 1);
  const placementForTime = (item: MediaId, timeMs: number) => {
    const otherMoments = item.kind === 'annotation' ? moments.filter((entry) => entry.id !== item.id) : moments;
    const without = buildMediaTimeline(routeDuration, otherMoments, pictures.filter((p) => item.kind !== 'picture' || p.id !== item.id), videos.filter((v) => item.kind !== 'video' || v.id !== item.id));
    const originalProgress = item.anchorProgress ?? annotations.find((entry) => entry.id === item.id)?.progress;
    const annotationOffset = item.kind === 'annotation' && originalProgress !== undefined
      ? progressToTimelineTime(originalProgress, routeDuration, moments, timeline.blocks) - progressToTimelineTime(originalProgress, routeDuration, otherMoments, without.blocks)
      : 0;
    return placementAtProgress(timelineTimeToProgress(timeMs - annotationOffset, routeDuration, otherMoments, without.blocks));
  };
  const moveToTime = (item: MediaId, timeMs: number) => {
    const placement = placementForTime(item, timeMs);
    if (!placement) { setError(t('media.bulkNoTimelinePosition')); return false; }
    if (item.kind === 'annotation') moveTimelineAnnotation(item.id, placement);
    else movePlacedMedia(item.kind, item.id, placement);
    return true;
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    const raw = event.dataTransfer.getData(PENDING_MEDIA_DRAG_TYPE);
    const placed = event.dataTransfer.getData(PLACED_MEDIA_DRAG_TYPE);
    const annotationId = event.dataTransfer.getData(ANNOTATION_DRAG_TYPE);
    const files = Array.from(event.dataTransfer.files ?? []);
    if (!raw && !placed && !annotationId && !files.length) return;
    event.preventDefault(); setHovering(false); setPreviewPosition(null);
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !Number.isFinite(event.clientX)) return;
    try {
      const time = Math.max(0, Math.min(total, (event.clientX - bounds.left) / bounds.width * total));
      if (annotationId && annotations.some((item) => item.id === annotationId)) { moveToTime({ kind: 'annotation', id: annotationId }, time); return; }
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
  const resizeAnnotation = (item: MediaId, edge: 'start' | 'end', delta: number, arrivalMs: number) => {
    const annotation = annotations.find((entry) => entry.id === item.id);
    if (!annotation || routeDuration <= 0) return;
    const oldHold = Math.max(0, annotation.holdDuration ?? defaultHold);
    const requestedChange = edge === 'start' ? -delta : delta;
    const nextHold = Math.max(0, Math.min(30000, Math.round(oldHold + requestedChange)));
    const actualChange = nextHold - oldHold;
    const shift = (edge === 'start' ? -1 : 1) * actualChange / 2;
    const placement = placementForTime(item, arrivalMs + shift);
    if (!placement) { setError(t('media.bulkNoTimelinePosition')); return; }
    updateAnnotation(item.id, { holdDuration: nextHold, progress: placement.progress, routeDistance: placement.routeDistance, lat: placement.lat, lon: placement.lon, elevation: placement.elevation });
  };
  const begin = (event: PointerEvent<HTMLElement>, item: MediaId, mode: Gesture['mode'], startMs: number, endMs: number, arrivalMs?: number) => {
    if (event.button !== 0 || !laneRef.current) return;
    event.preventDefault(); event.stopPropagation();
    const width = laneRef.current.getBoundingClientRect().width;
    if (!width) return;
    gesture.current = { item, mode, clientX: event.clientX, startMs, endMs, width, totalMs: total, startScroll: scrollerRef.current?.scrollLeft ?? 0, arrivalMs };
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
    setPreviewPosition(null);
    setTimelineDraggedPicture(null);
    const delta = (event.clientX - g.clientX + (scrollerRef.current?.scrollLeft ?? 0) - g.startScroll) / g.width * g.totalMs;
    if (!Number.isFinite(delta) || Math.abs(delta) < 1) return;
    if (g.item.kind === 'annotation' && g.mode !== 'move') { resizeAnnotation(g.item, g.mode, delta, g.arrivalMs ?? g.endMs); return; }
    if (g.mode === 'move') moveToTime(g.item, Math.max(0, g.startMs + delta));
    else if (g.mode === 'end') updateDuration(g.item.id, Math.max(MIN_PICTURE_MS, Math.round(g.endMs + delta - g.startMs)));
    else {
      const nextStart = Math.max(0, Math.min(g.endMs - MIN_PICTURE_MS, g.startMs + delta));
      if (moveToTime(g.item, nextStart)) updateDuration(g.item.id, Math.max(MIN_PICTURE_MS, Math.round(g.endMs - nextStart)));
    }
  };
  const activeBlock = clock && timeline.blocks.find((block) => block.kind === clock.kind && block.id === clock.id);
  const playhead = activeBlock && clock ? activeBlock.startMs + Math.min(activeBlock.durationMs, Math.max(0, clock.elapsedMs)) : progressToTimelineTime(playback.progress, routeDuration, moments, timeline.blocks);
  const laneWidth = Math.max(1, viewport.width, Math.ceil(total / 1000 * (zoom ?? 0)));
  useEffect(() => {
    if (clock) wasHoldingMedia.current = true;
    if (playback.isPlaying && !wasPlaying.current) {
      if (!wasHoldingMedia.current) followPlayhead.current = true;
      wasHoldingMedia.current = false;
    }
    wasPlaying.current = playback.isPlaying;
    const node = scrollerRef.current;
    if (!node || !followPlayhead.current || (!playback.isPlaying && !clock)) return;
    const maxScroll = Math.max(0, node.scrollWidth - node.clientWidth);
    const next = Math.min(maxScroll, Math.max(0, playhead / total * laneWidth - node.clientWidth / 2));
    if (Math.abs(node.scrollLeft - next) > 1) { expectedScroll.current = next; node.scrollLeft = next; }
  }, [playback.isPlaying, clock, playhead, total, laneWidth, collapsed]);
  const pixelsPerSecond = laneWidth / (total / 1000);
  const minStep = Math.max(1, Math.ceil(42 / pixelsPerSecond));
  const scale = 10 ** Math.floor(Math.log10(minStep));
  const step = [1, 2, 5, 10].find((value) => value * scale >= minStep)! * scale;
  const firstTick = Math.max(0, Math.floor(viewport.left / pixelsPerSecond / step) - 1);
  const lastTick = Math.min(Math.floor(total / 1000 / step), Math.ceil((viewport.left + viewport.width) / pixelsPerSecond / step) + 1);
  const ticks = Array.from({ length: Math.max(0, lastTick - firstTick + 1) }, (_, index) => (firstTick + index) * step * 1000);
  const scrollAtEdge = (clientX: number) => {
    const node = scrollerRef.current;
    if (!node) return;
    const bounds = node.getBoundingClientRect();
    if (!bounds.width) return;
    if (clientX < bounds.left + 35) { followPlayhead.current = false; node.scrollLeft -= 18; }
    else if (clientX > bounds.right - 35) { followPlayhead.current = false; node.scrollLeft += 18; }
  };
  const scrollByPage = (direction: number) => { followPlayhead.current = false; expectedScroll.current = null; scrollerRef.current?.scrollBy({ left: direction * viewport.width * 0.8, behavior: 'smooth' }); };
  return (
    <section aria-label={t('media.timelineTitle')} className="shrink-0 min-w-0 max-w-full overflow-hidden border-t border-[var(--evergreen)]/20 bg-[var(--canvas)] px-3 py-2 sm:px-4">
      <div className="flex items-center gap-2 text-xs">
        <h2 className="font-semibold text-[var(--evergreen)]">{t('media.timelineTitle')}</h2>
        {!collapsed && <div className="flex items-center gap-1">
          <button type="button" className="rounded border border-[var(--evergreen)]/20 px-2 py-1" disabled={zoom === null} onClick={() => setZoom((value) => { const next = (value ?? 0) / 1.5; return next <= viewport.width / (total / 1000) ? null : next; })} aria-label={t('media.timelineZoomOut')}>−</button>
          <button type="button" className="rounded border border-[var(--evergreen)]/20 px-2 py-1" disabled={zoom !== null && zoom >= 128} onClick={() => setZoom((value) => Math.min(128, Math.max(viewport.width / (total / 1000) * 1.5, (value ?? 0) * 1.5)))} aria-label={t('media.timelineZoomIn')}>+</button>
        </div>}
        <span className="ml-auto text-[var(--evergreen-60)]">{formatDuration(playhead / 1000)} / {t('media.timelineDuration', { duration: formatDuration(total / 1000) })}</span>
        <button type="button" className="rounded border border-[var(--evergreen)]/20 px-2 py-1" onClick={() => { setCollapsed((value) => !value); setPreviewPosition(null); }} aria-expanded={!collapsed}>{t(collapsed ? 'media.timelineExpand' : 'media.timelineCollapse')}</button>
      </div>
      {!collapsed && <>
      <div className="flex min-w-0 items-center gap-1">
      <button type="button" className="shrink-0 rounded px-1 py-2 text-[var(--evergreen)] hover:bg-[var(--evergreen)]/10" onClick={() => scrollByPage(-1)} aria-label={t('media.timelineScrollBack')}>‹</button>
      <div ref={scrollerRef} onScroll={(event) => { const node = event.currentTarget; if (expectedScroll.current === null || Math.abs(node.scrollLeft - expectedScroll.current) > 1) followPlayhead.current = false; expectedScroll.current = null; setViewport({ left: node.scrollLeft, width: node.clientWidth }); }} className="flex-1 min-w-0 overflow-x-auto pb-2">
        <div className="relative" style={{ width: `${laneWidth}px` }}>
          <div className="relative mt-1 h-5 text-[10px] text-[var(--evergreen-60)]" aria-hidden="true">{ticks.map((ms) => <span key={ms} className="absolute border-l border-[var(--evergreen)]/30 pl-1" style={{ left: `${ms / total * 100}%` }}>{formatDuration(ms / 1000)}</span>)}</div>
          <div ref={laneRef} className={`relative h-16 rounded-lg border border-dashed ${hovering ? 'border-[var(--trail-orange)] bg-[var(--trail-orange)]/10' : 'border-[var(--evergreen)]/25 bg-[var(--evergreen)]/5'}`}
            aria-label={t('media.timelineDrop')} onClick={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); if (bounds.width) seek(timelineTimeToProgress((event.clientX - bounds.left) / bounds.width * total, routeDuration, moments, timeline.blocks)); }}
            onDragOver={(event) => { if ((event.dataTransfer.types.includes(PENDING_MEDIA_DRAG_TYPE) || event.dataTransfer.types.includes(PLACED_MEDIA_DRAG_TYPE) || event.dataTransfer.types.includes(ANNOTATION_DRAG_TYPE) || event.dataTransfer.types.includes('Files'))) { event.preventDefault(); event.dataTransfer.dropEffect = (event.dataTransfer.types.includes(PLACED_MEDIA_DRAG_TYPE) || event.dataTransfer.types.includes(ANNOTATION_DRAG_TYPE)) ? 'move' : 'copy'; setHovering(true); scrollAtEdge(event.clientX); const bounds = event.currentTarget.getBoundingClientRect(); if (bounds.width) { const time = Math.max(0, Math.min(total, (event.clientX - bounds.left) / bounds.width * total)); setPreviewPosition(draggedPictureId ? placementForTime({ kind: 'picture', id: draggedPictureId }, time) : placementAtProgress(timelineTimeToProgress(time, routeDuration, moments, timeline.blocks))); } } }}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { setHovering(false); setPreviewPosition(null); } }} onDrop={onDrop}>
            <div className="pointer-events-none absolute inset-y-0 z-30 w-0.5 bg-[var(--trail-orange)]" style={{ left: `${playhead / total * 100}%` }} />
            {items.length === 0 && moments.length === 0 && <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-[var(--evergreen-60)]">{t('media.timelineEmpty')}</p>}
            {timeline.blocks.map((block, index) => {
              const item = items.find((entry) => entry.id === block.id && entry.kind === block.kind);
              if (!item) return null;
              const name = item.file?.name ?? item.originalFileName ?? item.id;
              const active = previewGesture?.item.id === block.id && previewGesture.item.kind === block.kind ? previewGesture : null;
              const delta = active && dragDelta !== null ? dragDelta : 0;
              const displayStart = active?.mode === 'move' ? Math.max(0, block.startMs + delta) : active?.mode === 'start' ? Math.max(0, Math.min(block.endMs - MIN_PICTURE_MS, block.startMs + delta)) : block.startMs;
              const displayEnd = active?.mode === 'move' ? displayStart + block.durationMs : active?.mode === 'end' ? Math.max(block.startMs + MIN_PICTURE_MS, block.endMs + delta) : block.endMs;
              return <div key={`${block.kind}-${block.id}`} role="button" tabIndex={0} aria-label={t('media.timelineMarker', { name, percent: Math.round(item.progress * 100) })} title={`${name} · ${(block.durationMs / 1000).toFixed(1)}s`}
                onPointerDown={(event) => begin(event, item, 'move', block.startMs, block.endMs)} onPointerMove={(event) => { const g = gesture.current; if (g) { scrollAtEdge(event.clientX); const delta = (event.clientX - g.clientX + (scrollerRef.current?.scrollLeft ?? 0) - g.startScroll) / g.width * g.totalMs; setDragDelta(delta); if (g.mode !== 'end') { if (g.item.kind === 'picture') setTimelineDraggedPicture(g.item.id); setPreviewPosition(placementForTime(g.item, Math.max(0, g.startMs + delta))); } } }} onPointerUp={end} onPointerCancel={() => { gesture.current = null; setPreviewGesture(null); setDragDelta(null); setPreviewPosition(null); setTimelineDraggedPicture(null); }} onLostPointerCapture={() => { if (gesture.current) { gesture.current = null; setPreviewGesture(null); setDragDelta(null); setPreviewPosition(null); setTimelineDraggedPicture(null); } }}
                onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); moveToTime(item, block.startMs + (event.key === 'ArrowLeft' ? -1000 : 1000)); } }}
                className={`group absolute top-1 flex h-14 min-w-2 touch-none select-none overflow-hidden rounded-md border-2 bg-[var(--evergreen)] text-white shadow-sm focus:z-20 ${selected?.id === item.id && selected.kind === item.kind ? 'border-[var(--trail-orange)]' : 'border-white'}`}
                style={{ left: `${displayStart / total * 100}%`, width: `${Math.max(0, displayEnd - displayStart) / total * 100}%`, zIndex: index + 1 }}>
                {item.kind === 'picture' && <span role="slider" tabIndex={0} aria-label={t('media.timelineResizeStart', { name })} aria-valuetext={`${(block.durationMs / 1000).toFixed(1)}s`} onPointerDown={(event) => begin(event, item, 'start', block.startMs, block.endMs)} onPointerUp={end} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const delta = event.key === 'ArrowLeft' ? -500 : 500; const next = Math.max(0, Math.min(block.endMs - MIN_PICTURE_MS, block.startMs + delta)); if (moveToTime(item, next)) updateDuration(item.id, block.endMs - next); } }} className="z-10 flex w-3 shrink-0 cursor-ew-resize items-center justify-center bg-white/85 text-[var(--evergreen)] opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100"><span aria-hidden="true" className="text-[10px] font-bold">⋮</span></span>}
                <span className="flex min-w-0 flex-1 cursor-grab items-center gap-1 overflow-hidden">{item.url ? item.kind === 'picture' ? <img src={item.url} alt="" className="h-full w-10 shrink-0 object-cover" draggable={false} /> : <video src={item.url} muted preload="metadata" className="h-full w-10 shrink-0 object-cover" /> : item.kind === 'picture' ? <ImageIcon size={16} /> : <Video size={16} />}<span className="truncate text-[10px]">{name}</span></span>
                {item.kind === 'picture' && <span role="slider" tabIndex={0} aria-label={t('media.timelineResizeEnd', { name })} aria-valuetext={`${(block.durationMs / 1000).toFixed(1)}s`} onPointerDown={(event) => begin(event, item, 'end', block.startMs, block.endMs)} onPointerUp={end} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); updateDuration(item.id, Math.max(MIN_PICTURE_MS, block.durationMs + (event.key === 'ArrowLeft' ? -500 : 500))); } }} className="z-10 flex w-3 shrink-0 cursor-ew-resize items-center justify-center bg-white/85 text-[var(--evergreen)] opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100"><span aria-hidden="true" className="text-[10px] font-bold">⋮</span></span>}
              </div>;
            })}
            {moments.map((annotation, index) => {
              const arrival = annotation.progress * routeDuration;
              const startRoute = Math.max(0, arrival - 500);
              const endRoute = Math.min(routeDuration, arrival + 500);
              const start = progressToTimelineTime(routeDuration ? startRoute / routeDuration : 0, routeDuration, moments, timeline.blocks);
              const endTime = progressToTimelineTime(routeDuration ? endRoute / routeDuration : 0, routeDuration, moments, timeline.blocks);
              const arrivalTime = progressToTimelineTime(annotation.progress, routeDuration, moments, timeline.blocks);
              const active = previewGesture?.item.kind === 'annotation' && previewGesture.item.id === annotation.id ? previewGesture : null;
              const delta = active ? (dragDelta ?? 0) : 0;
              const displayStart = active?.mode === 'move' ? Math.max(0, start + delta) : active?.mode === 'start' ? Math.max(0, Math.min(endTime - MIN_PICTURE_MS, start + delta)) : start;
              const displayEnd = active?.mode === 'move' ? displayStart + endTime - start : active?.mode === 'end' ? Math.max(start + MIN_PICTURE_MS, endTime + delta) : endTime;
              const annotationId = { kind: 'annotation' as const, id: annotation.id, anchorProgress: annotation.progress };
              return <div key={`${annotation.id}-${index}`} role="button" tabIndex={0} title={annotation.title} aria-label={t('media.timelineAnnotation', { name: annotation.title })}
                onPointerDown={(event) => begin(event, annotationId, 'move', arrivalTime, arrivalTime + Math.max(0, endTime - start))}
                onPointerMove={(event) => { const g = gesture.current; if (g) { scrollAtEdge(event.clientX); const change = (event.clientX - g.clientX + (scrollerRef.current?.scrollLeft ?? 0) - g.startScroll) / g.width * g.totalMs; setDragDelta(change); if (g.mode === 'move') setPreviewPosition(placementForTime(g.item, Math.max(0, g.startMs + change))); else setPreviewPosition(placementForTime(g.item, Math.max(0, (g.arrivalMs ?? g.endMs) + change / 2))); } }}
                onPointerUp={end} onPointerCancel={() => { gesture.current = null; setPreviewGesture(null); setDragDelta(null); setPreviewPosition(null); setTimelineDraggedPicture(null); }} onLostPointerCapture={() => { if (gesture.current) { gesture.current = null; setPreviewGesture(null); setDragDelta(null); setPreviewPosition(null); setTimelineDraggedPicture(null); } }} onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); moveToTime({ kind: 'annotation', id: annotation.id, anchorProgress: annotation.progress }, arrivalTime + (event.key === 'ArrowLeft' ? -1000 : 1000)); } }}
                className="group absolute top-1 z-20 flex h-14 min-w-8 touch-none select-none items-center overflow-hidden rounded border-2 border-white text-left text-[10px] text-white cursor-grab" style={{ left: `${displayStart / total * 100}%`, width: `${Math.max(0, displayEnd - displayStart) / total * 100}%`, backgroundColor: annotation.color || '#385b4d' }}>
                {(['start', 'end'] as const).map((edge) => <span key={edge} role="slider" tabIndex={0} aria-label={t(edge === 'start' ? 'media.timelineResizeStart' : 'media.timelineResizeEnd', { name: annotation.title })} aria-valuetext={`${((endTime - start) / 1000).toFixed(1)}s`} onPointerDown={(event) => begin(event, annotationId, edge, start, endTime, arrivalTime)} onPointerUp={end} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); resizeAnnotation(annotationId, edge, event.key === 'ArrowLeft' ? -500 : 500, arrivalTime); } }} className={`${edge === 'end' ? 'order-last' : ''} z-10 flex h-full w-3 shrink-0 cursor-ew-resize items-center justify-center bg-white/85 text-[var(--evergreen)] opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100`}><span aria-hidden="true" className="text-[10px] font-bold">⋮</span></span>)}
                <span className="min-w-0 flex-1 truncate px-1">{annotation.title}</span>
              </div>;
            })}
          </div>
        </div>
      </div>
      <button type="button" className="shrink-0 rounded px-1 py-2 text-[var(--evergreen)] hover:bg-[var(--evergreen)]/10" onClick={() => scrollByPage(1)} aria-label={t('media.timelineScrollForward')}>›</button>
      </div>
      </>}
    </section>
  );
}
