import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import type { TextAnnotation, VideoExportSettings } from '@/types';
import { drawExportFrame } from './drawExportFrame';

describe('export frame stacking', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('draws stats behind the side note and popup chrome above it', () => {
    const annotation: TextAnnotation = {
      id: 'station', progress: 0.5, lat: 0, lon: 0, title: 'Station note',
      color: '#f3b133', displayDuration: 4000, presentation: 'side-panel',
      logo: '●', holdDuration: 6000,
    };
    const state = useAppStore.getState();
    vi.spyOn(useAppStore, 'getState').mockReturnValue({
      ...state,
      textAnnotations: [annotation],
      playback: { ...state.playback, currentTime: 30_000, totalDuration: 60_000 },
      animationPhase: 'playing',
    });

    const container = document.createElement('div');
    container.id = 'map-capture-container';
    container.getBoundingClientRect = () => new DOMRect(0, 0, 1000, 800);
    const panel = document.createElement('div');
    panel.className = 'tr-annotation-side-panel';
    panel.getBoundingClientRect = () => new DOMRect(600, 350, 300, 200);
    container.appendChild(panel);
    document.body.appendChild(container);

    const mapCanvas = document.createElement('canvas');
    mapCanvas.className = 'maplibregl-canvas';
    mapCanvas.width = 1000;
    mapCanvas.height = 800;
    document.body.appendChild(mapCanvas);
    const recordingCanvas = document.createElement('canvas');
    const staticOverlay = document.createElement('canvas');
    const popupOverlay = document.createElement('canvas');
    const calls: string[] = [];
    const context = {
      drawImage: (source: unknown) => {
        if (source === mapCanvas) calls.push('map');
        if (source === staticOverlay) calls.push('static');
        if (source === popupOverlay) calls.push('popup');
      },
      fillText: (value: string) => { if (value === 'Station note') calls.push('side note'); },
      measureText: (value: string) => ({ width: value.length * 8 }),
      save: () => {}, restore: () => {}, fillRect: () => {},
      beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {},
    } as unknown as CanvasRenderingContext2D;

    drawExportFrame({
      recordingCanvasRef: { current: recordingCanvas },
      recordingContextRef: { current: context },
      videoExportSettings: { resolution: { width: 1000, height: 800 } } as VideoExportSettings,
      cachedOverlayRef: { current: staticOverlay },
      cachedPopupOverlayRef: { current: popupOverlay },
      drawVideoFrame: () => { calls.push('video'); },
      drawStatsValues: () => { calls.push('stats'); },
      drawElevationProgress: () => { calls.push('elevation'); },
      svgMarkerImageCacheRef: { current: new Map() },
      preloadSvgMarkerIcon: () => {},
      getTrackLabel: () => null,
      cachedLogoRef: { current: null },
      overlayLastUpdateRef: { current: Date.now() },
      overlayBusyRef: { current: false },
      overlayRefreshIntervalMs: 1000,
      updateOverlayAsync: async () => {},
      t: (key) => key,
    });

    expect(calls).toEqual(['map', 'static', 'stats', 'elevation', 'side note', 'popup', 'video']);
  });
});
