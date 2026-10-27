import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Map } from 'maplibre-gl';
import { useAppStore } from '@/store/useAppStore';
import { useMapControlLabels } from './useMapControlLabels';

afterEach(cleanup);

describe('map control translations', () => {
  it('updates labels when language changes without recreating the map, including fullscreen transitions', () => {
    useAppStore.getState().reset();
    useAppStore.getState().setSettings({ language: 'en' });
    const container = document.createElement('div');
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    for (const name of ['zoom-in', 'zoom-out', 'compass', 'fullscreen']) {
      const button = document.createElement('button');
      button.className = `maplibregl-ctrl-${name}`;
      container.appendChild(button);
    }
    const mapRef = { current: { getCanvas: () => canvas, getContainer: () => container } as unknown as Map };
    renderHook(() => useMapControlLabels(mapRef, true));
    const zoom = container.querySelector('.maplibregl-ctrl-zoom-in')!;
    expect(zoom).toHaveAttribute('title', 'Zoom in');
    act(() => useAppStore.getState().setSettings({ language: 'zh-TW' }));
    expect(zoom).toHaveAttribute('title', '放大');
    expect(canvas).toHaveAttribute('aria-label', '地圖');
    expect(container.querySelector('.maplibregl-ctrl-compass')).toHaveAttribute('aria-label', '將地圖轉回北方');
    const fullscreen = container.querySelector('.maplibregl-ctrl-fullscreen')!;
    fullscreen.className = 'maplibregl-ctrl-shrink';
    fullscreen.setAttribute('title', 'Exit fullscreen');
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(fullscreen).toHaveAttribute('title', '切換全螢幕');
  });
});
