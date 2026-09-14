import { describe, expect, it } from 'vitest';
import {
  getTriggeredPlaybackItems,
  getTriggeredPlaybackPictures,
  hasPlaybackProgressRewound,
} from './playbackPictures';
import type { PictureAnnotation } from '@/types';

function createPicture(id: string, progress: number): PictureAnnotation {
  return {
    id,
    file: new File(['image'], `${id}.jpg`, { type: 'image/jpeg' }),
    url: `blob:${id}`,
    isPlaceholder: false,
    progress,
    position: progress,
    displayDuration: 5000,
  };
}

describe('playback picture helpers', () => {
  it('returns triggered pictures in playback order when several land in the same window', () => {
    const pictures = [
      createPicture('late', 0.303),
      createPicture('first', 0.3),
      createPicture('middle', 0.301),
    ];

    const triggered = getTriggeredPlaybackPictures({
      pictures,
      previousProgress: 0.298,
      currentProgress: 0.302,
      shownPictureIds: new Set(),
      queuedPictureIds: [],
    });

    expect(triggered.map((picture) => picture.id)).toEqual(['first', 'middle', 'late']);
  });

  it('skips pictures that are already shown or already queued', () => {
    const triggered = getTriggeredPlaybackPictures({
      pictures: [
        createPicture('shown', 0.4),
        createPicture('queued', 0.401),
        createPicture('new', 0.402),
      ],
      previousProgress: 0.398,
      currentProgress: 0.403,
      shownPictureIds: new Set(['shown']),
      queuedPictureIds: ['queued'],
    });

    expect(triggered.map((picture) => picture.id)).toEqual(['new']);
  });

  it('detects when playback has been rewound enough to clear picture history', () => {
    expect(hasPlaybackProgressRewound(0.7, 0.5)).toBe(true);
    expect(hasPlaybackProgressRewound(0.7, 0.6995)).toBe(false);
  });
});

describe('getTriggeredPlaybackItems', () => {
  it('triggers clips on the same rule as photos, in route order', () => {
    const videos = [
      { id: 'summit', progress: 0.605 },
      { id: 'descent', progress: 0.6 },
      { id: 'finish', progress: 0.99 },
    ];

    const triggered = getTriggeredPlaybackItems({
      items: videos,
      previousProgress: 0.598,
      currentProgress: 0.61,
      shownItemIds: new Set<string>(),
      queuedItemIds: [],
    });

    expect(triggered.map((video) => video.id)).toEqual(['descent', 'summit']);
  });

  it('never triggers a clip twice', () => {
    const videos = [{ id: 'summit', progress: 0.5 }];

    const triggered = getTriggeredPlaybackItems({
      items: videos,
      previousProgress: 0.49,
      currentProgress: 0.51,
      shownItemIds: new Set(['summit']),
      queuedItemIds: [],
    });

    expect(triggered).toEqual([]);
  });
});
