import { describe, expect, it } from 'vitest';
import { steerMarker } from './markerSteering';

describe('3D marker steering', () => {
  it('limits turning according to elapsed video time and converges without overshooting', () => {
    let state = steerMarker(null, 0, 0);
    state = steerMarker(state, 90, 100);
    expect(state.heading).toBeCloseTo(15);
    state = steerMarker(state, 90, 500);
    expect(state.heading).toBeCloseTo(75);
    state = steerMarker(state, 90, 700);
    expect(state.heading).toBeCloseTo(90);
  });
  it('uses the short direction across north and ignores small jitter', () => {
    expect(steerMarker({ heading: 359, timeMs: 0 }, 1, 100).heading).toBe(359);
    expect(steerMarker({ heading: 350, timeMs: 0 }, 10, 100).heading).toBe(5);
    expect(steerMarker({ heading: 10, timeMs: 0 }, 350, 100).heading).toBe(355);
  });
  it('holds on repeated frames and resets after a seek or restart', () => {
    const initial = { heading: 0, timeMs: 1000 };
    expect(steerMarker(initial, 90, 1000).heading).toBe(0);
    expect(steerMarker(initial, 90, 100).heading).toBe(90);
    expect(steerMarker(initial, 90, 4000).heading).toBe(90);
  });
});
