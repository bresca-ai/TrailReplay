import { describe, expect, it } from 'vitest';
import { addBlock, applyPreset, createReplayComposition, duplicateBlock, getLayout, isClassicReplayLayout, moveBlockBy, normalizeReplayComposition, removeBlock, reorder, toggleLock, toggleVisibility, updateRect } from './replayComposition';

describe('replay composition domain', () => {
  it('uses normalized fractions, clamps malformed rectangles, and keeps blocks inside the frame', () => {
    const blocks = normalizeReplayComposition({ blocks: [{ kind: 'video', x: -.4, y: .8, width: 4, height: .8 }, { kind: 'stats', width: 0 }] }).layouts['16:9'].blocks;
    expect(blocks.find((b) => b.kind === 'video')).toMatchObject({ x: 0, y: .8, width: 1 });
    expect(blocks.find((b) => b.kind === 'video')?.height).toBeCloseTo(.2);
    expect(blocks.find((b) => b.kind === 'stats')?.width).toBeGreaterThan(0);
  });
  it('has non-overlapping reel regions and classic full-frame map overlays', () => {
    const reel = createReplayComposition('reel').layouts['9:16'].blocks;
    expect(reel.map((b) => b.kind)).toEqual(['video', 'stats', 'map', 'elevation', 'branding']);
    expect(reel.every((b, i) => i === 0 || b.y >= reel[i - 1].y + reel[i - 1].height - 1e-9)).toBe(true);
    expect(createReplayComposition().layouts['16:9'].blocks.find((b) => b.kind === 'map')).toMatchObject({ x: 0, y: 0, width: 1, height: 1 });
  });
  it('enforces a singleton map while allowing every element to be removed', () => {
    const c = normalizeReplayComposition({ layouts: { '1:1': { blocks: [{ kind: 'map' }, { kind: 'map' }, { kind: 'branding', config: { attribution: false } }] } } });
    const l = getLayout(c, '1:1');
    expect(l.blocks.filter((b) => b.kind === 'map')).toHaveLength(1);
    expect(l.blocks.find((b) => b.kind === 'branding')?.config).toEqual({ attribution: true });
    expect(removeBlock(c, '1:1', l.blocks.find((b) => b.kind === 'map')!.id).layouts['1:1'].blocks.filter((b) => b.kind === 'map')).toHaveLength(0);
  });
  it('supports isolated editor operations and only duplicates duplicable blocks', () => {
    const c = createReplayComposition(); const stats = c.layouts['1:1'].blocks.find((b) => b.kind === 'stats')!;
    const changed = toggleVisibility(toggleLock(updateRect(reorder(c, '1:1', stats.id, 99), '1:1', stats.id, { x: .2, width: .3 }), '1:1', stats.id), '1:1', stats.id);
    expect(changed.layouts['1:1'].blocks.find((b) => b.id === stats.id)).toMatchObject({ x: .2, width: .3, visible: false, locked: true, zIndex: 99 });
    expect(changed.layouts['16:9'].blocks).toEqual(c.layouts['16:9'].blocks);
    expect(duplicateBlock(c, '1:1', stats.id).layouts['1:1'].blocks).toHaveLength(5);
    expect(duplicateBlock(c, '1:1', 'map-0')).toBe(c);
    const branding = c.layouts['1:1'].blocks.find((b) => b.kind === 'branding')!;
    expect(duplicateBlock(c, '1:1', branding.id).layouts['1:1'].blocks.filter((b) => b.kind === 'branding')).toHaveLength(2);
    expect(addBlock(c, '1:1', { ...stats, id: 'custom', kind: 'photo', config: { source: 'x' } } as never).layouts['1:1'].blocks.some((b) => b.id === 'custom')).toBe(true);
  });
  it('applies a preset to one aspect ratio and preserves the others', () => {
    const c = createReplayComposition(); const changed = applyPreset(c, '9:16', 'reel');
    expect(changed.layouts['9:16'].blocks[0].kind).toBe('video');
    expect(changed.layouts['16:9']).toEqual(c.layouts['16:9']);
  });
  it('distinguishes untouched classic layouts from edited layouts', () => {
    const c = createReplayComposition();
    expect(isClassicReplayLayout(c.layouts['16:9'])).toBe(true);
    expect(isClassicReplayLayout(updateRect(c, '16:9', 'stats-10', { x: .2 }).layouts['16:9'])).toBe(false);
    expect(isClassicReplayLayout(createReplayComposition('reel').layouts['9:16'])).toBe(false);
  });
  it('moves a block one layer at a time with stable unique z indexes', () => {
    const c = createReplayComposition('reel');
    const moved = moveBlockBy(c, '9:16', 'video-0', 1);
    expect([...moved.layouts['9:16'].blocks].sort((a, b) => a.zIndex - b.zIndex).map((block) => block.kind).slice(0, 2))
      .toEqual(['stats', 'video']);
    expect(new Set(moved.layouts['9:16'].blocks.map((block) => block.zIndex)).size)
      .toBe(moved.layouts['9:16'].blocks.length);
  });
});
