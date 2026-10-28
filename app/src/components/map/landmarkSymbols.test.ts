import { expect, it } from 'vitest';
import { landmarkIconFromSymbol, landmarkSymbol } from './landmarkSymbols';
it('preserves old glyphs, library icons, emoji, and fallback for invalid legacy icons', () => {
  expect(landmarkSymbol({ type: 'summit', icon: 'camp' })).toBe('map:camp');
  expect(landmarkSymbol({ type: 'summit', icon: 'invalid' })).toBe('map:summit');
  expect(landmarkSymbol({ type: 'summit', icon: 'pinhead:bicycle' })).toBe('pinhead:bicycle');
  expect(landmarkSymbol({ type: 'summit', icon: 'emoji:🏕️' })).toBe('🏕️');
  expect(landmarkIconFromSymbol('map:camp')).toBe('camp');
  expect(landmarkIconFromSymbol('pinhead:bicycle')).toBe('pinhead:bicycle');
  expect(landmarkIconFromSymbol('🏕️')).toBe('emoji:🏕️');
});
