import { describe, expect, it } from 'vitest';
import { getIntroDuration, getIntroLevels, introStage, locationIntroEasing } from './locationChapterCamera';
import { createDefaultSettings } from '@/store/defaults';

describe('location introduction timing', () => {
  const settings = createDefaultSettings().locationChapters;

  it('preserves the normal intro and gives location chapters a readable opening', () => {
    expect(getIntroDuration(settings)).toBe(2500);
    expect(getIntroDuration({ ...settings, level: 'country' })).toBe(7000);
    expect(getIntroDuration({ ...settings, level: 'region', introCountryFirst: true })).toBe(10000);
    expect(getIntroDuration({ ...settings, level: 'country', introDurationSeconds: 12 })).toBe(12000);
  });

  it('holds the country and region views before moving into the route', () => {
    expect(locationIntroEasing(.3, true)).toBe(0);
    expect(locationIntroEasing(.65, true)).toBe(.5);
    expect(locationIntroEasing(1, true)).toBe(1);
    expect(locationIntroEasing(.4, false)).toBe(0);
  });

  it('keeps legacy settings and orders an explicit selection from broad to local', () => {
    expect(getIntroLevels({ ...settings, level: 'region', introCountryFirst: true })).toEqual(['country', 'region']);
    expect(getIntroLevels({ ...settings, level: 'adm3', introLevels: ['adm3', 'country', 'adm2'] })).toEqual(['country', 'adm2', 'adm3']);
    expect(getIntroLevels({ ...settings, level: 'adm3', introLevels: [] })).toEqual([]);
    expect(getIntroDuration({ ...settings, level: 'adm3', introLevels: [] })).toBe(2500);
    expect(introStage(.1, 3).index).toBe(0);
    expect(introStage(.4, 3).index).toBe(1);
    expect(introStage(.7, 3).index).toBe(2);
  });
});
