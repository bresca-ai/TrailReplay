import { describe, expect, it } from 'vitest';
import { routeTileCorridor } from './routeTileCorridor';

describe('routeTileCorridor', () => {
  it('bounds work on routes spanning continents', () => {
    const keys = routeTileCorridor([[-120, 0], [100, 0]], 16, 1, 128);
    expect(keys).toHaveLength(128);
  });
  it('covers the tiles between sparse points as well as their neighbours', () => {
    const keys = routeTileCorridor([[0, 0], [0.1, 0]], 14);
    const rows = new Set(keys.map(key => key.split('/')[2]));
    const columns = new Set(keys.map(key => Number(key.split('/')[1])));
    expect(rows.size).toBe(3);
    expect(columns.size).toBeGreaterThan(5);
    expect(columns.has(8194)).toBe(true);
  });

  it('takes the short path across the antimeridian', () => {
    const keys = routeTileCorridor([[179.99, 0], [-179.99, 0]], 14, 0);
    expect(keys.length).toBeLessThan(10);
    expect(keys.some(key => key.startsWith('14/0/'))).toBe(true);
    expect(keys.some(key => key.startsWith('14/16383/'))).toBe(true);
  });
});
