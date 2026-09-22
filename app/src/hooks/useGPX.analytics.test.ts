import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { trackEvent } from '@/utils/analytics';
import { parseGPX, parseGPXFiles } from '@/utils/gpxParser';
import { useGPX } from './useGPX';

vi.mock('@/utils/analytics', async (original) => ({ ...await original<object>(), trackEvent: vi.fn() }));
vi.mock('@/utils/gpxParser', async (original) => ({ ...await original<object>(), parseGPXFiles: vi.fn() }));
vi.mock('./useProjectFile', () => ({ isReplayFile: () => false, useProjectFile: () => ({ openProjectFile: vi.fn() }) }));

describe('route import telemetry', () => {
  beforeEach(() => {
    useAppStore.getState().reset();
    vi.mocked(trackEvent).mockClear();
  });

  it('pairs a successful import and canonical project readiness with the same attempt', async () => {
    const track = parseGPX('<gpx><trk><name>private route</name><trkseg><trkpt lat="41" lon="2"><ele>10</ele></trkpt><trkpt lat="41.01" lon="2.01"><ele>20</ele></trkpt></trkseg></trk></gpx>', 'private.gpx');
    vi.mocked(parseGPXFiles).mockResolvedValue([track]);
    const { result } = renderHook(() => useGPX());
    await act(async () => { await result.current.parseFiles([new File(['x'], 'private.gpx')]); });
    const calls = vi.mocked(trackEvent).mock.calls;
    expect(calls.map(([name]) => name)).toEqual(['route_import_started', 'route_import_completed', 'project_ready']);
    const id = calls[0][1]?.operation_id;
    expect(id).toEqual(expect.any(String));
    expect(calls[1][1]?.operation_id).toBe(id);
    expect(calls[2][1]).toMatchObject({ operation_id: id, import_source: 'route_files', track_count: 1 });
    expect(JSON.stringify(calls)).not.toContain('private');
  });

  it('reports an empty parse result as failure without project readiness', async () => {
    vi.mocked(parseGPXFiles).mockResolvedValue([]);
    const { result } = renderHook(() => useGPX());
    await act(async () => {
      await expect(result.current.parseFiles([new File(['x'], 'private.gpx')])).rejects.toThrow();
    });
    const calls = vi.mocked(trackEvent).mock.calls;
    expect(calls.map(([name]) => name)).toEqual(['route_import_started', 'route_import_failed']);
    expect(calls[1][1]).toMatchObject({ operation_id: calls[0][1]?.operation_id, route_error_type: 'empty_result' });
  });
});
