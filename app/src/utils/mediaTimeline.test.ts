import { describe, expect, it } from 'vitest';
import { buildMediaTimeline, progressToTimelineTime, timelineTimeToProgress } from './mediaTimeline';
import type { PictureAnnotation } from '@/types';
const photo = (id: string, progress: number, displayDuration: number): PictureAnnotation => ({ id, progress, position: progress, displayDuration, file: null, url: '', isPlaceholder: false });
describe('media timeline', () => {
  it('accounts for sequential photo holds in the ruler and converts drops back to route positions', () => {
    const timeline = buildMediaTimeline(60000, [], [photo('a', 0.25, 4000), photo('b', 0.5, 2000)], []);
    expect(timeline.blocks.map((b) => [b.startMs, b.endMs])).toEqual([[15000, 19000], [34000, 36000]]);
    expect(timeline.totalMs).toBe(66000);
    expect(timelineTimeToProgress(17000, 60000, [], timeline.blocks)).toBe(0.25);
    expect(timelineTimeToProgress(24000, 60000, [], timeline.blocks)).toBeCloseTo(1 / 3, 5);
    expect(progressToTimelineTime(0.5, 60000, [], timeline.blocks)).toBe(34000);
  });
});
