# TrailReplay camera authoring for agents

This guide describes an optional, local Node.js workflow for agents authoring
cinematic camera keyframes in a TrailReplay recipe. It does not require an AI
service, an account, or a route upload.

Shots set a bearing, pitch and zoom around a look-at target. Generated terrain
plans use a fixed course target: keep the start visible, fit the painted route
with room for stats and the elevation profile, and look toward the mountain
from near its height. This avoids chasing the marker uphill or flying over the
summit. Targetless recipes retain the existing smoothed route-following orbit.
An external agent uses terrain evidence and your creative brief to revise shots.
The website offers a deterministic starting plan and a draft preview.

## Review in the website

1. Open **Map & Camera → Cinematic** in an existing project.
2. Choose **Survey terrain & suggest shots**, or **Download agent brief** to
   hand the current recipe, routes and optional terrain survey to an agent.
   The download contains locations and timestamps; media and sensor readings
   are excluded. Its README explains how to run the standalone tool.
3. Use **Review camera recipe** for the returned JSON. This stages camera
   changes without replacing the project's routes, media, annotations or
   accepted shots.
4. Choose **Preview draft**, play the replay and revise shots in the editor.
   **Reassess terrain** samples the revised shots and their transitions.
5. **Apply camera plan** accepts the current draft; **Discard draft** restores
   the accepted plan. Saving a project or exporting video uses accepted shots.

Accepted shots, their occurrence anchors, and their terrain notes survive
saving and reopening a `.replay`. Its `recipe.json` also reflects current shots
and the actual route filenames in that archive. A changed route or timeline
invalidates a pending review; download a fresh brief for that context.

## Get the tool

For a pinned copy, fetch the discovery manifest first:

```sh
curl -fLO https://trailreplay.com/agent-tools.json
```

The manifest's `download` field names an immutable bundle and `sha256` gives
the expected hash of its exact bytes. Download that named file and, if needed,
verify it with `shasum -a 256 agent-tools.<hash>.mjs`. The
`latestDownload` field points to the convenient unversioned alias. Both files
are self-contained Node.js 20+ programs:

```sh
curl -fLO https://trailreplay.com/agent-tools.mjs
node agent-tools.mjs --help
```

Every command result includes `engineVersion`, a SHA-256 identifier for the
bundled source graph. The manifest uses the same value.

The tool reads route and recipe files on the machine. Terrain sampling sends
requested tile coordinates to AWS Terrarium and fetches public elevation tiles,
with a 64-tile limit, four concurrent requests, and a 12-second sampling budget
per sampler. Route files are not uploaded, and no TrailReplay endpoint receives
them. GPX and KML are supported. A `.replay` archive is used as a source of
GPX/KML route files only; pass the recipe separately with `--recipe`. The CLI
does not read `project.json` or inspect the current browser project. To give an
agent the current project's route and recipe context, use **Download agent
brief** in TrailReplay's Cinematic Camera editor. FIT is not supported by this
CLI; export the recording as GPX first.

## Inspect shared route context

Pass all route files together. The route parser, distance calculations, recipe
resolver, and camera-anchor validation are bundled from TrailReplay's own
source, so the reported positions and distances use the app's implementation.

```sh
node agent-tools.mjs inspect \
  --recipe recipe.json \
  --routes day-1.gpx day-2.gpx \
  --out context.json
```

The context includes resolved track IDs, playback segment IDs and durations,
track distance and elevation summaries, recipe placements, warnings, and any
existing camera frames. The `recipe` field is a canonical recipe with
deterministic track and segment IDs. Use it as the base for later edits; the
CLI uses those same IDs on every run.

## Ask for terrain context

```sh
node agent-tools.mjs terrain \
  --recipe recipe.json \
  --routes day-1.gpx day-2.gpx \
  --intent "Show the exposed ridge and the main descent" \
  --out terrain-brief.json
```

The result contains sampled route moments, relief estimates, coverage counts,
warnings, and a context fingerprint. A missing elevation sample is reported as
unknown; it is not filled with a guess. Use the evidence and the person's
requested visual intent to review the suggestions. The `recipe` field contains
the complete normalized source recipe with the suggested keyframes merged into
`cameraKeyframes`; save that object as the starting recipe for evaluation. Keep
the camera frame IDs unique when you revise or add shots.

## Camera recipe shape

Each frame is anchored by route distance within one playback segment occurrence.
`trackId` is a track ID from the resolved context. `segmentId` names one active
occurrence from `journeySegments`; if a route is repeated, each occurrence gets
its own segment ID. `distanceMeters` is local to that occurrence's route.
The tool canonicalizes these IDs when the source recipe omits them, and returns
the canonical recipe in each command result. For a machine-readable field
schema, see [camera-recipe.schema.json](https://trailreplay.com/camera-recipe.schema.json).

```json
{
  "segments": [
    { "id": "day-1-play", "trackId": "day-1", "duration": 36000 },
    { "id": "day-2-play", "trackId": "day-2", "duration": 24000 }
  ],
  "cameraKeyframes": {
    "version": 1,
    "frames": [
      {
        "id": "ridge-overview",
        "title": "Ridge overview",
        "anchor": {
          "trackId": "day-1",
          "segmentId": "day-1-play",
          "distanceMeters": 8400
        },
        "bearingDeg": 235,
        "pitchDeg": 62,
        "zoom": 12.5,
        "frame": "world",
        "easing": "smooth",
        "target": { "lon": -3.72, "lat": 40.41, "elevationMeters": 1450 },
        "terrain": {
          "rationale": "The sampled ridge has clear relief above the approach.",
          "confidence": 0.82,
          "warnings": []
        }
      }
    ]
  }
}
```

`bearingDeg` is from 0 inclusive to 360 exclusive, `pitchDeg` is 0–85,
`zoom` is 0–20, `frame` is `world` or `route`, and `easing` is `smooth`,
`linear`, or `hold`. Terrain rationale and confidence describe the evidence
behind an authored choice; `estimatedMinClearanceMeters` is an optional numeric
estimate produced from sampled terrain. These values do not certify that the
scene looks right.
An optional `target` fixes the camera look-at point for a shot. Its
`elevationMeters` is unexaggerated elevation above sea level, not camera
location; longitude is limited to `[-180, 180]`, latitude to `[-85, 85]`, and
elevation to `[-12000, 100000]` metres.

## Evaluate numeric terrain clearance

After adding the frames, run:

```sh
node agent-tools.mjs evaluate \
  --recipe recipe.json \
  --routes day-1.gpx day-2.gpx \
  --out evaluation.json
```

Evaluation reports terrain coverage, radial relief, estimated camera distance
and altitude, sampled course coverage, start visibility and sightline clearance. It is a numeric check only. Open
the recipe and routes in TrailReplay and inspect the rendered replay to verify
composition, camera motion, terrain appearance, and tile availability.

The terrain provider is shared with the visible map. Surveys inspect eight
directions at 250, 750 and 1500 metres around selected moments. Evaluations
use the same replay timing and pose spline as playback, with explicit viewport,
field of view, exaggeration and stability assumptions. Fixed course targets keep
their authored elevation; legacy shots use route target smoothing. Candidate
selection checks all eight bearings and three low viewing pitches, padded
perspective framing and sampled terrain rays to the course, including its start.
Unknown terrain never counts as confirmed visibility. Adaptive transition sampling is bounded at 256 checks, with a
warning when the requested density is capped. Missing tiles and unknown
clearance remain explicit. `clear-sampled` describes sampled sight lines;
`renderStatus: "not-run"` records that numeric assessment has not rendered a
video. Runtime elevation smoothing and native camera collision adjustments can
change the actual view, so a rendered preview remains part of review.

For any command, use `--out -` to write JSON to standard output. The tool exits
with a non-zero status and a plain error message when the input is invalid or a
requested route format is unsupported.

## Keep recipe handoff explicit

The final recipe remains an ordinary TrailReplay recipe and can be dropped with
its routes at <https://trailreplay.com>. Preserve the app's existing cover
choice rule: when preparing a video and the person has not chosen whether to
show a designed cover during the first second, ask and wait for an explicit yes
or no. Set `videoExportSettings.includeCover` only after that answer.
