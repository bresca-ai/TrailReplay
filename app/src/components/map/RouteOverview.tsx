import { useEffect, useMemo, useRef } from 'react';
import type { CropPreviewMetrics } from '@/utils/crop';
import { useComputedJourney } from '@/hooks/useComputedJourney';
import { useAppStore } from '@/store/useAppStore';
import { useI18n } from '@/i18n/useI18n';
import { comparisonDistanceAtPrimary, getRouteComparisonPlan } from '@/utils/routeComparisonPlayback';
import { interpolateTrackPoint } from '@/utils/gpx/interpolateTrackPoint';
import { buildTrackTimeIndex, trackPositionAtTime } from '@/utils/trackPositionAtTime';
import { buildJourneyOverviewRoutes, buildRouteOverviewGeometry, projectRouteOverviewProgress, routeOverviewColors } from './routeOverviewGeometry';

interface Props { containerSize: { width: number; height: number }; frame: CropPreviewMetrics | null }
const WIDTH = 200, HEIGHT = 144;
const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function RouteOverview({ containerSize, frame }: Props) {
  const { t } = useI18n();
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const settings = useAppStore(state => state.settings);
  const setSettings = useAppStore(state => state.setSettings);
  const isExporting = useAppStore(state => state.isExporting);
  const exportResolution = useAppStore(state => state.videoExportSettings.resolution);
  const phase = useAppStore(state => state.animationPhase);
  const comparisons = useAppStore(state => state.comparisonTracks);
  const comparisonMode = useAppStore(state => state.comparisonMode);
  const comparisonThreshold = useAppStore(state => state.comparisonThresholdMeters);
  const tracks = useAppStore(state => state.tracks);
  const { allCoordinates, completedCoordinates, currentTrackColor, computedJourney, currentSegment, currentPosition, activeTrack } = useComputedJourney();
  const selectedSegment = currentSegment?.segment;
  const routePaths = useMemo(() => {
    const fallbackColor = settings.trailStyle.trailColor;
    const primary = computedJourney
      ? buildJourneyOverviewRoutes(computedJourney, [], selectedSegment, null, fallbackColor, settings.routeOverviewPerRoute)
      : [{ id: activeTrack?.id ?? 'route', trackId: activeTrack?.id, color: activeTrack?.color ?? fallbackColor, coordinates: allCoordinates, completed: [] as number[][] }];
    const primaryIds = new Set(primary.map((route) => route.trackId));
    const others = comparisons.filter((comparison) => !settings.routeOverviewPerRoute && comparison.visible && (!comparison.groupId || primaryIds.has(comparison.groupId)))
      .map((comparison) => ({ id: comparison.id, trackId: comparison.groupId, color: comparison.color,
        coordinates: comparison.track.points.map((point) => [point.lon, point.lat]), completed: [] as number[][] }));
    return [...primary, ...others];
  }, [computedJourney, selectedSegment, settings.trailStyle.trailColor, settings.routeOverviewPerRoute, activeTrack, allCoordinates, comparisons]);
  const geometry = useMemo(() => {
    const coordinates = routePaths.flatMap((route) => route.coordinates);
    // Include connections in the bounds so the position marker remains on
    // screen while travelling between routes, without drawing extra lines.
    for (const segment of computedJourney?.segmentTimings ?? []) {
      if (segment.type !== 'transport' || (settings.routeOverviewPerRoute && segment.segmentId !== selectedSegment?.segmentId)) continue;
      coordinates.push(...computedJourney!.coordinates.slice(segment.startCoordIndex, segment.endCoordIndex + 1).map((point) => [point.lon, point.lat]));
    }
    return buildRouteOverviewGeometry(coordinates, WIDTH, HEIGHT);
  }, [routePaths, computedJourney, selectedSegment, settings.routeOverviewPerRoute]);
  const projectedPaths = useMemo(() => new Map(routePaths.map((route) => [route.id,
    geometry ? projectRouteOverviewProgress(route.coordinates, geometry.project) : [],
  ])), [routePaths, geometry]);
  const comparisonTimeIndexes = useMemo(() => new Map(comparisons.map((comparison) => [comparison.id, buildTrackTimeIndex(comparison.track)])), [comparisons]);
  const routes = useMemo(() => {
    const primary = computedJourney
      ? buildJourneyOverviewRoutes(computedJourney, completedCoordinates, selectedSegment, currentPosition, currentTrackColor || settings.trailStyle.trailColor, settings.routeOverviewPerRoute)
      : [{ id: activeTrack?.id ?? 'route', completed: completedCoordinates }];
    const progress = new Map(primary.map((route) => [route.id, route.completed]));
    const primaryTrack = tracks.find((track) => track.id === currentPosition?.trackId) ?? activeTrack;
    for (const comparison of comparisons) {
      if (!comparison.visible || (comparisonMode === 'route' && comparison.groupId && comparison.groupId !== primaryTrack?.id)) continue;
      const timeIndex = comparisonTimeIndexes.get(comparison.id);
      const position = comparisonMode === 'route' && primaryTrack
        ? interpolateTrackPoint(comparison.track, comparisonDistanceAtPrimary(
            getRouteComparisonPlan(primaryTrack, comparison.track, comparisonThreshold), currentPosition?.distance ?? 0))
        : currentPosition?.time && timeIndex ? trackPositionAtTime(comparison.track, timeIndex, currentPosition.time.getTime()) : null;
      if (!position) continue;
      const completed = comparison.track.points.filter((point) => point.distance <= position.distance).map((point) => [point.lon, point.lat]);
      const last = completed.at(-1);
      if (!last || last[0] !== position.lon || last[1] !== position.lat) completed.push([position.lon, position.lat]);
      progress.set(comparison.id, completed);
    }
    const result = routePaths.map((route) => ({ ...route, completed: progress.get(route.id) ?? route.completed }));
    // Paint the active segment last so its advancing line stays visible where
    // it overlaps an earlier, later, or comparison route.
    const activeId = selectedSegment?.type === 'track' ? selectedSegment.segmentId : !computedJourney ? activeTrack?.id : undefined;
    const activeIndex = result.findIndex((route) => route.id === activeId);
    if (activeIndex >= 0) result.push(...result.splice(activeIndex, 1));
    return result;
  }, [computedJourney, completedCoordinates, selectedSegment, currentPosition, currentTrackColor, settings.trailStyle.trailColor, settings.routeOverviewPerRoute, activeTrack, routePaths, tracks, comparisons, comparisonMode, comparisonThreshold, comparisonTimeIndexes]);
  const frameWidth = frame?.frameWidth ?? containerSize.width;
  const frameHeight = frame?.frameHeight ?? containerSize.height;
  const width = Math.min(WIDTH, Math.max(70, frameWidth * 0.38), Math.max(70, frameHeight * 0.32));
  const height = width * HEIGHT / WIDTH;
  const position = settings.routeOverviewPosition ?? { x: 0.86, y: 0.15 };
  const x = clamp(position.x), y = clamp(position.y);

  useEffect(() => {
    const element = canvas.current;
    if (!element || !geometry || !settings.showRouteOverview) return;
    const ctx = element.getContext('2d');
    if (!ctx) return;
    const resolution = isExporting ? Math.max(2, width * exportResolution.width / Math.max(1, frameWidth) / WIDTH) : 2;
    element.width = WIDTH * resolution; element.height = HEIGHT * resolution;
    ctx.scale(resolution, resolution);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const route of routes) {
      const path = projectedPaths.get(route.id) ?? [];
      if (path.length < 2) continue;
      ctx.beginPath();
      path.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
      const colors = routeOverviewColors(route.color);
      ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 5; ctx.stroke();
      ctx.strokeStyle = colors.remaining; ctx.lineWidth = 2.5; ctx.stroke();
      const completed = projectRouteOverviewProgress(route.completed, geometry.project);
      if (completed.length > 1) {
        ctx.beginPath();
        completed.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
        ctx.strokeStyle = colors.completed; ctx.lineWidth = 3; ctx.stroke();
      }
    }
    if (currentPosition && Number.isFinite(currentPosition.lon) && Number.isFinite(currentPosition.lat)) {
      const marker = geometry.project(currentPosition.lon, currentPosition.lat);
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, 3, 0, 2 * Math.PI);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }, [geometry, routes, projectedPaths, currentPosition, settings.showRouteOverview, phase, isExporting, width, frameWidth, exportResolution.width]);

  if (!settings.showRouteOverview || !geometry || (phase !== 'idle' && phase !== 'playing')) return null;
  return <canvas ref={canvas} className="tr-route-overview absolute z-20" role="img" aria-label={t('annotations.routeOverview')} tabIndex={isExporting ? -1 : 0}
    style={{ left: (frame?.frameLeft ?? 0) + x * Math.max(0, frameWidth - width), top: (frame?.frameTop ?? 0) + y * Math.max(0, frameHeight - height), width, height, cursor: isExporting ? 'default' : 'grab', touchAction: 'none' }}
    onPointerDown={event => { if (isExporting) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY, startX: x, startY: y }; }}
    onPointerMove={event => { if (!drag.current) return; setSettings({ routeOverviewPosition: { x: clamp(drag.current.startX + (event.clientX - drag.current.x) / Math.max(1, frameWidth - width)), y: clamp(drag.current.startY + (event.clientY - drag.current.y) / Math.max(1, frameHeight - height)) } }); }}
    onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
    onKeyDown={event => {
      if (isExporting || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      setSettings({ routeOverviewPosition: { x: clamp(x + (event.key === 'ArrowRight' ? 0.02 : event.key === 'ArrowLeft' ? -0.02 : 0)), y: clamp(y + (event.key === 'ArrowDown' ? 0.02 : event.key === 'ArrowUp' ? -0.02 : 0)) } });
    }} />;
}
