import type { ReplayCameraPose } from './replayCameraPlan';
import type { LocationChapterSettings } from '@/types';

export const DEFAULT_INTRO_DURATION = 2500;
export function getIntroDuration(settings?: LocationChapterSettings): number {
  if (!settings || settings.level === 'off') return DEFAULT_INTRO_DURATION;
  const seconds = settings.introDurationSeconds ?? (settings.level === 'region' && settings.introCountryFirst ? 10 : 7);
  return Math.max(5, Math.min(20, seconds)) * 1000;
}

export const locationChapterIntroProgressRef = { current: 0 };

/** Hold the opening view long enough to read, then pause again for the region. */
export function locationIntroEasing(time: number, countryFirst: boolean): number {
  const smooth = (value: number) => { const x = Math.max(0, Math.min(1, value)); return x * x * (3 - 2 * x); };
  if (!countryFirst) return smooth((time - 0.45) / 0.55);
  if (time < 0.37) return 0;
  if (time < 0.58) return 0.5 * smooth((time - 0.37) / 0.21);
  if (time < 0.75) return 0.5;
  return 0.5 + 0.5 * smooth((time - 0.75) / 0.25);
}

/** Session-local opening pose shared by the live map and video tile warm-up. */
export const locationChapterIntroCameraRef: { current: ReplayCameraPose | undefined } = { current: undefined };
