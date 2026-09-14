import { describe, expect, it } from 'vitest';
import { createAppStore } from '@/store/createAppStore';
import type { PictureAnnotation, VideoAnnotation } from '@/types';

function createPlaceholderPicture(overrides: Partial<PictureAnnotation> = {}): PictureAnnotation {
  return {
    id: 'picture-1',
    file: null,
    url: '',
    isPlaceholder: true,
    originalFileName: 'summit.jpg',
    progress: 0.5,
    position: 0.5,
    displayDuration: 5000,
    ...overrides,
  };
}

function createPlaceholderVideo(overrides: Partial<VideoAnnotation> = {}): VideoAnnotation {
  return {
    id: 'video-1',
    file: null,
    url: '',
    isPlaceholder: true,
    originalFileName: 'descent.mp4',
    progress: 0.3,
    ...overrides,
  };
}

describe('mediaSlice relink actions', () => {
  it('relinkPictureFile attaches a file to a placeholder picture and clears isPlaceholder', () => {
    const store = createAppStore();
    store.setState((state) => {
      state.pictures.push(createPlaceholderPicture());
    });

    const file = new File(['image'], 'summit.jpg', { type: 'image/jpeg' });
    store.getState().relinkPictureFile('picture-1', file);

    const picture = store.getState().pictures[0];
    expect(picture.file).toBe(file);
    expect(picture.isPlaceholder).toBe(false);
    expect(picture.url).toMatch(/^blob:|^data:/);
    expect(picture.originalFileName).toBe('summit.jpg');
  });

  it('relinkVideoFile attaches a file to a placeholder video and clears isPlaceholder', () => {
    const store = createAppStore();
    store.setState((state) => {
      state.videos.push(createPlaceholderVideo());
    });

    const file = new File(['video'], 'descent.mp4', { type: 'video/mp4' });
    store.getState().relinkVideoFile('video-1', file);

    const video = store.getState().videos[0];
    expect(video.file).toBe(file);
    expect(video.isPlaceholder).toBe(false);
    expect(video.url).toMatch(/^blob:|^data:/);
  });

  it('is a no-op when the picture/video id does not exist', () => {
    const store = createAppStore();
    store.setState((state) => {
      state.pictures.push(createPlaceholderPicture());
    });

    store.getState().relinkPictureFile('missing-id', new File(['image'], 'x.jpg'));

    expect(store.getState().pictures[0].isPlaceholder).toBe(true);
  });
});

describe('mediaSlice video selection', () => {
  it('clears the selection when the selected video is removed', () => {
    const store = createAppStore();
    store.setState((state) => {
      state.videos.push(createPlaceholderVideo());
    });

    store.getState().setSelectedVideoId('video-1');
    store.getState().removeVideo('video-1');

    expect(store.getState().videos).toHaveLength(0);
    expect(store.getState().selectedVideoId).toBeNull();
  });

  it('re-anchors a video when its position on the route is updated', () => {
    const store = createAppStore();
    store.setState((state) => {
      state.videos.push(createPlaceholderVideo());
    });

    store.getState().updateVideoPosition('video-1', 0.75, {
      routeDistance: 12_000,
      routeSegmentId: 'segment-2',
      routeSegmentDistance: 3_000,
    });

    const video = store.getState().videos[0];
    expect(video.progress).toBe(0.75);
    expect(video.routeDistance).toBe(12_000);
    expect(video.routeSegmentId).toBe('segment-2');
    expect(video.routeSegmentDistance).toBe(3_000);
  });
});
