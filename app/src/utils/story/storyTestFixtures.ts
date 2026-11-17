// Test-only builders shared by the compile and reader tests.
import type { AppSettings, GPXTrack, JourneySegment } from '@/types';
import { buildTrackFromRawPoints } from '@/utils/gpx/trackStats';
import type { StoryCompileInput } from './compileStory';
import { createDefaultStory, type StoryAnchor, type StoryBlock, type StoryDocument } from './storyDocument';

/** A straight north-bound track, 0.001 degrees of latitude (about 111 m) between points. */
export function northbound(name: string, lat: number, lon: number, points = 11): GPXTrack {
  return buildTrackFromRawPoints({
    idPrefix: 'track',
    name,
    rawPoints: Array.from({ length: points }, (_, index) => ({
      lat: lat + index * 0.001,
      lon,
      elevation: 100 + index * 10,
      time: null,
      heartRate: null,
      cadence: null,
      power: null,
      temperature: null,
    })),
  });
}

/** Segment ids `day-1`, `hop` (a camera connector) and `day-2`. */
export function journeyWithCameraHop(first: GPXTrack, second: GPXTrack): JourneySegment[] {
  return [
    { id: 'day-1', type: 'track', trackId: first.id, duration: 60_000 },
    { id: 'hop', type: 'transport', mode: 'camera', from: first.points.at(-1)!, to: second.points[0], duration: 5_000, distance: 0 },
    { id: 'day-2', type: 'track', trackId: second.id, duration: 60_000 },
  ];
}

export const settings: StoryCompileInput['settings'] = {
  mapStyle: 'topo',
  waybackItemURL: null,
  terrainExaggeration: 9,
  unitSystem: 'metric',
  trailStyle: { trailColor: '#C1652F' } as AppSettings['trailStyle'],
};

export const story = (...sections: Array<[id: string, anchor: StoryAnchor, blocks?: StoryBlock[]]>): StoryDocument => ({
  ...createDefaultStory(),
  sections: sections.map(([id, anchor, blocks = []]) => ({ id, anchor, heading: id, blocks })),
});

export const km = (routeMeters: number, segment?: { segmentId: string; segmentMeters: number }): StoryAnchor => (
  { ref: null, place: { routeMeters, ...segment } }
);

export const media = (id: string, fields: Partial<StoryCompileInput['pictures'][number]> = {}) => (
  { id, url: `blob:${id}`, isPlaceholder: false, ...fields }
);
