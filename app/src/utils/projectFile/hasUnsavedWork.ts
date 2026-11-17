import type { AppState } from '@/store/storeTypes';
import { hasStoryContent } from '@/utils/story/storyDocument';

export function hasUnsavedProjectContent(state: Pick<AppState, 'tracks' | 'pictures' | 'journey' | 'story'>): boolean {
  return state.tracks.length > 0 || state.pictures.length > 0 || state.journey !== null || hasStoryContent(state.story);
}
