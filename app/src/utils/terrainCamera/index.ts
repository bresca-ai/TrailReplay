import type { GPXTrack, JourneySegment } from '@/types';
import { buildComputedJourney, buildJourneyDistanceProfile, getJourneyPointAtProgress, getSegmentAtProgress } from '@/utils/journeyUtils';
import { deriveCinematicKeyframeProgress, prepareCinematicKeyframeTrack, getCinematicCameraPose } from '@/utils/cinematicCameraPlan';
import type { CinematicCameraKeyframe } from '@/utils/cinematicCameraPlan';
import { getRouteBearingAtProgress } from '@/utils/replayCameraPlan';
import { buildCameraPathCoordinates } from '@/utils/cameraPathCoordinates';
import { interpolateTrackPoint } from '@/utils/gpx/interpolateTrackPoint';
import { getSmoothedCameraAnchor } from '@/utils/cinematicCameraAnchor';
import { cinematicAnchorSmoothingHalfWindow } from '@/components/map/cameraUtils';
import { terrainContextFingerprint } from './context';
import { composeRouteCandidates, groupOverlappingRouteFootprints, routePointInFrame } from './routeComposition';
import type { RouteCompositionPoint } from './routeComposition';
import type { BuildTerrainCameraBriefOptions, EvaluateTerrainCameraPlanOptions, TerrainAnchor, TerrainCameraBrief, TerrainCameraEvaluation, TerrainCameraKeyframe, TerrainSampler } from './types';
export * from './types';
export { terrainContextFingerprint } from './context';
export { createTerrariumSampler, decodeTerrariumHeight, slippyTileFor, TERRARIUM_TILE_URL } from './terrariumSampler';
export { createBrowserTerrariumSampler } from './browserSampler';

const DISTANCES = [250, 750, 1500];
const DIRECTIONS = Array.from({ length: 8 }, (_, i) => i * 45);
const M_PER_DEG_LAT = 111_320;
const EXAGGERATION = 1.2;
const WIDTH_PX = 1280;
const MPP_Z0 = 40075016.686 / 512;
const VERTICAL_FOV_DEG = 36;
const MAX_FRAMES = 12;
const ROUTE_VISIBILITY_SAMPLES = 20;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const norm = (v: number) => (v % 360 + 360) % 360;
const angleDelta = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
function abort(signal?: AbortSignal) { if (signal?.aborted) throw new DOMException('Aborted', 'AbortError'); }
function metersLon(lat: number) { return M_PER_DEG_LAT * Math.max(0.01, Math.cos(lat * Math.PI / 180)); }
function offset(lon: number, lat: number, bearing: number, distance: number): [number, number] {
  const a = bearing * Math.PI / 180;
  return [lon + Math.sin(a) * distance / metersLon(lat), lat + Math.cos(a) * distance / M_PER_DEG_LAT];
}
function bearing(lon1: number, lat1: number, lon2: number, lat2: number) {
  const a = lat1 * Math.PI / 180, b = lat2 * Math.PI / 180, d = (lon2 - lon1) * Math.PI / 180;
  return norm(Math.atan2(Math.sin(d) * Math.cos(b), Math.cos(a) * Math.sin(b) - Math.sin(a) * Math.cos(b) * Math.cos(d)) * 180 / Math.PI);
}
function trackFor(tracks: GPXTrack[], id: string) { return tracks.find((t) => t.id === id); }
function coordinateAt(track: GPXTrack, distance: number): [number, number] | null {
  const point = interpolateTrackPoint(track, distance);
  return point ? [point.lon, point.lat] : null;
}
async function sampleFinite(sampler: TerrainSampler, lon: number, lat: number): Promise<number | null> {
  const value = await sampler.sampleElevation(lon, lat);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function routePointsFor(track: GPXTrack): RouteCompositionPoint[] {
  if (track.points.length === 0) return [];
  const count = Math.min(ROUTE_VISIBILITY_SAMPLES, track.points.length);
  const sampled = count <= 1 ? track.points.map(p => p) : Array.from({ length: count }, (_, i) => {
    const point = track.points[Math.round(i * (track.points.length - 1) / (count - 1))];
    return point;
  });
  const minBy = (selector: (point: GPXTrack['points'][number]) => number) => track.points.reduce((a, b) => selector(a) <= selector(b) ? a : b);
  const maxBy = (selector: (point: GPXTrack['points'][number]) => number) => track.points.reduce((a, b) => selector(a) >= selector(b) ? a : b);
  const knownElevationPoints = track.points.filter(point => Number.isFinite(point.elevation));
  const extrema = [track.points[0], track.points[track.points.length - 1], minBy(point => point.lat), maxBy(point => point.lat), minBy(point => point.lon), maxBy(point => point.lon)];
  if (knownElevationPoints.length) extrema.push(knownElevationPoints.reduce((a, b) => a.elevation <= b.elevation ? a : b));
  if (knownElevationPoints.length) extrema.push(knownElevationPoints.reduce((a, b) => a.elevation >= b.elevation ? a : b));
  return [...new Set([...sampled, ...extrema])].map((point) => ({
    lon: point.lon, lat: point.lat, elevationMeters: Number.isFinite(point.elevation) ? point.elevation : null,
    ...(point === track.points[0] ? { isStart: true } : {}),
  }));
}

async function evaluateRouteVisibility(points: RouteCompositionPoint[], candidate: { target: { lon: number; lat: number; elevationMeters: number }; bearingDeg: number; pitchDeg: number; zoom: number }, viewport: { widthPx: number; heightPx: number; verticalFovDeg: number; terrainExaggeration: number }, sampler: TerrainSampler, signal?: AbortSignal) {
  const projected = points.filter(point => routePointInFrame(point, { ...candidate, coverage: 0, mountainAlignment: 0, startVisible: false }, viewport));
  const routeChecks = projected.length <= 8 ? projected : Array.from({ length: 8 }, (_, i) => projected[Math.round(i * (projected.length - 1) / 7)]);
  const starts = points.filter(point => point.isStart);
  for (const start of starts) if (projected.includes(start) && !routeChecks.includes(start)) routeChecks.push(start);
  const clearPoints = new Set<RouteCompositionPoint>();
  const unknownPoints = new Set<RouteCompositionPoint>();
  let unknown = 0;
  for (const point of routeChecks) {
    abort(signal);
    if (point.elevationMeters === null) { unknown++; unknownPoints.add(point); continue; }
    const mpp = 40075016.686 * Math.cos(candidate.target.lat * Math.PI / 180) / (512 * 2 ** candidate.zoom);
    const focalPx = viewport.heightPx / (2 * Math.tan(viewport.verticalFovDeg * Math.PI / 360));
    const cameraDistance = Math.max(1, focalPx * mpp);
    const pitch = candidate.pitchDeg * Math.PI / 180;
    const cameraGroundDistance = cameraDistance * Math.sin(pitch);
    const cameraAltitude = candidate.target.elevationMeters * viewport.terrainExaggeration + cameraDistance * Math.cos(pitch);
    const [cx, cy] = offset(candidate.target.lon, candidate.target.lat, norm(candidate.bearingDeg + 180), cameraGroundDistance);
    const bearingToPoint = bearing(cx, cy, point.lon, point.lat);
    const distance = Math.hypot((point.lon - cx) * metersLon(candidate.target.lat), (point.lat - cy) * M_PER_DEG_LAT);
    let clear = true, hasUnknown = false;
    for (const t of [.1, .2, .3, .4, .5, .6, .7, .8, .9]) {
      const [lon, lat] = offset(cx, cy, bearingToPoint, distance * t);
      const terrain = await sampleFinite(sampler, lon, lat);
      if (terrain === null) { hasUnknown = true; continue; }
      const sightline = cameraAltitude + (point.elevationMeters * viewport.terrainExaggeration - cameraAltitude) * t;
      if (terrain * viewport.terrainExaggeration > sightline + 2) clear = false;
    }
    if (hasUnknown) { unknown++; unknownPoints.add(point); }
    else if (clear) clearPoints.add(point);
  }
  const startInFrameCount = starts.filter(start => projected.includes(start)).length;
  const startVisibleCount = starts.filter(start => clearPoints.has(start)).length;
  const startUnknownCount = starts.filter(start => unknownPoints.has(start)).length;
  const startOccludedCount = starts.filter(start => projected.includes(start) && !unknownPoints.has(start) && !clearPoints.has(start)).length;
  const allStartsInFrame = starts.length > 0 && startInFrameCount === starts.length;
  const allStartsVisible = starts.length > 0 && startVisibleCount === starts.length;
  return { sampled: routeChecks.length, visible: clearPoints.size, unknown, coverage: routeChecks.length ? (projected.length / points.length) * clearPoints.size / routeChecks.length : null, startVisible: allStartsVisible, startInFrame: allStartsInFrame, startOccluded: startOccludedCount > 0, startUnknown: startUnknownCount > 0, startCount: starts.length, startInFrameCount, startVisibleCount, startOccludedCount, startUnknownCount };
}

async function resolveSampler(options: { sampler?: TerrainSampler; sampleElevation?: (lon: number, lat: number) => Promise<number | null>; signal?: AbortSignal }): Promise<TerrainSampler> {
  if (options.sampler) return options.sampler;
  if (options.sampleElevation) return { sampleElevation: options.sampleElevation };
  if (typeof window !== 'undefined') {
    const { createBrowserTerrariumSampler } = await import('./browserSampler');
    return createBrowserTerrariumSampler({ signal: options.signal });
  }
  throw new Error('Pass a terrain sampler or sampleElevation when running outside a browser.');
}

interface Candidate { anchor: TerrainAnchor; coord: [number, number]; score: number; reason: string; title: string; segmentOrder: number; }
function candidatesFor(tracks: GPXTrack[], segments: JourneySegment[]): Candidate[] {
  const out: Candidate[] = [];
  segments.forEach((segment, segmentOrder) => {
    if (segment.type !== 'track') return;
    const track = trackFor(tracks, segment.trackId);
    if (!track || track.points.length < 2) return;
    const p = track.points;
    const add = (i: number, score: number, reason: string, label: string) => {
      const x = p[i];
      out.push({ anchor: { trackId: track.id, segmentId: segment.id, distanceMeters: x.distance }, coord: [x.lon, x.lat], score, reason, title: `${track.name}: ${label}`, segmentOrder });
    };
    add(0, 4, 'track start', 'start'); add(p.length - 1, 4, 'track finish', 'finish');
    const stride = Math.max(1, Math.floor(p.length / 180));
    for (let i = stride; i < p.length - stride; i += stride) {
      const before = p[i - stride], at = p[i], after = p[i + stride];
      if ([before.elevation, at.elevation, after.elevation].every(Number.isFinite)) {
        const peakDelta = at.elevation - (before.elevation + after.elevation) / 2;
        if (peakDelta > 12) add(i, Math.min(10, 4 + peakDelta / 25), 'local high point', 'high point');
        if (peakDelta < -12) add(i, Math.min(9, 4 + Math.abs(peakDelta) / 30), 'local low point', 'low point');
      }
      const turn = angleDelta(bearing(before.lon, before.lat, at.lon, at.lat), bearing(at.lon, at.lat, after.lon, after.lat));
      if (turn >= 55) add(i, Math.min(8, 3 + turn / 45), 'route turn', 'turn');
    }
    // Even a quiet route gets enough authored beats to make a useful camera arc.
    for (const fraction of [0.25, 0.5, 0.75]) {
      const d = track.totalDistance * fraction;
      const point = coordinateAt(track, d);
      if (point && !out.some((x) => x.anchor.segmentId === segment.id && Math.abs(x.anchor.distanceMeters - d) < Math.max(1, track.totalDistance * 0.04))) {
        out.push({ anchor: { trackId: track.id, segmentId: segment.id, distanceMeters: d }, coord: point, score: 2, reason: 'timeline beat', title: `${track.name}: journey beat`, segmentOrder });
      }
    }
  });
  return out;
}
function selectCandidates(all: Candidate[], limit: number, computed: ReturnType<typeof buildComputedJourney>, mode: BuildTerrainCameraBriefOptions['routeTimingMode']): Candidate[] {
  const chosen: Candidate[] = [];
  const progress = (candidate: Candidate) => computed
    ? deriveCinematicKeyframeProgress({ routeSegmentId: candidate.anchor.segmentId, routeSegmentDistance: candidate.anchor.distanceMeters }, computed.segmentTimings, computed.coordinates, mode ?? 'recorded')
    : null;
  const gap = 1 / (limit * 2.5);
  for (const c of [...all].sort((a, b) => b.score - a.score)) {
    if (chosen.length >= limit) break;
    const p = progress(c);
    if (p !== null && chosen.every((x) => { const q = progress(x); return q === null || Math.abs(p - q) >= gap; })) chosen.push(c);
  }
  const timelineOrder = [...all].sort((a, b) => (progress(a) ?? a.segmentOrder) - (progress(b) ?? b.segmentOrder));
  for (const c of timelineOrder) { if (chosen.length >= Math.min(5, limit)) break; if (!chosen.includes(c)) chosen.push(c); }
  return chosen.sort((a, b) => (progress(a) ?? a.segmentOrder) - (progress(b) ?? b.segmentOrder));
}

async function sampleMoment(sampler: TerrainSampler, candidate: Candidate, signal?: AbortSignal) {
  const center = await sampleFinite(sampler, ...candidate.coord);
  const radial: Array<{ bearing: number; distance: number; elevation: number | null }> = [];
  for (const direction of DIRECTIONS) for (const distance of DISTANCES) {
    abort(signal);
    const [lon, lat] = offset(...candidate.coord, direction, distance);
    radial.push({ bearing: direction, distance, elevation: await sampleFinite(sampler, lon, lat) });
  }
  const known = radial.map((x) => x.elevation).filter((x): x is number => x !== null && Number.isFinite(x));
  const profile = DIRECTIONS.map((bearingDeg) => {
    const samples = radial.filter((x) => x.bearing === bearingDeg).map((x) => ({ distanceMeters: x.distance, elevationMeters: x.elevation }));
    const heights = samples.map((x) => x.elevationMeters).filter((x): x is number => x !== null);
    return { bearingDeg, samples, reliefMeters: heights.length === DISTANCES.length ? Math.max(...heights) - Math.min(...heights) : null };
  });
  return { center, radial, profile, relief: known.length === 24 ? Math.max(...known) - Math.min(...known) : null };
}

export async function buildTerrainCameraBrief(options: BuildTerrainCameraBriefOptions): Promise<TerrainCameraBrief> {
  const { tracks, journeySegments: segments, signal, onProgress } = options;
  abort(signal);
  const sampler = await resolveSampler(options);
  const warningSet = new Set<string>();
  const computed = buildComputedJourney(segments, tracks);
  if (!computed) warningSet.add('Journey timing could not be computed from the supplied segments.');
  const duration = computed?.totalDuration ?? segments.reduce((sum, segment) => sum + Math.max(0, segment.duration || 0), 0);
  const frameLimit = clamp(5 + Math.floor(Math.log2(duration / 60_000 + 1)), 5, MAX_FRAMES);
  const allCandidates = candidatesFor(tracks, segments);
  const selected = selectCandidates(allCandidates, frameLimit, computed, options.routeTimingMode);
  const selectedSegments = new Set(selected.map((candidate) => candidate.anchor.segmentId));
  if (allCandidates.some((candidate) => !selectedSegments.has(candidate.anchor.segmentId))) {
    warningSet.add('The 5–12 shot budget leaves some route segments without a dedicated keyframe; the intervals between selected shots are still sampled.');
  }
  const routeTimingMode = options.routeTimingMode ?? 'recorded';
  const cameraStability = options.cameraStability ?? 0.5;
  const smoothingHalfWindow = cinematicAnchorSmoothingHalfWindow(cameraStability, (computed?.totalDuration ?? 0) / 1000);
  const viewportSize = { widthPx: options.viewport?.widthPx ?? WIDTH_PX, heightPx: options.viewport?.heightPx ?? 720, verticalFovDeg: options.viewport?.verticalFovDeg ?? VERTICAL_FOV_DEG, terrainExaggeration: options.viewport?.terrainExaggeration ?? EXAGGERATION };
  const routePointsBySegment = new Map<string, RouteCompositionPoint[]>();
  for (const segment of segments) {
    if (segment.type !== 'track' || routePointsBySegment.has(segment.id) || !selectedSegments.has(segment.id)) continue;
    const track = trackFor(tracks, segment.trackId);
    if (!track) continue;
    // The trail is draped on the map DEM; recorded GPS altitude can disagree
    // with that surface, so use the same terrain for fitting and occlusion.
    const points = routePointsFor(track);
    for (const point of points) {
      abort(signal);
      point.elevationMeters = await sampleFinite(sampler, point.lon, point.lat);
    }
    routePointsBySegment.set(segment.id, points);
  }
  // Nearby course footprints share a composition target so the framing does not jump between overlapping tracks.
  const compositionBySegment = new Map<string, { groupIds: string[]; points: RouteCompositionPoint[]; candidates: ReturnType<typeof composeRouteCandidates> }>();
  const routeGroups = groupOverlappingRouteFootprints([...routePointsBySegment].map(([id, points]) => ({ id, points })));
  for (const groupIds of routeGroups) {
    const points = groupIds.flatMap(id => routePointsBySegment.get(id) ?? []);
    const groupComposition = { groupIds, points, candidates: composeRouteCandidates(points, viewportSize) };
    for (const id of groupIds) compositionBySegment.set(id, groupComposition);
  }
  // Resolve composition once per connected group. All beats and segments in that group reuse its fixed pose.
  type ChosenComposition = { frame: Omit<TerrainCameraKeyframe, 'id' | 'title' | 'anchor'>; evaluation: TerrainCameraEvaluation; routeVisibility: Awaited<ReturnType<typeof evaluateRouteVisibility>> };
  const chosenCompositionBySegment = new Map<string, ChosenComposition>();
  const orbitBySegment = new Map<string, { kind: 'orbit' | 'dolly'; direction: number; degrees: number; zoom: number; pitch: number; start: number; end: number }>();
  const completedGroups = new Set<string>();
  for (const [segmentId, composition] of compositionBySegment) {
    const groupKey = composition.groupIds.join('|');
    if (completedGroups.has(groupKey)) continue;
    completedGroups.add(groupKey);
    const finalists = composition.candidates;
    const courseHigh = Math.max(...composition.points.map(point => point.elevationMeters ?? 0)) * viewportSize.terrainExaggeration;
    let selectedComposition: ChosenComposition | null = null;
    let selectedScore = Number.POSITIVE_INFINITY;
    for (const candidate of finalists) {
      const routeVisibility = await evaluateRouteVisibility(composition.points, candidate, viewportSize, sampler, signal);
      const anchor = selected.find(item => composition.groupIds.includes(item.anchor.segmentId))?.anchor ?? { trackId: '', segmentId, distanceMeters: 0 };
      const evaluation = await evaluatePose(`terrain-segment-${segmentId}`, anchor, [candidate.target.lon, candidate.target.lat], candidate.bearingDeg, candidate.pitchDeg, candidate.zoom, sampler, options.viewport ?? {}, smoothingHalfWindow, cameraStability, signal, candidate.target.elevationMeters);
      evaluation.routeVisibility = routeVisibility;
      const cameraGroundClearance = evaluation.clearanceSamples[0]?.clearanceMeters;
      const score = (1 - (routeVisibility.coverage ?? 0)) * 100_000 + (routeVisibility.startVisible ? 0 : 100_000)
        + routeVisibility.unknown * 1_000 + (cameraGroundClearance === null || cameraGroundClearance === undefined ? 50_000 : Math.max(0, 40 - cameraGroundClearance) * 500)
        + candidate.mountainAlignment * 8 + Math.abs(82 - candidate.pitchDeg) * 20 + (14 - candidate.zoom) * 4
        + Math.max(0, (evaluation.estimate.cameraAltitudeMeters ?? courseHigh) - courseHigh) * .5;
      if (score < selectedScore) {
        selectedScore = score;
        selectedComposition = { frame: { bearingDeg: candidate.bearingDeg, pitchDeg: candidate.pitchDeg, zoom: candidate.zoom, target: candidate.target, frame: 'world', easing: 'smooth' }, evaluation, routeVisibility };
      }
    }
    if (selectedComposition) {
      for (const groupSegmentId of composition.groupIds) chosenCompositionBySegment.set(groupSegmentId, selectedComposition);
      // Try real, gentle orbit arcs around the fixed route composition. Every checked
      // pose must retain the padded full-course fit, sampled LOS, and 40 m clearance.
      const groupTimings = computed?.segmentTimings.filter(timing => composition.groupIds.includes(timing.segmentId)) ?? [];
      const start = groupTimings.length ? Math.min(...groupTimings.map(timing => timing.progressStartRatio)) : 0;
      const end = groupTimings.length ? Math.max(...groupTimings.map(timing => timing.progressEndRatio)) : 1;
      let motion: { kind: 'orbit' | 'dolly'; direction: number; degrees: number; zoom: number; pitch: number; start: number; end: number } | null = null;
      const base = selectedComposition.frame;
      if (base.target) {
        const target = base.target;
        const checks = [0, .125, .25, .375, .5, .625, .75, .875, 1];
        const checkMotion = async (kind: 'orbit' | 'dolly', direction: number, degrees: number, zoom: number) => {
          for (const phase of checks) {
            const zoomAt = kind === 'dolly' ? base.zoom + direction * degrees * Math.sin(Math.PI * phase) : zoom;
            const pitchAt = Math.acos(clamp(Math.cos(base.pitchDeg * Math.PI / 180) * 2 ** (zoomAt - base.zoom), -1, 1)) * 180 / Math.PI;
            const orbitBearing = kind === 'orbit' ? norm(base.bearingDeg + direction * degrees * .5 * (phase * 2 - 1)) : base.bearingDeg;
            if (pitchAt > 85 || pitchAt < 0) return false;
            const pose = { ...base, target, bearingDeg: orbitBearing, pitchDeg: pitchAt, zoom: zoomAt };
            if (!composition.points.every(point => routePointInFrame(point, { ...pose, coverage: 0, mountainAlignment: 0, startVisible: false }, viewportSize))) return false;
            const visibility = await evaluateRouteVisibility(composition.points, pose, viewportSize, sampler, signal);
            if ((visibility.coverage ?? 0) < .8 || visibility.unknown > 0 || !visibility.startVisible) return false;
            const clearance = await evaluatePose(`motion-check-${segmentId}`, selected.find(item => composition.groupIds.includes(item.anchor.segmentId))?.anchor ?? { trackId: '', segmentId, distanceMeters: 0 }, [target.lon, target.lat], orbitBearing, pitchAt, zoomAt, sampler, options.viewport ?? {}, smoothingHalfWindow, cameraStability, signal, target.elevationMeters);
            const minimum = clearance.clearanceSamples.map(sample => sample.clearanceMeters).filter((value): value is number => value !== null).reduce<number | null>((min, value) => min === null ? value : Math.min(min, value), null);
            if (minimum === null || minimum < 40) return false;
          }
          return true;
        };
        // Create breathing room first; choose the largest safe sweep before a smaller one.
        outer: for (const degrees of [24, 18, 12, 6]) {
          for (const pullback of [.1, .2, .35]) {
            const zoom = base.zoom - pullback;
            const pitch = Math.acos(clamp(Math.cos(base.pitchDeg * Math.PI / 180) * 2 ** (zoom - base.zoom), -1, 1)) * 180 / Math.PI;
            if (pitch > 85) continue;
            for (const direction of [1, -1]) {
              if (await checkMotion('orbit', direction, degrees, zoom)) {
                motion = { kind: 'orbit', direction, degrees, zoom, pitch, start, end };
                break outer;
              }
            }
          }
        }
        // A small checked pullback/push variation keeps the camera alive when no orbit fits.
        if (!motion) for (const direction of [1, -1]) {
          if (await checkMotion('dolly', direction, .15, base.zoom)) {
            motion = { kind: 'dolly', direction, degrees: .15, zoom: base.zoom, pitch: base.pitchDeg, start, end };
            break;
          }
        }
      }
      if (motion) for (const groupSegmentId of composition.groupIds) orbitBySegment.set(groupSegmentId, motion);
      else warningSet.add('Terrain and framing checks rejected camera motion for one or more route groups; those groups retain their safe fixed composition.');
    }
  }
  const moments: TerrainCameraBrief['moments'] = [], frames: TerrainCameraKeyframe[] = [];
  let centerKnown = 0, radialKnownTotal = 0;
  onProgress?.({ completed: 0, total: selected.length });
  for (let i = 0; i < selected.length; i++) {
    abort(signal);
    const c = selected[i], result = await sampleMoment(sampler, c, signal);
    if (result.center !== null) centerKnown++;
    const radialKnown = result.radial.filter((x) => x.elevation !== null).length;
    radialKnownTotal += radialKnown;
    if (result.center === null || radialKnown < 24) warningSet.add('Some terrain samples are unavailable; unknown terrain was not treated as flat.');
    const id = `terrain-${i + 1}`;
    moments.push({ id, title: c.title, anchor: c.anchor, elevationMeters: result.center, reliefMeters: result.relief, reason: c.reason, radialRelief: result.profile });
    const baseConfidence = result.center !== null && radialKnown === 24 ? 0.72 : result.center !== null && radialKnown >= 16 ? 0.34 : result.center !== null ? 0.12 : 0;
    const picked = chosenCompositionBySegment.get(c.anchor.segmentId);
    if (!picked) continue;
    const motion = orbitBySegment.get(c.anchor.segmentId);
    const progress = computed ? deriveCinematicKeyframeProgress({ routeSegmentId: c.anchor.segmentId, routeSegmentDistance: c.anchor.distanceMeters }, computed.segmentTimings, computed.coordinates, routeTimingMode) : null;
    const phase = progress === null || !motion || motion.end <= motion.start ? .5 : clamp((progress - motion.start) / (motion.end - motion.start), 0, 1);
    const motionZoom = motion ? (motion.kind === 'dolly' ? motion.zoom + motion.direction * motion.degrees * Math.sin(Math.PI * phase) : motion.zoom) : picked.frame.zoom;
    const motionPitch = motion ? Math.acos(clamp(Math.cos(picked.frame.pitchDeg * Math.PI / 180) * 2 ** (motionZoom - picked.frame.zoom), -1, 1)) * 180 / Math.PI : picked.frame.pitchDeg;
    const frame: TerrainCameraKeyframe = { ...picked.frame, zoom: motionZoom, pitchDeg: motionPitch, ...(motion?.kind === 'orbit' ? { bearingDeg: norm(picked.frame.bearingDeg + motion.direction * motion.degrees * .5 * (phase * 2 - 1)) } : {}), id, title: c.title, anchor: c.anchor };
    const chosen = { frame, evaluation: { ...picked.evaluation, frameId: id } };
    const warnings = [...chosen.evaluation.warnings];
    if (radialKnown < 24) warnings.push('Incomplete radial DEM coverage limits this recommendation.');
    if (!picked.routeVisibility.startInFrame) warnings.push('One or more nearby course origins are outside the generated camera frame.');
    else if (picked.routeVisibility.startOccluded) warnings.push('Sampled terrain occludes one or more nearby course origins from this camera position.');
    else if (picked.routeVisibility.startUnknown) warnings.push('Line of sight to one or more nearby course origins is unknown because DEM samples are incomplete.');
    if ((picked.routeVisibility.coverage ?? 0) < 0.8) warnings.push('The complete course was not confirmed visible in this frame.');
    if (picked.routeVisibility.unknown > 0) warnings.push('Route line-of-sight checks include unknown DEM samples; unknown terrain was not treated as visible.');
    chosen.frame.terrain = {
      rationale: 'A slow camera move around a low course target keeps the route and its start in view; the sweep, framing, terrain visibility and camera clearance were checked.',
      confidence: Math.min(baseConfidence, chosen.evaluation.confidence, (picked.routeVisibility.coverage ?? 0) * (picked.routeVisibility.unknown > 0 ? 0.45 : 0.9)), warnings,
      estimatedMinClearanceMeters: chosen.evaluation.clearanceSamples.map((x) => x.clearanceMeters).filter((x): x is number => x !== null).reduce<number | null>((min, value) => min === null ? value : Math.min(min, value), null),
    };
    frames.push(chosen.frame);
    onProgress?.({ completed: i + 1, total: selected.length });
  }
  // Keep motion authored across each connected course, including exact segment
  // endpoints; the ordinary highlight budget may have skipped those candidates.
  const endpointKeys = new Set(frames.map(frame => `${frame.anchor.segmentId}:${frame.anchor.distanceMeters.toFixed(3)}`));
  for (const segmentId of compositionBySegment.keys()) {
    const segment = segments.find(segment => segment.id === segmentId);
    const track = segment?.type === 'track' ? trackFor(tracks, segment.trackId) : undefined;
    const picked = chosenCompositionBySegment.get(segmentId);
    if (!track || !picked) continue;
    const motion = orbitBySegment.get(segmentId);
    for (const distanceMeters of [0, track.totalDistance]) {
      const key = `${segmentId}:${distanceMeters.toFixed(3)}`;
      if (endpointKeys.has(key)) continue;
      endpointKeys.add(key);
      const anchor = { trackId: track.id, segmentId, distanceMeters };
      const progress = computed ? deriveCinematicKeyframeProgress({ routeSegmentId: segmentId, routeSegmentDistance: distanceMeters }, computed.segmentTimings, computed.coordinates, routeTimingMode) : null;
      const phase = progress === null || !motion || motion.end <= motion.start ? .5 : clamp((progress - motion.start) / (motion.end - motion.start), 0, 1);
      const motionZoom = motion ? (motion.kind === 'dolly' ? motion.zoom + motion.direction * motion.degrees * Math.sin(Math.PI * phase) : motion.zoom) : picked.frame.zoom;
      const motionPitch = motion ? Math.acos(clamp(Math.cos(picked.frame.pitchDeg * Math.PI / 180) * 2 ** (motionZoom - picked.frame.zoom), -1, 1)) * 180 / Math.PI : picked.frame.pitchDeg;
      frames.push({ ...picked.frame, zoom: motionZoom, pitchDeg: motionPitch, ...(motion?.kind === 'orbit' ? { bearingDeg: norm(picked.frame.bearingDeg + motion.direction * motion.degrees * .5 * (phase * 2 - 1)) } : {}), id: `terrain-course-${frames.length + 1}`, title: `${track.name}: ${distanceMeters === 0 ? 'start' : 'finish'}`, anchor });
    }
  }
  if (computed) frames.sort((a, b) => {
    const progress = (frame: TerrainCameraKeyframe) => deriveCinematicKeyframeProgress({ routeSegmentId: frame.anchor.segmentId, routeSegmentDistance: frame.anchor.distanceMeters }, computed.segmentTimings, computed.coordinates, routeTimingMode) ?? 0;
    return progress(a) - progress(b);
  });
  let cameraSamplesComplete = false;
  if (frames.length) {
    const review = await evaluateTerrainCameraPlan({ frames, tracks, journeySegments: segments, routeTimingMode, cameraStability, viewport: options.viewport, signal, sampler });
    cameraSamplesComplete = review.length > 0 && review.every((item) => item.estimate.cameraAltitudeMeters !== null
      && item.clearanceSamples.every((sample) => sample.terrainMeters !== null)
      && (item.routeVisibility === undefined || item.routeVisibility.unknown === 0)
      && item.radialRelief.every((direction) => direction.samples.every((sample) => sample.elevationMeters !== null))
      && !item.warnings.some((warning) => warning.includes('Missing DEM') || warning.includes('256 check limit')));
    for (const item of review) {
      if (item.phase === 'transition' && item.visibility !== 'clear-sampled') {
        const destination = frames.find((frame) => frame.anchor.segmentId === item.anchor.segmentId && frame.anchor.distanceMeters === item.anchor.distanceMeters);
        if (destination?.terrain) {
          destination.terrain.confidence = Math.min(destination.terrain.confidence, item.confidence);
          destination.terrain.warnings = [...new Set([...destination.terrain.warnings, item.visibility === 'unknown'
            ? 'Terrain coverage is incomplete on a transition approaching this shot.'
            : 'Sampled terrain may obstruct a transition approaching this shot; preview and revise it.'])];
        }
      }
      if (item.phase === 'keyframe') {
        const frame = frames.find((entry) => entry.id === item.frameId);
        if (frame?.terrain) {
          frame.terrain.confidence = Math.min(frame.terrain.confidence, item.confidence);
          frame.terrain.warnings = [...new Set([...frame.terrain.warnings, ...item.warnings])];
          const measured = item.clearanceSamples.filter((sample) => !sample.targetEndpoint).map((sample) => sample.clearanceMeters).filter((value): value is number => value !== null);
          frame.terrain.estimatedMinClearanceMeters = measured.length ? Math.min(...measured) : null;
        }
      }
      if (item.warnings.some((warning) => warning.includes('Missing DEM'))) warningSet.add('Terrain coverage is incomplete along one or more camera transitions.');
      if (item.warnings.some((warning) => warning.includes('intersects'))) warningSet.add('Terrain may intersect one or more estimated camera sight lines.');
      if (item.routeVisibility && (item.routeVisibility.coverage ?? 0) < 0.8) warningSet.add('The camera route visibility review found course points outside the frame or behind sampled terrain.');
      if (item.routeVisibility?.unknown) warningSet.add('Course route visibility is incomplete because some line-of-sight DEM samples are unknown.');
      if (item.warnings.some((warning) => warning.includes('256 check limit'))) warningSet.add('Terrain path evaluation was limited to 256 checks distributed across the full route.');
    }
    if (!cameraSamplesComplete) warningSet.add('Camera path terrain sampling is incomplete.');
  }
  const stats = (sampler as TerrainSampler & { stats?: () => { tiles: number; failedTiles: number; exhausted: boolean } }).stats?.();
  if (stats?.failedTiles) warningSet.add(`${stats.failedTiles} terrain tile requests failed.`);
  if (stats?.exhausted) warningSet.add('Terrain sampling reached its tile, time, or cancellation budget.');
  const expected = selected.length * 25;
  return { version: 1, provider: 'aws-terrarium', coverage: { sampled: expected, known: centerKnown + radialKnownTotal, unknown: expected - centerKnown - radialKnownTotal, tiles: stats?.tiles ?? 0, cameraSamplesComplete, complete: selected.length > 0 && centerKnown === selected.length && radialKnownTotal === selected.length * 24 && cameraSamplesComplete && !stats?.exhausted && !stats?.failedTiles }, assumptions: { viewport: { widthPx: options.viewport?.widthPx ?? WIDTH_PX, heightPx: options.viewport?.heightPx ?? 720, verticalFovDeg: options.viewport?.verticalFovDeg ?? VERTICAL_FOV_DEG }, cameraStability, terrainExaggeration: options.viewport?.terrainExaggeration ?? EXAGGERATION, spatialElevationSmoothing: 'not-modeled' }, warnings: [...warningSet], contextFingerprint: terrainContextFingerprint(tracks, segments, routeTimingMode), moments, cameraKeyframes: { version: 1, frames } };
}

function visibleWidth(zoom: number, lat: number, widthPx: number) { return MPP_Z0 * Math.cos(clamp(lat, -85, 85) * Math.PI / 180) / 2 ** zoom * widthPx; }
async function evaluatePose(frameId: string, anchor: TerrainAnchor, coord: [number, number], bearingDeg: number, pitchDeg: number, zoom: number, sampler: TerrainSampler, viewport: NonNullable<EvaluateTerrainCameraPlanOptions['viewport']>, smoothingHalfWindow: number, cameraStability: number, signal?: AbortSignal, centerElevationMeters?: number): Promise<TerrainCameraEvaluation> {
  abort(signal);
  const widthPx = viewport.widthPx ?? WIDTH_PX, heightPx = viewport.heightPx ?? 720;
  const fovDeg = viewport.verticalFovDeg ?? VERTICAL_FOV_DEG, exaggeration = viewport.terrainExaggeration ?? EXAGGERATION;
  const center = await sampleFinite(sampler, ...coord), width = visibleWidth(zoom, coord[1], widthPx);
  const worldSizePx = 512 * 2 ** zoom;
  const metersPerPixel = (40075016.686 * Math.cos(clamp(coord[1], -85, 85) * Math.PI / 180)) / worldSizePx;
  const cameraCenterDistanceMeters = (heightPx / 2 / Math.tan((fovDeg * Math.PI / 180) / 2)) * metersPerPixel;
  const horizontalOffset = cameraCenterDistanceMeters * Math.sin(clamp(pitchDeg, 0, 85) * Math.PI / 180);
  const verticalOffset = cameraCenterDistanceMeters * Math.cos(clamp(pitchDeg, 0, 85) * Math.PI / 180);
  const cameraGroundCoord = offset(...coord, norm(bearingDeg + 180), horizontalOffset);
  const cameraGround = await sampleFinite(sampler, ...cameraGroundCoord);
  const centerElevation = centerElevationMeters !== undefined && Number.isFinite(centerElevationMeters) ? centerElevationMeters : center;
  const cameraAltitude = centerElevation !== null ? centerElevation * exaggeration + verticalOffset : null;
  const radialRelief: TerrainCameraEvaluation['radialRelief'] = [];
  for (const dir of DIRECTIONS) {
    const samples: Array<{ distanceMeters: number; elevationMeters: number | null }> = [];
    for (const d of DISTANCES) { const [lon, lat] = offset(...coord, dir, d); const e = await sampleFinite(sampler, lon, lat); samples.push({ distanceMeters: d, elevationMeters: e === null ? null : e * exaggeration }); }
    const h = samples.map((x) => x.elevationMeters).filter((x): x is number => x !== null);
    radialRelief.push({ bearingDeg: dir, samples, reliefMeters: h.length === DISTANCES.length ? Math.max(...h) - Math.min(...h) : null });
  }
  const clearanceSamples: TerrainCameraEvaluation['clearanceSamples'] = [];
  const endpoint = centerElevation === null ? null : centerElevation * exaggeration;
  const clearanceSteps = centerElevationMeters !== undefined ? [0] : Array.from({ length: 9 }, (_, i) => i);
  for (const i of clearanceSteps) {
    const t = i / 8, d = horizontalOffset * t, [lon, lat] = offset(...cameraGroundCoord, bearingDeg, d);
    const e = await sampleFinite(sampler, lon, lat);
    const sightline = cameraAltitude !== null && endpoint !== null ? cameraAltitude + (endpoint - cameraAltitude) * t : null;
    clearanceSamples.push({ distanceMeters: d, targetEndpoint: i === 8, terrainMeters: e === null ? null : e * exaggeration, sightlineMeters: sightline, clearanceMeters: e !== null && sightline !== null ? sightline - e * exaggeration : null });
  }
  const warnings: string[] = [];
  if ((centerElevationMeters === undefined && center === null) || horizontalOffset > 0 && cameraGround === null || clearanceSamples.some((x) => x.clearanceMeters === null)) warnings.push('Missing DEM samples make one or more line of sight checks unknown.');
  if (clearanceSamples.some((x) => x.clearanceMeters !== null && x.clearanceMeters < -2)) warnings.push(centerElevationMeters === undefined
    ? 'Sampled terrain intersects the estimated line of sight; adjust and review this shot visually.'
    : 'The estimated camera position intersects sampled terrain; increase camera height or adjust the framing.');
  warnings.push('Camera height, field of view, and sampled line of sight are approximate and cannot guarantee a clear view.');
  if (centerElevationMeters === undefined) warnings.push('The runtime may smooth camera center elevation over the route; this clearance estimate uses the sampled center elevation directly.');
  const knownCount = clearanceSamples.filter((x) => x.clearanceMeters !== null).length;
  const intersects = clearanceSamples.some((x) => x.clearanceMeters !== null && x.clearanceMeters < -2);
  const unknown = (centerElevationMeters === undefined && center === null) || horizontalOffset > 0 && cameraGround === null || clearanceSamples.some((x) => x.clearanceMeters === null);
  const visibility: TerrainCameraEvaluation['visibility'] = unknown ? 'unknown' : intersects ? 'intersects-sampled-terrain' : 'clear-sampled';
  const confidence = centerElevationMeters === undefined && center === null ? 0 : knownCount / clearanceSteps.length * (horizontalOffset > 0 && cameraGround === null ? 0.35 : intersects ? 0.2 : 0.75);
  return { frameId, anchor, visibility, confidence, warnings, estimate: { cameraDistanceMeters: horizontalOffset, cameraAltitudeMeters: cameraAltitude, viewportWidthMeters: width, viewportWidthPx: widthPx, viewportHeightPx: heightPx, verticalFovDeg: fovDeg, terrainExaggeration: exaggeration, cameraStability, anchorSmoothingHalfWindow: smoothingHalfWindow, pitchDeg }, radialRelief, clearanceSamples };
}

export async function evaluateTerrainCameraPlan(options: EvaluateTerrainCameraPlanOptions): Promise<TerrainCameraEvaluation[]> {
  const sampler = await resolveSampler(options), results: TerrainCameraEvaluation[] = [];
  const computed = buildComputedJourney(options.journeySegments, options.tracks);
  if (!computed) return [];
  const mode = options.routeTimingMode ?? 'recorded';
  const distanceProfile = buildJourneyDistanceProfile(computed.coordinates);
  const coordinates = buildCameraPathCoordinates(computed, distanceProfile, undefined, mode);
  const cameraStability = options.cameraStability ?? 0.5;
  const smoothingHalfWindow = cinematicAnchorSmoothingHalfWindow(cameraStability, computed.totalDuration / 1000);
  const cinematicFrames: Array<{ keyframe: CinematicCameraKeyframe; progress: number; anchor: TerrainAnchor }> = [];
  const unresolvedFrames: typeof options.frames = [];
  for (const frame of options.frames) {
    const keyframe: CinematicCameraKeyframe = { id: frame.id, title: frame.title, anchor: { routeSegmentId: frame.anchor.segmentId, routeSegmentDistance: frame.anchor.distanceMeters }, bearingDeg: frame.bearingDeg, pitchDeg: frame.pitchDeg, zoom: frame.zoom, frame: frame.frame, easing: frame.easing, target: frame.target };
    const segmentTiming = computed.segmentTimings.find((timing) => timing.segmentId === frame.anchor.segmentId);
    const track = trackFor(options.tracks, frame.anchor.trackId);
    const validOccurrence = segmentTiming?.type === 'track' && segmentTiming.trackId === frame.anchor.trackId
      && track !== undefined && Number.isFinite(frame.anchor.distanceMeters)
      && frame.anchor.distanceMeters >= 0 && frame.anchor.distanceMeters <= track.totalDistance;
    const progress = validOccurrence ? deriveCinematicKeyframeProgress(keyframe.anchor, computed.segmentTimings, computed.coordinates, mode) : null;
    if (progress !== null) cinematicFrames.push({ keyframe, progress, anchor: frame.anchor });
    else unresolvedFrames.push(frame);
  }
  const prepared = prepareCinematicKeyframeTrack(cinematicFrames, coordinates);
  const unresolvedResults: TerrainCameraEvaluation[] = unresolvedFrames.map((frame) => ({ frameId: frame.id, phase: 'keyframe', confidence: 0, visibility: 'unknown', warnings: ['Anchor does not resolve to a current track segment occurrence.'], anchor: frame.anchor, estimate: { cameraDistanceMeters: 0, cameraAltitudeMeters: null, viewportWidthMeters: 0, viewportWidthPx: options.viewport?.widthPx ?? WIDTH_PX, viewportHeightPx: options.viewport?.heightPx ?? 720, verticalFovDeg: options.viewport?.verticalFovDeg ?? VERTICAL_FOV_DEG, terrainExaggeration: options.viewport?.terrainExaggeration ?? EXAGGERATION, cameraStability, anchorSmoothingHalfWindow: smoothingHalfWindow, pitchDeg: frame.pitchDeg }, radialRelief: [], clearanceSamples: [] }));
  const poseEvaluationCache = new Map<string, TerrainCameraEvaluation>();
  const routePointsCache = new Map<string, RouteCompositionPoint[]>();
  const routeVisibilityCache = new Map<string, Awaited<ReturnType<typeof evaluateRouteVisibility>>>();
  const checkPoseAt = async (progress: number, anchor: TerrainAnchor, id: string, phase: 'keyframe' | 'transition') => {
    const pose = getCinematicCameraPose({ keyframes: prepared, coordinates, progress, routeHeadingDeg: getRouteBearingAtProgress(coordinates, progress) });
    if (!pose) return;
    const cameraCenter = pose.centerElevationMeters === undefined ? getSmoothedCameraAnchor({ coordinates, progress, smoothingHalfWindow, markerPosition: pose.center, zoom: pose.zoom }) : pose.center;
    const cacheKey = [cameraCenter[0], cameraCenter[1], pose.centerElevationMeters ?? '', pose.bearing, pose.pitch, pose.zoom].map(value => typeof value === 'number' ? value.toFixed(6) : value).join('|');
    let checked = poseEvaluationCache.get(cacheKey);
    if (!checked) {
      checked = await evaluatePose(id, anchor, cameraCenter, pose.bearing, pose.pitch, pose.zoom, sampler, options.viewport ?? {}, smoothingHalfWindow, cameraStability, options.signal, pose.centerElevationMeters);
      poseEvaluationCache.set(cacheKey, checked);
    }
    const activeSegment = getSegmentAtProgress(progress, computed.segmentTimings)?.segment;
    const activeTrack = activeSegment?.type === 'track' && activeSegment.trackId ? trackFor(options.tracks, activeSegment.trackId) : undefined;
    let routeVisibility: Awaited<ReturnType<typeof evaluateRouteVisibility>> | undefined;
    if (activeTrack) {
      const routeCacheKey = `${cacheKey}|${activeTrack.id}`;
      routeVisibility = routeVisibilityCache.get(routeCacheKey);
      if (!routeVisibility) {
        let points = routePointsCache.get(activeTrack.id);
        if (!points) {
          points = routePointsFor(activeTrack);
          for (const point of points) {
            abort(options.signal);
            point.elevationMeters = await sampleFinite(sampler, point.lon, point.lat);
          }
          routePointsCache.set(activeTrack.id, points);
        }
        const evaluatedCenterElevation = pose.centerElevationMeters ?? await sampleFinite(sampler, cameraCenter[0], cameraCenter[1])
          ?? getJourneyPointAtProgress(progress, computed.coordinates, computed.segmentTimings)?.elevation ?? 0;
        routeVisibility = await evaluateRouteVisibility(points, { target: { lon: cameraCenter[0], lat: cameraCenter[1], elevationMeters: evaluatedCenterElevation }, bearingDeg: pose.bearing, pitchDeg: pose.pitch, zoom: pose.zoom }, {
          widthPx: options.viewport?.widthPx ?? WIDTH_PX, heightPx: options.viewport?.heightPx ?? 720,
          verticalFovDeg: options.viewport?.verticalFovDeg ?? VERTICAL_FOV_DEG, terrainExaggeration: options.viewport?.terrainExaggeration ?? EXAGGERATION,
        }, sampler, options.signal);
        routeVisibilityCache.set(routeCacheKey, routeVisibility);
      }
    }
    const warnings = [...checked.warnings];
    let confidence = checked.confidence, visibility = checked.visibility;
    if (routeVisibility) {
      if (!routeVisibility.startInFrame) warnings.push('The active course start is outside the camera frame.');
      else if (routeVisibility.startOccluded) warnings.push('Sampled terrain occludes the active course start from this camera position.');
      else if (routeVisibility.startUnknown) warnings.push('Active course start line of sight is unknown because DEM samples are incomplete.');
      if ((routeVisibility.coverage ?? 0) < 0.8) warnings.push('The active course is not fully visible in the camera frame.');
      if (routeVisibility.unknown > 0) warnings.push('Route line-of-sight checks include unknown DEM samples; unknown terrain was not treated as visible.');
      confidence = Math.min(confidence, (routeVisibility.coverage ?? 0) * (routeVisibility.unknown > 0 ? 0.45 : 0.9) * (routeVisibility.startVisible ? 1 : 0.5));
      if (routeVisibility.unknown > 0) visibility = 'unknown';
      else if (routeVisibility.startOccluded || (routeVisibility.coverage ?? 0) < 0.8) visibility = 'intersects-sampled-terrain';
    }
    results.push({ ...checked, frameId: id, anchor, phase, progress, confidence, visibility, warnings: [...new Set(warnings)], ...(routeVisibility ? { routeVisibility } : {}) });
  };
  // Keep a bounded, evenly distributed set of terrain checks over the entire camera path.
  // Endpoint checks are explicit because playback holds the first and last pose outside the keys.
  const sorted = [...cinematicFrames].sort((a, b) => a.progress - b.progress);
  if (options.frames.length === 0) return [];
  type ScheduledCheck = { progress: number; anchor: TerrainAnchor; id: string; phase: 'keyframe' | 'transition' };
  const keyChecks: ScheduledCheck[] = sorted.map((item) => ({ progress: item.progress, anchor: item.anchor, id: item.keyframe.id, phase: 'keyframe' }));
  const eps = 1e-9;
  const endpointChecks: ScheduledCheck[] = [];
  const startKey = keyChecks.find((check) => Math.abs(check.progress) <= eps);
  const endKey = keyChecks.find((check) => Math.abs(check.progress - 1) <= eps);
  if (!startKey) endpointChecks.push({ progress: 0, anchor: sorted[0]?.anchor ?? options.frames[0].anchor, id: 'route-start', phase: 'transition' });
  if (!endKey) endpointChecks.push({ progress: 1, anchor: sorted[sorted.length - 1]?.anchor ?? options.frames[0].anchor, id: 'route-end', phase: 'transition' });
  const endpointKeys = [startKey, endKey].filter((check): check is ScheduledCheck => check !== undefined);
  const otherKeys = keyChecks.filter((check) => check !== startKey && check !== endKey);
  const transitions: ScheduledCheck[] = [];
  let intervalLimited = false;
  const addInterval = (lower: number, upper: number, anchor: TerrainAnchor, prefix: string) => {
    const span = upper - lower;
    if (span <= eps) return;
    const durationUpper = computed.totalDuration / 1000 * span;
    const distanceUpper = computed.totalDistance * span;
    const requestedCount = Math.max(3, Math.ceil(durationUpper / 2) - 1, Math.ceil(distanceUpper / 150) - 1);
    intervalLimited ||= requestedCount > 256;
    const count = Math.min(256, requestedCount);
    for (let i = 1; i <= count; i++) transitions.push({ progress: lower + span * i / (count + 1), anchor, id: `${prefix}-transition-${i}`, phase: 'transition' });
  };
  if (sorted.length) {
    if (sorted[0].progress > eps) addInterval(0, sorted[0].progress, sorted[0].anchor, 'intro');
    for (let i = 0; i < sorted.length - 1; i++) addInterval(sorted[i].progress, sorted[i + 1].progress, sorted[i + 1].anchor, `${sorted[i].keyframe.id}-${sorted[i + 1].keyframe.id}`);
    if (sorted[sorted.length - 1].progress < 1 - eps) addInterval(sorted[sorted.length - 1].progress, 1, sorted[sorted.length - 1].anchor, 'outro');
  }
  const cap = 256;
  const evenSample = <T,>(items: T[], count: number): T[] => {
    if (count >= items.length) return items;
    if (count <= 0) return [];
    if (count === 1) return [items[Math.floor((items.length - 1) / 2)]];
    return Array.from({ length: count }, (_, i) => items[Math.round(i * (items.length - 1) / (count - 1))]);
  };
  const available = Math.max(0, cap - Math.min(cap, unresolvedResults.length));
  const requiredEndpoints = [...endpointChecks, ...endpointKeys].sort((a, b) => a.progress - b.progress);
  const reservedEndpoints = evenSample(requiredEndpoints, Math.min(requiredEndpoints.length, available));
  let budget = available - reservedEndpoints.length;
  // Preserve all authored poses when possible. If an imported plan exceeds the cap,
  // sample its keys across the timeline before spending the remaining budget on transitions.
  const selectedKeys = evenSample(otherKeys, Math.min(otherKeys.length, budget));
  budget -= selectedKeys.length;
  const selectedTransitions = evenSample(transitions.sort((a, b) => a.progress - b.progress), Math.min(transitions.length, budget));
  const scheduled = [...reservedEndpoints, ...selectedKeys, ...selectedTransitions].sort((a, b) => a.progress - b.progress);
  const limited = intervalLimited || unresolvedResults.length + requiredEndpoints.length + otherKeys.length + transitions.length > cap;
  const capWarning = 'Terrain evaluation reached the 256 check limit; checks were distributed across the full route.';
  for (const check of scheduled) {
    abort(options.signal);
    await checkPoseAt(check.progress, check.anchor, check.id, check.phase);
  }
  if (limited) for (const result of [...results, ...unresolvedResults]) result.warnings.push(capWarning);
  return [...unresolvedResults.slice(0, cap), ...results.slice(0, Math.max(0, cap - unresolvedResults.length))];
}
