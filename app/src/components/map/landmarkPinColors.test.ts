import { describe, expect, it } from 'vitest';
import { landmarkPinColors } from './landmarkPinColors';

describe('landmark pin colors', () => {
  it('distinguishes all water features from green land features', () => {
    const green = landmarkPinColors({ type: 'summit' });
    for (const type of ['lake', 'water', 'waterfall', 'river-crossing'] as const) {
      const blue = landmarkPinColors({ type });
      expect(blue.pin).toBe('#1674c5');
      expect(blue.label).toBe('#b4ddff');
      expect(blue.pin).not.toBe(green.pin);
      expect(blue.label).not.toBe(green.label);
    }
  });

  it('preserves an explicitly chosen color', () => {
    expect(landmarkPinColors({ type: 'lake', color: '#123456' }).pin).toBe('#123456');
  });
});
