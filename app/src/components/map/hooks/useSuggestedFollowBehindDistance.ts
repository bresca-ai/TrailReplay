import { useEffect, useRef } from 'react';
import type { CameraSettings } from '@/types';
import {
  getNearestFollowBehindPreset,
  getSuggestedFollowBehindZoomLevel,
} from '@/utils/followBehindCamera';

/**
 * Whether a freshly computed suggestion is allowed to move the slider.
 *
 * A new route always gets a suggestion. After that the rule is simply: if the
 * level is no longer the one that was suggested, the user put it where it is,
 * and it stays there. This is what keeps re-running the calculation (which has
 * to happen, because clip length feeds into it and is still settling as a route
 * loads) from ever undoing a manual choice.
 */
export function shouldApplySuggestedDistance({
  isNewRoute,
  lastSuggestedLevel,
  currentLevel,
}: {
  isNewRoute: boolean;
  lastSuggestedLevel: number | null;
  currentLevel: number;
}): boolean {
  if (isNewRoute) return true;
  if (lastSuggestedLevel === null) return true;
  return currentLevel === lastSuggestedLevel;
}

interface UseSuggestedFollowBehindDistanceParams {
  allCoordinates: number[][];
  followBehindZoomLevel: number;
  preserveAuthoredDistance: boolean;
  setCameraSettings: (settings: Partial<CameraSettings>) => void;
  totalDistanceMeters: number;
  totalDurationMs: number;
}

/**
 * Starts a route on the distance stop that suits how fast it travels, instead
 * of always on `medium`.
 *
 * This only ever moves the slider that the user has not moved themselves. The
 * moment the level differs from what was last suggested, the choice is treated
 * as the user's and nothing here touches it again.
 *
 * Clip length is part of the calculation, not just the route: the same track as
 * a 15s clip travels four times faster than as a 60s one and wants a very
 * different framing. Re-suggesting when the clip length changes also covers the
 * case where duration is still settling as a freshly loaded route mounts, which
 * otherwise leaves the slider on a distance picked from a placeholder duration.
 */
export function useSuggestedFollowBehindDistance({
  allCoordinates,
  followBehindZoomLevel,
  preserveAuthoredDistance,
  setCameraSettings,
  totalDistanceMeters,
  totalDurationMs,
}: UseSuggestedFollowBehindDistanceParams) {
  const lastSuggestedLevelRef = useRef<number | null>(null);
  const lastRouteKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (preserveAuthoredDistance) return;
    if (totalDistanceMeters <= 0 || totalDurationMs <= 0 || allCoordinates.length === 0) {
      // No measurable route (all tracks removed): let the next one be suggested.
      lastRouteKeyRef.current = null;
      lastSuggestedLevelRef.current = null;
      return;
    }

    // Identify the route by its shape rather than by object identity: the
    // coordinate array is rebuilt on unrelated renders, and re-running for
    // those would be pointless churn.
    const routeKey = `${allCoordinates.length}:${Math.round(totalDistanceMeters)}`;
    const isNewRoute = lastRouteKeyRef.current !== routeKey;

    if (!shouldApplySuggestedDistance({
      isNewRoute,
      lastSuggestedLevel: lastSuggestedLevelRef.current,
      currentLevel: followBehindZoomLevel,
    })) return;

    const middleCoordinate = allCoordinates[Math.floor(allCoordinates.length / 2)];
    const latitudeDeg = middleCoordinate?.[1];
    if (!Number.isFinite(latitudeDeg)) return;

    const level = getSuggestedFollowBehindZoomLevel({
      totalDistanceMeters,
      videoDurationSeconds: totalDurationMs / 1000,
      latitudeDeg: latitudeDeg as number,
    });

    lastRouteKeyRef.current = routeKey;
    lastSuggestedLevelRef.current = level;

    if (level === followBehindZoomLevel) return;

    setCameraSettings({
      followBehindZoomLevel: level,
      followBehindPreset: getNearestFollowBehindPreset(level),
    });
  }, [
    allCoordinates,
    followBehindZoomLevel,
    preserveAuthoredDistance,
    setCameraSettings,
    totalDistanceMeters,
    totalDurationMs,
  ]);
}
