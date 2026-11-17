import type { AppState } from '@/store/storeTypes';
import { createDefaultStory } from '@/utils/story/storyDocument';
import { applyStoryEdit } from '@/utils/story/storyEdits';
import type { AppSliceCreator } from './types';

export const createStorySlice: AppSliceCreator<Pick<AppState, 'story' | 'updateStory'>> = (set, get) => ({
  story: createDefaultStory(),

  updateStory: (edit) => {
    const next = applyStoryEdit(get().story, edit);
    if (next !== get().story) set({ story: next });
  },
});
