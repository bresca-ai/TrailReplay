import { describe, expect, it } from 'vitest';
import { assertMapContextAvailable } from './mapContextReadiness';

describe('map context readiness', () => {
  it('rejects a lost or unavailable WebGL context', () => {
    const canvas = (lost: boolean | null) => ({ getContext: () => lost === null ? null : { isContextLost: () => lost } }) as unknown as HTMLCanvasElement;
    expect(() => assertMapContextAvailable(canvas(false))).not.toThrow();
    expect(() => assertMapContextAvailable(canvas(true))).toThrow(/graphics context was lost/);
    expect(() => assertMapContextAvailable(canvas(null))).toThrow(/graphics context was lost/);
  });
});
