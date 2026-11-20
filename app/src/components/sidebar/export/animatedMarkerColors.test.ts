import { describe, expect, it } from 'vitest';
import { animatedIconUrl, getActivityIconMarkerHtml } from '@/utils/activityIcons';
import { recolorMarkerPixels } from './animatedMarkerFrames';

describe('animated marker track colors', () => {
  it('changes the primary SVG color and preserves the other artwork colors', () => {
    const url = animatedIconUrl('/media/images/animated-markers/runner-steady.svg', '#2574d9');
    const svg = decodeURIComponent(url.slice('data:image/svg+xml,'.length));
    expect(svg).toContain('--orange:#2574d9');
    expect(svg).toContain('--ink:#1B2A20');
    expect(getActivityIconMarkerHtml('animated-runner-steady', 28, '#2574d9')).toContain('data-marker-color="#2574d9"');
  });
  it('changes export sprite orange but keeps ink, paper and gold', () => {
    const pixels = new Uint8ClampedArray([193, 101, 47, 255, 27, 42, 32, 255, 255, 255, 255, 255, 233, 180, 76, 255]);
    recolorMarkerPixels(pixels, '#2574d9');
    expect([...pixels]).toEqual([37, 116, 217, 255, 27, 42, 32, 255, 255, 255, 255, 255, 233, 180, 76, 255]);
  });
});
