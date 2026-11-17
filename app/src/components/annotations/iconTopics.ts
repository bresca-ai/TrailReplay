import { translate } from '@/i18n/translations';
import { normalizeSearchText, searchPinheadIcons, type PinheadIcon, type PinheadTerms, type PinheadLabelLookup } from './pinheadIcons';

// The published Pinhead index has no categories; infer broad topics from names.
export const ICON_TOPICS = [
  ['nature', /mountain|hill|tree|forest|water|river|lake|rock|flower|plant|weather|sun|snow|trail|camp|tent/],
  ['food', /food|drink|bottle|cup|burger|bread|fruit|apple|coffee|beer|wine|sandwich|restaurant|fork|spoon/],
  ['transport', /car|bike|bicycle|train|bus|boat|plane|aircraft|vehicle|road|parking/],
  ['places', /house|building|church|shop|hospital|school|tower|bridge|shelter|hut|town/],
  ['people', /person|people|human|hand|face|body|head|foot/],
  ['animals', /animal|bird|fish|dog|cat|horse|bear|insect|snake/],
  ['symbols', /arrow|letter|number|numeral|circle|square|triangle|cross|sign|flag/],
] as const;

export function iconTopic(icon: PinheadIcon) {
  return ICON_TOPICS.find(([, pattern]) => pattern.test(icon.label))?.[0] ?? 'other';
}

const topicSearchText = (text: string) => normalizeSearchText(text).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Combine name matches with every icon in a matching translated or English topic. */
export function searchIconsByTopic(
  icons: PinheadIcon[], query: string, limit: number, terms: PinheadTerms | null,
  t: (key: string) => string, language = 'en', lookup?: PinheadLabelLookup,
) {
  const normalized = topicSearchText(query);
  const nameMatches = searchPinheadIcons(icons, query, icons.length, terms, language, lookup).results;
  if (!normalized) return { results: [], total: 0 };
  const topicKeys = [...ICON_TOPICS.map(([key]) => key), 'other'];
  const matchingTopics = new Set(topicKeys.filter((key) => {
    const path = `annotations.iconTopic.${key}`;
    return [t(path), translate('en', path)].some((label) => topicSearchText(label).includes(normalized));
  }));
  const seen = new Set(nameMatches.map((icon) => icon.id));
  const matches = [...nameMatches, ...icons.filter((icon) => matchingTopics.has(iconTopic(icon)) && !seen.has(icon.id))];
  return { results: matches.slice(0, limit), total: matches.length };
}
