import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/useAppStore';
import type { AppState } from '@/store/storeTypes';
import { compileStory, type StoryCompileInput } from '@/utils/story/compileStory';

// Flat, so shallow equality holds between renders: a nested settings object would be new on every call.
function pickStoryState(state: AppState) {
  return {
    document: state.story,
    tracks: state.tracks,
    journeySegments: state.journeySegments,
    textAnnotations: state.textAnnotations,
    pictures: state.pictures,
    videos: state.videos,
    journeyName: state.journey?.name ?? '',
    mapStyle: state.settings.mapStyle,
    waybackItemURL: state.settings.waybackItemURL,
    terrainExaggeration: state.settings.terrainExaggeration,
    unitSystem: state.settings.unitSystem,
    trailStyle: state.settings.trailStyle,
  };
}

function toCompileInput(picked: ReturnType<typeof pickStoryState>): StoryCompileInput {
  const { mapStyle, waybackItemURL, terrainExaggeration, unitSystem, trailStyle, ...rest } = picked;
  return { ...rest, settings: { mapStyle, waybackItemURL, terrainExaggeration, unitSystem, trailStyle } };
}

export function storyCompileInput(state: AppState): StoryCompileInput {
  return toCompileInput(pickStoryState(state));
}

export function useCompiledStory() {
  const picked = useAppStore(useShallow(pickStoryState));
  return useMemo(() => {
    const input = toCompileInput(picked);
    return { input, story: compileStory(input) };
  }, [picked]);
}
