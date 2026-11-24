import { describe, expect, it } from 'vitest';
import { steerMarker } from './markerSteering';

describe('3D marker steering', () => {
  it('limits turning according to elapsed video time and converges without overshooting', () => {
    let state = steerMarker(null, 0, 0);
    state = steerMarker(state, 90, 100);
    expect(state.heading).toBeCloseTo(30);
    state = steerMarker(state, 90, 250);
    expect(state.heading).toBeCloseTo(75);
    state = steerMarker(state, 90, 300);
    expect(state.heading).toBeCloseTo(90);
  });
  it('uses the short direction across north and ignores small jitter', () => {
    expect(steerMarker({ heading: 359, timeMs: 0 }, 1, 100).heading).toBe(359);
    expect(steerMarker({ heading: 350, timeMs: 0 }, 10, 100).heading).toBe(10);
    expect(steerMarker({ heading: 10, timeMs: 0 }, 350, 100).heading).toBe(350);
  });
  it('turns sharply at the same speed at different frame rates', () => {
    let fastFrames = steerMarker(null, 0, 0);
    for (let time = 20; time <= 200; time += 20) fastFrames = steerMarker(fastFrames, 180, time);
    const slowFrames = steerMarker(steerMarker(null, 0, 0), 180, 200);
    expect(fastFrames.heading).toBeCloseTo(slowFrames.heading);
    expect(fastFrames.heading).toBeCloseTo(300);
  });
  it('holds on repeated frames and resets after a seek or restart', () => {
    const initial = { heading: 0, timeMs: 1000 };
    expect(steerMarker(initial, 90, 1000).heading).toBe(0);
    expect(steerMarker(initial, 90, 100).heading).toBe(90);
    expect(steerMarker(initial, 90, 4000).heading).toBe(90);
  });
});
