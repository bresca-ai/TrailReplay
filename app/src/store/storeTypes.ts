import type {
  GPXTrack,
  PictureAnnotation,
  PendingPicturePlacement,
  VideoAnnotation,
  IconChange,
  TextAnnotation,
  JourneySegment,
  Journey,
  PlaybackState,
  VideoExportSettings,
  SocialShareSettings,
  ComparisonTrack,
  AppSettings,
  UnitSystem,
  MapStyle,
  CameraMode,
  CameraSettings,
  TransportMode,
  TrailStyleSettings,
} from '@/types';
import type { LandmarkType, NearbyPlacesCoverage, RouteLandmark } from '@/types/landmarks';
import type { CinematicCameraKeyframe } from '@/utils/cinematicCameraPlan';
import type { Recipe, RecipeReport } from '@/utils/recipe/types';

export interface AppState {
  tracks: GPXTrack[];
  activeTrackId: string | null;
  comparisonTracks: ComparisonTrack[];
  journey: Journey | null;
  journeySegments: JourneySegment[];
  cinematicCameraKeyframes: CinematicCameraKeyframe[];
  pictures: PictureAnnotation[];
  pendingPicturePlacements: PendingPicturePlacement[];
  videos: VideoAnnotation[];
  iconChanges: IconChange[];
  textAnnotations: TextAnnotation[];
  userLandmarks: RouteLandmark[];
  enrichedLandmarks: RouteLandmark[];
  /** Ids of derived landmarks the user removed from the replay. */
  hiddenLandmarkIds: string[];
  selectedLandmarkId: string | null;
  /** True while the next map click drops a new landmark. */
  isPlacingLandmark: boolean;
  showAutomaticLandmarks: boolean;
  enabledLandmarkGroups: LandmarkType[];
  nearbyPlaceTypes: LandmarkType[] | null;
  nearbyPlacesEnabled: boolean;
  nearbyPlacesLoading: boolean;
  nearbyPlacesError: string | null;
  nearbyPlacesCoverage: NearbyPlacesCoverage | null;
  playback: PlaybackState;
  cinematicPlayed: boolean;
  animationPhase: 'idle' | 'preloading' | 'intro' | 'playing' | 'outro' | 'ended';
  // Drives PicturePopup's progress bar / zoom timing during a deterministic
  // export hold, decoupled from `playback.currentTime` so the route position
  // (and everything derived from it) stays frozen while the photo is shown.
  exportPictureHoldElapsedMs: number | null;
  /**
   * The point in a clip the deterministic export wants shown, in seconds.
   * Non-null only during a video hold: the popup then seeks instead of
   * playing, so every encoded frame lands on the frame the timeline asked
   * for rather than on whatever the browser happened to have decoded.
   */
  exportVideoHoldTimeSeconds: number | null;
  settings: AppSettings;
  cameraSettings: CameraSettings;
  videoExportSettings: VideoExportSettings;
  socialShareSettings: SocialShareSettings;
  exportSubMode: 'video' | 'image';
  isExporting: boolean;
  isDeterministicExport: boolean;
  exportProgress: number;
  exportStage: string;
  isSidebarOpen: boolean;
  exploreMode: boolean;
  activePanel: 'tracks' | 'journey' | 'annotations' | 'pictures' | 'export' | 'settings';
  isLoading: boolean;
  error: string | null;
  selectedPictureId: string | null;
  selectedVideoId: string | null;
  cameraPosition: { lat: number; lon: number; zoom: number; pitch: number; bearing: number } | null;
  addTrack: (track: GPXTrack) => void;
  removeTrack: (trackId: string) => void;
  setActiveTrack: (trackId: string | null) => void;
  updateTrackColor: (trackId: string, color: string) => void;
  updateTrackIcon: (trackId: string, icon: string) => void;
  updateTrackName: (trackId: string, name: string) => void;
  toggleTrackVisibility: (trackId: string) => void;
  reorderTracks: (fromIndex: number, toIndex: number) => void;
  addComparisonTrack: (track: ComparisonTrack) => void;
  removeComparisonTrack: (trackId: string) => void;
  ungroupComparisonTrack: (trackId: string) => void;
  toggleComparisonTrack: (trackId: string) => void;
  updateComparisonOffset: (trackId: string, offset: number) => void;
  updateComparisonTrackName: (trackId: string, name: string) => void;
  updateComparisonColor: (trackId: string, color: string) => void;
  createJourney: (name: string) => void;
  updateJourneyName: (name: string) => void;
  addJourneySegment: (segment: JourneySegment) => void;
  removeJourneySegment: (segmentId: string) => void;
  reorderJourneySegments: (segments: JourneySegment[]) => void;
  updateJourneySegmentDuration: (segmentId: string, duration: number) => void;
  addTransportSegment: (from: { lat: number; lon: number }, to: { lat: number; lon: number }, mode: TransportMode) => void;
  clearJourney: () => void;
  addCinematicCameraKeyframe: (keyframe: CinematicCameraKeyframe) => void;
  updateCinematicCameraKeyframe: (keyframeId: string, updates: Partial<CinematicCameraKeyframe>) => void;
  removeCinematicCameraKeyframe: (keyframeId: string) => void;
  addPicture: (picture: PictureAnnotation) => void;
  queuePendingPicturePlacement: (picture: PendingPicturePlacement) => void;
  removePendingPicturePlacement: (pictureId: string) => void;
  clearPendingPicturePlacements: () => void;
  removePicture: (pictureId: string) => void;
  updatePicturePosition: (
    pictureId: string,
    progress: number,
    routeAnchor?: { routeDistance: number; routeSegmentId: string; routeSegmentDistance: number },
  ) => void;
  updatePictureMetadata: (pictureId: string, title: string, description: string) => void;
  updatePictureDuration: (pictureId: string, duration: number) => void;
  addVideo: (video: VideoAnnotation) => void;
  removeVideo: (videoId: string) => void;
  updateVideoPosition: (
    videoId: string,
    progress: number,
    routeAnchor?: { routeDistance: number; routeSegmentId: string; routeSegmentDistance: number },
  ) => void;
  setSelectedVideoId: (videoId: string | null) => void;
  addIconChange: (iconChange: IconChange) => void;
  removeIconChange: (iconChangeId: string) => void;
  updateIconChangePosition: (iconChangeId: string, progress: number) => void;
  addTextAnnotation: (annotation: TextAnnotation) => void;
  updateTextAnnotation: (annotationId: string, updates: Partial<TextAnnotation>) => void;
  removeTextAnnotation: (annotationId: string) => void;
  addLandmark: (landmark: RouteLandmark) => void;
  hideLandmark: (landmarkId: string) => void;
  restoreHiddenLandmarks: () => void;
  selectLandmark: (landmarkId: string | null) => void;
  setIsPlacingLandmark: (isPlacing: boolean) => void;
  /** Turns a derived landmark into an editable copy owned by the user. */
  adoptLandmark: (landmark: RouteLandmark) => string;
  updateLandmark: (landmarkId: string, updates: Partial<RouteLandmark>) => void;
  removeLandmark: (landmarkId: string) => void;
  setShowAutomaticLandmarks: (show: boolean) => void;
  setEnabledLandmarkGroups: (groups: LandmarkType[]) => void;
  setNearbyPlaceTypes: (types: LandmarkType[] | null) => void;
  setNearbyPlacesEnabled: (enabled: boolean) => void;
  setEnrichedLandmarks: (landmarks: RouteLandmark[]) => void;
  setNearbyPlacesStatus: (loading: boolean, error?: string | null, coverage?: NearbyPlacesCoverage | null) => void;
  setPlayback: (playback: Partial<PlaybackState>) => void;
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  seekToProgress: (progress: number) => void;
  setSpeed: (speed: number) => void;
  setRouteTimingMode: (mode: PlaybackState['routeTimingMode']) => void;
  setCurrentSegment: (index: number, progress: number) => void;
  setCinematicPlayed: (played: boolean) => void;
  setAnimationPhase: (phase: 'idle' | 'preloading' | 'intro' | 'playing' | 'outro' | 'ended') => void;
  setExportPictureHoldElapsedMs: (elapsedMs: number | null) => void;
  resetPlayback: () => void;
  setSettings: (settings: Partial<AppSettings>) => void;
  setCameraSettings: (settings: Partial<CameraSettings>) => void;
  setCameraMode: (mode: CameraMode) => void;
  setMapStyle: (style: MapStyle) => void;
  setUnitSystem: (unit: UnitSystem) => void;
  setTrailStyle: (settings: Partial<TrailStyleSettings>) => void;
  setVideoExportSettings: (settings: Partial<VideoExportSettings>) => void;
  setSocialShareSettings: (settings: Partial<SocialShareSettings>) => void;
  setExportSubMode: (mode: 'video' | 'image') => void;
  setIsExporting: (isExporting: boolean) => void;
  setIsDeterministicExport: (isDeterministic: boolean) => void;
  setExportProgress: (progress: number) => void;
  setExportStage: (stage: string) => void;
  setCameraPosition: (position: { lat: number; lon: number; zoom: number; pitch: number; bearing: number }) => void;
  setSidebarOpen: (isOpen: boolean) => void;
  setExploreMode: (enabled: boolean) => void;
  setActivePanel: (panel: AppState['activePanel']) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  setSelectedPictureId: (pictureId: string | null) => void;
  setExportVideoHoldTimeSeconds: (seconds: number | null) => void;
  relinkPictureFile: (pictureId: string, file: File) => void;
  relinkVideoFile: (videoId: string, file: File) => void;
  reset: () => void;
  /** Bulk-restore only (project load) — bypasses granular per-field actions and their id-generation/side-effect behavior. Do not use for normal UI-driven updates. */
  /** What the last dropped recipe resolved to, shown so a person can check it. */
  recipeReport: RecipeReport | null;
  setRecipeReport: (report: RecipeReport | null) => void;
  /**
   * The recipe this project was built from, kept so that saving preserves the
   * source rather than only what it resolved to.
   */
  sourceRecipe: Recipe | null;
  setSourceRecipe: (recipe: Recipe | null) => void;
  hydrateState: (partial: Partial<AppState>) => void;
}
