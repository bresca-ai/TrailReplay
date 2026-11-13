import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { setTimelineDraggedPicture } from '@/utils/timelineDragPicture';
import { usePictureMarkers } from './usePictureMarkers';

vi.mock('maplibre-gl', () => ({ Marker: class {
  element: HTMLElement;
  constructor(options: { element: HTMLElement }) { this.element = options.element; }
  setLngLat() { return this; }
  addTo() { document.body.appendChild(this.element); return this; }
} }));
afterEach(() => { cleanup(); setTimelineDraggedPicture(null); document.querySelectorAll('.tr-picture-marker').forEach((node) => node.remove()); });
it('hides the old map marker during a drag and restores it when cancelled', () => {
  const picture = { id: 'photo', file: null, url: '', isPlaceholder: true, lat: 42, lon: 2, progress: 0.2, position: 0.2, displayDuration: 3000 };
  renderHook(() => usePictureMarkers({ isMapLoaded: true, mapRef: { current: {} as MapLibreMap }, pictures: [picture], setSelectedPictureId: vi.fn(), showPictures: true }));
  expect(document.querySelectorAll('.tr-picture-marker')).toHaveLength(1);
  act(() => setTimelineDraggedPicture('photo'));
  expect(document.querySelectorAll('.tr-picture-marker')).toHaveLength(0);
  act(() => setTimelineDraggedPicture(null));
  expect(document.querySelectorAll('.tr-picture-marker')).toHaveLength(1);
});
