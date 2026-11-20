import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Marker3DPreview } from './Marker3DPreview';

const renderModel = vi.fn();
vi.mock('@/components/map/load3DMarker', () => ({
  create3DMarker: async () => ({ render: renderModel, dispose: vi.fn() }),
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); renderModel.mockClear(); });

it('rotates automatically after a click, then holds the angle chosen by dragging', async () => {
  let nextFrame: FrameRequestCallback = () => {};
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { nextFrame = callback; return 1; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('PointerEvent', MouseEvent);
  const now = performance.now();
  await act(async () => { render(<Marker3DPreview value="3d-runner" color="#c1652f" label="Drag to rotate" />); });
  const canvas = screen.getByRole('img', { name: 'Drag to rotate' });
  canvas.setPointerCapture = vi.fn();
  act(() => nextFrame(now + 1000));
  const initialBearing = renderModel.mock.lastCall![2];
  fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 10, clientY: 10 });
  fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 10, clientY: 10 });
  act(() => nextFrame(now + 2000));
  expect(renderModel.mock.lastCall![2]).toBeGreaterThan(initialBearing);
  const beforeDrag = renderModel.mock.lastCall![2];
  fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 10, clientY: 10 });
  fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 50, clientY: 10 });
  fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 50, clientY: 10 });
  const draggedBearing = renderModel.mock.lastCall![2];
  expect(draggedBearing).toBeGreaterThan(beforeDrag);
  act(() => nextFrame(now + 3000));
  expect(renderModel.mock.lastCall![2]).toBe(draggedBearing);
});
