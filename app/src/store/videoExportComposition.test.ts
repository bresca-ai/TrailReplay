import { describe, expect, it } from 'vitest';
import { createDefaultVideoExportSettings, mergeVideoExportSettings } from './defaults';
import { createReplayComposition, isClassicReplayLayout } from '@/components/sidebar/export/replayComposition';

describe('video export composition persistence', () => {
  it('gives existing projects a classic layout for every aspect ratio', () => {
    const settings = mergeVideoExportSettings({ fps: 60 });
    expect(settings.fps).toBe(60);
    expect(isClassicReplayLayout(settings.composition.layouts['16:9'])).toBe(true);
    expect(isClassicReplayLayout(settings.composition.layouts['1:1'])).toBe(true);
    expect(isClassicReplayLayout(settings.composition.layouts['9:16'])).toBe(true);
  });

  it('preserves a composed portrait layout through a JSON project round trip', () => {
    const source = createDefaultVideoExportSettings();
    source.composition = createReplayComposition('reel');
    const serialized = JSON.parse(JSON.stringify(source)) as typeof source;
    const hydrated = mergeVideoExportSettings(serialized);
    expect(hydrated.composition.layouts['9:16'].blocks.map((block) => block.kind))
      .toEqual(['video', 'stats', 'map', 'elevation', 'branding']);
    expect(isClassicReplayLayout(hydrated.composition.layouts['9:16'])).toBe(false);
  });

  it('repairs missing aspect layouts instead of leaving an unusable editor', () => {
    const hydrated = mergeVideoExportSettings({
      composition: {
        version: 1,
        layouts: {
          '16:9': createReplayComposition('reel').layouts['16:9'],
        },
      } as never,
    });
    expect(hydrated.composition.layouts['1:1'].blocks.length).toBeGreaterThan(0);
    expect(hydrated.composition.layouts['9:16'].blocks.length).toBeGreaterThan(0);
  });
});
