import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const changelog = readFileSync(resolve(process.cwd(), '../CHANGELOG.md'), 'utf8');
import { LANGUAGE_CODES } from '@/i18n/languages';
import { parseReleaseNotes } from './releaseNotes';
import { translateNote } from './releaseCopy';

describe('release translations', () => {
  it('covers every release note in each supported language', () => {
    const texts = parseReleaseNotes(changelog).flatMap((release) => [
      ...release.introduction,
      ...release.sections.flatMap((section) => [section.title, ...section.items]),
    ]);
    for (const language of LANGUAGE_CODES.filter((code) => code !== 'en')) {
      const missing = texts.filter((text) => translateNote(language, text) === text && !['Version', 'Reporting'].includes(text));
      expect(missing, `Missing ${language} translations: ${missing.join(', ')}`).toEqual([]);
    }
  });
});
