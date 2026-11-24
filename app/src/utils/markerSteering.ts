/** Heading is measured clockwise from north, and time is in replay milliseconds. */
export interface MarkerSteeringState { heading: number; timeMs: number }
// A quarter turn takes 0.3 s of replay time, keeping the marker aligned on
// sharp bends while retaining the deadband that filters small GPS jitter.
export const MARKER_TURN_RATE_DEGREES_PER_SECOND = 300;
const HEADING_DEADBAND_DEGREES = 2;
const SEEK_RESET_MS = 2000;

export function steerMarker(previous: MarkerSteeringState | null, target: number, timeMs: number): MarkerSteeringState {
  const heading = ((target % 360) + 360) % 360;
  if (!previous || !Number.isFinite(previous.timeMs) || timeMs < previous.timeMs || timeMs - previous.timeMs > SEEK_RESET_MS) {
    return { heading, timeMs };
  }
  const delta = ((heading - previous.heading + 540) % 360) - 180;
  if (Math.abs(delta) <= HEADING_DEADBAND_DEGREES) return { heading: previous.heading, timeMs };
  const limit = MARKER_TURN_RATE_DEGREES_PER_SECOND * (timeMs - previous.timeMs) / 1000;
  const step = Math.max(-limit, Math.min(limit, delta));
  return { heading: ((previous.heading + step) % 360 + 360) % 360, timeMs };
}
