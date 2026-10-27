import { useEffect, useRef, type MutableRefObject } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { ComparisonTrack, GPXTrack } from '@/types';
import { comparisonDistanceAtPrimary, getRouteComparisonPlan, isRouteSplitAtPrimaryDistance } from '@/utils/routeComparisonPlayback';
import { interpolateTrackPoint } from '@/utils/gpx/interpolateTrackPoint';
import { getExportFrameFitPadding, type CropPreviewMetrics } from '@/utils/crop';
import { advanceRouteComparisonCamera, markersFitInViewport, routeSplitCameraTarget, type RouteComparisonCameraPose } from '@/utils/routeComparisonCameraMotion';

/** During a split, frame both moving markers rather than following only the primary. */
export function useRouteComparisonCamera({ enabled, isPlaying, isExporting, isDeterministicExport, currentTimeMs, isMapLoaded, mapRef, primaryTrack, primaryDistance, comparisons, comparisonThresholdMeters, exportFrame }: {
  enabled: boolean;
  isPlaying: boolean;
  isExporting: boolean;
  isDeterministicExport: boolean;
  currentTimeMs: number;
  isMapLoaded: boolean;
  mapRef: MutableRefObject<maplibregl.Map | null>;
  primaryTrack: GPXTrack | null | undefined;
  primaryDistance: number;
  comparisons: ComparisonTrack[];
  comparisonThresholdMeters: number;
  exportFrame?: CropPreviewMetrics | null;
}) {
  const poseRef = useRef<RouteComparisonCameraPose | null>(null);
  const timeRef = useRef<number | null>(null);
  const exportModeRef = useRef(isDeterministicExport);
  useEffect(() => {
    if (exportModeRef.current !== isDeterministicExport) {
      poseRef.current = null;
      timeRef.current = null;
      exportModeRef.current = isDeterministicExport;
    }
    const map = mapRef.current;
    if (!enabled || !isMapLoaded || !map || !primaryTrack) {
      poseRef.current = null;
      timeRef.current = null;
      return;
    }
    const primary = interpolateTrackPoint(primaryTrack, primaryDistance);
    if (!primary) return;
    const center = map.getCenter();
    const basePose: RouteComparisonCameraPose = {
      center: [center.lng, center.lat], zoom: map.getZoom(),
      pitch: map.getPitch(), bearing: map.getBearing(),
    };
    const coordinates: Array<[number, number]> = [[primary.lon, primary.lat]];
    let separated = false;
    for (const comparison of comparisons) {
      if (!comparison.visible || (comparison.groupId && comparison.groupId !== primaryTrack.id)) continue;
      const plan = getRouteComparisonPlan(primaryTrack, comparison.track, comparisonThresholdMeters);
      const point = interpolateTrackPoint(comparison.track, comparisonDistanceAtPrimary(plan, primaryDistance));
      if (!point) continue;
      coordinates.push([point.lon, point.lat]);
      if (isRouteSplitAtPrimaryDistance(plan, primaryDistance, primaryTrack.totalDistance)) separated = true;
    }
    // Follow Behind remains the base shot. A split only changes its framing;
    // switching to a flat, north-facing pose made the camera feel stationary.
    const container = map.getContainer();
    // Leave just enough room for the marker artwork. A generous framing
    // margin made a perfectly visible split trigger an unnecessary zoom out.
    const margin = Math.min(32, Math.min(container.clientWidth, container.clientHeight) * 0.06);
    const projected = coordinates.map((coordinate) => {
      const point = map.project(coordinate);
      return [point.x, point.y] as [number, number];
    });
    const needsFit = separated && !markersFitInViewport(projected, container.clientWidth, container.clientHeight, margin);
    if (!needsFit && poseRef.current === null) return;
    if (!needsFit && poseRef.current && Math.abs(poseRef.current.zoom - basePose.zoom) < 0.04) {
      // Once the temporary wide shot has recovered its zoom, let the normal
      // Follow Behind camera own the pan and heading again.
      poseRef.current = null;
      timeRef.current = null;
      return;
    }

    let target: RouteComparisonCameraPose = basePose;
    if (needsFit) {
      const bounds = new maplibregl.LngLatBounds();
      coordinates.forEach((coordinate) => bounds.extend(coordinate));
      const padding = exportFrame ? getExportFrameFitPadding(exportFrame) : margin;
      // A split should only widen the main camera's view; rejoining then
      // eases back into its normal close framing.
      const fit = map.cameraForBounds(bounds, { padding, maxZoom: basePose.zoom, bearing: basePose.bearing });
      if (fit?.center && fit.zoom !== undefined) {
        const fitCenter = maplibregl.LngLat.convert(fit.center);
        target = routeSplitCameraTarget(basePose, { center: [fitCenter.lng, fitCenter.lat], zoom: fit.zoom }, [primary.lon, primary.lat]);
      }
    }

    if (isExporting && !isDeterministicExport) {
      // A still capture needs its final framing in the one captured frame.
      map.jumpTo(target);
      poseRef.current = null;
      timeRef.current = null;
      return;
    }

    if (!isPlaying && !isDeterministicExport) {
      // Seeking while paused has no playback frames to drive the deterministic
      // filter, so let MapLibre animate to the new pose on the live canvas.
      map.easeTo({ ...target, duration: 1400 });
      // Keep that destination for a seamless resume after the primary camera
      // has briefly applied its own pose earlier in the same render.
      poseRef.current = target;
      timeRef.current = null;
      return;
    }

    const elapsedMs = timeRef.current === null || currentTimeMs <= timeRef.current
      ? 1000 / 60
      : currentTimeMs - timeRef.current;
    const next = advanceRouteComparisonCamera(poseRef.current ?? basePose, target, elapsedMs);
    map.jumpTo(next);
    poseRef.current = next;
    timeRef.current = currentTimeMs;
  }, [enabled, isPlaying, isExporting, isDeterministicExport, currentTimeMs, isMapLoaded, mapRef, primaryTrack, primaryDistance, comparisons, comparisonThresholdMeters, exportFrame]);
}
