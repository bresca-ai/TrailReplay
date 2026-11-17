import { describe, expect, it } from 'vitest';
import { STORY_LIMITS, createDefaultStory, hasStoryContent, normalizeStory } from './storyDocument';

const section = (overrides: Record<string, unknown> = {}) => ({
  id: 's1',
  anchor: { ref: null, place: { routeMeters: 1200 } },
  heading: 'Col de la Croix',
  blocks: [{ id: 'b1', kind: 'text', text: 'Long climb.' }],
  ...overrides,
});

describe('normalizeStory', () => {
  it('gives the default story for an absent or non-object value', () => {
    for (const raw of [undefined, null, 42, 'story', true, [], [section()]]) {
      expect(normalizeStory(raw)).toEqual(createDefaultStory());
    }
    expect(createDefaultStory()).toEqual({
      title: '',
      intro: '',
      layout: { view: '2d', zoom: 'medium', textSide: 'left', mobileMap: 'top' },
      sections: [],
    });
  });

  it('merges a partial layout key by key and ignores values outside each enum', () => {
    expect(normalizeStory({ layout: { zoom: 'far', view: '4d', textSide: 'right', mobileMap: 7, extra: 'x' } }).layout)
      .toEqual({ view: '2d', zoom: 'far', textSide: 'right', mobileMap: 'top' });
    expect(normalizeStory({ layout: 'wide' }).layout).toEqual(createDefaultStory().layout);
  });

  it('caps every string and drops sections and blocks over their caps', () => {
    const story = normalizeStory({
      title: 't'.repeat(STORY_LIMITS.title + 5),
      intro: 'i'.repeat(STORY_LIMITS.text + 5),
      sections: [
        section({
          heading: 'h'.repeat(STORY_LIMITS.heading + 5),
          blocks: Array.from({ length: STORY_LIMITS.blocksPerSection + 3 }, (_, index) => (
            { id: `b${index}`, kind: 'text', text: 'x'.repeat(STORY_LIMITS.text + 5) }
          )),
        }),
        ...Array.from({ length: STORY_LIMITS.sections + 4 }, (_, index) => section({ id: `extra-${index}` })),
      ],
    });

    expect(story.title).toHaveLength(STORY_LIMITS.title);
    expect(story.intro).toHaveLength(STORY_LIMITS.text);
    expect(story.sections).toHaveLength(STORY_LIMITS.sections);
    expect(story.sections.at(-1)?.id).toBe(`extra-${STORY_LIMITS.sections - 2}`);
    expect(story.sections[0].heading).toHaveLength(STORY_LIMITS.heading);
    expect(story.sections[0].blocks).toHaveLength(STORY_LIMITS.blocksPerSection);
    expect(story.sections[0].blocks[0]).toEqual({ id: 'b0', kind: 'text', text: 'x'.repeat(STORY_LIMITS.text) });
  });

  it('makes missing and repeated ids unique, the same way every time', () => {
    const raw = { sections: [section({ id: undefined }), section({ id: 'a' }), section({ id: 'a' }), section({ id: '' }), section({ id: 'a-2' })] };
    expect(normalizeStory(raw).sections.map((s) => s.id)).toEqual(['section-1', 'a', 'a-2', 'section-4', 'a-2-2']);
    expect(normalizeStory(raw)).toEqual(normalizeStory(raw));

    const blocks = normalizeStory({ sections: [section({ blocks: [{ kind: 'text', text: 'one' }, { id: 'x', kind: 'text' }, { id: 'x', kind: 'text' }] })] })
      .sections[0].blocks;
    expect(blocks).toEqual([
      { id: 'block-1', kind: 'text', text: 'one' },
      { id: 'x', kind: 'text', text: '' },
      { id: 'x-2', kind: 'text', text: '' },
    ]);
  });

  it('parks a section with a bad anchor at the start and keeps its text', () => {
    for (const anchor of [undefined, 'km 3', { place: { routeMeters: -5 } }, { place: { routeMeters: '1200' } }, { place: null }]) {
      const [normalized] = normalizeStory({ sections: [section({ anchor })] }).sections;
      expect(normalized.anchor).toEqual({ ref: null, place: { routeMeters: 0 } });
      expect(normalized.heading).toBe('Col de la Croix');
      expect(normalized.blocks).toEqual([{ id: 'b1', kind: 'text', text: 'Long climb.' }]);
    }
  });

  it('turns a malformed reference into ref null and keeps unknown reference ids', () => {
    const refOf = (ref: unknown) => normalizeStory({ sections: [section({ anchor: { ref, place: { routeMeters: 10 } } })] })
      .sections[0].anchor.ref;

    expect(refOf({ kind: 'track', id: 'x' })).toBeNull();
    expect(refOf({ kind: 'picture', id: '' })).toBeNull();
    expect(refOf({ kind: 'picture', id: 7 })).toBeNull();
    expect(refOf('photo-1')).toBeNull();
    expect(refOf({ kind: 'annotation', id: 'never-existed', extra: true })).toEqual({ kind: 'annotation', id: 'never-existed' });
  });

  it('keeps a segment id only with valid segment metres', () => {
    const placeOf = (place: unknown) => normalizeStory({ sections: [section({ anchor: { ref: null, place } })] })
      .sections[0].anchor.place;

    expect(placeOf({ routeMeters: 5, segmentId: 'seg', segmentMeters: 3 })).toEqual({ routeMeters: 5, segmentId: 'seg', segmentMeters: 3 });
    expect(placeOf({ routeMeters: 5, segmentId: 'seg', segmentMeters: -1 })).toEqual({ routeMeters: 5 });
    expect(placeOf({ routeMeters: 5, segmentId: 'seg' })).toEqual({ routeMeters: 5 });
    expect(placeOf({ routeMeters: 5, segmentId: '', segmentMeters: 3 })).toEqual({ routeMeters: 5 });
  });

  it('drops invalid media blocks and keeps media that point at unknown ids', () => {
    const blocks = normalizeStory({
      sections: [section({
        blocks: [
          { id: 'ok', kind: 'media', media: { kind: 'video', id: 'video-gone', url: 'blob:x' } },
          { id: 'audio', kind: 'media', media: { kind: 'audio', id: 'a' } },
          { id: 'empty', kind: 'media', media: { kind: 'picture', id: '' } },
          { id: 'bare', kind: 'media' },
          { id: 'wrong-kind', kind: 'gallery', media: { kind: 'picture', id: 'p' } },
          'text',
        ],
      })],
    }).sections[0].blocks;

    expect(blocks).toEqual([{ id: 'ok', kind: 'media', media: { kind: 'video', id: 'video-gone' } }]);
  });

  it('is idempotent', () => {
    const messy = {
      title: 7,
      intro: 'Two days',
      layout: { view: '3d', zoom: 'huge' },
      sections: [
        section({ id: '' }),
        section({ id: 'a', anchor: { ref: { kind: 'picture', id: 'p1' }, place: { routeMeters: 3, segmentId: 's', segmentMeters: 1 } } }),
        section({ id: 'a', blocks: [{ kind: 'media', media: { kind: 'picture', id: 'p1' } }, { id: 'x', kind: 'text', text: 9 }] }),
        null,
      ],
      unknown: { deep: true },
    };
    const once = normalizeStory(messy);
    expect(normalizeStory(once)).toEqual(once);
    expect(normalizeStory(JSON.parse(JSON.stringify(once)))).toEqual(once);
  });

  it('never throws on hostile input', () => {
    const hostile: unknown[] = [
      { sections: 'none' },
      { sections: [1, 'x', null, [], { anchor: [], blocks: 'b', heading: {} }] },
      { sections: [{ anchor: { ref: [], place: [] }, blocks: [null, [], { kind: 'media', media: [] }] }] },
      { layout: [], title: [], intro: null },
      Object.create(null),
      JSON.parse('{"__proto__": {"title": "x"}, "sections": [{"__proto__": null}]}'),
    ];
    for (const raw of hostile) expect(() => normalizeStory(raw)).not.toThrow();
  });
});

describe('hasStoryContent', () => {
  it('is true once a title, an intro or a section exists', () => {
    expect(hasStoryContent(createDefaultStory())).toBe(false);
    expect(hasStoryContent({ ...createDefaultStory(), layout: { view: '3d', zoom: 'far', textSide: 'right', mobileMap: 'bottom' } })).toBe(false);
    expect(hasStoryContent({ ...createDefaultStory(), title: 'Two days' })).toBe(true);
    expect(hasStoryContent({ ...createDefaultStory(), intro: 'We set off' })).toBe(true);
    expect(hasStoryContent(normalizeStory({ sections: [section()] }))).toBe(true);
  });
});
