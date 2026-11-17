import { describe, expect, it } from 'vitest';
import { createDefaultStory } from '@/utils/story/storyDocument';
import { hasUnsavedProjectContent } from './hasUnsavedWork';

const empty = { tracks: [], pictures: [], journey: null, story: createDefaultStory() };

describe('hasUnsavedProjectContent', () => {
  it('is false when there are no tracks, pictures, journey, or story', () => {
    expect(hasUnsavedProjectContent(empty)).toBe(false);
  });

  it('is true when there is at least one track', () => {
    expect(hasUnsavedProjectContent({ ...empty, tracks: [{ id: 't1' } as never] })).toBe(true);
  });

  it('is true when there is at least one picture', () => {
    expect(hasUnsavedProjectContent({ ...empty, pictures: [{ id: 'p1' } as never] })).toBe(true);
  });

  it('is true when a journey exists even with no tracks or pictures', () => {
    expect(hasUnsavedProjectContent({
      ...empty,
      journey: { id: 'j1', name: 'x', segments: [], totalDuration: 0, totalDistance: 0 },
    })).toBe(true);
  });

  it('is true when the story has a title, an intro or a section, and false for its layout alone', () => {
    const story = createDefaultStory();
    expect(hasUnsavedProjectContent({ ...empty, story: { ...story, layout: { ...story.layout, view: '3d' } } })).toBe(false);
    expect(hasUnsavedProjectContent({ ...empty, story: { ...story, title: 'Three days on the GR11' } })).toBe(true);
    expect(hasUnsavedProjectContent({ ...empty, story: { ...story, intro: 'We set off at dawn.' } })).toBe(true);
    expect(hasUnsavedProjectContent({
      ...empty,
      story: { ...story, sections: [{ id: 's1', anchor: { ref: null, place: { routeMeters: 0 } }, heading: '', blocks: [] }] },
    })).toBe(true);
  });
});
