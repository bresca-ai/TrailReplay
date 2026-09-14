import { useRef, useCallback, useEffect, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAppStore } from '@/store/useAppStore';
import { useComputedJourney } from '@/hooks/useComputedJourney';
import { usePreparedCinematicCameraKeyframes } from '@/hooks/useCinematicCameraKeyframes';
import { useSuggestedFollowBehindDistance } from '@/components/map/hooks/useSuggestedFollowBehindDistance';
import { MapElevationProfile } from './MapElevationProfile';
import { useI18n } from '@/i18n/useI18n';
import { MAP_LAYERS } from './mapStyle';
import {
  getFollowBehindLevelForStopIndex,
  getFollowBehindStopIndexForLevel,
  getNearestFollowBehindPreset,
} from '@/utils/followBehindCamera';
import { useManualPicturePlacement } from './hooks/useManualPicturePlacement';
import { usePictureMarkers } from './hooks/usePictureMarkers';
import { useTextAnnotationsLayer } from './hooks/useTextAnnotationsLayer';
import { useRouteLandmarksLayer } from './hooks/useRouteLandmarksLayer';
import { useLandmarkPlacement } from './hooks/useLandmarkPlacement';
import { useRouteLandmarks } from '@/hooks/useRouteLandmarks';
import { useComparisonTrackLayers } from './hooks/useComparisonTrackLayers';
import { useBaseMapPresentation } from './hooks/useBaseMapPresentation';
import { useMapInitialization } from './hooks/useMapInitialization';
import { useTrailLayerData } from './hooks/useTrailLayerData';
import { useTrailPlaybackCamera } from './hooks/useTrailPlaybackCamera';
import { useCameraTerrainClearance } from './hooks/useCameraTerrainClearance';
import { useTilePreload } from './hooks/useTilePreload';
import { useReplayTileWarmup } from './hooks/useReplayTileWarmup';
import { useTilePreloadDiagnostics } from './hooks/useTilePreloadDiagnostics';
import { projectCoordinateToJourney, projectCoordinateToTrack } from '@/utils/routeProjection';
import type { CropPreviewMetrics } from '@/utils/crop';

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
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const smoothBearingRef = useRef<number>(0);
  const targetBearingRef = useRef<number>(0);
  const loadZoomDoneRef = useRef<boolean>(false);
  const handledZoomButtonPressRef = useRef(false);
  const restoredCameraKeyRef = useRef<string | null>(null);

  const tracks = useAppStore((state) => state.tracks);
  const settings = useAppStore((state) => state.settings);
  const trailStyle = useAppStore((state) => state.settings.trailStyle);
  const cameraSettings = useAppStore((state) => state.cameraSettings);
  const pictures = useAppStore((state) => state.pictures);
  const textAnnotations = useAppStore((state) => state.textAnnotations);
  const pendingPicturePlacements = useAppStore((state) => state.pendingPicturePlacements);
  const playback = useAppStore((state) => state.playback);
  const animationPhase = useAppStore((state) => state.animationPhase);
  const isExporting = useAppStore((state) => state.isExporting);
  const setAnimationPhase = useAppStore((state) => state.setAnimationPhase);
  const setCameraPosition = useAppStore((state) => state.setCameraPosition);
  const setCameraSettings = useAppStore((state) => state.setCameraSettings);
  const setSelectedPictureId = useAppStore((state) => state.setSelectedPictureId);
  const addPicture = useAppStore((state) => state.addPicture);
  const removePendingPicturePlacement = useAppStore((state) => state.removePendingPicturePlacement);
  const comparisonTracks = useAppStore((state) => state.comparisonTracks);
  const landmarks = useRouteLandmarks();
  const selectedLandmarkId = useAppStore((state) => state.selectedLandmarkId);
  const isPlacingLandmark = useAppStore((state) => state.isPlacingLandmark);
  const selectLandmark = useAppStore((state) => state.selectLandmark);
  const setActivePanel = useAppStore((state) => state.setActivePanel);

  const [isMapLoaded, setIsMapLoaded] = useState(false);
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
  } = useComputedJourney();

  // Derive the current track name for the label
  const currentTrackName = currentSegment?.segment.type === 'track' && currentSegment.segment.trackId
    ? tracks.find((t) => t.id === currentSegment.segment.trackId)?.name
    : activeTrack?.name;
  const cameraMode = cameraSettings.mode;
  const followBehindZoomLevel = cameraSettings.followBehindZoomLevel;
  const cinematicKeyframes = usePreparedCinematicCameraKeyframes(cameraPathCoordinates);

  useSuggestedFollowBehindDistance({
    allCoordinates,
    followBehindZoomLevel,
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

  const findNearestRoutePoint = useCallback((lat: number, lon: number) => {
    if (computedJourney && computedJourney.coordinates.length > 0) {
      return projectCoordinateToJourney(computedJourney, lat, lon, playback.progress);
    }

    const track = activeTrack || tracks[0];
    if (!track || track.points.length === 0) return null;

    return projectCoordinateToTrack(track, lat, lon, playback.progress);
  }, [activeTrack, computedJourney, playback.progress, tracks]);

  useManualPicturePlacement({
    addPicture,
    findNearestRoutePoint,
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
  });

  const handleSelectLandmark = useCallback((landmarkId: string) => {
    selectLandmark(landmarkId);
    // Reveal the editor the selection drives, so clicking a pin on the map has
    // a visible effect even when another panel is open.
    setActivePanel('settings');
  }, [selectLandmark, setActivePanel]);

  useRouteLandmarksLayer({
    isMapLoaded,
    labelFade: settings.landmarkLabelFade,
    scale: settings.landmarkScale,
    landmarks,
    mapRef: map,
    onSelectLandmark: handleSelectLandmark,
    selectedLandmarkId,
  });

  useLandmarkPlacement({
    findNearestRoutePoint,
    isMapLoaded,
    isPlacingLandmark,
    mapRef: map,
  });

  useComparisonTrackLayers({
    comparisonTracks,
    isMapLoaded,
    mapRef: map,
    currentTime: currentPosition?.time ?? null,
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

  useTrailPlaybackCamera({
    activeTrack,
    allCoordinates,
    cameraCoordinates: cameraPathCoordinates,
    animationPhase,
    cameraMode,
    cameraStability: cameraSettings.cameraStability,
    cinematicKeyframes,
    completedCoordinates,
    computedJourney,
    currentIcon,
    currentTimeMs: playback.currentTime,
    currentPosition,
    currentSegment,
    currentTrackColor: currentTrackColor ?? null,
    currentTrackName: currentTrackName ?? null,
    elevationData,
    exportFrame: _props.exportFrame ?? null,
    followBehindZoomLevel,
    isExporting,
    isInTransport,
    isMapLoaded,
    mapRef: map,
    markerRef,
    playbackProgress: playback.progress,
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
      markerSize: trailStyle.markerSize,
      markerType: trailStyle.markerType,
      showCircle: trailStyle.showCircle,
      showMarker: trailStyle.showMarker,
      showTrackLabels: trailStyle.showTrackLabels,
      trailColor: trailStyle.trailColor,
    },
  });

  // Applies in every camera mode, and to manual navigation as much as to the
  // replay: whatever moves the camera, it does not end up underground.
  useCameraTerrainClearance({
    isMapLoaded,
    mapRef: map,
    show3DTerrain: settings.show3DTerrain,
  });

  useTilePreload({
    allCoordinates: cameraPathCoordinates,
    animationPhase,
    cameraMode,
    elevationData,
    followBehindZoomLevel,
    isMapLoaded,
    isPlaying: playback.isPlaying,
    mapRef: map,
    setAnimationPhase,
    smoothBearingRef,
    targetBearingRef,
    totalDurationMs: playback.totalDuration,
  });

  const tileDiagnostics = useTilePreloadDiagnostics({
    isMapLoaded,
    isPlaying: playback.isPlaying,
    mapRef: map,
  });

  useReplayTileWarmup({
    allCoordinates: cameraPathCoordinates,
    animationPhase,
    cameraMode,
    diagnostics: tileDiagnostics,
    elevationData,
    followBehindZoomLevel,
    isMapLoaded,
    isPlaying: playback.isPlaying,
    mapStyle: settings.mapStyle,
    playbackProgress: playback.progress,
    playbackSpeed: playback.speed,
    totalDurationMs: playback.totalDuration,
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
    <div className="w-full h-full relative">
      <div ref={mapContainer} className="w-full h-full" />

      {!isMapLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--canvas)]">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 border-2 border-[var(--trail-orange)] border-t-transparent rounded-full animate-spin" />
            <span className="text-[var(--evergreen)]">{t('map.loading')}</span>
          </div>
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
