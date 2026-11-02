import type { ReplayCameraPose } from './replayCameraPlan';

/** Session-local opening pose shared by the live map and video tile warm-up. */
export const locationChapterIntroCameraRef: { current: ReplayCameraPose | undefined } = { current: undefined };
