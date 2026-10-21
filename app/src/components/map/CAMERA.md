# The replay camera

Notes for anyone — human or agent — changing how the follow camera moves.

Camera work is unusually easy to get wrong because the thing you are tuning
(does it *feel* smooth?) is subjective, while the thing you can change is a pile
of constants. The way to stay honest is to measure the camera per frame and look
at distributions, not to stare at the replay and adjust numbers. Every fix
described below started as a measurement that contradicted an intuition.

## Where the motion comes from

Per playback frame, `useTrailPlaybackCamera` assembles a pose and applies it with
a single `jumpTo`. Five channels move independently:

| Channel | Target from | Smoothed by |
|---|---|---|
| bearing | `getRouteBearingAtProgress` (`replayCameraPlan.ts`) — averaged at both ends | `smoothBearing` |
| zoom | preset − terrain pull-back (`calculateTerrainAwareAdjustments`) | `smoothZoom` |
| pitch | preset − terrain pull-back (same) | `smoothPitch` |
| centre lng/lat | the marker's interpolated position | `smoothCoordinate` |
| centre elevation | `queryTerrainElevation`, averaged along the route | rate limit only |

`jumpTo` is deliberate — not `easeTo`. Deterministic export must render a fully
settled pose per encoded frame, so all easing is computed by hand and both live
playback and export apply identical values the same way. **If you introduce
smoothing that relies on MapLibre's own animation, you break export.**

## Invariants

Do not regress these. Each has cost real debugging time.

1. **The marker stays in frame.** Not "usually" — measure it (see below) and
   expect zero off-screen frames during steady playback.
2. **Live preview and export match.** Anything time-based must key off
   `currentTimeMs` (simulated playback time), never wall-clock. Export advances
   playback time by a fixed step per encoded frame regardless of how long the
   frame took to render, so wall-clock time is meaningless there.
3. **Frame-rate independence.** The smoothing helpers cap movement *per call*.
   Scale by `frameTimeMultiplierFromDeltaMs(deltaMs)` or a 30fps export moves
   the camera half as far as a 60fps one over the same clip.
4. **Route-length independence.** See below — this is the subtle one.

## The compression ratio governs everything

A 206 km route rendered as a 60 s video advances **3.4 km of ground per second
of video**, or ~57 m per frame. The same code on a 10 km route advances 2.8 m per
frame. Any quantity you express in metres therefore means something completely
different on different routes, and any quantity you express as a fraction of
progress means something different again.

The rule that falls out of this:

- **Pacing** (how long a camera move takes) belongs in *progress / video time*.
  A move should take a couple of seconds of video whatever the route.
- **Terrain judgements** belong in *dimensionless ratios* (gradients), never raw
  metres, because the window they are measured over scales with route length.

Concrete example of getting this wrong: `steepnessRisk` used to be the raw
elevation *change* across ±2% of progress. On a 206 km route that window spans
±4.1 km of the Pyrenees, so it saturated its threshold on every climb *and* every
descent, and the zoom target reversed direction 29 times per minute. The fix was
not a bigger threshold — it was dividing by the distance the elevation was gained
over, turning it into a gradient.

## Three failure modes, and why the obvious fix is wrong

### 1. A wide deadband is not "more stable" — it is stick-slip

Deadbands were scaled by the full inverse of reactivity, so the most stable
setting got a 16° bearing dead zone. Measured, that meant the heading was
**frozen for 83.8% of frames**, in runs averaging 3.2 seconds, then swinging
through the whole banked-up error in about half a second. Users read that as
juddering, not stability.

A dead zone rejects jitter by refusing to move. A slow continuous response
rejects the same jitter by being unable to react to it, and it always looks like
motion. Prefer the latter: cap how far the deadband may widen
(`bearingDeadbandScale`) and let the slower turn rate carry the smoothing.

### 2. A time lag biases on a ramp

The obvious way to stop the camera bobbing over terrain is to lag it. It works —
and it also sits permanently behind whenever the signal ramps. Because these
replays climb hundreds of metres per second of *video*, a 400 ms lag became a
~70 m vertical offset and walked the marker clean out of the bottom of the frame.

When the signal has a sustained slope, use a **symmetric spatial average**
instead. The mean of a straight line is its midpoint, so averaging terrain over a
span of route has *zero* bias on constant gradient while still removing the
roughness on top. That is what `TERRAIN_SAMPLE_INDEX_OFFSETS` does. Reserve rate
limiting for genuine artefacts (a refining terrain tile once moved the look-at
height 903 m in one frame).

### 3. The channel you blame is usually not the one moving

"The zoom is bumping in and out" was, when measured, a zoom channel that did not
change *at all* for an entire replay. This happened **twice**, with two different
culprits:

- the camera's look-at **height** bobbing over terrain, which in a pitched view
  moves the picture along the view axis;
- **pitch** drifting a few degrees, which changes how much ground fills the
  frame.

Both read as zoom to the eye. Measure every channel before forming a theory.

### 4. A two-point reading inherits the noise of both its points

The bearing target was measured between the marker's sample and one ten samples
ahead. Both endpoints carry GPS wobble, so the reported heading swung while the
route's actual direction was unchanged — and the camera answered every swing by
rotating. On real routes that chord changed direction 80 times (11 km) and 137
times (206 km), with single frames jumping up to 36 degrees.

Averaging a small window at *each* end cancels the wobble and leaves the real
turn: 28 and 29 direction changes, and the rendered camera reverses about half
as often (32 -> 15, 30 -> 19 at maximum stability).

Beware when testing this: the old reading used a *fixed* ten-sample offset, so
any synthetic wobble whose period divides ten cancels itself out and the old
code scores a perfect zero. An alternating point-up/point-down route proves
nothing. Use irregular jitter.

### 5. A resampled path read per frame is a staircase

`cameraPathCoordinates` is a fixed 601 samples, but a 60s clip at 60fps is 3600
frames. Rounding progress to the nearest sample therefore makes *everything*
derived from it hold still for six frames and then jump — a ten-per-second train
of impulses, each of which the pose smoothing answers with a small lurch. That
is what "the camera trembles" turned out to be. Measured before the fix, the
bearing target was unchanged on 83.3% of frames and then stepped a median of
2.2 degrees (p90 5-7).

Read the path at a **fractional** index and interpolate between the two
neighbouring samples. Afterwards the target changes on every frame, by a median
of 0.35-0.39 degrees. The same applied to the terrain sampling window, which
slid a whole sample at a time and stepped the look-at height on the same
ten-per-second beat.

Anything indexed by `Math.round(progress * (n - 1))` is suspect. Check for it
before reaching for more smoothing: smoothing a staircase does not remove the
staircase, it just blurs each step.

### 6. Channels sharing an input need comparable sensitivity to it

Zoom and pitch are both driven by the same terrain risk value, but through very
different budgets — and their deadbands were not scaled to match. With a zoom
budget of 0.8 against a 0.4 deadband, and a pitch budget of 15 against a 1.4
deadband, pitch ended up roughly five times more reactive to the same wobble.
Measured at maximum stability, risk drifting between 0.36 and 0.70 moved zoom by
0.27 (entirely swallowed, nothing rendered) and pitch by 5 degrees (of which 3.6
to 4.9 rendered).

So when one channel looks calm and another does not, compare
`budget / deadband` across them before touching the smoothing. Calming the
shared input helps every channel at once; changing one channel's budget is what
brings them into line.

## How to measure

### Cinematic tile budget

`basemapTileLod.ts` keeps imagery at one zoom level with hysteresis. Its
calculator must wrap the native calculator installed by `setSourceTileLodParams`,
including its tile-count correction. Returning the camera zoom unconditionally
removes that correction: steep authored shots then cover the horizon with
near-field imagery tiles and stall terrain rendering. Apply the same policy to
the visible map and the predictive warmup map. Guard non-finite cover geometry
before passing it to the stateful hysteresis.

### Playback marker modifiers

The completed-trail source carries an invisible point at the same endpoint as
the painted line. `paintedTrailMarker.ts` reads its newest rendered revision and
projects the DOM marker once, on the map's `render` event. Keep that as the sole
position writer: a normal MapLibre `Marker` also repositions on `move`,
`moveend`, `terrain`, and `idle`, which can move the DOM between canvas frames.
Those extra updates can make an aligned marker look as though it jitters.

Keep subpixel coordinates and absolute positioning; do not add a CSS transform
transition or ease the marker separately from the line. A temporary missing-tip
query during tile replacement retains the last painted anchor. Annotation holds
and the existing playback visibility rules explicitly remove the adornment.
Unchanged icon/label markup is retained so playback does not recreate the
marker's children every frame. Export captures the same DOM position after the
map settles. The legacy `showCircle` setting now enables a silhouette outline
and shadow, shared with export through `markerIconContrastFilter`; it must not
add an animated disc or change the marker position.

### Pure functions: vitest, offline

Fastest loop by far, and it works on the real sample routes:

```ts
import { readFileSync } from 'node:fs';
import { parseGPX } from '@/utils/gpxParser';
import { calculateTerrainAwareAdjustments } from '@/components/map/cameraUtils';

const track = parseGPX(
  readFileSync('public/media/samples/pedals-de-foc-non-stop-2023.gpx', 'utf8'),
  'sample.gpx',
);
```

Build the same `elevationData` shape `useComputedJourney` produces, sweep
`progress` from 0 to 1 in as many steps as the clip has frames, and look at the
resulting target curve. `vitest` swallows `console.log`, so write results to a
file. Good sample routes live in `public/media/samples/` —
`pedals-de-foc-non-stop-2023.gpx` (206 km, 6.9 km climb) is the stress case;
anything that behaves well there and on a short route is probably fine.

### The real camera: instrument it in the browser

Pure functions cannot tell you what the *rendered* camera did, because the
smoothing chain, the map, and terrain queries all sit in between. Get the live
map instance by walking up the React fiber from the on-screen map container:

```js
const isMap = (o) => o && typeof o === 'object'
  && typeof o.getZoom === 'function'
  && typeof o.queryTerrainElevation === 'function';
// NB: pick the on-screen container. There are two.
const container = [...document.querySelectorAll('.maplibregl-map')]
  .find((c) => c.getBoundingClientRect().left > -1000);
const key = Object.keys(container).find((k) => k.startsWith('__reactFiber'));
let node = container[key], map = null;
while (node && !map) {
  let hook = node.memoizedState;
  while (hook && !map) {
    const st = hook.memoizedState;
    if (st && typeof st === 'object' && isMap(st.current)) map = st.current;
    hook = hook.next;
  }
  node = node.return;
}
```

Then sample every animation frame — bearing, zoom, pitch, `transform.elevation`,
centre, and the marker's position relative to the canvas — and drive a full
replay.

### Metrics that actually correlate with "feels bad"

Averages hide everything. These are the ones that caught real defects:

- **Direction reversals** per clip, per channel. This is the single best proxy
  for "bumpy". A cinematic channel reverses a handful of times per minute.
  Terrain-driven look-at height was reversing **1,036 times**.
- **Percent of frames frozen**, and the **length of freeze runs**. High frozen
  percentage plus long runs means stick-slip, not smoothness.
- **Percentiles of per-frame change**, not the mean. The fix for stick-slip
  *raised* the median bearing change (0 → 0.33°/frame) while *lowering* the 99th
  percentile — motion redistributed from lurches into continuous glide. A mean
  would have shown almost nothing.
- **Marker screen position**: min/max as a fraction of the canvas, and a count of
  frames outside `[0,1]`. This is the safety check, and it is how the time-lag
  approach was caught.
- **High-frequency jitter**: RMS deviation of the marker position from its own
  ~15-frame moving average, which separates fast shake from slow drift.

### Measure at the DEFAULT slider position, not just at max stable

This one cost a round trip with a user. A fix was verified entirely at maximum
stability, looked perfect, and shipped — then the same replay on a fresh page
pumped visibly, because a fresh page uses `cameraStability: 0.5` and the
verification had never covered it. The widened deadband at the stable end was
hiding a target that still reversed 17 times a minute.

Two rules follow:

- **Sweep the stability range.** A change is not verified until it has been
  measured at 0, 0.5 and 1. Cheap offline — feed the target series through
  `smoothZoom` at each `cameraReactivityFromStability` value.
- **Fix the target, not the filter.** If a channel only looks calm because a
  deadband is swallowing it, it is not calm — it will surface at any slider
  position where that deadband is narrower. Size the terrain window so the
  *target* is calm, and let smoothing be a refinement rather than a mask.

### Isolating the steady replay in a capture

Intro fly-in and outro `fitBounds` move the camera far more than playback ever
does, and leaving them in a capture makes every range and swing meaningless. The
clean way to slice: **keep only frames where `.tr-marker` exists in the DOM.**
The marker is mounted only while `animationPhase === 'playing'`, so that filter
lands exactly on the steady replay — on a 60 s video it returns 60.0 s of frames.
Slicing by frame percentage does not work; it silently leaves fly-in frames in.

### Reference numbers

Pedals de Foc, 60 s, follow-behind, stability at max stable, before this work
and after:

| | before | after |
|---|---|---|
| zoom target reversals | 29/min | 0 |
| bearing frames frozen | 83.8% | ~7–13% |
| longest bearing freeze | ~10,000 frames | ~60 frames |
| look-at height reversals | 1,036 | 32 |
| look-at per-frame change, p99 | 27.8 m | 8.3 m |
| marker off-screen frames | — | 0 |

## Traps that will eat your afternoon

Every one of these produced a confidently wrong measurement at least once:

- **Stale map after HMR.** Editing camera source hot-reloads the app and builds a
  *new* map. A captured reference keeps returning frozen values and looks like a
  camera that stopped moving. Re-acquire after every edit, and sanity-check that
  `map.getCanvas()` is the canvas actually in the document.
- **There are two maps.** The visible one, and an offscreen 1920×1080 export
  canvas parked at `left: -10000`. `document.querySelector('.maplibregl-canvas')`
  may return either. Filter by bounding rect, and scope marker lookups to the map
  container you are measuring.
- **Hidden tabs pause `requestAnimationFrame`.** Playback is rAF-driven, so a
  backgrounded tab does not advance at all and the sampler collects nothing. A
  screenshot does *not* bring a tab to the foreground. Check `document.hidden`
  before trusting an empty capture.
- **A sampler that throws, dies.** If the exception happens before the next
  `requestAnimationFrame`, the chain stops silently. Wrap the body in try/catch
  and schedule the next frame outside it.
- **`beforeunload` blocks reloads** once a track is loaded, which makes getting a
  clean page harder than expected.
- **Repeated HMR eventually crashes the page** — `useRouteLandmarksLayer` throws
  "Style is not done loading" on remount. After a handful of hot reloads, reload
  properly instead of trusting what you see.
- **Terrain tiles fail.** `queryTerrainElevation` depends on elevation tiles from
  a public S3 bucket that rate-limits. When they fail, elevation readings degrade
  and you will chase phantom camera bugs. Check the console for `AJAXError` on
  `elevation-tiles-prod` before believing an elevation measurement.
- **Playback speed and camera preset silently change your baseline.** A stray
  click on 0.25× or a different distance preset invalidates a comparison. Assert
  the settings you think you are measuring.

## A cinematic, keyframed mode

There is a design plan for a fourth camera mode in which the pose is authored as
keyframes rather than derived per frame:
[CINEMATIC_CAMERA_PLAN.md](./CINEMATIC_CAMERA_PLAN.md). It leans heavily on the
failure modes above — in particular, its stability comes from *not* consulting
the route heading or the terrain-risk model at all, rather than from filtering
them harder.

## Tuning surface

Everything lives in `cameraUtils.ts`:

- `cameraReactivityFromStability` — maps the stability slider (0 = stable,
  1 = reactive) onto one multiplier used by the smoothing helpers.
- `bearingDeadbandScale` / `bearingTurnReactivity` — how the bearing deadband and
  turn rate respond to that multiplier. Both are deliberately capped; read their
  comments before widening either.
- `cameraCenterChaseDurationFromStability` — lag on the horizontal pan. The
  biggest single lever on how the motion *feels*, and for a long time it was a
  constant that the stability slider did not touch at all. The stable half ramps
  steeply (900ms at the endpoint against 100ms at the default), which is what
  lets the marker drift within the frame instead of the camera chasing every
  wiggle.
- `smoothZoomTarget` — low-passes the requested zoom *before* the pose smoothing
  sees it, with hysteresis and a slow return, for the stable half of the slider.
  It backstops the terrain settings below: those aim to keep the target calm in
  the first place, this catches whatever still gets through.
- `TERRAIN_CAMERA_SETTINGS` — terrain-driven zoom and pitch pull-back.
  `FULL_RISK_GRADIENT` is a gradient, not a height, on purpose.
- `TERRAIN_SAMPLE_INDEX_OFFSETS` — width of the terrain average. Widening it
  smooths more but tracks real terrain shape less. Must stay symmetric.
- `MAX_CENTER_ELEVATION_RATE_M_PER_S` — set well above real terrain speed; it
  exists only to absorb tile-refresh spikes, and it should never bind on genuine
  ground.
