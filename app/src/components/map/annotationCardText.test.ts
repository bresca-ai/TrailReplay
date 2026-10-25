import { describe, expect, it } from 'vitest';
import { cardLayoutForMapWidth, fitText, wrapText, type TextMeasurer } from './annotationCardText';

/** Width proportional to length, which is all the layout maths needs. */
function measurer(pixelsPerChar = 16): TextMeasurer {
  return { measureText: (text: string) => ({ width: text.length * pixelsPerChar }) };
}

describe('wrapText', () => {
  const m = measurer();

  it('wraps Chinese titles without inserting spaces or losing characters', () => {
    expect(wrapText(m, '合歡山主峰登山口', 80, 2)).toEqual(['合歡山主峰', '登山口']);
  });

  it('keeps Chinese closing punctuation off the start of a line and respects the line budget', () => {
    const title = '第一補給站，請靠右進入並在此補水休息';
    const lines = wrapText(m, title, 80, 2);
    expect(lines).toHaveLength(2);
    expect(lines.every((line) => !/^[，。！？、：；）】」』]/.test(line))).toBe(true);
    expect(lines.every((line) => m.measureText(line).width <= 80)).toBe(true);
    expect(title.startsWith(lines.join('').replace('…', ''))).toBe(true);
  });

  it('leaves a short title on one line', () => {
    expect(wrapText(m, 'Water stop', 284, 2)).toEqual(['Water stop']);
  });

  // 448 is the text width of a card grown to its maximum, which is what a long
  // title actually gets: the card widens before it wraps.
  it('wraps a source-length title instead of cutting it to an ellipsis', () => {
    const title = 'Avituallament 1 — Collet de Barraques';
    const lines = wrapText(m, title, 448, 2);

    expect(lines.length).toBeGreaterThan(1);
    // Every word still readable somewhere on the card.
    expect(lines.join(' ')).toBe(title);
    expect(lines.join(' ')).not.toContain('…');
  });

  it('never exceeds the line budget, however long the text', () => {
    const long = 'Km 25 · Aigua · Cola · Isotònic · Llaminadures · Fruita · Entrepans dolços · Fruits secs';
    expect(wrapText(m, long, 448, 2)).toHaveLength(2);
    expect(wrapText(m, long, 120, 2)).toHaveLength(2);
  });

  it('puts the ellipsis at the end when the budget runs out, not mid-title', () => {
    const long = 'one two three four five six seven eight nine ten eleven twelve';
    const lines = wrapText(m, long, 160, 2);

    expect(lines).toHaveLength(2);
    expect(lines[0]).not.toContain('…');
    expect(lines[1].endsWith('…')).toBe(true);
    // The visible text is still a prefix of the original.
    expect(long.startsWith(lines.join(' ').replace('…', '').trim())).toBe(true);
  });

  it('keeps a single unbreakable word rather than trimming it away', () => {
    expect(wrapText(m, 'Supercalifragilisticexpialidocious', 100, 2))
      .toEqual(['Supercalifragilisticexpialidocious']);
  });

  it('falls back to trimming when only one line is allowed', () => {
    expect(wrapText(m, 'a much longer line than fits', 100, 1)).toHaveLength(1);
    expect(wrapText(m, 'a much longer line than fits', 100, 1)[0]).toContain('…');
  });
});

describe('fitText', () => {
  it('returns text that already fits untouched', () => {
    expect(fitText(measurer(), 'short', 284)).toBe('short');
  });

  it('trims to an ellipsis when it does not', () => {
    const trimmed = fitText(measurer(), 'a very long piece of text indeed', 100);
    expect(trimmed.endsWith('…')).toBe(true);
    expect(trimmed.length).toBeLessThan('a very long piece of text indeed'.length);
  });
});

describe('cardLayoutForMapWidth', () => {
  it('shrinks the type as the map narrows', () => {
    const phone = cardLayoutForMapWidth(420);
    const tablet = cardLayoutForMapWidth(800);
    const desktop = cardLayoutForMapWidth(1440);

    expect(phone.titleSize).toBeLessThan(tablet.titleSize);
    expect(tablet.titleSize).toBeLessThan(desktop.titleSize);
    expect(phone.detailSize).toBeLessThan(desktop.detailSize);
    expect(phone.maxWidth).toBeLessThan(desktop.maxWidth);
  });

  it('keeps line height above the type size at every width', () => {
    for (const width of [320, 420, 700, 1024, 1920]) {
      const layout = cardLayoutForMapWidth(width);
      expect(layout.titleLineHeight).toBeGreaterThan(layout.titleSize);
      expect(layout.detailLineHeight).toBeGreaterThan(layout.detailSize);
    }
  });

  // The point of shrinking the type: more of the sentence survives, rather than
  // the card ending at the second item on the list.
  it('fits more of a long subtitle on a narrow map than large type would', () => {
    const subtitle = 'Km 25 · Aigua · Cola · Isotònic · Llaminadures · Fruita · Entrepans dolços';
    const phone = cardLayoutForMapWidth(420);

    const charsPerLine = (size: number, width: number) =>
      wrapText(measurer(size * 0.55), subtitle, width - phone.padding * 2, 2).join(' ').length;

    // Same card width, smaller type, more characters shown.
    expect(charsPerLine(phone.detailSize, phone.maxWidth))
      .toBeGreaterThan(charsPerLine(cardLayoutForMapWidth(1440).detailSize, phone.maxWidth));
  });
});
