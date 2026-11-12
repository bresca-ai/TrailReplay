import { useRef, useCallback, useEffect, useMemo, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { PaintedTrailMarker } from '@/utils/paintedTrailMarker';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAppStore } from '@/store/useAppStore';
import { useComputedJourney } from '@/hooks/useComputedJourney';
import { useStartLocationLevels } from '@/hooks/useStartLocationLevels';
import { usePreparedCinematicCameraKeyframes } from '@/hooks/useCinematicCameraKeyframes';
import { getAerialFollowBearing, resolveReplayCameraMode } from '@/utils/replayCameraPlan';
import { effectiveTerrainExaggeration } from '@/utils/terrainExaggeration';
import { useSuggestedFollowBehindDistance } from '@/components/map/hooks/useSuggestedFollowBehindDistance';
import { MapElevationProfile } from './MapElevationProfile';
import { ComparisonLeaderboard } from './ComparisonLeaderboard';
import { LocationChapterLabel } from './LocationChapterLabel';
import { COMPARISON_MARKER_SIZE } from '@/utils/comparisonMarker';
import { useI18n } from '@/i18n/useI18n';
import { areFollowingSamePath } from '@/utils/routeComparisonSharedPath';
import { MAP_LAYERS } from './mapStyle';
import { DEFAULT_SKY_COLOR } from './mapSky';
import {
  getFollowBehindLevelForStopIndex,
  getFollowBehindStopIndexForLevel,
  getNearestFollowBehindPreset,
} from '@/utils/followBehindCamera';
import { useManualPicturePlacement } from './hooks/useManualPicturePlacement';
import { usePictureMarkers } from './hooks/usePictureMarkers';
import { useTextAnnotationsLayer } from './hooks/useTextAnnotationsLayer';
import { shouldShowRouteLandmarks, useRouteLandmarksLayer } from './hooks/useRouteLandmarksLayer';
import { useLandmarkPlacement } from './hooks/useLandmarkPlacement';
import { useRouteLandmarks } from '@/hooks/useRouteLandmarks';
import { useComparisonTrackLayers } from './hooks/useComparisonTrackLayers';
import { useRouteComparisonCamera } from './hooks/useRouteComparisonCamera';
import { useBaseMapPresentation } from './hooks/useBaseMapPresentation';
import { useMapInitialization } from './hooks/useMapInitialization';
import { useRecordedElevationLayer } from './hooks/useRecordedElevationLayer';
import { useTrailLayerData } from './hooks/useTrailLayerData';
import { useTrailPlaybackCamera } from './hooks/useTrailPlaybackCamera';
import { useCameraTerrainClearance } from './hooks/useCameraTerrainClearance';
import { useTilePreload } from './hooks/useTilePreload';
import { useReplayTileWarmup } from './hooks/useReplayTileWarmup';
import { useTilePreloadDiagnostics } from './hooks/useTilePreloadDiagnostics';
import { useTrackTrimPreview } from './hooks/useTrackTrimPreview';
import { useLocationChapters } from './hooks/useLocationChapters';
import { useLocationStartCue } from './hooks/useLocationStartCue';
import { useMapControlLabels } from './hooks/useMapControlLabels';
import type { CropPreviewMetrics } from '@/utils/crop';
import { loadRouteTerrainPlan, registerAerialTerrainPlan, terrainPlanBearing, trailingFlightBearing, unregisterAerialTerrainPlan } from '@/utils/aerialTerrainPlan';
import { cinematicAnchorSmoothingHalfWindow } from '@/components/map/cameraUtils';

interface TrailMapProps {
  activeTextAnnotationId?: string | null;
  exportFrame?: CropPreviewMetrics | null;
  mapContainerRef?: React.RefObject<HTMLDivElement | null>;
  onReadyChange?: (isReady: boolean) => void;
}

const ZOOM_BUTTON_HINT_STORAGE_KEY = 'trailreplay-follow-behind-zoom-buttons-hint-seen';

export function TrailMap(_props: TrailMapProps) {
  const { t } = useI18n();
  const isMobile = useIsMobile();
  const internalMapContainerRef = useRef<HTMLDivElement>(null);
  const mapContainer = _props.mapContainerRef ?? internalMapContainerRef;
  const onReadyChange = _props.onReadyChange;
  const map = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<PaintedTrailMarker | null>(null);
  const smoothBearingRef = useRef<number>(0);
  const targetBearingRef = useRef<number>(0);
  const loadZoomDoneRef = useRef<boolean>(false);
  const handledZoomButtonPressRef = useRef(false);
  const startupWarmupReadyRef = useRef(false);
  const startupWarmupFastRef = useRef(false);
  const setStartupWarmupReady = useCallback((ready: boolean, fast = false) => {
    startupWarmupReadyRef.current = ready;
    startupWarmupFastRef.current = ready && fast;
  }, []);
  const restoredCameraKeyRef = useRef<string | null>(null);

  const tracks = useAppStore((state) => state.tracks);
  const settings = useAppStore((state) => state.settings);
  const trailStyle = useAppStore((state) => state.settings.trailStyle);
  const cameraSettings = useAppStore((state) => state.cameraSettings);
  const sourceRecipe = useAppStore((state) => state.sourceRecipe);
  const pictures = useAppStore((state) => state.pictures);
  const textAnnotations = useAppStore((state) => state.textAnnotations);
  const pendingPicturePlacements = useAppStore((state) => state.pendingPicturePlacements);
  const playback = useAppStore((state) => state.playback);
  const animationPhase = useAppStore((state) => state.animationPhase);
  const isExporting = useAppStore((state) => state.isExporting);
  const isDeterministicExport = useAppStore((state) => state.isDeterministicExport);
  const setAnimationPhase = useAppStore((state) => state.setAnimationPhase);
  const setCameraPosition = useAppStore((state) => state.setCameraPosition);
  const setCameraSettings = useAppStore((state) => state.setCameraSettings);
  const setSelectedPictureId = useAppStore((state) => state.setSelectedPictureId);
  const addPicture = useAppStore((state) => state.addPicture);
  const addVideo = useAppStore((state) => state.addVideo);
  const removePendingPicturePlacement = useAppStore((state) => state.removePendingPicturePlacement);
  const comparisonTracks = useAppStore((state) => state.comparisonTracks);
  const comparisonMode = useAppStore((state) => state.comparisonMode);
  const comparisonThresholdMeters = useAppStore((state) => state.comparisonThresholdMeters);
  const landmarks = useRouteLandmarks();
  const selectedLandmarkId = useAppStore((state) => state.selectedLandmarkId);
  const isPlacingLandmark = useAppStore((state) => state.isPlacingLandmark);
  const revealLandmarkEditor = useAppStore((state) => state.revealLandmarkEditor);
  const inactiveAnnotationsOpacity = useAppStore((state) => state.settings.inactiveAnnotationsOpacity);

  const [isMapLoaded, setIsMapLoaded] = useState(false);
  useTrackTrimPreview(map, isMapLoaded);
  useMapControlLabels(map, isMapLoaded);
  const [showZoomButtonsHint, setShowZoomButtonsHint] = useState(false);
  const [hasSeenZoomButtonsHint, setHasSeenZoomButtonsHint] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      return window.localStorage.getItem(ZOOM_BUTTON_HINT_STORAGE_KEY) === '1';
    } catch {
      return true;
    }
  });

  // Use the computed journey hook for multi-track support
  const {
    currentPosition,
    currentIcon,
    currentSegment,
    completedCoordinates,
    allCoordinates,
    cameraPathCoordinates,
    isInTransport,
    currentTrackColor,
    segmentTimings,
    elevationData,
    activeTrack,
    computedJourney,
    totalDistance,
    routeProgress,
  } = useComputedJourney();
  useStartLocationLevels(allCoordinates[0]);

  // Derive the current track name for the label
  const currentTrackName = currentSegment?.segment.type === 'track' && currentSegment.segment.trackId
    ? tracks.find((t) => t.id === currentSegment.segment.trackId)?.name
    : activeTrack?.name;
  const followBehindZoomLevel = cameraSettings.followBehindZoomLevel;
  const cinematicKeyframes = usePreparedCinematicCameraKeyframes(cameraPathCoordinates);
  const cameraMode = resolveReplayCameraMode(cameraSettings.mode, cinematicKeyframes.length);
  const [terrainViewportHeight, setTerrainViewportHeight] = useState(720);
  const [terrainPlanState, setTerrainPlanState] = useState<{ coordinates: number[][]; elevations: typeof elevationData; viewportHeight: number; exaggeration: number; halfWindow: number; durationMs: number; plan: number[] | null } | null>(null);
  const terrainExaggeration = effectiveTerrainExaggeration(settings);
  const aerialHalfWindow = cinematicAnchorSmoothingHalfWindow(cameraSettings.cameraStability, playback.totalDuration / 1000);
  useEffect(() => {
    const canvas = map.current?.getCanvas();
    if (!isMapLoaded || !canvas) return;
    const update = () => { if (canvas.clientHeight > 0) setTerrainViewportHeight(canvas.clientHeight); };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [isMapLoaded]);
  useEffect(() => {
    if (cameraMode !== 'aerial-follow' || !terrainExaggeration || cameraPathCoordinates.length < 2 || !isMapLoaded) return;
    const controller = new AbortController();
    let cancelled = false;
    const timeout = setTimeout(() => controller.abort(), 15000);
    const preparation = loadRouteTerrainPlan(cameraPathCoordinates, terrainExaggeration, controller.signal, aerialHalfWindow, { elevationData, viewportHeight: terrainViewportHeight, durationSeconds: playback.totalDuration / 1000 })
      .then(plan => { if (!cancelled) { if (import.meta.env.DEV) console.debug('Aerial terrain plan:', plan ? `${plan.length} poses` : 'unavailable'); setTerrainPlanState({ coordinates: cameraPathCoordinates, elevations: elevationData, viewportHeight: terrainViewportHeight, exaggeration: terrainExaggeration, halfWindow: aerialHalfWindow, durationMs: playback.totalDuration, plan }); } return plan; })
      .catch(error => { if (!cancelled) { if (import.meta.env.DEV) console.debug('Aerial terrain plan unavailable:', error); setTerrainPlanState({ coordinates: cameraPathCoordinates, elevations: elevationData, viewportHeight: terrainViewportHeight, exaggeration: terrainExaggeration, halfWindow: aerialHalfWindow, durationMs: playback.totalDuration, plan: null }); } return null; })
      .finally(() => clearTimeout(timeout));
    registerAerialTerrainPlan(cameraPathCoordinates, preparation);
    return () => { cancelled = true; controller.abort(); clearTimeout(timeout); unregisterAerialTerrainPlan(cameraPathCoordinates, preparation); };
  }, [cameraMode, cameraPathCoordinates, elevationData, isMapLoaded, terrainExaggeration, aerialHalfWindow, terrainViewportHeight, playback.totalDuration]);
  const matchingTerrainPlan = terrainPlanState?.coordinates === cameraPathCoordinates && terrainPlanState.elevations === elevationData && terrainPlanState.viewportHeight === terrainViewportHeight && terrainPlanState.exaggeration === terrainExaggeration && terrainPlanState.halfWindow === aerialHalfWindow && terrainPlanState.durationMs === playback.totalDuration ? terrainPlanState : null;
  const routeComparisonActive = comparisonMode === 'route' && comparisonTracks.some((track) => track.visible);
  const primaryComparisonTrack = tracks.find((track) => track.id === currentPosition?.trackId) ?? activeTrack ?? null;
  const comparisonActive = comparisonTracks.some((track) => track.visible && (!track.groupId || track.groupId === primaryComparisonTrack?.id));
  const activeRouteComparisons = useMemo(() => comparisonMode === 'route' && primaryComparisonTrack
    ? comparisonTracks.filter((track) => track.visible && (!track.groupId || track.groupId === primaryComparisonTrack.id))
    : [], [comparisonMode, comparisonTracks, primaryComparisonTrack]);
  const sharedRouteComparisons = useMemo(() => currentPosition && primaryComparisonTrack
    ? activeRouteComparisons.filter((track) => areFollowingSamePath(primaryComparisonTrack, track.track, currentPosition.distance, comparisonThresholdMeters))
    : [], [activeRouteComparisons, currentPosition, primaryComparisonTrack, comparisonThresholdMeters]);
  const sharedTrackIds = useMemo(() => sharedRouteComparisons.map((track) => track.id), [sharedRouteComparisons]);

  useSuggestedFollowBehindDistance({
    allCoordinates,
    followBehindZoomLevel,
    preserveAuthoredDistance: sourceRecipe?.cameraSettings?.followBehindPreset !== undefined
      || sourceRecipe?.cameraSettings?.followBehindZoomLevel !== undefined,
    setCameraSettings,
    totalDistanceMeters: totalDistance,
    totalDurationMs: playback.totalDuration,
  });
  const handleMapLoadedChange = useCallback((isLoaded: boolean) => {
    setIsMapLoaded(isLoaded);
    if (!isLoaded) {
      loadZoomDoneRef.current = false;
    }
  }, []);

  useManualPicturePlacement({
    addPicture,
    addVideo,
    isMapLoaded,
    mapRef: map,
    pendingPicturePlacements,
    removePendingPicturePlacement,
    t,
  });

  usePictureMarkers({
    isMapLoaded,
    mapRef: map,
    pictures,
    setSelectedPictureId,
    showPictures: settings.showPictures,
  });

  useTextAnnotationsLayer({
    activeAnnotationId: _props.activeTextAnnotationId ?? null,
    annotations: textAnnotations,
    isMapLoaded,
    mapRef: map,
    unitSystem: settings.unitSystem,
    language: settings.language,
    overlayFont: trailStyle.overlayFont,
    inactiveAnnotationsOpacity,
  });

  useRouteLandmarksLayer({
    isMapLoaded,
    labelFade: settings.landmarkLabelFade,
    landmarkStyle: settings.landmarkStyle,
    scale: settings.landmarkScale,
    overlayFont: trailStyle.overlayFont,
    landmarks,
    mapRef: map,
    onSelectLandmark: revealLandmarkEditor,
    selectedLandmarkId,
    visible: shouldShowRouteLandmarks(animationPhase),
  });

  useLandmarkPlacement({
    isMapLoaded,
    isPlacingLandmark,
    mapRef: map,
  });

  useComparisonTrackLayers({
    comparisonTracks,
    isMapLoaded,
    mapRef: map,
    currentTime: currentPosition?.time ?? null,
    comparisonMode,
    comparisonThresholdMeters,
    primaryTrack: primaryComparisonTrack,
    primaryDistance: currentPosition?.distance ?? 0,
    sharedTrackIds,
  });

  useBaseMapPresentation({
    currentTrackColor: currentTrackColor ?? null,
    isMapLoaded,
    mapRef: map,
    settings,
    trailStyle,
  });

  useMapInitialization({
    mapContainer,
    mapRef: map,
    onReadyChange,
    onSetMapLoaded: handleMapLoadedChange,
  });

  // Keep the actual map camera (including manual pan/zoom) in the store so a
  // saved .replay restores what the user was looking at, not just a preset.
  useEffect(() => {
    if (!map.current || !isMapLoaded) return;
    const currentMap = map.current;
    // Let the restore effect below apply a saved camera before recording the
    // map's initial default camera back into the store, while still listening
    // for the user's later manual pan/zoom.
    const savedCamera = useAppStore.getState().cameraPosition;
    const hasSavedCameraToRestore = Boolean(savedCamera && restoredCameraKeyRef.current === null);
    const updateCameraPosition = () => {
      const currentMap = map.current;
      if (!currentMap) return;
      const center = currentMap.getCenter();
      setCameraPosition({
        lat: center.lat,
        lon: center.lng,
        zoom: currentMap.getZoom(),
        pitch: currentMap.getPitch(),
        bearing: currentMap.getBearing(),
      });
    };
    currentMap.on('moveend', updateCameraPosition);
    if (!hasSavedCameraToRestore) updateCameraPosition();
    return () => { currentMap.off('moveend', updateCameraPosition); };
  }, [isMapLoaded, setCameraPosition]);

  // Restore a saved camera after normal map initialization. Playback takes
  // ownership again when it starts. Read imperatively instead of subscribing:
  // the replay camera writes cameraPosition every frame, and subscribing here
  // turns that bookkeeping into a render/effect feedback loop.
  useEffect(() => {
    const savedCamera = useAppStore.getState().cameraPosition;
    if (!map.current || !isMapLoaded || animationPhase !== 'idle' || !savedCamera) return;
    const key = [savedCamera.lat, savedCamera.lon, savedCamera.zoom, savedCamera.pitch, savedCamera.bearing].join(':');
    if (restoredCameraKeyRef.current === key) return;
    restoredCameraKeyRef.current = key;
    map.current.jumpTo({
      center: [savedCamera.lon, savedCamera.lat],
      zoom: savedCamera.zoom,
      pitch: savedCamera.pitch,
      bearing: savedCamera.bearing,
    });
  }, [animationPhase, isMapLoaded, tracks]);

  useEffect(() => {
    if (!useAppStore.getState().cameraPosition) restoredCameraKeyRef.current = null;
  }, [tracks]);

  useTrailLayerData({
    activeTrack,
    allCoordinates,
    colorMode: trailStyle.colorMode,
    colorZones: trailStyle.colorZones,
    computedJourney,
    isExporting,
    isMapLoaded,
    loadZoomDoneRef,
    mapRef: map,
    segmentTimings,
    trailColor: trailStyle.trailColor,
  });

  const recordedPoints = useMemo(() => computedJourney?.coordinates ?? activeTrack?.points ?? [], [computedJourney, activeTrack]);
  const recordedElevationEnabled = settings.recordedElevationPrototype && recordedPoints.length >= 2;
  const recordedStyle = useMemo(() => ({ colorMode: trailStyle.colorMode, trailColor: trailStyle.trailColor, colorZones: trailStyle.colorZones, segmentTimings: computedJourney?.segmentTimings ?? [] }), [trailStyle.colorMode, trailStyle.trailColor, trailStyle.colorZones, computedJourney]);
  useRecordedElevationLayer(map, isMapLoaded, recordedElevationEnabled, recordedPoints, currentPosition, completedCoordinates, markerRef, recordedStyle, trailStyle.ghostTrailOpacity);

  const locationChapter = useLocationChapters(map, isMapLoaded, settings.locationChapters, allCoordinates, currentPosition, playback.currentTime, animationPhase, cameraMode !== 'overview' && !routeComparisonActive);
  useLocationStartCue(map, isMapLoaded, animationPhase, allCoordinates[0], settings.locationChapters?.color ?? '#ffbd66', locationChapter.introStages.length > 0);
  const introStageOverrides = useMemo(() => locationChapter.introStages.flatMap(stage => stage.camera ? [stage.camera] : []), [locationChapter.introStages]);

  useTrailPlaybackCamera({
    activeTrack,
    introStartOverride: locationChapter.introCamera,
    introRegionOverride: locationChapter.introRegionCamera,
    introStageOverrides,
    locationChapters: settings.locationChapters,
    locationChapterCameraCue: locationChapter.cameraCueRef,
    activeTextAnnotationId: _props.activeTextAnnotationId ?? null,
    allCoordinates,
    cameraCoordinates: cameraPathCoordinates,
    aerialTerrainPlan: matchingTerrainPlan?.plan ?? null,
    animationPhase,
    cameraMode,
    cameraStability: cameraSettings.cameraStability,
    cinematicKeyframes,
    completedCoordinates,
    computedJourney,
    currentIcon,
    currentTimeMs: playback.currentTime,
    currentPosition,
    recordedElevationEnabled,
    currentSegment,
    currentTrackColor: currentTrackColor ?? null,
    currentTrackName: currentTrackName ?? null,
    elevationData,
    exportFrame: _props.exportFrame ?? null,
    followBehindZoomLevel,
    followBehindPitch: cameraSettings.followBehindPitch,
    isExporting,
    isPlaying: playback.isPlaying,
    sharedComparisonColors: sharedRouteComparisons.map((track) => track.color),
    isInTransport,
    isMapLoaded,
    mapRef: map,
    markerRef,
    playbackProgress: routeComparisonActive ? routeProgress : playback.progress,
    segmentTimings,
    setCameraPosition,
    smoothBearingRef,
    targetBearingRef,
    totalDurationMs: playback.totalDuration,
    trailStyle: {
      colorMode: trailStyle.colorMode,
      colorZones: trailStyle.colorZones,
      currentIcon: trailStyle.currentIcon,
      markerColor: trailStyle.markerColor,
      markerSize: comparisonActive ? COMPARISON_MARKER_SIZE : trailStyle.markerSize,
      markerType: comparisonActive ? 'dot' : trailStyle.markerType,
      overlayFont: trailStyle.overlayFont,
      showCircle: trailStyle.showCircle,
      showMarker: trailStyle.showMarker || comparisonActive,
      showTrackLabels: trailStyle.showTrackLabels,
      trailColor: trailStyle.trailColor,
    },
  });

  useRouteComparisonCamera({
    enabled: comparisonMode === 'route' && playback.progress > 0 && (animationPhase === 'playing' || animationPhase === 'idle'),
    isPlaying: playback.isPlaying,
    isExporting,
    isDeterministicExport,
    currentTimeMs: playback.currentTime,
    isMapLoaded,
    mapRef: map,
    primaryTrack: primaryComparisonTrack,
    primaryDistance: currentPosition?.distance ?? 0,
    comparisons: comparisonTracks,
    comparisonThresholdMeters,
    exportFrame: _props.exportFrame,
  });

  // Applies in every camera mode, and to manual navigation as much as to the
  // replay: whatever moves the camera, it does not end up underground.
  useCameraTerrainClearance({
    playbackOwnsCamera: (cameraMode === 'cinematic' || cameraMode === 'aerial-follow')
      && (isExporting || playback.isPlaying || animationPhase === 'intro' || animationPhase === 'outro'),
    isMapLoaded,
    mapRef: map,
    show3DTerrain: settings.show3DTerrain,
  });


  const tileDiagnostics = useTilePreloadDiagnostics({
    isMapLoaded,
    isPlaying: playback.isPlaying,
    mapRef: map,
  });

  useReplayTileWarmup({
    allCoordinates: cameraPathCoordinates,
    routeCoordinates: allCoordinates,
    animationPhase,
    cameraMode,
    aerialTerrainPlan: matchingTerrainPlan?.plan ?? null,
    aerialTerrainLoading: cameraMode === 'aerial-follow' && terrainExaggeration > 0 && cameraPathCoordinates.length >= 2 && !matchingTerrainPlan,
    cinematicKeyframes,
    cameraStability: cameraSettings.cameraStability,
    diagnostics: tileDiagnostics,
    visibleMapRef: map,
    elevationData,
    // Deterministic export already advances the visible map one frame at a
    // time. Keeping the second, offscreen MapLibre instance alive at the same
    // time duplicates its tile/GPU cache and caused memory to climb into
    // gigabytes during annotation slowdowns. Unmount it for the export and let
    // the recording map own tile loading until the export completes.
    enabled: !isExporting && settings.mapStyle !== 'street' && cameraMode !== 'overview' && cameraPathCoordinates.length >= 2
      && (animationPhase === 'idle' || playback.isPlaying || animationPhase === 'preloading' || animationPhase === 'intro' || animationPhase === 'outro'),
    followBehindZoomLevel,
    followBehindPitch: cameraSettings.followBehindPitch,
    isMapLoaded,
    isPlaying: playback.isPlaying,
    mapStyle: settings.mapStyle,
    waybackItemURL: settings.waybackItemURL,
    playbackProgress: playback.progress,
    playbackSpeed: playback.speed,
    totalDurationMs: playback.totalDuration,
    terrainExaggeration,
    locationFeatures: locationChapter.features,
    zoomToPlace: Boolean(settings.locationChapters?.zoomToPlace),
    onStartupReadyChange: !isExporting && cameraMode !== 'overview' ? setStartupWarmupReady : undefined,
  });

  useTilePreload({
    allCoordinates: cameraPathCoordinates,
    animationPhase,
    cameraMode,
    cinematicKeyframes,
    cameraStability: cameraSettings.cameraStability,
    elevationData,
    followBehindZoomLevel,
    followBehindPitch: cameraSettings.followBehindPitch,
    isMapLoaded,
    isPlaying: playback.isPlaying,
    mapRef: map,
    setAnimationPhase,
    smoothBearingRef,
    targetBearingRef,
    totalDurationMs: playback.totalDuration,
    locationBoundariesLoading: locationChapter.loading,
    aerialTerrainLoading: cameraMode === 'aerial-follow' && terrainExaggeration > 0 && cameraPathCoordinates.length >= 2 && !matchingTerrainPlan,
    aerialTerrainPlan: matchingTerrainPlan?.plan ?? null,
    introStartOverride: locationChapter.introCamera,
    introStageOverrides,
    backgroundWarmupReadyRef: !isExporting && cameraMode !== 'overview' ? startupWarmupReadyRef : undefined,
    fastWarmupRef: startupWarmupFastRef,
    // OSM's standard tile service prohibits speculative tile prefetching.
    skipPredictivePreload: settings.mapStyle === 'street',
    basemapIdentity: `${settings.mapStyle}:${settings.waybackItemURL ?? ''}`,
  });

  useEffect(() => {
    if (!map.current || !isMapLoaded) return;

    const container = map.current.getContainer();
    const zoomInButton = container.querySelector('.maplibregl-ctrl-zoom-in');
    const zoomOutButton = container.querySelector('.maplibregl-ctrl-zoom-out');

    if (!(zoomInButton instanceof HTMLButtonElement) || !(zoomOutButton instanceof HTMLButtonElement)) {
      return;
    }

    const changeFollowBehindDistance = (event: Event, direction: 1 | -1) => {
      const isAnimating = animationPhase === 'intro' || animationPhase === 'playing';
      if (cameraMode !== 'follow-behind' || !isAnimating) return false;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();

      // Step through the distance stops the slider exposes, from the saved
      // level rather than the map's live zoom: terrain safety can temporarily
      // zoom the camera out, and deriving from that made a button press appear
      // to do nothing or jump to the wrong distance.
      const currentIndex = getFollowBehindStopIndexForLevel(followBehindZoomLevel);
      const nextLevel = getFollowBehindLevelForStopIndex(currentIndex + direction);
      if (nextLevel === followBehindZoomLevel) return true;

      setCameraSettings({
        followBehindPreset: getNearestFollowBehindPreset(nextLevel),
        followBehindZoomLevel: nextLevel,
      });
      return true;
    };

    const handleZoomButtonPress = (event: Event, direction: 1 | -1) => {
      handledZoomButtonPressRef.current = changeFollowBehindDistance(event, direction);
    };
    const handleZoomButtonClick = (event: Event, direction: 1 | -1) => {
      if (handledZoomButtonPressRef.current) {
        handledZoomButtonPressRef.current = false;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        return;
      }
      changeFollowBehindDistance(event, direction);
    };

    const handleZoomInPress = (event: Event) => handleZoomButtonPress(event, 1);
    const handleZoomOutPress = (event: Event) => handleZoomButtonPress(event, -1);
    const handleZoomInClick = (event: Event) => handleZoomButtonClick(event, 1);
    const handleZoomOutClick = (event: Event) => handleZoomButtonClick(event, -1);

    zoomInButton.addEventListener('mousedown', handleZoomInPress, true);
    zoomOutButton.addEventListener('mousedown', handleZoomOutPress, true);
    zoomInButton.addEventListener('touchstart', handleZoomInPress, true);
    zoomOutButton.addEventListener('touchstart', handleZoomOutPress, true);
    zoomInButton.addEventListener('click', handleZoomInClick, true);
    zoomOutButton.addEventListener('click', handleZoomOutClick, true);

    return () => {
      zoomInButton.removeEventListener('mousedown', handleZoomInPress, true);
      zoomOutButton.removeEventListener('mousedown', handleZoomOutPress, true);
      zoomInButton.removeEventListener('touchstart', handleZoomInPress, true);
      zoomOutButton.removeEventListener('touchstart', handleZoomOutPress, true);
      zoomInButton.removeEventListener('click', handleZoomInClick, true);
      zoomOutButton.removeEventListener('click', handleZoomOutClick, true);
    };
  }, [animationPhase, cameraMode, followBehindZoomLevel, isMapLoaded, setCameraSettings]);

  useEffect(() => {
    if (!isMobile || cameraMode !== 'follow-behind' || hasSeenZoomButtonsHint) return;

    const isAnimating = animationPhase === 'intro' || animationPhase === 'playing';
    if (!isAnimating) return;

    // Deferring this presentation update prevents a render cascade when playback
    // enters its active phase, while still showing the hint before the next paint.
    const timeoutId = window.setTimeout(() => {
      setShowZoomButtonsHint(true);
      setHasSeenZoomButtonsHint(true);
    }, 0);

    try {
      window.localStorage.setItem(ZOOM_BUTTON_HINT_STORAGE_KEY, '1');
    } catch {
      // Ignore storage failures; the hint will just reappear on the next load.
    }

    return () => window.clearTimeout(timeoutId);
  }, [animationPhase, cameraMode, hasSeenZoomButtonsHint, isMobile]);

  useEffect(() => {
    if (!showZoomButtonsHint) return;

    const timeoutId = window.setTimeout(() => {
      setShowZoomButtonsHint(false);
    }, 5000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [showZoomButtonsHint]);

  return (
    <div className="w-full h-full relative" data-aerial-plan={import.meta.env.DEV ? (matchingTerrainPlan ? (matchingTerrainPlan.plan ? 'ready' : 'unavailable') : 'loading') : undefined}
      data-aerial-follow-bearing={import.meta.env.DEV && cameraPathCoordinates.length > 1 ? getAerialFollowBearing(cameraPathCoordinates, playback.progress).toFixed(1) : undefined}
      data-aerial-trailing-bearing={import.meta.env.DEV && cameraPathCoordinates.length > 1 ? trailingFlightBearing(cameraPathCoordinates, playback.progress).toFixed(1) : undefined}
      data-aerial-planned-bearing={import.meta.env.DEV && matchingTerrainPlan?.plan ? terrainPlanBearing(matchingTerrainPlan.plan, playback.progress).toFixed(1) : undefined}>
      <div ref={mapContainer} className="w-full h-full" style={{ backgroundColor: DEFAULT_SKY_COLOR }} />
      {settings.show3DBuildings && <div className="absolute bottom-1 left-1 z-10 bg-black/70 px-1 text-[10px] text-white">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a> · © <a href="https://openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a></div>}

      <span hidden data-location-chapters-status={locationChapter.loading ? "loading" : "ready"} />
      {locationChapter.label && <LocationChapterLabel label={locationChapter.label} accent={settings.locationChapters?.color ?? '#ffbd66'} font={trailStyle.overlayFont} />}
      {locationChapter.credit && <div className="tr-location-credit absolute bottom-1 left-1 z-20 bg-black/75 px-1 text-[10px] text-white">{locationChapter.credit}</div>}
      {locationChapter.loading && !isExporting && <div role="status" className="absolute left-4 top-4 z-20 rounded bg-black/75 px-3 py-2 text-xs text-white">{t('locationChapters.loading')}</div>}
      {locationChapter.error && !isExporting && <div role="status" className="absolute left-4 top-4 z-20 rounded bg-black/75 px-3 py-2 text-xs text-white">{t('locationChapters.unavailable')}{locationChapter.missing.length > 0 && ` ${locationChapter.missing.join(', ')}`}</div>}
      {!locationChapter.error && locationChapter.missing.length > 0 && !isExporting && <div role="status" className="absolute left-4 top-4 z-20 max-w-[80%] rounded bg-black/75 px-3 py-2 text-xs text-white">{t('locationChapters.partialCoverage')}: {locationChapter.missing.join(', ')}</div>}
      {!isMapLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--canvas)]">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 border-2 border-[var(--trail-orange)] border-t-transparent rounded-full animate-spin" />
            <span className="text-[var(--evergreen)]">{t('map.loading')}</span>
          </div>
        </div>
      )}

      {comparisonMode === 'time' && comparisonTracks.length > 0 && (
        <ComparisonLeaderboard primaryTrack={primaryComparisonTrack} comparisonTracks={comparisonTracks} currentTime={currentPosition?.time ?? null} interactive={!isExporting} frame={_props.exportFrame} />
      )}

      {routeComparisonActive && activeRouteComparisons.length > 0 && playback.progress > 0 && (animationPhase === 'playing' || animationPhase === 'idle') && (
        <div role="status" aria-live="polite" className="absolute bottom-20 right-4 z-20 flex items-center gap-2 rounded-full border border-white/20 bg-[rgba(9,14,19,0.88)] px-3 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur-sm">
          <span className="flex items-center -space-x-1" aria-hidden="true">
            <span className="h-3.5 w-3.5 rounded-full border border-white" style={{ backgroundColor: primaryComparisonTrack?.color }} />
            {activeRouteComparisons.map((track) => <span key={track.id} className="h-3.5 w-3.5 rounded-full border border-white" style={{ backgroundColor: track.color }} />)}
          </span>
          {sharedRouteComparisons.length === activeRouteComparisons.length ? t('tracks.routeShared') : t('tracks.routeSplit')}
        </div>
      )}

      {animationPhase === 'preloading' && !isExporting && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[rgba(9,14,19,0.55)] backdrop-blur-[1px]">
          <div className="flex items-center gap-3 rounded-2xl border border-white/12 bg-[rgba(9,14,19,0.88)] px-4 py-3 text-white shadow-[0_16px_36px_rgba(0,0,0,0.28)]">
            <div className="w-6 h-6 border-2 border-[var(--trail-orange)] border-t-transparent rounded-full animate-spin" />
            <span>{t('map.preparingReplay')}</span>
          </div>
        </div>
      )}

      {isMobile && showZoomButtonsHint && isMapLoaded && allCoordinates.length > 0 && (
        <div className="absolute right-4 top-20 z-20 max-w-56 rounded-2xl border border-white/12 bg-[rgba(9,14,19,0.88)] px-3 py-2.5 text-xs leading-relaxed text-white shadow-[0_16px_36px_rgba(0,0,0,0.28)] backdrop-blur-sm">
          {t('map.zoomButtonsHint')}
        </div>
      )}

      {/* Elevation Profile at bottom of map */}
      {isMapLoaded && (tracks.length > 0 || allCoordinates.length > 0) && (
        <MapElevationProfile exportFrame={_props.exportFrame ?? null} />
      )}
    </div>
  );
}

export { MAP_LAYERS };
