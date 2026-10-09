import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { parseGPXFiles, parseRouteFiles } from '@/utils/gpxParser';
import { isRecipeFile, parseRecipeFile } from '@/utils/recipe/parseRecipeFile';
import { resolveRecipe } from '@/utils/recipe/resolveRecipe';
import { applyRecipe } from '@/utils/recipe/applyRecipe';
import { RecipeError } from '@/utils/recipe/types';
import { useAppStore } from '@/store/useAppStore';
import { useI18n } from '@/i18n/useI18n';
import { getDistanceBucket, trackEvent } from '@/utils/analytics';
import { isReplayFile, useProjectFile } from '@/hooks/useProjectFile';
import { getTrackTimeRange, groupTracksByTimeOverlap } from '@/utils/trackTimeOverlap';
import { groupTracksBySpatialSimilarity } from '@/utils/trackSpatialSimilarity';
import { COMPARISON_COLORS } from '@/components/sidebar/tracks/constants';
import { createId } from '@/utils/id';
import type { GPXTrack } from '@/types';

export type RouteInputMethod = 'file_picker' | 'dropzone';

export function useGPX() {
  const { t } = useI18n();
  const [parseError, setParseError] = useState<string | null>(null);
  const addImportedTracks = useAppStore((state) => state.addImportedTracks);
  const setError = useAppStore((state) => state.setError);
  const fileImportStatus = useAppStore((state) => state.fileImportStatus);
  const setFileImportStatus = useAppStore((state) => state.setFileImportStatus);
  const { openProjectFile } = useProjectFile();
  const isParsing = fileImportStatus !== null;

  const applyRecipeFiles = useCallback(async (
    recipeFile: File,
    fileArray: File[],
    routeInputMethod: RouteInputMethod,
  ) => {
    setFileImportStatus({
      kind: 'recipe',
      fileName: recipeFile.name,
      fileCount: fileArray.length,
    });
    setParseError(null);
    trackEvent('recipe_import_started', { route_input_method: routeInputMethod });

    try {
      const recipe = await parseRecipeFile(recipeFile);
      const parsed = await parseRouteFiles(fileArray);
      if (parsed.length === 0) {
        throw new RecipeError(
          'Drop the GPX or KML files together with the recipe — it only names them.',
        );
      }

      const resolved = resolveRecipe(
        recipe,
        parsed.map((entry) => entry.track),
        parsed.map((entry) => entry.fileName),
      );
      applyRecipe(recipe, resolved, useAppStore.getState());
      useAppStore.getState().setRecipeReport(resolved.report);

      trackEvent('recipe_import_completed', {
        recipe_track_count: resolved.report.trackCount,
        recipe_landmark_count: resolved.report.landmarks.length,
        recipe_annotation_count: resolved.report.annotations.length,
        recipe_warning_count: resolved.report.warnings.length,
        recipe_stitched: resolved.report.stitched,
      });

      const placed = resolved.report.landmarks.length + resolved.report.annotations.length;
      toast.success(t('recipe.applied', {
        tracks: String(resolved.report.trackCount),
        placed: String(placed),
      }));

      return resolved.tracks;
    } catch (error) {
      console.error('Failed to apply recipe:', error);
      const message = error instanceof RecipeError
        ? error.message
        : t('recipe.errors.failed');
      trackEvent('recipe_import_failed', {
        recipe_error_type: error instanceof RecipeError ? 'recipe' : 'unknown',
      });
      setParseError(message);
      setError(message);
      throw error;
    } finally {
      setFileImportStatus(null);
    }
  }, [setError, setFileImportStatus, t]);

  const parseFiles = useCallback(async (
    files: FileList | File[] | null,
    routeInputMethod: RouteInputMethod = 'file_picker',
  ) => {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);

    // A .replay file is a saved project, not a route — open it instead of parsing GPX/KML.
    const replayFile = fileArray.find(isReplayFile);
    if (replayFile) {
      await openProjectFile(replayFile);
      return undefined;
    }

    // A recipe describes a whole replay in terms of the routes dropped with it.
    const recipeFiles = fileArray.filter(isRecipeFile);
    if (recipeFiles.length > 0) {
      // Silently picking one of several would produce a replay nobody asked
      // for, and the difference between two recipes is the whole point of them.
      if (recipeFiles.length > 1) {
        const message = t('recipe.errors.multiple', {
          files: recipeFiles.map((file) => file.name).join(', '),
        });
        setParseError(message);
        setError(message);
        return undefined;
      }
      return applyRecipeFiles(recipeFiles[0], fileArray, routeInputMethod);
    }

    setFileImportStatus({
      kind: 'routes',
      fileName: fileArray[0].name,
      fileCount: fileArray.length,
    });
    setParseError(null);
    trackEvent('route_import_started', {
      route_file_count: fileArray.length,
      route_input_method: routeInputMethod,
    });
    
    try {
      const tracks = await parseGPXFiles(fileArray);
      
      if (tracks.length === 0) {
        throw new Error(t('errors.noValidGpx'));
      }
      
      // Files recorded during the same window belong in one replay. Whatever
      // time cannot speak for gets a second pass on route shape, so people
      // who ran the same trail still land together — that only puts them in
      // one replay, and a track with no timestamps still gets no moving
      // marker rather than one following an invented pace.
      const timeClusters = groupTracksByTimeOverlap(tracks);
      const timedClusters: GPXTrack[][] = [];
      const ungroupedTracks: GPXTrack[] = [];
      timeClusters.forEach((cluster) => {
        if (cluster.length === 1) ungroupedTracks.push(cluster[0]);
        else timedClusters.push(cluster);
      });
      const spatialClusters = groupTracksBySpatialSimilarity(ungroupedTracks);
      const timedClusterSet = new Set(timedClusters);

      const trackOrder = new Map(tracks.map((track, index) => [track, index]));
      const firstIndex = (cluster: GPXTrack[]) =>
        Math.min(...cluster.map((track) => trackOrder.get(track)!));
      const clusters = [...timedClusters, ...spatialClusters].sort(
        (a, b) => firstIndex(a) - firstIndex(b)
      );

      let groupedByTimeCount = 0;
      let groupedByRouteCount = 0;
      let comparisonColorIndex = 0;
      const primaryTracks: GPXTrack[] = [];
      const comparisonTracks: Parameters<typeof addImportedTracks>[1] = [];

      clusters.forEach((cluster) => {
        if (cluster.length === 1) {
          primaryTracks.push(cluster[0]);
          return;
        }

        const isTimedCluster = timedClusterSet.has(cluster);
        // Earliest start leads, and a track that has a clock leads one that
        // does not: the replay reads its time from the main track, so putting
        // a timed track first is what lets any timed marker move at all.
        const [primary, ...rest] = [...cluster].sort((a, b) => {
          const rangeA = getTrackTimeRange(a);
          const rangeB = getTrackTimeRange(b);
          if (rangeA && rangeB) return rangeA.start.getTime() - rangeB.start.getTime();
          if (rangeA) return -1;
          if (rangeB) return 1;
          return 0;
        });

        primaryTracks.push(primary);
        rest.forEach((track) => {
          comparisonTracks.push({
            id: createId('comparison'),
            name: track.name,
            color: COMPARISON_COLORS[comparisonColorIndex % COMPARISON_COLORS.length],
            track,
            visible: true,
            offset: 0,
            groupId: primary.id,
          });
          comparisonColorIndex += 1;
        });

        if (isTimedCluster) groupedByTimeCount += cluster.length;
        else groupedByRouteCount += cluster.length;
      });

      addImportedTracks(primaryTracks, comparisonTracks);

      if (groupedByTimeCount > 0) {
        toast.success(t('tracks.autoGroupedToast', { count: String(groupedByTimeCount) }));
      }
      if (groupedByRouteCount > 0) {
        toast.success(t('tracks.autoGroupedRouteToast', { count: String(groupedByRouteCount) }));
      }

      trackEvent('route_import_completed', {
        route_file_count: fileArray.length,
        route_imported_track_count: tracks.length,
        route_import_is_multi_file: fileArray.length > 1,
        route_input_method: routeInputMethod,
        route_total_distance_bucket: getDistanceBucket(
          tracks.reduce((total, track) => total + track.totalDistance, 0),
        ),
        route_has_timestamps: tracks.some((track) =>
          track.points.some((point) => point.time !== null)
        ),
      });

      if (groupedByTimeCount > 0 || groupedByRouteCount > 0) {
        trackEvent('tracks_auto_grouped', {
          route_grouped_track_count: groupedByTimeCount + groupedByRouteCount,
          route_group_count: clusters.filter((cluster) => cluster.length > 1).length,
          route_time_grouped_count: groupedByTimeCount,
          route_spatial_grouped_count: groupedByRouteCount,
        });
      }

      return tracks;
    } catch (error) {
      trackEvent('route_import_failed', {
        route_file_count: fileArray.length,
        route_input_method: routeInputMethod,
        route_error_type: error instanceof Error && error.message === t('errors.noValidGpx')
          ? 'empty_result'
          : 'parse_error',
      });
      const message = error instanceof Error ? error.message : t('errors.parseGpxFailed');
      setParseError(message);
      setError(message);
      throw error;
    } finally {
      setFileImportStatus(null);
    }
  }, [addImportedTracks, applyRecipeFiles, openProjectFile, setError, setFileImportStatus, t]);

  return {
    parseFiles,
    isParsing,
    parseError,
  };
}
