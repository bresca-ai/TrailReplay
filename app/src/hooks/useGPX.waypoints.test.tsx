import { act, renderHook, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { useWaypointImportQueue } from '@/utils/gpx/waypointImportQueue';
import { useGPX } from './useGPX';

beforeEach(() => { useAppStore.getState().reset(); useWaypointImportQueue.setState({ batches: [] }); });
afterEach(cleanup);

it('asks what to do with waypoints after importing the GPX route', async () => {
  const file = new File(['<gpx><wpt lat="41" lon="2.005"><name>Aid station</name></wpt><trk><trkseg><trkpt lat="41" lon="2"/><trkpt lat="41" lon="2.01"/></trkseg></trk></gpx>'], 'trail.gpx');
  const { result } = renderHook(() => useGPX());
  await act(async () => { await result.current.parseFiles([file]); });
  expect(useAppStore.getState().tracks).toHaveLength(1);
  expect(useWaypointImportQueue.getState().batches[0].tracks[0].waypoints?.[0].name).toBe('Aid station');
  expect(useAppStore.getState().textAnnotations).toHaveLength(0);
  expect(useAppStore.getState().userLandmarks).toHaveLength(0);
});
