import { createElement } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { GPXTrack } from '@/types';
import { useAppStore } from '@/store/useAppStore';
import { mapGlobalRef } from '@/utils/mapRef';
import { ExportPanel } from '../ExportPanel';
import { useSocialShareExport } from './useSocialShareExport';
import { captureSocialMap } from './captureSocialMap';
import { renderSocialPoster } from './socialShareRenderer';
import { createDefaultVideoExportSettings } from '@/store/defaults';

const recorderMock = vi.hoisted(() => ({ blob: null as Blob | null, exportedSettings: null as import('@/types').VideoExportSettings | null }));

vi.mock('@/hooks/useProjectFile', () => ({ useProjectFile: () => ({ saveProject: vi.fn(), isSaving: false }) }));
vi.mock('./ExportSettingsModal', () => ({ ExportSettingsModal: () => null }));
vi.mock('./useVideoExportRecorder', () => ({ useVideoExportRecorder: () => ({
  actualFormat: 'webm', estimatedSize: 1, exportProgress: 0, exportStage: '', exportedBlob: recorderMock.blob,
  exportedVideoSettings: recorderMock.exportedSettings,
  resetExportResult: () => { recorderMock.blob = null; recorderMock.exportedSettings = null; },
  isExporting: false, studioDeliveryStatus: recorderMock.blob ? 'failed' : 'idle',
}) }));
vi.mock('./captureSocialMap', () => ({ captureSocialMap: vi.fn(async () => document.createElement('canvas')) }));
vi.mock('./socialShareRenderer', async (original) => ({
  ...await original<typeof import('./socialShareRenderer')>(),
  renderSocialPoster: vi.fn((input) => `data:image/png,${input.settings.customTitle}`),
}));
vi.mock('./socialShareBrand', async (original) => ({
  ...await original<typeof import('./socialShareBrand')>(),
  loadSocialShareLogo: vi.fn(async () => new Image()),
}));
vi.mock('./socialShareMedia', async (original) => ({
  ...await original<typeof import('./socialShareMedia')>(),
  loadPosterAssets: vi.fn(async () => ({})),
}));

const initial = useAppStore.getState();
beforeEach(() => {
  vi.clearAllMocks();
  recorderMock.blob = null;
  recorderMock.exportedSettings = null;
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
  useAppStore.setState(initial, true);
  useAppStore.getState().setSettings({ language: 'en' });
  useAppStore.setState({ tracks: [{
    id: 'alba', name: 'Alba', visible: true, color: '#ff0000', points: [],
    totalDistance: 1000, totalTime: 600, movingTime: 600, elevationGain: 800,
    elevationLoss: 0, maxElevation: 1200, minElevation: 400, avgSpeed: 6, maxSpeed: 10,
  } as unknown as GPXTrack] });
  useAppStore.getState().setSocialShareSettings({ titleMode: 'custom', customTitle: 'Alba' });
  Object.defineProperty(document, 'fonts', { configurable: true, value: { load: vi.fn(async () => []) } });
  mapGlobalRef.current = {
    getCenter: () => ({ lng: 1, lat: 42 }), getZoom: () => 13,
    getPitch: () => 75, getBearing: () => 20,
    getCanvas: () => ({ width: 1200, height: 800 }), jumpTo: vi.fn(),
  } as unknown as MapLibreMap;
});

it('shows the finished video settings and keeps them locked until starting a new export', () => {
  recorderMock.blob = new Blob(['video'], { type: 'video/mp4' });
  recorderMock.exportedSettings = createDefaultVideoExportSettings();
  useAppStore.getState().setVideoExportSettings({ aspectRatio: '9:16', resolution: { width: 810, height: 1440 } });
  const { rerender } = render(createElement(ExportPanel));
  expect(screen.getByRole('button', { name: '16:9' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: '9:16' })).toBeDisabled();
  expect(screen.getByText(/settings describe the finished video/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'New Export' }));
  rerender(createElement(ExportPanel));
  expect(screen.getByRole('button', { name: '9:16' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: '9:16' })).toBeEnabled();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); mapGlobalRef.current = null; useAppStore.setState(initial, true); });

describe('cover previews across export tabs', () => {
  it('keeps project saving available above both output modes', () => {
    render(createElement(ExportPanel));
    expect(screen.getByText('Save your project').closest('details')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Image' }));
    expect(screen.getByText('Save your project').closest('details')).toBeInTheDocument();
  });
  it('keeps Back to video visible through Image-tab clicks and retains edits in the video cover', async () => {
    useAppStore.getState().setVideoExportSettings({ includeCover: true });
    render(createElement(ExportPanel));
    await waitFor(() => expect(useAppStore.getState().videoCoverImageUrl).toBe('data:image/png,Alba'));
    fireEvent.click(screen.getByRole('button', { name: 'Image' }));
    fireEvent.click(screen.getByRole('button', { name: 'Image' }));
    expect(screen.getByRole('button', { name: 'Back to video export' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Title' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'La meva portada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Video' }));
    await waitFor(() => expect(useAppStore.getState().videoCoverImageUrl).toBe('data:image/png,La meva portada'));
    expect(screen.getByRole('img', { name: 'Video cover' })).toHaveAttribute('src', 'data:image/png,La meva portada');
    fireEvent.click(screen.getByRole('button', { name: 'Image' }));
    fireEvent.click(screen.getByRole('button', { name: 'Title' }));
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('La meva portada');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back to video export' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Back to video export' }));
    expect(screen.getByRole('img', { name: 'Video cover' })).toHaveAttribute('src', 'data:image/png,La meva portada');
  });

  it('restores the cover camera when returning to the editor', async () => {
    const map = mapGlobalRef.current!;
    const { rerender } = renderHook(({ enabled }) => useSocialShareExport(enabled), { initialProps: { enabled: true } });
    await waitFor(() => expect(useAppStore.getState().socialShareSettings.mapCamera).toBeDefined());
    rerender({ enabled: false });
    rerender({ enabled: true });
    expect(map.jumpTo).toHaveBeenCalledWith(expect.objectContaining({ center: [1, 42], zoom: 13, pitch: 75, bearing: 20 }));
  });

  it('restores a saved cover camera before generating a cover outside the editor', async () => {
    const camera = { trackKey: '', center: [2, 43] as [number, number], zoom: 15, pitch: 35, bearing: 65 };
    useAppStore.getState().setSocialShareSettings({ mapCamera: camera });
    const map = mapGlobalRef.current!;
    renderHook(() => useSocialShareExport(true, false, true));
    await waitFor(() => expect(captureSocialMap).toHaveBeenCalled());
    expect(map.jumpTo).toHaveBeenCalledWith(camera);
    expect(vi.mocked(map.jumpTo).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(captureSocialMap).mock.invocationCallOrder[0]);
  });

  it('stores the adjusted cover camera while the editor is still open', async () => {
    const container = document.createElement('div');
    container.id = 'map-capture-container';
    container.getBoundingClientRect = () => new DOMRect(0, 0, 1200, 800);
    document.body.appendChild(container);
    const map = mapGlobalRef.current!;
    Object.assign(map, {
      project: () => ({ x: 600, y: 400 }),
      unproject: () => ({ lng: 2, lat: 43 }),
      jumpTo: vi.fn(),
    });
    const { result } = renderHook(() => useSocialShareExport());
    await waitFor(() => expect(result.current.previewUrl).not.toBeNull());
    vi.spyOn(map, 'getCenter').mockReturnValue({ lng: 2, lat: 43 } as ReturnType<typeof map.getCenter>);
    await act(async () => { await result.current.transformMapViewport({ type: 'move', deltaX: 0.1, deltaY: 0.1 }); });
    expect(useAppStore.getState().socialShareSettings.mapCamera).toMatchObject({ center: [2, 43], zoom: 13, pitch: 75, bearing: 20 });
    container.remove();
  });

  it('saves the latest edit when switching to Video before its tiles finish loading', async () => {
    const { result, rerender } = renderHook(({ enabled }) => useSocialShareExport(enabled), { initialProps: { enabled: true } });
    await waitFor(() => expect(result.current.previewUrl).toBe('data:image/png,Alba'));
    let finishCapture!: (canvas: HTMLCanvasElement) => void;
    vi.mocked(captureSocialMap).mockImplementationOnce(() => new Promise((resolve) => { finishCapture = resolve; }));
    act(() => useAppStore.getState().setSocialShareSettings({ customTitle: 'Portada catalana', showMapPlaces: true }));
    await waitFor(() => expect(finishCapture).toBeDefined());
    rerender({ enabled: false });
    await act(async () => finishCapture(document.createElement('canvas')));
    await waitFor(() => expect(useAppStore.getState().videoCoverImageUrl).toBe('data:image/png,Portada catalana'));
    expect(result.current.previewUrl).toBe('data:image/png,Portada catalana');
    const rendered = vi.mocked(renderSocialPoster).mock.calls.length;
    rerender({ enabled: true });
    expect(renderSocialPoster).toHaveBeenCalledTimes(rendered);
    expect(result.current.previewUrl).toBe('data:image/png,Portada catalana');
  });

  it('does not let an older pending render overwrite newer edits', async () => {
    let finishOldCapture!: (canvas: HTMLCanvasElement) => void;
    vi.mocked(captureSocialMap).mockImplementationOnce(() => new Promise((resolve) => { finishOldCapture = resolve; }));
    renderHook(() => useSocialShareExport());
    await waitFor(() => expect(finishOldCapture).toBeDefined());
    act(() => useAppStore.getState().setSocialShareSettings({ customTitle: 'Latest' }));
    await waitFor(() => expect(useAppStore.getState().videoCoverImageUrl).toBe('data:image/png,Latest'));
    await act(async () => finishOldCapture(document.createElement('canvas')));
    expect(useAppStore.getState().videoCoverImageUrl).toBe('data:image/png,Latest');
  });

  it('keeps an incomplete photo layout from replacing the saved cover', async () => {
    useAppStore.getState().setVideoCoverImageUrl('previous-cover');
    useAppStore.getState().setSocialShareSettings({ template: 'split', photoSlots: [] });
    const { result } = renderHook(() => useSocialShareExport());
    await waitFor(() => expect(result.current.previewUrl).toBe('data:image/png,Alba'));
    expect(useAppStore.getState().videoCoverImageUrl).toBe('previous-cover');
  });
});
