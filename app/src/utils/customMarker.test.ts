import { describe, expect, it } from 'vitest';
import { CUSTOM_ANIMATION_PREFIX, CUSTOM_ANIMATION_DURATION, CUSTOM_MODEL_PREFIX, customAnimationByKey, customAnimationKey, getCustomAnimation, sanitizeAnimatedSvg, validateGlb } from './customMarker';
import { getActivityIconMarkerHtml, getActivityIconOption, is3DActivityIcon } from './activityIcons';
import { animatedMarkerFramesUrl } from '@/components/sidebar/export/animatedMarkerFrames';

function glb(json: object): ArrayBuffer {
  const body = new TextEncoder().encode(JSON.stringify(json));
  const length = (body.length + 3) & ~3;
  const bytes = new Uint8Array(20 + length); const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, bytes.length, true);
  view.setUint32(12, length, true); view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(32, 20); bytes.set(body, 20); return bytes.buffer;
}

describe('custom markers', () => {
  it('accepts local fragment references in animated SVGs but rejects active or external content', () => {
    expect(sanitizeAnimatedSvg('<svg xmlns="http://www.w3.org/2000/svg"><style>.x{filter:url(#ink);animation:spin 1s infinite}@keyframes spin{to{rotate:360deg}}</style><path class="x" d="M0 0"/></svg>').localName).toBe('svg');
    for (const svg of ['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', '<svg xmlns="http://www.w3.org/2000/svg"><path onload="alert(1)"/></svg>', '<svg xmlns="http://www.w3.org/2000/svg"><style>.x{fill:url(https://evil.example/x)}</style></svg>', '<svg xmlns="http://www.w3.org/2000/svg"><use href="https://evil.example/x"/></svg>']) {
      expect(() => sanitizeAnimatedSvg(svg)).toThrow();
    }
  });
  it('rejects invalid GLBs and references to external resources', () => {
    expect(() => validateGlb(glb({ asset: { version: '2.0' }, buffers: [{ byteLength: 0 }] }))).not.toThrow();
    expect(() => validateGlb(glb({ asset: { version: '2.0' }, buffers: [{ uri: 'https://evil.example/file.bin' }] }))).toThrow();
    expect(() => validateGlb(new ArrayBuffer(4))).toThrow();
  });
  it('restores an animation and its export sprite from a project marker value', () => {
    const data = { svg: 'data:image/svg+xml,%3Csvg%2F%3E', sprite: 'data:image/png;base64,AAAA', duration: CUSTOM_ANIMATION_DURATION };
    const value = CUSTOM_ANIMATION_PREFIX + btoa(JSON.stringify(data));
    expect(getCustomAnimation(value)).toEqual(data);
    expect(getActivityIconOption(value)?.kind).toBe('animated');
    expect(customAnimationByKey(customAnimationKey(value))).toEqual(data);
    expect(animatedMarkerFramesUrl(value)).toBe(data.sprite);
    expect(getActivityIconMarkerHtml(value, 28, '#111111')).toContain('data-custom-animation=');
    expect(is3DActivityIcon(CUSTOM_MODEL_PREFIX + 'AA==')).toBe(true);
    expect(getActivityIconOption(CUSTOM_MODEL_PREFIX + 'AA==')?.kind).toBe('3d');
  });
});
