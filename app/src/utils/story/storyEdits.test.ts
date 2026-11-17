import { describe, expect, it } from 'vitest';
import { STORY_LIMITS, createDefaultStory, type StoryAnchor, type StoryDocument } from './storyDocument';
import { applyStoryEdit, type StoryEdit } from './storyEdits';

const at = (routeMeters: number): StoryAnchor => ({ ref: null, place: { routeMeters } });

function storyWith(...sections: Array<[id: string, routeMeters: number]>): StoryDocument {
  return sections.reduce(
    (story, [id, routeMeters]) => applyStoryEdit(story, { type: 'addSection', id, anchor: at(routeMeters) }),
    createDefaultStory(),
  );
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

const ids = (story: StoryDocument) => story.sections.map((s) => s.id);

describe('applyStoryEdit', () => {
  const base = applyStoryEdit(
    applyStoryEdit(storyWith(['a', 100], ['b', 500]), { type: 'addBlock', sectionId: 'a', block: { id: 't1', kind: 'text', text: 'one' } }),
    { type: 'addBlock', sectionId: 'a', block: { id: 'm1', kind: 'media', media: { kind: 'picture', id: 'photo-1' } } },
  );

  it('never mutates its input', () => {
    const frozen = deepFreeze(structuredClone(base));
    const edits: StoryEdit[] = [
      { type: 'setCover', title: 'Two days', intro: 'We set off' },
      { type: 'setLayout', layout: { view: '3d' } },
      { type: 'addSection', id: 'c', anchor: at(300), prefill: { heading: 'Col', text: 'Steep' } },
      { type: 'setSection', id: 'a', heading: 'Start', anchor: at(50) },
      { type: 'moveSection', id: 'b', to: 0 },
      { type: 'removeSection', id: 'a' },
      { type: 'addBlock', sectionId: 'b', block: { id: 't2', kind: 'text', text: 'two' } },
      { type: 'setText', sectionId: 'a', blockId: 't1', text: 'edited' },
      { type: 'moveBlock', sectionId: 'a', blockId: 'm1', to: 0 },
      { type: 'removeBlock', sectionId: 'a', blockId: 't1' },
    ];
    for (const edit of edits) {
      const next = applyStoryEdit(frozen, edit);
      expect(next).not.toBe(frozen);
      expect(frozen).toEqual(base);
    }
  });

  it('returns the very same story for a no-op', () => {
    const noOps: StoryEdit[] = [
      { type: 'setCover' },
      { type: 'setCover', title: '', intro: '' },
      { type: 'setLayout', layout: { view: '2d', zoom: 'medium' } },
      { type: 'setSection', id: 'a', heading: base.sections[0].heading, anchor: at(100) },
      { type: 'setSection', id: 'missing', heading: 'x' },
      { type: 'moveSection', id: 'a', to: 0 },
      { type: 'moveSection', id: 'missing', to: 1 },
      { type: 'removeSection', id: 'missing' },
      { type: 'addBlock', sectionId: 'missing', block: { id: 'x', kind: 'text', text: '' } },
      { type: 'setText', sectionId: 'a', blockId: 't1', text: 'one' },
      { type: 'setText', sectionId: 'a', blockId: 'm1', text: 'not a text block' },
      { type: 'moveBlock', sectionId: 'a', blockId: 'm1', to: 1 },
      { type: 'removeBlock', sectionId: 'a', blockId: 'missing' },
    ];
    for (const edit of noOps) expect(applyStoryEdit(base, edit)).toBe(base);
  });

  it('treats a repeated add id as a no-op', () => {
    expect(applyStoryEdit(base, { type: 'addSection', id: 'a', anchor: at(900) })).toBe(base);
    expect(applyStoryEdit(base, { type: 'addBlock', sectionId: 'a', block: { id: 't1', kind: 'text', text: 'again' } })).toBe(base);
  });

  it('inserts a new section at its place in route order', () => {
    expect(ids(applyStoryEdit(base, { type: 'addSection', id: 'c', anchor: at(300) }))).toEqual(['a', 'c', 'b']);
    expect(ids(applyStoryEdit(base, { type: 'addSection', id: 'c', anchor: at(0) }))).toEqual(['c', 'a', 'b']);
    expect(ids(applyStoryEdit(base, { type: 'addSection', id: 'c', anchor: at(500) }))).toEqual(['a', 'b', 'c']);
  });

  it('moves a section whose place changes to its route-order slot, exactly as adding it there would', () => {
    const three = storyWith(['a', 2_000], ['b', 6_000], ['c', 12_000]);
    const moved = applyStoryEdit(three, { type: 'setSection', id: 'a', anchor: at(15_000) });
    expect(ids(moved)).toEqual(['b', 'c', 'a']);
    expect(moved.sections[2]).toEqual({ ...three.sections[0], anchor: at(15_000) });
    expect(ids(applyStoryEdit(storyWith(['b', 6_000], ['c', 12_000]), { type: 'addSection', id: 'a', anchor: at(15_000) }))).toEqual(ids(moved));

    expect(ids(applyStoryEdit(three, { type: 'setSection', id: 'c', anchor: at(0) }))).toEqual(['c', 'a', 'b']);
    expect(ids(applyStoryEdit(three, { type: 'setSection', id: 'a', anchor: at(6_000) }))).toEqual(['b', 'a', 'c']);
    const unordered = applyStoryEdit(three, { type: 'moveSection', id: 'c', to: 0 });
    expect(ids(applyStoryEdit(unordered, { type: 'setSection', id: 'c', heading: 'Col' }))).toEqual(['c', 'a', 'b']);
  });

  it('fills the heading and one text block from a prefill', () => {
    const story = applyStoryEdit(createDefaultStory(), {
      type: 'addSection', id: 'n', anchor: at(10), prefill: { heading: 'Aid station', text: 'Soup and oranges.' },
    });
    expect(story.sections[0]).toEqual({
      id: 'n', anchor: at(10), heading: 'Aid station', blocks: [{ id: 'n:text', kind: 'text', text: 'Soup and oranges.' }],
    });

    const headingOnly = applyStoryEdit(createDefaultStory(), {
      type: 'addSection', id: 'n', anchor: at(10), prefill: { heading: 'Aid station', text: '' },
    });
    expect(headingOnly.sections[0].blocks).toEqual([]);
  });

  it('ignores layout values outside the enums', () => {
    const story = applyStoryEdit(base, { type: 'setLayout', layout: { view: '4d', zoom: 'far' } as never });
    expect(story.layout).toEqual({ view: '2d', zoom: 'far', textSide: 'left', mobileMap: 'top' });
    expect(applyStoryEdit(base, { type: 'setLayout', layout: { textSide: 'middle' } as never })).toBe(base);
  });

  it('clamps moves to the list', () => {
    expect(ids(applyStoryEdit(base, { type: 'moveSection', id: 'a', to: 99 }))).toEqual(['b', 'a']);
    expect(ids(applyStoryEdit(base, { type: 'moveSection', id: 'b', to: -3 }))).toEqual(['b', 'a']);
    const moved = applyStoryEdit(base, { type: 'moveBlock', sectionId: 'a', blockId: 'm1', to: -1 });
    expect(moved.sections[0].blocks.map((b) => b.id)).toEqual(['m1', 't1']);
  });

  it('holds the caps', () => {
    const long = 'x'.repeat(STORY_LIMITS.text + 1);
    const edited = applyStoryEdit(
      applyStoryEdit(base, { type: 'setCover', title: 't'.repeat(STORY_LIMITS.title + 1), intro: long }),
      { type: 'setText', sectionId: 'a', blockId: 't1', text: long },
    );
    expect(edited.title).toHaveLength(STORY_LIMITS.title);
    expect(edited.intro).toHaveLength(STORY_LIMITS.text);
    expect(edited.sections[0].blocks[0]).toEqual({ id: 't1', kind: 'text', text: 'x'.repeat(STORY_LIMITS.text) });

    const prefilled = applyStoryEdit(createDefaultStory(), {
      type: 'addSection', id: 'n', anchor: at(0), prefill: { heading: 'h'.repeat(STORY_LIMITS.heading + 1), text: long },
    });
    expect(prefilled.sections[0].heading).toHaveLength(STORY_LIMITS.heading);
    expect(prefilled.sections[0].blocks[0]).toMatchObject({ text: 'x'.repeat(STORY_LIMITS.text) });

    const full = storyWith(...Array.from({ length: STORY_LIMITS.sections }, (_, index): [string, number] => [`s${index}`, index]));
    expect(full.sections).toHaveLength(STORY_LIMITS.sections);
    expect(applyStoryEdit(full, { type: 'addSection', id: 'one-more', anchor: at(0) })).toBe(full);

    const fullSection = Array.from({ length: STORY_LIMITS.blocksPerSection }, (_, index) => index).reduce(
      (story, index) => applyStoryEdit(story, { type: 'addBlock', sectionId: 'b', block: { id: `t${index}`, kind: 'text', text: '' } }),
      base,
    );
    expect(fullSection.sections[1].blocks).toHaveLength(STORY_LIMITS.blocksPerSection);
    expect(applyStoryEdit(fullSection, { type: 'addBlock', sectionId: 'b', block: { id: 'over', kind: 'text', text: '' } })).toBe(fullSection);
  });
});
