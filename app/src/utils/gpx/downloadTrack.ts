import type { GPXTrack } from '@/types';
import { serializeTrackToGpx } from './serializeTrackToGpx';

export function downloadTrimmedTrack(track: GPXTrack): void {
  const blob = new Blob([serializeTrackToGpx(track)], { type: 'application/gpx+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const name = track.name.replace(/[<>:"/\\|?*]/g, '-').replace(/\p{Cc}/gu, '-').replace(/\.gpx$/i, '').trim() || 'route';
  anchor.href = url;
  anchor.download = `${name}-trimmed.gpx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give browsers time to consume the object URL before releasing it.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
