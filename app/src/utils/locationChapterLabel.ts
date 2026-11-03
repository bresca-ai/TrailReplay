/** Split the optional Unicode country flag from the name without splitting graphemes. */
export function splitLocationChapterLabel(label: string): { flag: string; name: string } {
  const characters = Array.from(label.trim());
  const isRegionalIndicator = (character: string | undefined) => {
    const code = character?.codePointAt(0) ?? 0;
    return code >= 0x1f1e6 && code <= 0x1f1ff;
  };
  if (isRegionalIndicator(characters[0]) && isRegionalIndicator(characters[1])) {
    return { flag: characters.slice(0, 2).join(''), name: characters.slice(2).join('').trim() };
  }
  return { flag: '', name: label.trim() };
}
