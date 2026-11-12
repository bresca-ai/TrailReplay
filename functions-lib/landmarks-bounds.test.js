import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { onRequestPost } from '../functions/api/landmarks.js';

describe('landmark geographic and enumeration bounds', () => {
  it.each([
    [[181, 42], [181, 42]], [[-181, 42], [-181, 42]],
    [[2, 91], [2, 91]], [[2, -91], [2, -91]],
  ])('rejects an unsupported coordinate domain before I/O', async (...points) => {
    const context = {
      request: new Request('https://example.invalid/api/landmarks', {
        method: 'POST', body: JSON.stringify({ points }),
      }),
      env: new Proxy({}, { get() { throw new Error('unexpected I/O'); } }),
    };
    expect((await onRequestPost(context)).status).toBe(400);
  });

  function helpers() {
    const countTile = vi.fn();
    const context = vm.createContext({ countTile });
    const source = readFileSync(new URL('../functions/api/landmarks.js', import.meta.url), 'utf8')
      .replaceAll('export ', '')
      .replace('function tileKey(latIndex, lonIndex) {', 'function tileKey(latIndex, lonIndex) { countTile();');
    vm.runInContext(source, context);
    return {
      countTile,
      tiles: (bounds) => vm.runInContext(`tilesForBounds(${JSON.stringify(bounds)})`, context),
      bounds: (points) => vm.runInContext(`routeBounds(${JSON.stringify(points)})`, context),
    };
  }

  it('rejects an oversized grid before constructing any tile', () => {
    const { tiles, countTile } = helpers();
    expect(tiles([0, 0, 3, 3])).toBeNull();
    expect(countTile).not.toHaveBeenCalled();
    expect(tiles([0, 0, 2, 2])).toHaveLength(64);
    expect(tiles([41.5, 2, 41.75, 2.25])).toHaveLength(1);
  });

  it.each([180, -180])('keeps padded geographic edge bounds valid at %s', (longitude) => {
    const { tiles, bounds } = helpers();
    const latitude = longitude / 2;
    const padded = bounds([[longitude, latitude], [longitude, latitude]]);
    expect(padded[0]).toBeGreaterThanOrEqual(-90);
    expect(padded[1]).toBeGreaterThanOrEqual(-180);
    expect(padded[2]).toBeLessThanOrEqual(90);
    expect(padded[3]).toBeLessThanOrEqual(180);
    expect(tiles(padded).length).toBeGreaterThan(0);
  });
});
