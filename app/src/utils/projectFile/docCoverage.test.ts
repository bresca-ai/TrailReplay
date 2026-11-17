import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normalizeStory, type StoryDocument } from '@/utils/story/storyDocument';

/**
 * app/public/replay-file.md is served at trailreplay.com/replay-file.md and is
 * the only thing an agent authoring a project has to go on. A field added to
 * the format but not to that page is a field nobody outside this repo can use,
 * so the page has to keep up with the type.
 *
 * Fields deliberately not offered to authors are listed below with the reason.
 */
const NOT_FOR_AUTHORS = new Set([
  // Real media files a .replay cannot carry; reopened as placeholders.
  'pictures',
  'videos',
  // A camera mode not yet reachable from the UI.
  'cinematicCameraKeyframes',
]);

function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

/** Field names declared on ReplayProjectFile, from the type's own source. */
function replayProjectFileFields(): string[] {
  const source = read('./types.ts');
  const body = source.slice(source.indexOf('export interface ReplayProjectFile {'));
  return [...body.slice(0, body.indexOf('\n}')).matchAll(/^ {2}(\w+)\??:/gm)]
    .map((match) => match[1]);
}

describe('replay-file.md', () => {
  const doc = read('../../../public/replay-file.md');
  const fields = replayProjectFileFields();

  it('reads the fields off the type', () => {
    expect(fields).toContain('tracks');
    expect(fields).toContain('userLandmarks');
    expect(fields.length).toBeGreaterThan(15);
  });

  it.each(fields.filter((field) => !NOT_FOR_AUTHORS.has(field)))(
    'documents %s',
    (field) => {
      expect(doc).toContain(`\`${field}\``);
    },
  );

  it('explains the fields it deliberately withholds', () => {
    for (const field of NOT_FOR_AUTHORS) {
      expect(doc).toContain(`\`${field}\``);
    }
    expect(doc).toContain('Fields to leave alone');
  });

  // normalizeStory drops unknown keys and repairs bad values, so an example that
  // comes back unchanged uses only real field names with values the app keeps.
  it('gives a story example the app reads back unchanged', () => {
    const section = doc.slice(doc.search(/^### [\d.]+ `story`$/m));
    const example = /```json\n([\s\S]*?)\n```/.exec(section)?.[1];
    expect(example, 'a json block under the story heading').toBeDefined();
    const story = JSON.parse(example!) as StoryDocument;

    expect(normalizeStory(story)).toStrictEqual(story);
    expect(story.title).not.toBe('');
    expect(story.intro).not.toBe('');
    expect(story.sections.map((entry) => entry.anchor.ref?.kind ?? null)).toEqual([null, 'annotation']);
    expect(new Set(story.sections.flatMap((entry) => entry.blocks.map((block) => block.kind)))).toEqual(new Set(['text', 'media']));
  });
});
