import {
  STORY_LIMITS,
  mergeStoryLayout,
  type StoryAnchor,
  type StoryBlock,
  type StoryDocument,
  type StoryLayout,
  type StorySection,
} from './storyDocument';

/** What the panel does, and nothing else. */
export type StoryEdit =
  | { type: 'setCover'; title?: string; intro?: string }
  | { type: 'setLayout'; layout: Partial<StoryLayout> }
  | { type: 'addSection'; id: string; anchor: StoryAnchor; prefill?: { heading: string; text: string } }
  | { type: 'setSection'; id: string; heading?: string; anchor?: StoryAnchor }
  | { type: 'moveSection'; id: string; to: number }
  | { type: 'removeSection'; id: string }
  | { type: 'addBlock'; sectionId: string; block: StoryBlock }
  | { type: 'setText'; sectionId: string; blockId: string; text: string }
  | { type: 'moveBlock'; sectionId: string; blockId: string; to: number }
  | { type: 'removeBlock'; sectionId: string; blockId: string };

/**
 * Pure. A no-op returns the same object, so nothing is written and undo records nothing. Idempotent: a
 * repeated add id is a no-op. Unknown ids are no-ops; caps match normalizeStory.
 */
export function applyStoryEdit(story: StoryDocument, edit: StoryEdit): StoryDocument {
  switch (edit.type) {
    case 'setCover': {
      const title = edit.title === undefined ? story.title : edit.title.slice(0, STORY_LIMITS.title);
      const intro = edit.intro === undefined ? story.intro : edit.intro.slice(0, STORY_LIMITS.text);
      return title === story.title && intro === story.intro ? story : { ...story, title, intro };
    }
    case 'setLayout': {
      const layout = mergeStoryLayout(story.layout, edit.layout);
      const unchanged = (Object.keys(layout) as (keyof StoryLayout)[]).every((key) => layout[key] === story.layout[key]);
      return unchanged ? story : { ...story, layout };
    }
    case 'addSection': {
      if (story.sections.length >= STORY_LIMITS.sections || story.sections.some((s) => s.id === edit.id)) return story;
      const text = edit.prefill?.text.slice(0, STORY_LIMITS.text) ?? '';
      const section: StorySection = {
        id: edit.id,
        anchor: edit.anchor,
        heading: edit.prefill?.heading.slice(0, STORY_LIMITS.heading) ?? '',
        blocks: text === '' ? [] : [{ id: `${edit.id}:text`, kind: 'text', text }],
      };
      return { ...story, sections: inRouteOrder(story.sections, section) };
    }
    case 'setSection': {
      const section = story.sections.find((s) => s.id === edit.id);
      if (!section) return story;
      const heading = edit.heading === undefined ? section.heading : edit.heading.slice(0, STORY_LIMITS.heading);
      const anchor = edit.anchor === undefined || sameAnchor(edit.anchor, section.anchor) ? section.anchor : edit.anchor;
      if (heading === section.heading && anchor === section.anchor) return story;
      const next = { ...section, heading, anchor };
      // A new place moves the section to its route-order slot, as adding it there would.
      return anchor === section.anchor
        ? updateSection(story, edit.id, () => next)
        : { ...story, sections: inRouteOrder(story.sections.filter((s) => s !== section), next) };
    }
    case 'moveSection':
      return withSections(story, moveItem(story.sections, edit.id, edit.to));
    case 'removeSection':
      return withSections(story, story.sections.filter((s) => s.id !== edit.id));
    case 'addBlock':
      return updateSection(story, edit.sectionId, (section) => (
        section.blocks.length >= STORY_LIMITS.blocksPerSection || section.blocks.some((b) => b.id === edit.block.id)
          ? section
          : { ...section, blocks: [...section.blocks, capBlock(edit.block)] }
      ));
    case 'setText':
      return updateSection(story, edit.sectionId, (section) => {
        const text = edit.text.slice(0, STORY_LIMITS.text);
        return withBlocks(section, section.blocks.map((b) => (
          b.id === edit.blockId && b.kind === 'text' && b.text !== text ? { ...b, text } : b
        )));
      });
    case 'moveBlock':
      return updateSection(story, edit.sectionId, (section) => withBlocks(section, moveItem(section.blocks, edit.blockId, edit.to)));
    case 'removeBlock':
      return updateSection(story, edit.sectionId, (section) => withBlocks(section, section.blocks.filter((b) => b.id !== edit.blockId)));
  }
}

/** `sections` with `section` before the first one placed further along the route. */
function inRouteOrder(sections: StorySection[], section: StorySection): StorySection[] {
  const slot = sections.findIndex((s) => s.anchor.place.routeMeters > section.anchor.place.routeMeters);
  const next = [...sections];
  next.splice(slot === -1 ? next.length : slot, 0, section);
  return next;
}

function updateSection(story: StoryDocument, id: string, update: (section: StorySection) => StorySection): StoryDocument {
  return withSections(story, story.sections.map((section) => (section.id === id ? update(section) : section)));
}

/** `story` itself when no section changed identity or position. */
function withSections(story: StoryDocument, sections: StorySection[]): StoryDocument {
  return sameItems(sections, story.sections) ? story : { ...story, sections };
}

function withBlocks(section: StorySection, blocks: StoryBlock[]): StorySection {
  return sameItems(blocks, section.blocks) ? section : { ...section, blocks };
}

function sameItems<T>(next: T[], previous: T[]): boolean {
  return next.length === previous.length && next.every((item, index) => item === previous[index]);
}

/** The item with `id` moved to `to`, clamped to the list; unknown id: the list unchanged. */
function moveItem<T extends { id: string }>(items: T[], id: string, to: number): T[] {
  const from = items.findIndex((item) => item.id === id);
  if (from === -1) return items;
  const next = items.filter((_, index) => index !== from);
  next.splice(Math.max(0, Math.min(items.length - 1, to)), 0, items[from]);
  return next;
}

function capBlock(block: StoryBlock): StoryBlock {
  return block.kind === 'text' ? { ...block, text: block.text.slice(0, STORY_LIMITS.text) } : block;
}

function sameAnchor(a: StoryAnchor, b: StoryAnchor): boolean {
  return a.ref?.kind === b.ref?.kind && a.ref?.id === b.ref?.id
    && a.place.routeMeters === b.place.routeMeters
    && a.place.segmentId === b.place.segmentId
    && a.place.segmentMeters === b.place.segmentMeters;
}
