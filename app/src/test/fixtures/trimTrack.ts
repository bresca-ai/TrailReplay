import { buildTrackFromRawPoints } from '@/utils/gpx/trackStats';

export function createTrimTestTrack() {
  const times = [0, 10, 40, 60, 100, 120];
  return buildTrackFromRawPoints({
    idPrefix: 'track',
    name: 'Mountain loop',
    rawPoints: times.map((seconds, index) => ({
      lat: 25 + index * 0.001,
      lon: 121 + index * 0.001,
      elevation: [300, 100, 120, 140, 160, 400][index],
      time: new Date(Date.UTC(2026, 9, 25, 0, 0, seconds)),
      heartRate: 120 + index,
      cadence: 80 + index,
      power: 200 + index,
      temperature: 20 + index,
    })),
  });
}
