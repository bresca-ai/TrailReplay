import { describe, expect, it } from 'vitest';
import { translate } from '@/i18n/translations';
import { searchIconsByTopic } from './iconTopics';
import type { PinheadIcon } from './pinheadIcons';

const icons: PinheadIcon[] = ['burger', 'drink bottle', 'mountain', 'fish'].map((label) => ({ id: label, label, terms: label, path: 'M0 0' }));
const search = (query: string, lang: 'en' | 'ca' = 'en', limit = 10) =>
  searchIconsByTopic(icons, query, limit, null, (key) => translate(lang, key));

describe('topic search', () => {
  it('includes all icons in the English topic without duplicating name matches', () => {
    expect(search('food').results.map((icon) => icon.id)).toEqual(['burger', 'drink bottle']);
  });
  it('matches translated topic labels and still accepts English', () => {
    expect(search('menjar', 'ca').results.map((icon) => icon.id)).toEqual(['burger', 'drink bottle']);
    expect(search('food', 'ca').total).toBe(2);
  });
  it('preserves individual searches and reports the full topic count when capped', () => {
    expect(search('mountain').results.map((icon) => icon.id)).toEqual(['mountain']);
    expect(search('food', 'en', 1)).toMatchObject({ total: 2, results: [{ id: 'burger' }] });
  });
});
