/**
 * Scales a stability-tuned setting (0-1, where 0.5 matches the values tuned
 * below) into a multiplier applied to smoothing speed and deadbands. 0 = very
 * stable (quarter speed, wider deadbands), 1 = very reactive (1.75x speed,
 * narrower deadbands).
 */
export function cameraReactivityFromStability(cameraStability: number): number {
  const safeValue = Number.isFinite(cameraStability) ? cameraStability : 0.5;
  const clamped = Math.max(0, Math.min(1, safeValue));
  return 0.25 + clamped * 1.5;
}

/**
 * Authored cinematic keyframes already define a smooth pose and must be
 * followed exactly. Cinematic mode without keyframes uses the procedural,
 * terrain-aware fallback, whose changing zoom/pitch still needs the same
 * stabilization as follow-behind.
 */
export function shouldBypassProceduralCameraSmoothing(
  cameraMode: 'overview' | 'follow' | 'follow-behind' | 'cinematic',
  cinematicKeyframeCount: number,
): boolean {
  return cameraMode === 'follow' || (cameraMode === 'cinematic' && cinematicKeyframeCount > 0);
}

/**
 * Widest the cinematic anchor smoothing window goes, in seconds of video
 * either side. Deliberately generous: a window this wide would lose the
 * marker on its own, and is only safe because the anchor is bounded against
 * the marker afterwards (see cinematicCameraAnchor.ts). The bound is what
 * lets the stable end of the slider be genuinely stable.
 */
const MAX_ANCHOR_SMOOTHING_SECONDS = 5;

/**
 * Narrowest it goes. Not zero: even at the reactive end a little smoothing
 * costs nothing on a straight run (a symmetric average of a straight line is
 * that line) while still taking the edge off single-sample GPS noise.
 */
const MIN_ANCHOR_SMOOTHING_SECONDS = 0.12;

/**
 * Half-width of the cinematic camera's anchor smoothing window, as a fraction
 * of the whole replay.
 *
 * This is the one dial cinematic mode has. The window is set in seconds of
 * *video* rather than metres of route, because that is what decides whether a
 * switchback is a shake or a move: the same 200 m hairpin is a fifth of a
 * second on a 206 km clip and eight seconds on a 1.7 km one, and only the
 * first should be smoothed away. `cameraPathCoordinates` is resampled evenly
 * in replay time, so seconds convert straight into a fraction of it.
 *
 * The stable half of the slider ramps in faster than linearly, so most of the
 * travel is spent in the range where the difference is visible rather than
 * crawling toward a window nobody uses.
 */
export function cinematicAnchorSmoothingHalfWindow(
  cameraStability: number,
  clipDurationSeconds: number,
): number {
  if (!Number.isFinite(clipDurationSeconds) || clipDurationSeconds <= 0) return 0;

  const safeValue = Number.isFinite(cameraStability) ? cameraStability : 0.5;
  const stability = 1 - Math.max(0, Math.min(1, safeValue));
  const seconds =
    MIN_ANCHOR_SMOOTHING_SECONDS +
    (MAX_ANCHOR_SMOOTHING_SECONDS - MIN_ANCHOR_SMOOTHING_SECONDS) * Math.pow(stability, 1.5);

  return seconds / clipDurationSeconds;
}

/**
 * Half the separation between the two readings a route-framed shot takes its
 * heading from, as a fraction of the whole replay.
 *
 * Wider than the smoothing window on purpose. Smoothing decides how much of a
 * hairpin survives in the *position*; this decides how much of it survives in
 * the *direction*, and a heading is far more sensitive — a chord across half a
 * switchback points somewhere the route never goes. Measuring across several
 * seconds of video reports the line of the valley instead.
 */
export function cinematicHeadingBaselineHalfWidth(smoothingHalfWindow: number): number {
  return Math.max(smoothingHalfWindow * 2, 0);
}

/**
 * Controls how closely the camera centre chases the moving route marker.
 *
 * The middle of the slider preserves the original 100ms follow camera. Moving
 * toward reactive shortens that delay a little, while the stable half ramps
 * non-linearly into a long, floating camera move. The squared curve keeps the
 * familiar behaviour around the default but makes the far-left endpoint a
 * deliberate cinematic mode instead of merely a wider bearing deadband.
 */
export function cameraCenterChaseDurationFromStability(cameraStability: number): number {
  const safeValue = Number.isFinite(cameraStability) ? cameraStability : 0.5;
  const clamped = Math.max(0, Math.min(1, safeValue));

  if (clamped < 0.5) {
    const cinematicAmount = (0.5 - clamped) / 0.5;
    return 100 + 800 * cinematicAmount * cinematicAmount;
  }

  const reactiveAmount = (clamped - 0.5) / 0.5;
  return 100 - 45 * reactiveAmount;
}

/**
 * The smoothing constants below are per-call caps on how far the camera may
 * move. They were tuned against live playback, which updates the camera once
 * per rendered animation frame at roughly this interval. Deterministic video
 * export instead calls the smoothing functions once per *encoded* frame, so a
 * 30fps export calls them half as often as a 60fps export over the same
 * clip — without correcting for that, the exact same route plays back with
 * half the camera movement at 30fps and double at 60fps. Callers should scale
 * the elapsed *simulated playback time* between calls (not wall-clock time)
 * against this reference to keep the camera's real-world speed constant
 * regardless of frame rate. Wall-clock time doesn't work for this: during
 * deterministic export, playback time advances by a fixed step per encoded
 * frame independent of how long that frame actually takes to render.
 */
export const CAMERA_SMOOTHING_REFERENCE_FRAME_MS = 1000 / 60;

export function frameTimeMultiplierFromDeltaMs(deltaMs: number): number {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return 1;
  // Clamp so a stalled tab or a very low export fps can't make a single call
  // fling the camera across a huge jump; it just catches up over a couple of
  // extra calls instead, which stays smooth since every step still eases
  // toward the same target pose.
  const clampedDeltaMs = Math.min(deltaMs, CAMERA_SMOOTHING_REFERENCE_FRAME_MS * 4);
  return clampedDeltaMs / CAMERA_SMOOTHING_REFERENCE_FRAME_MS;
}

/**
 * `reactivity` below 1 (the tuned baseline) used to also throttle how fast
 * the bearing may *turn*, on top of widening the deadband. At the lowest
 * stability setting (reactivity 0.25) that made turning ~4x slower than
 * baseline, and on a curvy route the camera's facing direction permanently
 * fell behind the route's real heading — instead of a chase camera looking
 * behind the marker, it read as a near-static view just watching the marker
 * drift through frame, because the direction it faced barely followed real
 * turns. Widening the deadband is the actual point of lowering stability
 * (ignore more GPS jitter); slowing the turn rate this much was an
 * unintended side effect of reusing the same multiplier for both. Only
 * soften the slowdown below the baseline, and leave reactivity >= 1 (the
 * "more reactive" half) and the deadband untouched.
 */
function bearingTurnReactivity(reactivity: number): number {
  return reactivity >= 1 ? reactivity : 1 - (1 - reactivity) * 0.5;
}

/**
 * How far the jitter deadband may widen as stability increases.
 *
 * The deadband is a dead zone: inside it the camera holds a fixed heading and
 * does not move at all. Scaling it by the full inverse of reactivity made the
 * most stable setting a 16 degree dead zone, and measuring a real replay there
 * showed the camera frozen for 84% of frames — in stretches averaging over
 * three seconds — then swinging through the whole banked-up error in about
 * half a second once the route finally escaped the zone. Stop-and-go is the
 * opposite of what the stable end of the slider is for.
 *
 * Cap the widening and let the slower turn rate carry the smoothing instead. A
 * slow continuous approach rejects the same GPS jitter by simply not being
 * able to react to it, and it keeps the camera always gently moving.
 */
const MAX_BEARING_DEADBAND_SCALE = 1.5;

function bearingDeadbandScale(reactivity: number): number {
  return reactivity >= 1 ? 1 / reactivity : Math.min(MAX_BEARING_DEADBAND_SCALE, 1 / reactivity);
}

/**
 * Route samples either side of the marker whose terrain heights are averaged
 * into the camera's look-at height.
 *
 * The centre elevation used to be whatever `queryTerrainElevation` returned
 * directly under the marker on that frame. At this compression a single frame
 * advances tens of metres of ground, so the camera hugged every hummock in the
 * terrain mesh: measured on a real replay the look-at height changed on *every*
 * frame, reversed direction over a thousand times in one clip, and moved a
 * median of 3.6 m (99th percentile 28 m) per frame. In a pitched view that
 * vertical bob reads as the picture pumping in and out.
 *
 * Averaging over a span of route rather than lagging in time is what makes this
 * safe. A time lag would smooth the bumps but also sit permanently behind on
 * every sustained climb — and these routes climb hundreds of metres per second
 * of video, which is enough to walk the marker out of frame. The mean of a
 * straight slope is exactly its midpoint value, so a symmetric spatial average
 * introduces no offset at all on constant gradient; it only removes the
 * roughness riding on top.
 *
 * The camera path is always resampled to a fixed number of points
 * (`cameraPathCoordinates`), so a span measured in samples covers the same
 * fraction of the replay — and so the same amount of screen motion — whether
 * the route is 10 km or 200 km.
 *
 * Width matters as much as symmetry. Those 601 samples work out at about six
 * rendered frames apart, so the first version of this — two samples either
 * side — averaged over barely a fifth of a second of video and left plenty of
 * bob behind. This spans eight either side, a little over a second of video,
 * which is long enough to flatten the undulations while still following the
 * shape of the ground. They are spaced two apart rather than packed together
 * because the width of the window does the smoothing; extra samples inside it
 * would only cost terrain lookups per frame.
 */
export const TERRAIN_SAMPLE_INDEX_OFFSETS = [-8, -6, -4, -2, 0, 2, 4, 6, 8] as const;

/**
 * Ceiling on how fast the look-at height may move, in metres per second of
 * playback time.
 *
 * Terrain tiles refining mid-flight change what `queryTerrainElevation` reports
 * from one frame to the next — the raw signal contained single-frame jumps of
 * over 900 m. Real ground under these replays moves at a few hundred metres per
 * second of video at most, so a limit set well above that never binds on
 * genuine terrain and exists purely to absorb those artefacts.
 */
export const MAX_CENTER_ELEVATION_RATE_M_PER_S = 400;

/**
 * Limits how far a value may move this frame, given how much playback time has
 * elapsed. Unlike a smoothing filter this does not lag a signal that stays
 * inside the limit — it only clips excursions that exceed it.
 */
export function limitRateOfChange(
  current: number,
  target: number,
  deltaMs: number,
  maxRatePerSecond: number,
): number {
  if (!Number.isFinite(current)) return target;
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return target;

  const maxChange = (maxRatePerSecond * deltaMs) / 1000;
  const diff = target - current;
  if (Math.abs(diff) <= maxChange) return target;
  return current + Math.sign(diff) * maxChange;
}

export function smoothBearing(
  currentBearing: number,
  targetBearing: number,
  smoothingFactor: number = 0.03,
  stabilityDeadbandDegrees: number = 4,
  reactivity: number = 1,
  frameTimeMultiplier: number = 1,
): number {
  let diff = targetBearing - currentBearing;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;

  // GPS traces frequently oscillate by a few degrees on an otherwise straight
  // section. At a close, pitched camera angle those tiny corrections read as
  // distracting side-to-side camera movement. Keep the current heading until
  // the route has made a meaningful turn; larger turns still take the normal
  // smooth, shortest-path transition below. A lower reactivity widens this
  // deadband (more stable); a higher one narrows it (more responsive), though
  // the widening is capped so the stable end glides rather than sticking and
  // slipping — see bearingDeadbandScale. This threshold is about ignoring GPS
  // jitter, not about frame rate, so it is deliberately left unscaled by
  // frameTimeMultiplier.
  const deadband = stabilityDeadbandDegrees * bearingDeadbandScale(reactivity);
  if (Math.abs(diff) < deadband) {
    return (currentBearing + 360) % 360;
  }

  // Keep sharp switchbacks cinematic rather than snapping the view sideways.
  const speed = bearingTurnReactivity(reactivity) * frameTimeMultiplier;
  const maxChange = 0.85 * speed;
  const change = Math.max(-maxChange, Math.min(maxChange, diff * smoothingFactor * speed));

  return (currentBearing + change + 360) % 360;
}

/**
 * Smooths the terrain-aware follow-camera zoom without letting minor elevation
 * estimate changes make the view pulse. Zooming in is deliberately slower than
 * zooming out: opening the frame quickly preserves a safe view of the marker
 * when the route enters steeper terrain.
 */
export function smoothZoom(
  currentZoom: number,
  targetZoom: number,
  smoothingFactor: number = 0.12,
  // Wide enough that the terrain estimate drifting by a fraction of a zoom
  // level leaves the framing alone entirely. A camera that is always creeping
  // toward a slightly different zoom never looks settled, and on a long route
  // the terrain under the marker changes constantly.
  stabilityDeadband: number = 0.1,
  reactivity: number = 1,
  frameTimeMultiplier: number = 1,
): number {
  const diff = targetZoom - currentZoom;

  const deadband = stabilityDeadband / reactivity;
  if (Math.abs(diff) < deadband) {
    return currentZoom;
  }

  const speed = reactivity * frameTimeMultiplier;
  const maxChange = (diff < 0 ? 0.12 : 0.035) * speed;
  const change = Math.max(-maxChange, Math.min(maxChange, diff * smoothingFactor * speed));

  return currentZoom + change;
}

/**
 * Low-pass filters the requested zoom before `smoothZoom` moves the camera.
 * Terrain protection can alternate between nearby targets on rolling ground;
 * smoothing only the camera pose still makes it reverse direction every time
 * that target changes. Cinematic mode therefore adds target hysteresis and an
 * asymmetric response: it opens the frame when needed, but returns to a close
 * shot much more slowly. The default and reactive half remain unchanged.
 */
export function smoothZoomTarget(
  currentTarget: number,
  nextTarget: number,
  deltaMs: number,
  cameraStability: number,
): number {
  const safeStability = Number.isFinite(cameraStability) ? cameraStability : 0.5;
  const clampedStability = Math.max(0, Math.min(1, safeStability));
  const cinematicPosition = Math.max(0, (0.5 - clampedStability) / 0.5);
  const cinematicAmount = cinematicPosition * cinematicPosition;

  if (cinematicAmount === 0 || !Number.isFinite(deltaMs) || deltaMs <= 0) {
    return nextTarget;
  }

  const difference = nextTarget - currentTarget;
  const deadband = 0.035 + 0.265 * cinematicAmount;
  if (Math.abs(difference) <= deadband) return currentTarget;

  const openingFrame = difference < 0;
  const responseDurationMs = openingFrame
    ? 100 + 1_100 * cinematicAmount
    : 100 + 4_900 * cinematicAmount;
  const interpolation = 1 - Math.exp(-deltaMs / responseDurationMs);

  return currentTarget + difference * interpolation;
}

/**
 * Keeps terrain protection from visibly tilting the horizon in steps. Reducing
 * pitch opens the view, so that safety adjustment is allowed to happen faster
 * than pitching back down into a close cinematic angle.
 */
export function smoothPitch(
  currentPitch: number,
  targetPitch: number,
  smoothingFactor: number = 0.12,
  stabilityDeadband: number = 0.35,
  reactivity: number = 1,
  frameTimeMultiplier: number = 1,
): number {
  const diff = targetPitch - currentPitch;

  const deadband = stabilityDeadband / reactivity;
  if (Math.abs(diff) < deadband) {
    return currentPitch;
  }

  const speed = reactivity * frameTimeMultiplier;
  const maxChange = (diff < 0 ? 0.6 : 0.22) * speed;
  const change = Math.max(-maxChange, Math.min(maxChange, diff * smoothingFactor * speed));

  return currentPitch + change;
}

/**
 * Chases a target lng/lat the way MapLibre's `easeTo({ duration })` would if
 * retriggered every frame with a slowly moving target: each call advances by
 * the fraction of `chaseDurationMs` that has elapsed, so repeated calls trace
 * out the same decaying-lag path.
 *
 * Live playback used to get this lag "for free" from calling
 * `map.easeTo({ center, duration: 100 })` every animation frame — a fresh
 * 100ms linear ease queued on top of whatever ease was already in flight,
 * which averages out route/GPS jitter into a smooth pan. Deterministic export
 * instead has to render a fully-settled pose before every encoded frame (a
 * mid-ease frame would bake motion blur into a still image), so it applies
 * poses with `jumpTo` — which skipped this lag entirely and let every bit of
 * jitter in `currentPosition` show up directly, making the exported camera
 * visibly twitchier than the live preview of the exact same replay. Computing
 * the same lag by hand and passing the result to `jumpTo` in both places
 * keeps them visually identical while still letting export capture a
 * fully-settled frame each time.
 */
export function smoothCoordinate(
  current: [number, number],
  target: [number, number],
  deltaMs: number,
  chaseDurationMs: number = 100,
): [number, number] {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return target;

  const t = Math.min(1, deltaMs / chaseDurationMs);
  return [
    current[0] + (target[0] - current[0]) * t,
    current[1] + (target[1] - current[1]) * t,
  ];
}

export const TERRAIN_CAMERA_SETTINGS = {
  ELEVATION_RISK_METERS: 1200,
  STEEPNESS_RISK_FACTOR: 18,
  /**
   * Half-width of the terrain window, as a fraction of playback progress.
   *
   * This is what sets how fast the zoom target may change, so it is the knob
   * that decides whether the framing reads as settled. It is deliberately wide:
   * on a rolling 11 km route a narrower window let the target reverse direction
   * 17 times a minute, and the only thing hiding that was the widened deadband
   * at the most stable slider position — at the default position the camera
   * visibly pumped. Sizing the window so the *target* is calm fixes it for
   * every slider position instead of relying on the smoothing to mask it.
   *
   * Being a fraction of progress, this is also a duration: a camera move takes
   * a comparable slice of the video whatever the route's length.
   */
  LOOK_AHEAD_PROGRESS: 0.15,
  /**
   * Sustained gradient (metres climbed per metre travelled) that justifies the
   * full pull-back. A replay camera loses its subject on *steep* ground, and
   * steepness is a ratio — so this threshold means the same thing on a 5 km
   * hill repeat and on a 200 km alpine tour.
   */
  FULL_RISK_GRADIENT: 0.12,
  /**
   * Shortest span a single gradient sample may be measured over. GPS elevation
   * noise of a couple of metres between samples recorded ~20 m apart reads as a
   * 10% slope; averaging over at least this much travel keeps the measurement
   * about the terrain rather than about the noise.
   */
  MIN_GRADIENT_SPAN_METERS: 200,
  /**
   * The altitude term is a scene-scaling hint, not the safety mechanism: the
   * playback camera pins its centre to the terrain surface via
   * `setCenterElevation`, which is what actually keeps a climbing marker in
   * frame. Weighted below the steepness term so a route that repeatedly drops
   * into valleys and climbs back out doesn't re-frame on every col.
   */
  ELEVATION_RISK_WEIGHT: 0.5,
  /**
   * Total zoom the terrain protection may spend.
   *
   * Kept small because this is not the mechanism that keeps the marker framed —
   * the playback camera pins its centre to the terrain surface, and the pitch
   * allowance below does the anti-occlusion work. What a large budget mostly
   * buys is a visible change of framing partway through a replay, which reads
   * as the camera pumping even when it moves monotonically.
   */
  MAX_ZOOM_OUT: 0.8,
  /**
   * Pitch allowed to flatten for terrain, in degrees.
   *
   * Cut hard from 15, for the same reason the zoom budget was cut, and then
   * some: pitch was by far the most sensitive channel to leftover wobble in the
   * terrain reading. Both channels are driven by the same risk value, but a
   * budget of 15 against a 1.4 degree deadband made pitch roughly five times
   * more reactive to it than zoom is to its own. Measured on two real routes at
   * maximum stability, the risk drifting between 0.36 and 0.70 moved the zoom
   * 0.27 — entirely swallowed by its deadband, nothing rendered — while moving
   * the pitch 5 degrees, of which 3.6 to 4.9 rendered. Tilting the camera
   * changes how much ground fills the frame, so that reads as the picture
   * slowly breathing in and out, which is exactly the symptom on routes with a
   * lot of elevation change.
   *
   * A budget this small still flattens the view on genuinely steep ground, but
   * cannot be moved by ordinary variation in the terrain reading. As with zoom,
   * this is not the mechanism keeping the marker framed — `setCenterElevation`
   * pinning the look-at point to the terrain surface is.
   */
  MAX_PITCH_REDUCE: 4,
  MIN_ZOOM: 8,
  MAX_ZOOM: 14,
  MIN_PITCH: 15,
  MAX_PITCH: 50,
} as const;

/**
 * Mean absolute gradient across a span of the route, or `null` when the samples
 * carry no usable distances (in which case the caller falls back to comparing
 * raw elevations).
 *
 * Gradient rather than raw elevation change is the whole point: the window is
 * sized as a fraction of *playback progress* so a camera move takes a couple of
 * seconds of video regardless of the route, but that means the window spans a
 * few hundred metres of a short route and several kilometres of a long one. An
 * elevation *delta* measured that way is really measuring route length, and on
 * a long route it saturates any sane threshold on every single climb. A
 * gradient divides that delta by the distance it was gained over, so the same
 * terrain reads the same on any route.
 */
function meanAbsoluteGradient(
  elevationData: Array<{ elevation: number; distance?: number }>,
  startIndex: number,
  endIndex: number,
): number | null {
  const minSpan = TERRAIN_CAMERA_SETTINGS.MIN_GRADIENT_SPAN_METERS;
  let gradientSum = 0;
  let sampleCount = 0;
  let spanStart = startIndex;

  for (let index = startIndex + 1; index <= endIndex; index++) {
    const from = elevationData[spanStart];
    const to = elevationData[index];
    if (!from || !to) continue;
    if (!Number.isFinite(from.distance) || !Number.isFinite(to.distance)) return null;

    const run = (to.distance as number) - (from.distance as number);
    if (run < minSpan) continue;

    const rise = to.elevation - from.elevation;
    if (Number.isFinite(rise) && run > 0) {
      gradientSum += Math.abs(rise) / run;
      sampleCount++;
    }
    spanStart = index;
  }

  return sampleCount > 0 ? gradientSum / sampleCount : null;
}

export function calculateTerrainAwareAdjustments(
  elevation: number,
  elevationData: Array<{ elevation: number; distance?: number; progress?: number }>,
  currentProgress: number
): { zoomAdjust: number; pitchAdjust: number } {
  // Absolute altitude is not what makes a replay camera lose its subject. The
  // problem is the climb relative to this route's lowest section: a track that
  // starts at sea level and climbs 1,500 m needs more room, while a flat route
  // entirely at 1,500 m does not. This also keeps the selected close framing at
  // the start of an alpine route and expands it progressively on the climb.
  const finiteElevations = elevationData
    .map((sample) => sample.elevation)
    .filter(Number.isFinite);
  const routeBaseElevation = finiteElevations.length > 0
    ? Math.min(...finiteElevations)
    : elevation;
  const relativeElevation = Math.max(0, elevation - routeBaseElevation);
  const elevationRisk = Math.min(
    relativeElevation / TERRAIN_CAMERA_SETTINGS.ELEVATION_RISK_METERS,
    1,
  );

  let steepnessRisk = 0;
  if (elevationData.length > 2) {
    const lookAhead = TERRAIN_CAMERA_SETTINGS.LOOK_AHEAD_PROGRESS;
    const behindIdx = Math.max(0, Math.floor((currentProgress - lookAhead) * (elevationData.length - 1)));
    const aheadIdx = Math.min(elevationData.length - 1, Math.floor((currentProgress + lookAhead) * (elevationData.length - 1)));
    const gradient = meanAbsoluteGradient(elevationData, behindIdx, aheadIdx);

    if (gradient !== null) {
      steepnessRisk = Math.min(gradient / TERRAIN_CAMERA_SETTINGS.FULL_RISK_GRADIENT, 1);
    } else {
      // No distances to divide by (synthetic data, or a track recorded without
      // them): fall back to the raw elevation change across the window.
      const behindElev = elevationData[behindIdx]?.elevation || elevation;
      const aheadElev = elevationData[aheadIdx]?.elevation || elevation;
      const elevChange = Math.abs(aheadElev - behindElev);
      steepnessRisk = Math.min((elevChange / 100) * TERRAIN_CAMERA_SETTINGS.STEEPNESS_RISK_FACTOR / 100, 1);
    }
  }

  const combinedRisk = Math.max(
    elevationRisk * TERRAIN_CAMERA_SETTINGS.ELEVATION_RISK_WEIGHT,
    steepnessRisk,
  );

  return {
    zoomAdjust: combinedRisk * TERRAIN_CAMERA_SETTINGS.MAX_ZOOM_OUT,
    pitchAdjust: combinedRisk * TERRAIN_CAMERA_SETTINGS.MAX_PITCH_REDUCE,
  };
}
