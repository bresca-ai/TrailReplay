# Giving TrailReplay a route

**Audience: AI agents.** If someone asks for a route in TrailReplay — a race
with its aid stations, a week of walks with the huts they slept in, a training
route with named climbs — you write a small JSON **recipe** and hand it over
with their GPX files. You never drive the UI, and you never compute a
coordinate.

TrailReplay is at <https://trailreplay.com>. It runs in the browser: no account,
no upload API.

---

## 1. The whole job

Write a recipe describing what you want, in the terms the source uses:

```json
{
  "name": "A week in the Pyrenees",
  "tracks": { "files": "*.gpx", "order": "chronological" },
  "landmarks": [
    { "auto": "start-finish", "type": "trailhead" },
    { "auto": "overnight-stops", "type": "hut", "icon": "shelter" }
  ],
  "annotations": [
    { "track": "Day 3", "km": 12, "title": "Coll de la Marrana", "subtitle": "2 530 m" }
  ]
}
```

If the person has not sent you the GPX files yet, §7 covers how to get them —
what you can fetch yourself, and what to ask them to do.

Save it as `recipe.json`. Then tell the person:

> Drag `recipe.json` onto <https://trailreplay.com> **together with** your GPX
> files — select them all and drop them at once.

That is the entire handover. The app reads the recipe, resolves every kilometre
against the routes with its own track maths, and shows a panel listing what it
placed and anything worth checking.

**You do not need to compute latitudes, progress values, or distances.** That is
the point of the format: the app owns the maths, so a recipe cannot disagree
with it.

## 2. What a recipe can say

One JSON file. Only `tracks` is required, and even that can be a wildcard.

### Routes

```json
"tracks": { "files": "*.gpx", "order": "chronological" }
```

Takes whatever was dropped. `order` is `chronological` (default, read from the
GPX timestamps), `name`, or `as-dropped`. `color` accepts one colour or a list
cycled across the routes.

Or name them, when you want to control each one:

```json
"tracks": [
  { "file": "day-1.gpx", "name": "Ribes to Núria", "color": "#E86F51" },
  { "file": "day-2.gpx", "name": "Núria to Ulldeter", "duration": 20000 }
]
```

`file` matches on the file's own name, so the path you had locally is fine.
Other keys: `name`, `color`, `activityIcon`, `visible`, `duration` (this leg's
screen time in ms, overriding the automatic share).

### How the routes relate

| Key | Meaning |
|---|---|
| `mode` | `stitch` (default) plays them one after another as one journey. `alternatives` loads them all but puts only the active one in the timeline, so the others are there to switch to. |
| `legDuration` | `by-distance` (default) shares screen time by how far each leg is, so a 35 km day is not given the same seconds as an 8 km one. `equal`, or a number of ms per leg. |
| `totalDuration` | Total replay length in ms. Default 60000. |
| `activeTrack` | Which route starts active: index or name. |

### Pins and cards

`landmarks` are **places** — permanent map furniture. `annotations` are
**moments** — a card that rises as the replay approaches and fades once past.
An aid station is a moment. A hut you slept in is a place.

**Put every timed route annotation in the top-level `annotations` array of
`recipe.json`.** Do not nest it under `tracks`, `settings`, or `landmarks`.
Each object needs an anchor such as `km` and a `title`. After import, people
can find and edit these entries in **Media → Annotations**; the Style panel
only controls the route's appearance.

Both are positioned the same way, by whichever of these you have:

- `"km": 6.5` — distance along its route. This is what sources publish.
- `"lat": 42.3, "lon": 2.1` — an exact spot. The pin stays exactly there; the
  route only decides when it appears, and the app reports how far off-route it
  is so a bad coordinate is visible.
- `"progress": 0.5` — a fraction of the whole replay.

With several routes, `"track": 2` or `"track": "Day 3"` says which one a `km`
belongs to.

```json
"landmarks": [
  { "km": 0, "title": "Ribes de Freser", "type": "trailhead", "icon": "town" },
  { "lat": 42.3971, "lon": 2.1547, "title": "Refugi Coma de Vaca", "type": "hut" }
],
"annotations": [
  { "km": 6.5, "title": "Avituallament 1 — Collet de Barraques",
    "subtitle": "Km 6,5 · Aigua · Fruita · Fruits secs", "color": "#3C9DCC" }
]
```

Landmark keys: `title`, `subtitle`, `type`, `icon`, `color`, `importance`
(1–5, default 5), `display`, `id`. A standard map card annotation uses
`title`, optional `subtitle`, `color`, `displayDuration` (ms on screen, default
5000), and optional `id`.

For a readable aid-station panel beside the map, author one object like this:

```json
"annotations": [
  {
    "km": 10.2,
    "presentation": "side-panel",
    "code": "A1",
    "title": "Avituallament d'aigua",
    "meta": "Km 10,2 · 15:30–19:30",
    "description": "Aquarius · Fruits secs · Plàtans",
    "logo": "🚰",
    "color": "#1c8ce4",
    "holdDuration": 7000,
    "translations": {
      "en": {
        "title": "Water station",
        "meta": "Km 10.2 · 15:30–19:30",
        "description": "Aquarius · Nuts · Bananas"
      }
    }
  }
]
```

`code` labels the station, `title` is its heading, `meta` is the short route
detail line, and `description` is the longer readable text. Keep those as
separate JSON fields; the `·` within `meta` or `description` is ordinary text.
`logo` is the compact symbol on the map. `holdDuration` is additional replay
time in milliseconds: the marker eases down and back up around the station
while the side panel remains visible. `translations` keys are app languages
(`en`, `es`, `ca`, `de`, `fr`); translate `title`, `meta`, and `description`
inside each language object. The viewer's app language chooses the wording.
The top-level text is the fallback when a language is missing. Older annotations
combining fields in `title` and `subtitle` still display, but new recipes
should use the separate fields. The panel disappears for the final zoom-out.

`iconChanges` swap the moving marker partway: `{ "km": 20, "icon": "🥾",
"label": "Walking the col" }`.

### Derived sets

Instead of positioning something, ask for it to be worked out:

```json
"landmarks": [{ "auto": "overnight-stops", "type": "hut", "icon": "shelter" }]
```

| `auto` | What it places |
|---|---|
| `overnight-stops` | Where consecutive legs meet — the end of one day and the start of the next is where the night was spent. One pin per night, labelled with the date. |
| `start-finish` | Start and finish, collapsed into one pin on a loop where they coincide. |
| `start`, `finish` | Just one of them. |

`overnight-stops` also checks its own work: it refuses to call a three-hour gap
a night, and it warns when one day ends a long way from where the next begins,
because that usually means a track is missing.

### Presentation

`settings`, `cameraSettings`, `videoExportSettings` and `socialShareSettings`
are merged over the app's defaults, so set only what you mean. Their fields are
listed in §5.5–5.8 — the same objects a saved project holds. Also at the top
level: `activityIcon`, `routeTimingMode`, `showAutomaticLandmarks`,
`nearbyPlaceTypes`.

```json
"settings": { "mapStyle": "esri-clarity", "show3DTerrain": true },
"cameraSettings": { "mode": "follow-behind", "pitch": 60 }
```

### What you get back

You cannot watch the replay, so the app measures it for you and reports what it
found. Ask the person to read the panel back — it is your only feedback.

Each placement is listed with its kilometre **along its own route**, the seconds
it is on screen **of the whole replay**, and the one number that matters:

```
 7.1 km   23–28s   Les Casetes
25.0 km   42–47s   Les Casetes          marker 4.1 km away
```

**"marker N away" means the replay is wrong.** It is how far the moving marker
is from the place a card names at the moment that card appears. It should be
metres. Anything more means the entry is timed to a different part of the replay
than the place it names — anchored to a route that is not playing, or to one lap
of a route the journey walks several times. It catches that whole class without
you having to work out which cause applies.

The panel also warns about pins close enough to collapse into one, cards that
would overlap on screen, days that do not join up, and variants of one route
stitched as if they were consecutive legs.

### Checking it yourself

If you can run Node and a browser, you do not have to rely on someone reading
the panel back. `scripts/probe-replay.mjs` in the repo plays the replay headless
and measures it:

```bash
npm i -D playwright && npx playwright install chromium
node scripts/probe-replay.mjs ./my-replay-folder --url https://trailreplay.com
```

Point it at a folder holding one recipe and its routes. It reports whether the
marker stayed in frame, how much of the basemap ever loaded, how the camera
moved, every recipe warning, and any page error — and exits non-zero if the
marker left the canvas or the page threw. The page only exposes what it needs
for this when opened with `?probe=1`, which the script adds itself.

## 3. Getting it right

The app now catches the mechanical mistakes and reports them — colliding pins,
overlapping cards, days that do not join up, a kilometre past the end of a
route. These are the ones only you can get right.

**A place is a pin; a moment is an annotation.** The choice that most often goes
wrong. Aid stations, cut-offs and "the climb starts here" are moments. Summits,
huts and the village you start in are places. Pinning every aid station leaves
the map cluttered with markers that mean nothing when the marker is elsewhere.

**One replay per course.** A replay plays one journey, and an annotation's
`progress` is fixed to it, so three distances of the same race belong in three
recipes — one per course, each listing its own aid stations at its own
kilometres. That is also the only way every course gets its stops: put them all
in one project and only the active course's cards fire at the right moment.
`mode: "alternatives"` is for variants of the *same* route you want to switch
between, not for courses that each deserve their own video.

Three days of a traverse are the opposite case: one recipe, default stitch.

**Use the source's own words.** If a race page says "Avituallament 2 — Torrent
Gros (Km 13)", that is the title, in that language. Do not translate it or
invent a friendlier name.

**Put the kilometre in the subtitle.** The map shows the title; the subtitle is
where "Km 13 · water, cola, fruit" belongs.

**Do not fabricate positions.** If a source names a stop but gives no kilometre
and no coordinate, say so rather than guessing. A pin in the wrong valley is
worse than a missing pin.

**Nearby named places are on by default.** The app pulls peaks, passes, huts and
towns near the route from OpenStreetMap and shows them next to yours. They
compete for the same 40 label slots, so set `"nearbyPlaceTypes": []` when your
pins are the point.

---

## 4. The `.replay` file

A `.replay` is a **ZIP archive** holding a recipe, a resolved project, or both.
Standard deflate, under 200 MB.

What you produce is the first kind — the recipe and its routes, nothing
resolved:

```
my-race.replay
├── recipe.json
└── routes/
    ├── day-1.gpx
    └── day-2.gpx
```

The app resolves it on open, exactly as it would a dropped folder. Routes are
matched on file name, so the `routes/` prefix does not matter.

What the app's Save button writes is both:

```
saved.replay
├── recipe.json           ← the source, when there was one
├── project.json          ← what it resolved to, plus every hand edit
├── manifest.json         ← diagnostic metadata; never write it yourself
└── routes/…
```

Keeping the recipe means a saved project still says where it came from, so you
can read one, change a kilometre, and rebuild — rather than being handed a wall
of resolved coordinates. `project.json` is the format's other half, specified in
§5; you rarely need to write it, because everything it holds that intent can
express is reachable from a recipe.

The app rejects an archive that has neither `recipe.json` nor `project.json`, a
recipe with none of its routes, or a `project.json` whose `routeFile` does not
match a zip entry. A leading `./` is the usual mistake.

GPX bytes are stored verbatim, so elevation, timestamps, heart rate, cadence and
power all reach the app untouched. Never rewrite a GPX you were given.

## 5. `project.json` — every field

Only `formatVersion` and `tracks` are required. Every other field falls back to
the app's own default, and objects are merged rather than replaced, so a partial
`settings` keeps the rest of the defaults. Set as much or as little as you mean.

```json
{ "formatVersion": 1, "tracks": [{ "routeFile": "routes/route.gpx" }] }
```

### 5.1 `tracks` and `comparisonTracks`

| Field | Notes |
|---|---|
| `routeFile` | **Required.** Path inside the archive. |
| `id` | Any stable string. Referenced by `activeTrackId` and by track segments. |
| `name` | Wins over the GPX's own `<name>`; falls back to it, then the filename. |
| `color` | Hex. Set `settings.trailStyle.trailColor` to match. |
| `activityIcon` | Emoji, or one of `svg-walking`, `svg-running`, `svg-biking`, `svg-swimming`. |
| `visible` | Default `true`. |
| `offset` | `comparisonTracks` only: start offset in seconds. |

`activeTrackId` picks the starting track; it defaults to the first.

### 5.2 `userLandmarks` — persistent pins for places

```json
{
  "id": "aid-1",
  "type": "aid-station",
  "source": "user",
  "display": "highlight",
  "lat": 42.33766, "lon": 2.12197,
  "progress": 0.2036,
  "elevation": 1687,
  "title": "Avituallament 1 — Collet de Barraques",
  "subtitle": "Km 6,5 · Aigua · Cola · Isotònic · Fruita",
  "importance": 5,
  "icon": "water",
  "color": "#3C9DCC",
  "routeDistanceMeters": 6500
}
```

Required: `id`, `lat`, `lon`, `progress` (`0`–`1`, or `null` for always
visible), `title`, `type`, `source` (use `"user"`). Optional: `display`
(`highlight` \| `subtle`), `importance` `1`–`5`, `subtitle`, `icon`, `color`,
`elevation` (m), `routeDistanceMeters` (orders the sidebar list — set it),
`metadata`.

**`type`** — `summit` `pass` `viewpoint` `high-point` `waterfall` `trailhead`
`hut` `shelter` `camp` `water` `aid-station` `finish` `town` `lake`
`river-crossing` `photo` `note` `challenge` `custom` `highest-point`
`longest-climb` `major-descent` `halfway`

**`icon`** (overrides the type's glyph) — `pin` `summit` `viewpoint` `waypoint`
`town` `shelter` `camp` `water` `waterfall`. An aid station defaults to `town`;
`water` usually reads better.

**Palette** — `#E86F51` `#F7F2E8` `#6D7E96` `#3C9DCC` `#63C5D9` `#B85E3C`
`#3E9DB0` `#536B65`. Any hex works.

`hiddenLandmarkIds` is a list of derived landmark ids to suppress.

### 5.3 `textAnnotations` — timed cards for moments

A card fades in over the `displayDuration` **before** the replay reaches
`progress` and is gone once past it, so it reads as "coming up". This is where
aid stations, cut-offs and "the climb starts here" belong.

```json
{ "id": "note-1", "progress": 0.41, "lat": 42.33993, "lon": 2.08026,
  "title": "The long climb starts here", "subtitle": "900 m in 6 km",
  "color": "#C1652F", "elevation": 1820, "displayDuration": 5000 }
```

All required except `subtitle` and `elevation`. `displayDuration` is in ms.

### 5.4 `iconChanges`

Swaps the moving marker partway through: `{ "id", "progress", "icon", "label" }`.
Useful when the activity changes — running to hiking on a steep col, riding to
pushing.

### 5.5 `settings`

| Field | Values |
|---|---|
| `unitSystem` | `metric` \| `imperial` |
| `language` | `en` `es` `ca` `de` `fr` |
| `mapStyle` | `satellite` `topo` `street` `outdoor` `esri-clarity` `wayback` `mapbox-streets` |
| `mapFilter` | `none` `muted` `mono` `noir` — tints the basemap only; route and labels keep their colours |
| `mapOverlays` | `{ skiPistes, slopeOverlay, placeLabels, aspectOverlay }`, all boolean |
| `show3DTerrain` | boolean |
| `showHeartRate`, `showPictures` | boolean |
| `cameraMode` | `overview` `follow` `follow-behind` `cinematic` |
| `defaultAnimationSpeed` | number, `1` = normal |
| `trailStyle` | see below |
| `waybackRelease`, `waybackItemURL` | historical imagery; `null` unless `mapStyle` is `wayback` |
| `visibleStats` | any of `distance` `duration` `movingDuration` `pace` `elevation` `heartRate` `speed` `altitude` (`duration` is the total elapsed clock, stops included; `movingDuration` excludes them) |
| `journeyStatsMode` | `cumulative` \| `per-track` |
| `statsPosition` | `{ x, y }` or `null` for the default corner |
| `statsScale` | number, `1` = 100 % |
| `statsLayout` | `auto` `horizontal` `vertical` |
| `statsBackground` | `panel` (dark card) \| `transparent` (text only, over the map) |
| `statsColumns` | number or `null` |
| `paceMode` | `cumulative` \| `per-km` |
| `showElevationProfile` | boolean |
| `landmarkScale` | multiplier on pins and their labels |
| `landmarkLabelFade` | boolean; fade labels in with zoom instead of popping |

**`trailStyle`** — `trailColor`, `colorMode` (`fixed` \| `heartRate` \|
`zones`), `heartRateZones` (`[{ min, max, color, label }]`), `markerType`
(`icon` \| `dot`), `markerColor`, `showMarker`, `markerSize`, `currentIcon`,
`showCircle`, `showTrackLabels`, `trackLabel`, `ghostTrailOpacity`, `colorZones`
(`[{ id, fromProgress, toProgress, color }]`).

### 5.6 `cameraSettings`

`mode` (`overview` `follow` `follow-behind` `cinematic`), `zoom`, `pitch`
(0 = straight down, 85 = near ground level), `bearing`, `followBehindPreset`
(`very-close` `close` `medium` `far`), `followBehindZoomLevel`,
`cameraStability` (`0` = smoothest, `1` = tightest tracking).

### 5.7 `videoExportSettings`

`format` (`mp4` \| `webm`), `quality` (`low` `medium` `high` `ultra`), `fps`,
`resolution` (`{ width, height }`), `aspectRatio` (`16:9` `1:1` `9:16`),
`includeAudio`.

### 5.8 `socialShareSettings`

`template` (`map-first` \| `photo-first`), `aspectRatio` (`4:5` `1:1` `9:16`),
`selectedPictureId`, `titleMode` (`journey-name` `track-name` `custom`),
`customTitle`, `locationLabel`, `showLocation`, `showStats`,
`showElevationMiniChart`, `routeTransform` (`{ offsetX, offsetY, scale,
opacity }`), `dataPanelOffsetY`, `routeGlow`.

### 5.9 Route and playback

- `cameraPosition` — the last live map camera as `{ lat, lon, zoom, pitch, bearing }`, or `null`. Saved projects use it to restore manual pan, zoom and orientation.
- `routeTimingMode` — `recorded` replays the GPX's own pacing; `uniform` runs at
  constant pace.
- `showAutomaticLandmarks` — derived pins (highest point, longest climb,
  halfway). Leave `false`; they crowd out authored ones.
- `nearbyPlaceTypes` — `null` shows every OpenStreetMap place type found near
  the route, `[]` shows none, or list the types you want.
- `enabledLandmarkGroups` — landmark types to enable.

### 5.10 `journey` and `journeySegments`

`journey` is `{ id, name, segments: [], totalDuration: 0, totalDistance: 0 }` —
only `name` matters to you.

`journeySegments` is the running order. **Omit it and each track gets a 60 s
segment in order, exactly as if the GPX files had been dropped on the page.**
Set `[]` to make the tracks alternatives instead, so only the active one plays.

```json
{ "id": "seg-1", "type": "track", "trackId": "track-0", "duration": 60000 }
```

A `transport` segment interpolates a connector between two points:

```json
{ "id": "seg-2", "type": "transport", "mode": "train",
  "from": { "lat": 42.30, "lon": 2.16, "name": "Ribes" },
  "to":   { "lat": 42.43, "lon": 2.26, "name": "Núria" },
  "duration": 8000, "distance": 14000 }
```

`mode` — `car` `bus` `train` `plane` `bike` `walk` `ferry`.

When tracks are stitched, `progress` spans the whole journey: a pin on the
second of three equal legs sits past `0.333`.

### 5.11 Fields to leave alone

`pictures` and `videos` reference real media files that a `.replay` cannot
carry — the app reopens them as placeholders, so authoring them from outside is
not useful. `cinematicCameraKeyframes` belongs to a camera mode not yet reachable
from the UI.

---

## 6. Turning a kilometre into a pin, by hand

If you are building the archive without the script:

1. Read `<trkpt lat=… lon=…>` in order, with each `<ele>`.
2. Accumulate **haversine distance with `R = 6371 km`**. This is the exact
   formula the app uses; a different earth radius drifts your pins.
3. Find the pair of points bracketing the target distance; interpolate `lat`,
   `lon` and `elevation` linearly between them.
4. `progress = targetKm / totalKm`, clamped to `0`–`1`. On a stitched journey,
   scale into the leg's slice: `legStart + (km / legKm) × legShare`, where a
   leg's share is its `duration` over the total.
5. `routeDistanceMeters = round(kmFromJourneyStart × 1000)`.

Progress is **distance-based**, not time-based, even when the GPX has timestamps
and `routeTimingMode` is `recorded`. That matches how the app places a pin
dropped by hand on the map.

Going the other way — you have a coordinate and want its progress — find the
nearest track point and use its accumulated distance.

---

---

## 7. Getting the routes in the first place

Often the person has not exported anything yet. What you can do depends on where
the route lives; try these in order.

### 1. A public URL — fetch it

Race organisers, clubs and blogs publish GPX files directly. This is the fastest
case and needs nothing from the person:

```
https://www.vallsdelfreser.com/gpx/valls-del-freser-trail-25k.gpx
```

If they name a race, look for its route or "recorregut" page before asking them
for anything. Check the file actually has track points — some sites serve an
HTML error page under a `.gpx` name.

### 2. Files they already have — read them

A Downloads folder, an unzipped export, a folder per trip. `tracks: { "files":
"*.gpx" }` takes whatever is there and orders it by its own timestamps, so
pointing at the folder is usually the whole job.

### 3. A bulk export they request — then work the folder

For "all my runs last week", both Strava and Garmin let a person download their
whole archive. That is the supported route for anything in bulk. Ask them to
request it, then handle the folder when it arrives.

**The archive will not be all GPX.** Strava keeps activities in whatever format
they were uploaded in, so an export is usually a mix of `.gpx`, `.fit` and
`.tcx`, often gzipped. TrailReplay reads GPX, KML and FIT — `.tcx` still needs
converting. Say so before they wait hours for an archive, and convert or filter
rather than silently dropping the rest.

### 4. Their own browser session — one activity at a time

If you can drive their browser, you can click the export button on a page they
are already signed in to. That is their data and an action they could do
themselves. It is reasonable for a handful of activities and wrong for two
hundred — use the bulk export for that.

### What not to do

- **Never ask for, store, or type their password.** Not for any provider, not
  even if they offer it.
- **Never work around a paywall or a private setting.** If AllTrails wants a
  subscription to download, that is the answer.
- **Do not scrape behind a login, and do not use unofficial API wrappers.**
  Garmin has no self-serve consumer API; the popular wrapper needs a raw
  password and breaks whenever Garmin changes an internal endpoint. Strava now
  blocks apps that reach its API through intermediaries.
- **Do not build a Strava integration to fetch one activity.** It needs them to
  register an app and complete OAuth, and even then the API has no GPX export
  for activities — only for routes. Telling them to press "Export GPX" takes
  ten seconds.

### Ask for the timestamps, not just the track

Files that belong together are grouped into one replay either way: by
overlapping recorded time, or failing that by covering the same route. What
timestamps buy is the animation — a timed track's marker sits where that person
actually was at each moment, while a file carrying shape alone is drawn and left
still, since inventing a pace for it would put it somewhere it never was. A
recorded activity normally keeps a timestamp on every
point — Strava's *Export Original* always does, as the watch's own `.fit`, along
with heart rate, cadence, power and temperature, and its *Export GPX* of an
activity normally keeps them too. A `.gpx` with no `<time>` is a route export,
or a file some other tool has stripped; ask for *Export Original* instead of
working with it.

### What to tell them, by provider

These are instructions to relay, not steps to automate. The full version, with
the caveats, is at <https://trailreplay.com/gpx-download-guide>.

| Where the route lives | What to tell them |
|---|---|
| **Strava** | Open the activity, three-dot menu top right, *Export GPX*. *Export Original* gives the watch's own `.fit`, which the app also reads — ask for that one when the GPX turns out to have no timestamps. |
| **Strava, many activities** | Settings → My Account → request an archive of your data. Arrives by email, can take hours. |
| **Wikiloc** | Open the trail, *Download* → *GPX*. Public trails usually work; some need an account. |
| **Garmin Connect** | Open the activity on the web dashboard, gear icon, *Export to GPX*. |
| **Garmin, many activities** | Account Management Center → *Export Your Data*. |
| **Komoot** | Open the tour, *…* menu → *Export GPX*. Planned tours export without timestamps. |
| **Polar Flow** | Open the training session, *Export* → GPX. |
| **AllTrails** | Route page → *Download route*. Needs a paid plan for most maps. |
| **Apple Health / Google Fit** | No direct GPX. Use the app that recorded it, Google Takeout, or a converter. |

### What to ask for

A recorded activity beats a drawn route: it carries timestamps and elevation,
which is what makes pace, duration and the elevation profile work. If what comes
back has neither, the replay still runs — it just moves at a constant pace over a
flat profile. Worth saying so before they wonder why.

---

*Recipes and `.replay` format version 1. The offline builder and a worked
example are served alongside this page: <https://trailreplay.com/make-replay.mjs> and
<https://trailreplay.com/example-recipe.json>. Source:
<https://github.com/alexalmansa/TrailReplay> (`app/src/utils/projectFile/`).*
