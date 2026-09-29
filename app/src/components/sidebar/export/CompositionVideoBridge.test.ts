import { describe, expect, it } from 'vitest';
import { getCompositionVideoTime } from './compositionVideoTime';

const base = { source: 'clip', fit: 'cover', mute: true } as const;

describe('getCompositionVideoTime', () => {
  it('loops timeline-synced footage inside its trim range', () => {
    expect(getCompositionVideoTime({
      config: { ...base, sync: 'timeline', trim: { start: 2, end: 6 } },
      duration: 10,
      progress: 0.5,
      timelineSeconds: 9,
    })).toBe(3);
  });

  it('maps route progress across the trim range', () => {
    expect(getCompositionVideoTime({
      config: { ...base, sync: 'route', trim: { start: 4, end: 8 } },
      duration: 10,
      progress: 0.25,
      timelineSeconds: 0,
    })).toBe(5);
  });

  it('keeps manual footage on its trim start', () => {
    expect(getCompositionVideoTime({
      config: { ...base, sync: 'manual', trim: { start: 7 } },
      duration: 12,
      progress: 1,
      timelineSeconds: 10,
    })).toBe(7);
  });
});
