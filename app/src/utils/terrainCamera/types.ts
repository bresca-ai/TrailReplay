import type { GPXTrack, JourneySegment, RouteTimingMode } from '@/types';

export interface TerrainTile { width: number; height: number; rgba: Uint8Array; }
export type TerrainTileFetcher = (z: number, x: number, y: number, signal?: AbortSignal) => Promise<TerrainTile>;
export interface TerrainSampler { sampleElevation(lon: number, lat: number): Promise<number | null>; }
export interface TerrainSamplerOptions {
  fetchTile: TerrainTileFetcher;
  maxTiles?: number;
  maxConcurrency?: number;
  timeBudgetMs?: number;
  signal?: AbortSignal;
  zoom?: number;
}
export interface TerrainAnchor { trackId: string; segmentId: string; distanceMeters: number; }
export interface TerrainCameraKeyframe {
  id: string; title?: string; anchor: TerrainAnchor; bearingDeg: number; pitchDeg: number; zoom: number;
  frame: 'world'; easing: 'smooth';
  target?: { lon: number; lat: number; elevationMeters: number };
  terrain?: { rationale: string; confidence: number; warnings: string[]; estimatedMinClearanceMeters?: number | null };
}
export interface TerrainCameraPlanFrame extends Omit<TerrainCameraKeyframe, 'frame' | 'easing' | 'terrain'> {
  frame: 'world' | 'route'; easing: 'smooth' | 'linear' | 'hold';
  terrain?: { rationale?: string; confidence?: number; warnings?: string[]; estimatedMinClearanceMeters?: number | null };
}
export interface TerrainCameraBrief {
  version: 1; provider: 'aws-terrarium'; coverage: { sampled: number; known: number; unknown: number; tiles: number; complete: boolean; cameraSamplesComplete?: boolean };
  assumptions: { viewport: { widthPx: number; heightPx: number; verticalFovDeg: number }; cameraStability: number; terrainExaggeration: number; spatialElevationSmoothing: 'not-modeled' };
  warnings: string[]; contextFingerprint: string;
  moments: Array<{ id: string; title: string; anchor: TerrainAnchor; elevationMeters: number | null; reliefMeters: number | null; reason: string; radialRelief: Array<{ bearingDeg: number; samples: Array<{ distanceMeters: number; elevationMeters: number | null }>; reliefMeters: number | null }> }>;
  cameraKeyframes: { version: 1; frames: TerrainCameraKeyframe[] };
}
export interface BuildTerrainCameraBriefOptions {
  tracks: GPXTrack[]; journeySegments: JourneySegment[]; intent?: string; signal?: AbortSignal;
  routeTimingMode?: RouteTimingMode;
  cameraStability?: number;
  viewport?: { widthPx?: number; heightPx?: number; verticalFovDeg?: number; terrainExaggeration?: number };
  onProgress?: (progress: { completed: number; total: number }) => void;
  sampleElevation?: (lon: number, lat: number) => Promise<number | null>;
  sampler?: TerrainSampler;
}
export interface TerrainCameraEvaluation {
  frameId: string; phase?: 'keyframe' | 'transition'; progress?: number; anchor: TerrainAnchor; confidence: number; warnings: string[];
  visibility: 'clear-sampled' | 'intersects-sampled-terrain' | 'unknown';
  routeVisibility?: { sampled: number; visible: number; unknown: number; coverage: number | null; startVisible: boolean; startInFrame: boolean; startOccluded: boolean; startUnknown: boolean; startCount: number; startInFrameCount: number; startVisibleCount: number; startOccludedCount: number; startUnknownCount: number };
  estimate: { cameraDistanceMeters: number; cameraAltitudeMeters: number | null; viewportWidthMeters: number; viewportWidthPx: number; viewportHeightPx: number; verticalFovDeg: number; terrainExaggeration: number; cameraStability: number; anchorSmoothingHalfWindow: number; pitchDeg: number };
  radialRelief: Array<{ bearingDeg: number; samples: Array<{ distanceMeters: number; elevationMeters: number | null }>; reliefMeters: number | null }>;
  clearanceSamples: Array<{ distanceMeters: number; targetEndpoint?: boolean; terrainMeters: number | null; sightlineMeters: number | null; clearanceMeters: number | null }>;
}
export interface EvaluateTerrainCameraPlanOptions {
  frames: TerrainCameraPlanFrame[]; tracks: GPXTrack[]; journeySegments: JourneySegment[]; signal?: AbortSignal;
  routeTimingMode?: RouteTimingMode;
  cameraStability?: number;
  viewport?: { widthPx?: number; heightPx?: number; verticalFovDeg?: number; terrainExaggeration?: number };
  sampleElevation?: (lon: number, lat: number) => Promise<number | null>; sampler?: TerrainSampler;
}
