import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { loadLocationAtPosition } from '@/utils/locationBoundaries';
import { useStartLocationLevels } from './useStartLocationLevels';

vi.mock('@/utils/locationBoundaries', async importOriginal => ({
  ...(await importOriginal<typeof import('@/utils/locationBoundaries')>()), loadLocationAtPosition: vi.fn(),
}));

it('shares incremental lookups, distinguishes errors from missing places, and retries errors', async () => {
  let fail = true;
  vi.mocked(loadLocationAtPosition).mockImplementation(async (_point, level) => {
    if (level === 'region' && fail) throw new Error('network');
    if (level === 'country' || level === 'region') return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [] }, properties: { id: level, name: level === 'country' ? 'Spain' : 'Catalonia', iso3: 'ESP', credit: '' } };
    return undefined;
  });
  const first = renderHook(() => useStartLocationLevels([2.345, 41.567]));
  const second = renderHook(() => useStartLocationLevels([2.345, 41.567]));
  await waitFor(() => expect(first.result.current.results.adm5.status).toBe('unavailable'));
  expect(first.result.current.results.country).toEqual({ status: 'available', name: 'Spain' });
  expect(second.result.current.results.region.status).toBe('error');
  expect(loadLocationAtPosition).toHaveBeenCalledTimes(6);
  fail = false;
  await act(async () => { first.result.current.retry(); });
  await waitFor(() => expect(second.result.current.results.region).toEqual({ status: 'available', name: 'Catalonia' }));
  expect(loadLocationAtPosition).toHaveBeenCalledTimes(7);
  first.unmount(); second.unmount();
});
