import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

it('uses the same keyed tile URL for map labels and preload requests', async () => {
  vi.stubEnv('VITE_CARTO_BASEMAPS_KEY', 'test+key');
  const { CARTO_LABELS_TEMPLATE } = await import('./cartoLabels');
  const { getTileRequestUrl } = await import('./tileRequestScheduler');
  expect(CARTO_LABELS_TEMPLATE).toContain('key=test%2Bkey');
  expect(getTileRequestUrl('carto-labels', '4/8/5')).toBe(
    CARTO_LABELS_TEMPLATE!.replace('{z}', '4').replace('{x}', '8').replace('{y}', '5'),
  );
});

it('does not request unkeyed CARTO tiles when no key is configured', async () => {
  vi.stubEnv('VITE_CARTO_BASEMAPS_KEY', '');
  const { CARTO_LABELS_TEMPLATE } = await import('./cartoLabels');
  const { getTileRequestUrl } = await import('./tileRequestScheduler');
  expect(CARTO_LABELS_TEMPLATE).toBeUndefined();
  expect(getTileRequestUrl('carto-labels', '4/8/5')).toBeNull();
});
