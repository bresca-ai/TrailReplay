export interface GPXPoint {
  lat: number;
  lon: number;
  elevation: number;
  time: Date | null;
  heartRate: number | null;
  cadence: number | null;
  power: number | null;
  temperature: number | null;
  distance: number;
  speed: number;
}

export interface GPXTrack {
  id: string;
  name: string;
  activityIcon: string;
  points: GPXPoint[];
  totalDistance: number;
  totalTime: number;
  movingTime: number;
  elevationGain: number;
  elevationLoss: number;
  maxElevation: number;
  minElevation: number;
  maxSpeed: number;
  avgSpeed: number;
  avgMovingSpeed: number;
  bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  color: string;
  visible: boolean;
}

export type TransportMode = 'car' | 'bus' | 'train' | 'plane' | 'bike' | 'walk' | 'ferry';

export interface TransportSegment {
  id: string;
  type: 'transport';
  mode: TransportMode;
  from: { lat: number; lon: number; name?: string };
  to: { lat: number; lon: number; name?: string };
  duration: number;
  distance: number;
}

export interface TrackSegment {
  id: string;
  type: 'track';
  trackId: string;
  duration: number;
}

export type JourneySegment = TrackSegment | TransportSegment;

export interface Journey {
  id: string;
  name: string;
  segments: JourneySegment[];
  totalDuration: number;
  totalDistance: number;
}

export interface PictureAnnotation {
  id: string;
  file: File | null;
  displayFile?: File;
  url: string;
  isPlaceholder: boolean;
  originalFileName?: string;
  lat?: number;
  lon?: number;
  timestamp?: Date;
  progress: number;
  position: number;
  /**
   * Where the photo sits along the route, in metres from the journey start.
   *
   * `progress` depends on the timing mode and therefore has to be recomputed
   * when that mode changes. Distance along the route does not: it increases
   * monotonically, so it identifies the point unambiguously even where the
   * route crosses itself or doubles back, and both timing modes can be
   * derived from it.
   */
  routeDistance?: number;
  /** Stable journey-segment anchor used when segments are reordered. */
  routeSegmentId?: string;
  /** Distance in metres from the start of `routeSegmentId`. */
  routeSegmentDistance?: number;
  placementSource?: 'gps' | 'timestamp' | 'manual';
  title?: string;
  description?: string;
  displayDuration: number;
}

export interface PendingPicturePlacement {
  id: string;
  /**
   * What is waiting to be placed. Clips go through the same click-the-route
   * flow as photos — a clip carrying no location is no more placeable than a
   * photo carrying none, and dropping it wherever the playhead happened to be
   * put it somewhere nobody chose. Absent means `'picture'`, so a saved
   * project written before clips joined the queue still reads correctly.
   */
  mediaKind?: 'picture' | 'video';
  /** Clip length, carried through so the placed `VideoAnnotation` keeps it. */
  durationSeconds?: number;
  file: File;
  displayFile?: File;
  url: string;
  timestamp?: Date;
  title?: string;
  description?: string;
  displayDuration: number;
  placementReason: 'missing-gps' | 'route-mismatch' | 'no-timed-route' | 'timestamp-out-of-range';
  originalLat?: number;
  originalLon?: number;
  mismatchDistanceMeters?: number;
  hasGpsMetadata?: boolean;
  hasTimestampMetadata?: boolean;
  timestampAlternative?: {
    lat: number;
    lon: number;
    progress: number;
    routeDistance?: number;
    routeSegmentId?: string;
    routeSegmentDistance?: number;
  };
}

export interface VideoAnnotation {
  id: string;
  file: File | null;
  url: string;
  isPlaceholder: boolean;
  originalFileName?: string;
  lat?: number;
  lon?: number;
  timestamp?: Date;
  progress: number;
  title?: string;
  description?: string;
  /** Clip length in seconds, as the browser that decoded it reports it. */
  durationSeconds?: number;
  /** How the clip found its place on the route, mirroring `PictureAnnotation`. */
  placementSource?: 'gps' | 'timestamp' | 'manual';
  routeDistance?: number;
  routeSegmentId?: string;
  routeSegmentDistance?: number;
}

export interface IconChange {
  id: string;
  progress: number;
  icon: string;
  label?: string;
}

export interface TextAnnotation {
  id: string;
  progress: number;
  lat: number;
  lon: number;
  title: string;
  subtitle?: string;
  code?: string;
  /** Optional small heading above the note; falls back to the localized default. */
  eyebrow?: string;
  meta?: string;
  description?: string;
  color: string;
  elevation?: number;
  displayDuration: number;
  /** A transparent map caption or a longer field note with a route symbol. */
  presentation?: 'map-card' | 'side-panel';
  /** `map:<glyph>` selects a shared map icon; other values remain emoji. */
  logo?: string;
  /** Additional playback time spent easing through this point, in ms. */
  holdDuration?: number;
  /** Optional authored wording for each UI language. Missing languages use title/subtitle. */
  translations?: Partial<Record<LanguageCode, { title: string; subtitle?: string; eyebrow?: string; meta?: string; description?: string }>>;
}

export * from './landmarks';

export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  totalDuration: number;
  progress: number;
  speed: number;
  currentSegmentIndex: number;
  segmentProgress: number;
  routeTimingMode: RouteTimingMode;
}

export type MapStyle = 'satellite' | 'topo' | 'street' | 'outdoor' | 'esri-clarity' | 'wayback' | 'mapbox-streets';
/**
 * Color treatment applied to the basemap imagery only. The route, markers and
 * landmark labels keep their own colors so they stand out against a muted or
 * black-and-white map (issue #99).
 */
export type MapFilter = 'none' | 'muted' | 'mono' | 'noir';
export type LanguageCode = 'en' | 'es' | 'ca' | 'de' | 'fr';
export type RouteTimingMode = 'recorded' | 'uniform';
export type JourneyStatsMode = 'cumulative' | 'per-track';

export interface MapOverlays {
  skiPistes: boolean;
  slopeOverlay: boolean;
  placeLabels: boolean;
  aspectOverlay: boolean;
}

export interface MapStyleConfig {
  id: MapStyle;
  name: string;
  url: string;
  thumbnail?: string;
}

export type CameraMode = 'overview' | 'follow' | 'follow-behind' | 'cinematic';

export interface CameraSettings {
  mode: CameraMode;
  zoom: number;
  pitch: number;
  bearing: number;
  followBehindPreset: 'very-close' | 'close' | 'medium' | 'far';
  followBehindZoomLevel: number;
  /** 0 = maximally stable/smooth camera, 1 = maximally reactive/tight tracking. */
  cameraStability: number;
}

export type VideoFormat = 'webm' | 'mp4';
export type VideoQuality = 'low' | 'medium' | 'high' | 'ultra';
export type AspectRatio = '16:9' | '1:1' | '9:16';

/**
 * `standard` advances as soon as the map has drawn a frame. `studio` waits for
 * every tile of each frame to finish loading first, so no frame is encoded
 * against the coarse fallback basemap — at roughly 6x the export wall clock.
 */
export type VideoQualityMode = 'standard' | 'studio';

export interface VideoExportSettings {
  format: VideoFormat;
  quality: VideoQuality;
  qualityMode: VideoQualityMode;
  fps: number;
  resolution: { width: number; height: number };
  aspectRatio: AspectRatio;
  includeAudio: boolean;
}

export type SocialShareTemplate = 'map-first' | 'photo-first';
export type SocialShareAspectRatio = '4:5' | '1:1' | '9:16';

export interface SocialShareRouteTransform {
  offsetX: number;
  offsetY: number;
  scale: number;
  opacity: number;
}

export interface SocialShareSettings {
  template: SocialShareTemplate;
  aspectRatio: SocialShareAspectRatio;
  selectedPictureId: string | null;
  titleMode: 'journey-name' | 'track-name' | 'custom';
  customTitle: string;
  locationLabel: string;
  showLocation: boolean;
  showStats: boolean;
  showElevationMiniChart: boolean;
  routeTransform: SocialShareRouteTransform;
  /** How far up the data panel (stats + elevation) is shifted from the bottom, as a fraction of poster height (0 = bottom). */
  dataPanelOffsetY: number;
  routeGlow: boolean;
}

export interface HeartRateZone {
  min: number;
  max: number;
  color: string;
  label: string;
}

export interface ComparisonTrack {
  id: string;
  name: string;
  color: string;
  track: GPXTrack;
  visible: boolean;
  offset: number;
  /** Set when this track was auto-grouped with an overlapping-time upload; names the primary track's id. */
  groupId?: string;
}

export type UnitSystem = 'metric' | 'imperial';

export type ColorMode = 'fixed' | 'heartRate' | 'zones';

export interface TrailColorZone {
  id: string;
  fromProgress: number;
  toProgress: number;
  color: string;
}

export interface TrailStyleSettings {
  // Trail Color
  trailColor: string;
  colorMode: ColorMode;
  heartRateZones: HeartRateZone[];
  // Marker Settings
  markerType: 'icon' | 'dot';
  markerColor: string;
  showMarker: boolean;
  markerSize: number;
  currentIcon: string;
  showCircle: boolean;
  // Track Labels
  showTrackLabels: boolean;
  trackLabel: string;
  ghostTrailOpacity: number;
  colorZones: TrailColorZone[];
}

/**
 * `duration` is the total elapsed clock (stops included); `movingDuration` is
 * the same replay measured on the moving clock. They are two selectable stats
 * rather than one stat with a preference, so a replay can show both.
 */
export type StatId =
  | 'distance'
  | 'duration'
  | 'movingDuration'
  | 'pace'
  | 'elevation'
  | 'heartRate'
  | 'speed'
  | 'altitude';

export interface AppSettings {
  unitSystem: UnitSystem;
  language: LanguageCode;
  mapStyle: MapStyle;
  mapFilter: MapFilter;
  mapOverlays: MapOverlays;
  show3DTerrain: boolean;
  showHeartRate: boolean;
  showPictures: boolean;
  cameraMode: CameraMode;
  defaultAnimationSpeed: number;
  trailStyle: TrailStyleSettings;
  waybackRelease: number | null;
  waybackItemURL: string | null;
  visibleStats: StatId[];
  journeyStatsMode: JourneyStatsMode;
  statsPosition: { x: number; y: number } | null;
  statsScale: number;
  statsLayout: 'auto' | 'horizontal' | 'vertical';
  /** `panel` is the dark rounded card; `transparent` leaves only the text over the map. */
  statsBackground: 'panel' | 'transparent';
  statsColumns: number | null;
  paceMode: 'cumulative' | 'per-km';
  showElevationProfile: boolean;
  /** Multiplier applied to landmark pins and their labels together. */
  landmarkScale: number;
  /** Fade landmark labels in with zoom instead of popping them in. */
  landmarkLabelFade: boolean;
}

export interface LiveStats {
  distance: number;
  duration: number;
  speed: number;
  pace: number;
  elevation: number;
  elevationGain: number;
  heartRate: number | null;
  cadence: number | null;
  power: number | null;
}

export type ActivityType = 'running' | 'cycling' | 'hiking' | 'walking' | 'skiing' | 'other';

export interface ActivityIcon {
  type: ActivityType;
  icon: string;
  label: string;
}
