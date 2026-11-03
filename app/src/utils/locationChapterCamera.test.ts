import { describe, expect, it } from 'vitest';
import { applyLocationChapterCamera, getIntroDuration, getIntroLevels, getZoomDurationSeconds, introStage, locationIntroEasing } from './locationChapterCamera';
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

it('uses slower country camera moves and allows a custom duration', () => {
  const settings = createDefaultSettings().locationChapters;
  expect(getZoomDurationSeconds({ ...settings, level: 'country' })).toBe(10);
  expect(getZoomDurationSeconds({ ...settings, level: 'region' })).toBe(7);
  expect(getZoomDurationSeconds({ ...settings, level: 'adm3' })).toBe(5);
  expect(getZoomDurationSeconds({ ...settings, level: 'country', zoomDurationSeconds: 14 })).toBe(14);
});

it('blends a place overview into the playback pose and returns to it smoothly', () => {
  const pose = { center: [179, 41] as [number, number], zoom: 14, pitch: 50, bearing: 30 };
  const cue = { target: { center: [-179, 42] as [number, number], zoom: 6, pitch: 0, bearing: 0 }, startTime: 1000, duration: 4000 };
  expect(applyLocationChapterCamera(pose, cue, 1000)).toEqual(pose);
  const middle = applyLocationChapterCamera(pose, cue, 3000);
  expect(middle.zoom).toBe(6);
  expect(middle.center[0]).toBe(181);
  expect(middle.pitch).toBe(0);
  expect(applyLocationChapterCamera(pose, cue, 5000)).toEqual(pose);
  expect(applyLocationChapterCamera(pose, null, 3000)).toEqual(pose);
});
