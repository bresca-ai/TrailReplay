import { getInitialLanguage } from '@/i18n/translations';
import type { AppSettings, CameraSettings, PlaybackState, SocialShareSettings, VideoExportSettings } from '@/types';
import {
  DEFAULT_FOLLOW_BEHIND_PRESET,
  getFollowBehindZoomLevelForPreset,
} from '@/utils/followBehindCamera';
import { DEFAULT_ACTIVITY_ICON } from '@/utils/activityIcons';

export function createDefaultPlayback(): PlaybackState {
  return {
    isPlaying: false,
    currentTime: 0,
    totalDuration: 0,
    progress: 0,
    speed: 1,
    currentSegmentIndex: 0,
    segmentProgress: 0,
    routeTimingMode: 'recorded',
  };
}

export function createDefaultSettings(): AppSettings {
  return {
    language: getInitialLanguage(),
    unitSystem: 'metric',
    mapStyle: 'esri-clarity',
    mapFilter: 'none',
    show3DTerrain: true,
    showHeartRate: false,
    showPictures: true,
    cameraMode: 'follow-behind',
    defaultAnimationSpeed: 1,
    trailStyle: {
      trailColor: '#C1652F',
      colorMode: 'fixed',
      heartRateZones: [
        { min: 50, max: 120, color: '#8BC34A', label: 'Zone 1' },
        { min: 121, max: 140, color: '#4CAF50', label: 'Zone 2' },
        { min: 141, max: 160, color: '#FFC107', label: 'Zone 3' },
        { min: 161, max: 180, color: '#FF9800', label: 'Zone 4' },
        { min: 181, max: 220, color: '#F44336', label: 'Zone 5' },
      ],
      markerType: 'dot' as const,
      markerColor: '#56C596',
      showMarker: true,
      markerSize: 1.0,
      currentIcon: DEFAULT_ACTIVITY_ICON,
      showCircle: true,
      showTrackLabels: false,
      trackLabel: 'Track 1',
      ghostTrailOpacity: 0.5,
      colorZones: [],
    },
    mapOverlays: { skiPistes: false, slopeOverlay: false, placeLabels: false, aspectOverlay: false },
    waybackRelease: null,
    waybackItemURL: null,
    visibleStats: ['duration', 'distance', 'pace', 'elevation'] as import('@/types').StatId[],
    journeyStatsMode: 'per-track',
    statsPosition: null,
    statsScale: 1,
    statsLayout: 'auto',
    statsBackground: 'panel',
    statsColumns: null,
    paceMode: 'per-km' as const,
    showElevationProfile: true,
    landmarkScale: 1,
    landmarkLabelFade: true,
  };
}

export function createDefaultCameraSettings(): CameraSettings {
  return {
    mode: 'follow-behind',
    zoom: 14,
    pitch: 55,
    bearing: 0,
    followBehindPreset: DEFAULT_FOLLOW_BEHIND_PRESET,
    followBehindZoomLevel: getFollowBehindZoomLevelForPreset(DEFAULT_FOLLOW_BEHIND_PRESET),
    cameraStability: 0.5,
  };
}

export function createDefaultVideoExportSettings(): VideoExportSettings {
  return {
    format: 'mp4',
    quality: 'high',
    qualityMode: 'standard',
    fps: 30,
    resolution: { width: 1920, height: 1080 },
    aspectRatio: '16:9',
    includeAudio: false,
  };
}

export function createDefaultSocialShareSettings(): SocialShareSettings {
  return {
    template: 'map-first',
    aspectRatio: '4:5',
    selectedPictureId: null,
    titleMode: 'journey-name',
    customTitle: '',
    locationLabel: '',
    showLocation: false,
    showStats: true,
    showElevationMiniChart: true,
    routeTransform: { offsetX: 0, offsetY: 0, scale: 1, opacity: 0.9 },
    dataPanelOffsetY: 0,
    routeGlow: true,
  };
}

export const defaultSidebarOpen =
  typeof window === 'undefined' ? true : window.innerWidth >= 768;

export const trackColors = [
  '#C1652F',
  '#3B82F6',
  '#10B981',
  '#8B5CF6',
  '#EF4444',
  '#F59E0B',
  '#06B6D4',
  '#EC4899',
];
