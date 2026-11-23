import { describe, expect, it } from 'vitest';
import { getStatGridPlacement } from './statGridPlacement';

describe('stat grid placement', () => {
  it('centers incomplete rows for every supported column count', () => {
    for (let count = 1; count <= 8; count++) {
      for (let columns = 1; columns <= count; columns++) {
        const remainder = count % columns;
        if (!remainder) continue;
        const first = count - remainder;
        const placement = getStatGridPlacement(first, count, columns);
        const rowStart = (placement.gridColumnStart ?? 1) - 1 - (placement.offsetHalfColumn ? 0.5 : 0);
        expect(rowStart + remainder / 2).toBe(columns / 2);
        for (let i = first; i < count; i++) {
          expect(getStatGridPlacement(i, count, columns).offsetHalfColumn).toBe(placement.offsetHalfColumn);
        }
      }
    }
  });
});
