import type { ReplayCameraPose } from './replayCameraPlan';
import type { LocationChapterSettings } from '@/types';
import { LOCATION_LEVELS, type LocationLevel } from './locationBoundaries';

export interface LocationChapterCameraCue {
  target: ReplayCameraPose;
  startTime: number;
  duration: number;
}

/** Blend against the unmodified playback pose, never against last frame's blend. */
export function applyLocationChapterCamera<T extends ReplayCameraPose>(pose: T, cue: LocationChapterCameraCue | null, time: number): T {
  if (!cue || time <= cue.startTime || time >= cue.startTime + cue.duration) return pose;
  const age = time - cue.startTime;
  const smooth = (value: number) => { const x = Math.max(0, Math.min(1, value)); return x * x * (3 - 2 * x); };
  const weight = Math.min(smooth(age / (cue.duration * .3)), smooth((cue.duration - age) / (cue.duration * .3)));
  const deltaLng = ((cue.target.center[0] - pose.center[0] + 540) % 360) - 180;
  return { ...pose, center: [pose.center[0] + deltaLng * weight, pose.center[1] + (cue.target.center[1] - pose.center[1]) * weight],
    zoom: pose.zoom + (Math.min(pose.zoom, cue.target.zoom) - pose.zoom) * weight,
    pitch: pose.pitch + (cue.target.pitch - pose.pitch) * weight };
}

export function getIntroLevels(settings?: LocationChapterSettings): LocationLevel[] {
  if (!settings || settings.level === 'off') return [];
  const selected = settings.introLevels ?? (settings.level === 'region' && settings.introCountryFirst ? ['country', 'region'] : [settings.level]);
  return LOCATION_LEVELS.filter(level => selected.includes(level));
}

export const DEFAULT_INTRO_DURATION = 2500;
export function getIntroDuration(settings?: LocationChapterSettings): number {
  if (!settings || settings.level === 'off') return DEFAULT_INTRO_DURATION;
  if (getIntroLevels(settings).length === 0) return DEFAULT_INTRO_DURATION;
  const seconds = settings.introDurationSeconds ?? Math.max(7, 7 + (getIntroLevels(settings).length - 1) * 3);
  return Math.max(5, Math.min(30, seconds)) * 1000;
}

export function introStage(progress: number, count: number): { index: number; local: number } {
  if (count < 1) return { index: 0, local: 0 };
  if (progress >= .8) return { index: count - 1, local: .8 };
  const position = Math.max(0, Math.min(.999999, progress / .8)) * count;
  return { index: Math.floor(position), local: position % 1 };
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
