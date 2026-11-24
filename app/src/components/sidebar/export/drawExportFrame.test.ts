import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { mapGlobalRef } from '@/utils/mapRef';
import { DEFAULT_SKY_COLOR } from '@/components/map/mapSky';
import { MAP_STYLE } from '@/components/map/mapStyle';
import { drawExportFrame } from './drawExportFrame';
import { createDefaultVideoExportSettings } from '@/store/defaults';
import { useAppStore } from '@/store/useAppStore';

function frameOptions() {
  const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };
  const options: Parameters<typeof drawExportFrame>[0] = {
    recordingCanvasRef: { current: document.createElement('canvas') },
    recordingContextRef: { current: context as unknown as CanvasRenderingContext2D },
    videoExportSettings: { ...createDefaultVideoExportSettings(), resolution: { width: 1080, height: 1920 } },
    cachedOverlayRef: { current: null }, drawVideoFrame: vi.fn(), drawStatsValues: vi.fn(), drawElevationProgress: vi.fn(),
    svgMarkerImageCacheRef: { current: new Map() }, preloadSvgMarkerIcon: vi.fn(), markerTimeMs: 0, getTrackLabel: () => null,
    cachedLogoRef: { current: null }, overlayLastUpdateRef: { current: Date.now() }, overlayBusyRef: { current: false },
    overlayFramesSinceRefreshRef: { current: 0 }, overlayRefreshIntervalMs: 1000,
    updateOverlayAsync: vi.fn(), t: (key) => key,
  };
  return { context, options };
}

beforeEach(() => {
  const container = document.createElement('div');
  container.id = 'map-capture-container';
  container.getBoundingClientRect = () => new DOMRect(0, 0, 1080, 1920);
  document.body.appendChild(container);
  const canvas = document.createElement('canvas');
  canvas.width = 1080; canvas.height = 1920;
  mapGlobalRef.current = { getCanvas: () => canvas } as unknown as MapLibreMap;
});
afterEach(() => { document.body.replaceChildren(); mapGlobalRef.current = null; });

it('crops the landscape map into the selected 9:16 output', () => {
  const container = document.getElementById('map-capture-container')!;
  container.getBoundingClientRect = () => new DOMRect(0, 0, 1600, 900);
  const canvas = mapGlobalRef.current!.getCanvas();
  canvas.width = 1600; canvas.height = 900;
  const { context, options } = frameOptions();
  options.videoExportSettings = { ...options.videoExportSettings, aspectRatio: '9:16', resolution: { width: 810, height: 1440 } };
  drawExportFrame(options);
  const [, x, y, width, height, destX, destY, destWidth, destHeight] = context.drawImage.mock.calls[0];
  expect(x).toBeCloseTo((1600 - 900 * 9 / 16) / 2);
  expect(y).toBeCloseTo(0);
  expect(width).toBeCloseTo(900 * 9 / 16);
  expect(height).toBeCloseTo(900);
  expect([destX, destY, destWidth, destHeight]).toEqual([0, 0, 810, 1440]);
});

it('scales the clamped mobile map crop into the requested output frame', () => {
  const container = document.getElementById('map-capture-container')!;
  container.getBoundingClientRect = () => new DOMRect(0, 0, 320, 2132);
  const canvas = mapGlobalRef.current!.getCanvas();
  canvas.width = 1229; canvas.height = 8192;
  const { context, options } = frameOptions();
  options.videoExportSettings.resolution = { width: 1280, height: 720 };
  drawExportFrame(options);
  const [source, x, y, width, height, destX, destY, destWidth, destHeight] = context.drawImage.mock.calls[0];
  expect(source).toBe(canvas);
  expect(x).toBe(0);
  expect(y).toBeGreaterThan(0);
  expect(width).toBe(1229);
  expect(height).toBeCloseTo(720 / 1280 * 320 * 8192 / 2132);
  expect([destX, destY, destWidth, destHeight]).toEqual([0, 0, 1280, 720]);
});

describe('opaque sky in replay exports', () => {
  it('replaces the previous frame before compositing transparent map pixels on every frame', () => {
    const { context, options } = frameOptions();
    drawExportFrame(options);
    drawExportFrame(options);
    expect(context.fillStyle).toBe(DEFAULT_SKY_COLOR);
    expect(context.fillRect.mock.calls).toEqual([[0, 0, 1080, 1920], [0, 0, 1080, 1920]]);
    const fills = context.fillRect.mock.invocationCallOrder;
    const maps = context.drawImage.mock.invocationCallOrder;
    expect(fills[0]).toBeLessThan(maps[0]);
    expect(maps[0]).toBeLessThan(fills[1]);
    expect(fills[1]).toBeLessThan(maps[1]);
  });

  it('uses the same blue while the map canvas is unavailable', () => {
    mapGlobalRef.current = null;
    const { context, options } = frameOptions();
    drawExportFrame(options);
    expect(context.fillStyle).toBe(DEFAULT_SKY_COLOR);
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 1080, 1920);
    expect(context.drawImage).not.toHaveBeenCalled();
  });

  it('defines opaque blue sky in the shared map style used by navigation, covers and playback', () => {
    expect(MAP_STYLE.sky['sky-color']).toBe(DEFAULT_SKY_COLOR);
    expect(MAP_STYLE.sky['horizon-color']).toBe(DEFAULT_SKY_COLOR);
    expect(MAP_STYLE.sky['sky-horizon-blend']).toBe(0);
    expect(MAP_STYLE.sky['fog-ground-blend']).toBe(1);
  });

  it('paints both colors of a unified comparison marker into the exported canvas', () => {
    const marker = document.createElement('div');
    marker.className = 'tr-marker';
    marker.getBoundingClientRect = () => new DOMRect(100, 200, 24, 24);
    const dot = document.createElement('div');
    dot.dataset.markerDot = '';
    dot.dataset.markerColors = encodeURIComponent(JSON.stringify(['#c1652f', '#3b82f6']));
    dot.style.width = '24px';
    dot.style.border = '2.5px solid white';
    marker.appendChild(dot);
    document.body.appendChild(marker);

    const { options } = frameOptions();
    const fills: string[] = [];
    const context = {
      fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn(), save: vi.fn(), restore: vi.fn(),
      beginPath: vi.fn(), moveTo: vi.fn(), arc: vi.fn(), closePath: vi.fn(), stroke: vi.fn(),
      fill() { fills.push(this.fillStyle); },
    };
    options.recordingContextRef.current = context as unknown as CanvasRenderingContext2D;
    expect(document.querySelector('.tr-marker [data-marker-dot]')).toBe(dot);
    drawExportFrame(options);

    expect(context.drawImage).toHaveBeenCalled();
    expect(fills).toEqual(['#c1652f', '#3b82f6']);
    expect(context.moveTo).toHaveBeenCalledTimes(2);
    expect(context.arc).toHaveBeenCalledTimes(3);
    expect(context.stroke).toHaveBeenCalledOnce();
  });
});

it('paints location names, flags and source credits into cropped video frames', () => {
  const container = document.getElementById('map-capture-container')!;
  const label = document.createElement('div'); label.className = 'tr-location-chapter'; label.textContent = '🇪🇸 Spain'; label.dataset.locationAccent = '#123456'; container.appendChild(label);
  const credit = document.createElement('div'); credit.className = 'tr-location-credit'; credit.textContent = 'geoBoundaries · source · CC BY 4.0'; container.appendChild(credit);
  const { options } = frameOptions();
  const context = { font: '', fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), roundRect: vi.fn(), fill: vi.fn(), stroke: vi.fn(), fillText: vi.fn(), measureText: (value: string) => ({ width: value.length * 10 }) };
  const fonts: string[] = [];
  const fills: string[] = [];
  context.fillText.mockImplementation(() => fonts.push(context.font));
  context.fillRect.mockImplementation(() => fills.push(context.fillStyle));
  options.recordingContextRef.current = context as unknown as CanvasRenderingContext2D;
  useAppStore.getState().setTrailStyle({ overlayFont: 'editorial' });
  drawExportFrame(options);
  expect(context.fillText).toHaveBeenCalledWith('🇪🇸', expect.any(Number), expect.any(Number));
  expect(context.fillText).toHaveBeenCalledWith('Spain', expect.any(Number), expect.any(Number), expect.any(Number));
  expect(context.roundRect).not.toHaveBeenCalled();
  expect(fills).toContain('#123456');
  expect(fonts[context.fillText.mock.calls.findIndex(call => call[0] === 'Spain')]).toContain('Source Serif 4');
  expect(context.fillText.mock.calls.some(call => String(call[0]).includes('geoBoundaries'))).toBe(true);
  useAppStore.getState().reset();
});


it('copies the screen annotation into the exported video frame', () => {
  const note = document.createElement('canvas');
  note.className = 'tr-screen-annotation';
  note.width = 800; note.height = 160;
  note.getBoundingClientRect = () => new DOMRect(400, 700, 200, 40);
  document.getElementById('map-capture-container')!.appendChild(note);
  const { options } = frameOptions();
  const context = {
    fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn(), save: vi.fn(), restore: vi.fn(),
    beginPath: vi.fn(), roundRect: vi.fn(), fill: vi.fn(), fillText: vi.fn(),
    measureText: (value: string) => ({ width: value.length * 10 }),
    createLinearGradient: () => ({ addColorStop: vi.fn() }),
  };
  options.recordingContextRef.current = context as unknown as CanvasRenderingContext2D;
  drawExportFrame(options);
  expect(context.drawImage).toHaveBeenCalledWith(note, 400, 700, 200, 40);
});

it('copies the live route overview to its position in the export', () => {
  const overview = document.createElement('canvas');
  overview.className = 'tr-route-overview';
  overview.width = 400; overview.height = 288;
  overview.getBoundingClientRect = () => new DOMRect(420, 720, 200, 144);
  document.getElementById('map-capture-container')!.appendChild(overview);
  const { options } = frameOptions();
  const context = {
    fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn(), save: vi.fn(), restore: vi.fn(),
    beginPath: vi.fn(), roundRect: vi.fn(), fill: vi.fn(), fillText: vi.fn(),
    measureText: (value: string) => ({ width: value.length * 10 }),
    createLinearGradient: () => ({ addColorStop: vi.fn() }),
  };
  options.recordingContextRef.current = context as unknown as CanvasRenderingContext2D;
  drawExportFrame(options);
  expect(context.drawImage).toHaveBeenCalledWith(overview, 420, 720, 200, 144);
});

it('draws different animated marker frames at different video timestamps', () => {
  const marker = document.createElement('div');
  marker.className = 'tr-marker';
  marker.getBoundingClientRect = () => new DOMRect(100, 200, 28, 28);
  marker.innerHTML = '<div data-marker-icon style="filter:none"><span data-animated-icon="/media/images/animated-markers/runner-steady.svg" style="width:28px;height:28px"></span></div>';
  document.body.appendChild(marker);
  const { options } = frameOptions();
  const sprite = document.createElement('img');
  options.svgMarkerImageCacheRef.current.set('/media/images/animated-marker-frames/runner-steady.png', sprite);
  const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn(), save: vi.fn(), restore: vi.fn() };
  options.recordingContextRef.current = context as unknown as CanvasRenderingContext2D;
  options.markerTimeMs = 0;
  drawExportFrame(options);
  options.markerTimeMs = 320;
  drawExportFrame(options);
  const frames = context.drawImage.mock.calls.filter(([image]) => image === sprite);
  expect(frames).toHaveLength(2);
  expect(frames[0].slice(1, 3)).toEqual([0, 0]);
  expect(frames[1].slice(1, 3)).toEqual([1280, 0]);
});


it('renders the 3D marker at the video timestamp before compositing it', () => {
  const marker = document.createElement('div');
  marker.className = 'tr-marker';
  marker.getBoundingClientRect = () => new DOMRect(100, 200, 28, 28);
  marker.innerHTML = '<div data-marker-icon style="filter:none"><span data-runner-3d style="width:28px;height:28px"><canvas></canvas></span></div>';
  document.body.appendChild(marker);
  const canvas = marker.querySelector('canvas')! as HTMLCanvasElement & { renderRunnerAt: (time: number) => void };
  canvas.renderRunnerAt = vi.fn();
  const { options } = frameOptions();
  const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn(), save: vi.fn(), restore: vi.fn() };
  options.recordingContextRef.current = context as unknown as CanvasRenderingContext2D;
  options.markerTimeMs = 1250;
  drawExportFrame(options);
  expect(canvas.renderRunnerAt).toHaveBeenCalledWith(1250);
  expect(context.drawImage.mock.calls.some(([image]) => image === canvas)).toBe(true);
});

it('uses uploaded animation frames for video export', async () => {
  const { CUSTOM_ANIMATION_PREFIX, CUSTOM_ANIMATION_DURATION, customAnimationKey } = await import('@/utils/customMarker');
  const { getActivityIconMarkerHtml } = await import('@/utils/activityIcons');
  const data = { svg: 'data:image/svg+xml,%3Csvg%2F%3E', sprite: 'data:image/png;base64,AAAA', duration: CUSTOM_ANIMATION_DURATION };
  const value = CUSTOM_ANIMATION_PREFIX + btoa(JSON.stringify(data));
  const marker = document.createElement('div'); marker.className = 'tr-marker';
  marker.getBoundingClientRect = () => new DOMRect(100, 200, 28, 28);
  marker.innerHTML = `<div data-marker-icon style="filter:none">${getActivityIconMarkerHtml(value, 28, '#000000')}</div>`;
  expect(marker.querySelector('span')?.dataset.customAnimation).toBe(customAnimationKey(value));
  document.body.appendChild(marker);
  const { options } = frameOptions(); const sprite = document.createElement('img');
  options.svgMarkerImageCacheRef.current.set(data.sprite, sprite);
  const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn(), save: vi.fn(), restore: vi.fn() };
  options.recordingContextRef.current = context as unknown as CanvasRenderingContext2D;
  options.markerTimeMs = 1000; drawExportFrame(options);
  expect(context.drawImage.mock.calls.some(([image]) => image === sprite)).toBe(true);
});
