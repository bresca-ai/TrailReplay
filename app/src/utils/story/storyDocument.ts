// Store-free (ESLint no-restricted-imports), so a phase-2 viewer imports it unchanged.

// Each enum lives once: normalizeStory, the Story tab's segmented controls and an i18n test map over these.
export const STORY_VIEWS = ['2d', '3d'] as const; // 3D adds terrain and a fixed 55 degree tilt, north-up
export const STORY_ZOOMS = ['near', 'medium', 'far'] as const; // place span across the map box: 2, 6, 18 km
export const STORY_TEXT_SIDES = ['left', 'right'] as const; // desktop column of the text
export const STORY_MOBILE_MAPS = ['top', 'bottom'] as const; // phones (< 768 px): sticky map box
export const STORY_REF_KINDS = ['annotation', 'picture', 'video'] as const;

export type StoryViewMode = (typeof STORY_VIEWS)[number];
export type StoryZoom = (typeof STORY_ZOOMS)[number];
export type StoryTextSide = (typeof STORY_TEXT_SIDES)[number];
export type StoryMobileMap = (typeof STORY_MOBILE_MAPS)[number];
export type StoryRefKind = (typeof STORY_REF_KINDS)[number];
export interface StoryLayout { view: StoryViewMode; zoom: StoryZoom; textSide: StoryTextSide; mobileMap: StoryMobileMap }

/** Ids are unique only per kind, so a reference always carries its kind. */
export interface StoryRef { kind: StoryRefKind; id: string }

/**
 * A place on the route. `routeMeters` is on the distance-profile scale, the km the Story tab shows: never
 * progress or time, so durations, timing mode and holds cannot move it. The optional segment anchor
 * (segment-local metres, as on photos) follows its track on reorder; `routeMeters` answers when the
 * segment id is gone.
 */
export interface RoutePlace { routeMeters: number; segmentId?: string; segmentMeters?: number }

/**
 * One shape for every anchor. `ref` set: the live item wins at compile time and `place` is the fallback
 * captured when the anchor was chosen, so deletes never cascade and undoing a delete restores the link.
 * `ref` null: the creator typed a kilometre and `place` is the anchor.
 */
export interface StoryAnchor { ref: StoryRef | null; place: RoutePlace }

/** References only, never a URL, File or Date: media bytes are tab-local. */
export type StoryBlock =
  | { id: string; kind: 'text'; text: string } // plain text; blank lines split paragraphs
  | { id: string; kind: 'media'; media: { kind: 'picture' | 'video'; id: string } };
export interface StorySection { id: string; anchor: StoryAnchor; heading: string; blocks: StoryBlock[] }

/** `AppState.story` and `ReplayProjectFile.story?`: one owner (the slice), one normalizer, one doc section. */
export interface StoryDocument { title: string; intro: string; layout: StoryLayout; sections: StorySection[] }

/** Shared by normalizeStory, applyStoryEdit and the inputs' `maxLength`. `intro` uses `text`. */
export const STORY_LIMITS = { title: 200, heading: 200, text: 20_000, sections: 200, blocksPerSection: 100 } as const;

/** Title and intro '', layout { view '2d', zoom 'medium', textSide 'left', mobileMap 'top' }, no sections. */
export function createDefaultStory(): StoryDocument {
  return { title: '', intro: '', layout: { view: '2d', zoom: 'medium', textSide: 'left', mobileMap: 'top' }, sections: [] };
}

/** `base` with each key of `raw` taken only when its value is in that key's enum; shared with setLayout. */
export function mergeStoryLayout(base: StoryLayout, raw: unknown): StoryLayout {
  const source = isRecord(raw) ? raw : {};
  const pick = <K extends keyof StoryLayout>(key: K, options: readonly StoryLayout[K][]) => (
    isOneOf(options, source[key]) ? source[key] : base[key]
  );
  return {
    view: pick('view', STORY_VIEWS),
    zoom: pick('zoom', STORY_ZOOMS),
    textSide: pick('textSide', STORY_TEXT_SIDES),
    mobileMap: pick('mobileMap', STORY_MOBILE_MAPS),
  };
}

/** The file and hydrate trust boundary. Never throws; idempotent; absent or not an object gives the default. */
export function normalizeStory(raw: unknown): StoryDocument {
  const story = createDefaultStory();
  if (!isRecord(raw)) return story;

  const sections = (Array.isArray(raw.sections) ? raw.sections : []).filter(isRecord).slice(0, STORY_LIMITS.sections);
  return {
    title: cappedString(raw.title, STORY_LIMITS.title),
    intro: cappedString(raw.intro, STORY_LIMITS.text),
    layout: mergeStoryLayout(story.layout, raw.layout),
    sections: withUniqueIds(sections.map((value) => ({
      id: isId(value.id) ? value.id : '',
      // A bad anchor parks the section at the start instead of dropping its text.
      anchor: normalizeAnchor(value.anchor),
      heading: cappedString(value.heading, STORY_LIMITS.heading),
      blocks: normalizeBlocks(value.blocks),
    })), 'section'),
  };
}

/** Saving would lose something (title, intro or a section): feeds `hasUnsavedProjectContent` and Save. */
export function hasStoryContent(story: StoryDocument): boolean {
  return story.title !== '' || story.intro !== '' || story.sections.length > 0;
}

function normalizeAnchor(raw: unknown): StoryAnchor {
  const anchor = isRecord(raw) ? raw : {};
  const ref = isRecord(anchor.ref) ? anchor.ref : {};
  const place = isRecord(anchor.place) ? anchor.place : {};
  const routeMeters = isMeters(place.routeMeters) ? place.routeMeters : 0;
  return {
    ref: isOneOf(STORY_REF_KINDS, ref.kind) && isId(ref.id) ? { kind: ref.kind, id: ref.id } : null,
    place: isId(place.segmentId) && isMeters(place.segmentMeters)
      ? { routeMeters, segmentId: place.segmentId, segmentMeters: place.segmentMeters }
      : { routeMeters },
  };
}

function normalizeBlocks(raw: unknown): StoryBlock[] {
  const blocks = (Array.isArray(raw) ? raw : []).flatMap((value): StoryBlock[] => {
    if (!isRecord(value)) return [];
    const id = isId(value.id) ? value.id : '';
    if (value.kind === 'text') return [{ id, kind: 'text', text: cappedString(value.text, STORY_LIMITS.text) }];
    const media = isRecord(value.media) ? value.media : {};
    return value.kind === 'media' && isOneOf(['picture', 'video'] as const, media.kind) && isId(media.id)
      ? [{ id, kind: 'media', media: { kind: media.kind, id: media.id } }]
      : [];
  });
  return withUniqueIds(blocks.slice(0, STORY_LIMITS.blocksPerSection), 'block');
}

/** An empty id becomes `${prefix}-${index + 1}` and a repeat gets `-2`, `-3`...: deterministic, so idempotent. */
function withUniqueIds<T extends { id: string }>(items: T[], prefix: string): T[] {
  const taken = new Set<string>();
  return items.map((item, index) => {
    const base = item.id || `${prefix}-${index + 1}`;
    let id = base;
    for (let suffix = 2; taken.has(id); suffix += 1) id = `${base}-${suffix}`;
    taken.add(id);
    return { ...item, id };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOneOf<T>(options: readonly T[], value: unknown): value is T {
  return (options as readonly unknown[]).includes(value);
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function isMeters(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function cappedString(value: unknown, cap: number): string {
  return typeof value === 'string' ? value.slice(0, cap) : '';
}
