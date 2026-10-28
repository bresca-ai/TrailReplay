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

vi.mock('@/hooks/useProjectFile', () => ({ useProjectFile: () => ({ saveProject: vi.fn(), isSaving: false }) }));
vi.mock('./ExportSettingsModal', () => ({ ExportSettingsModal: () => null }));
vi.mock('./useVideoExportRecorder', () => ({ useVideoExportRecorder: () => ({
  actualFormat: 'webm', estimatedSize: 1, exportProgress: 0, exportStage: '', exportedBlob: null,
  isExporting: false, studioDeliveryStatus: 'idle',
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
    getCanvas: () => ({ width: 1200, height: 800 }),
  } as unknown as MapLibreMap;
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
