# Changelog

All notable user-facing changes are recorded here. TrailReplay follows [Semantic Versioning](https://semver.org/).

## [1.4.0] - 2026-10-28

This release makes it easier to compare routes, arrange a replay, and prepare a video or shareable image. It also refreshes the editor from route import through export.

### Added

- **Route comparisons:** Group routes in the timeline and compare their recorded times with a live leaderboard, or compare their geometry to highlight sections where they diverge. Set the separation threshold and slowdown, and customize the leaderboard's appearance, position and size. These settings are saved with the project and appear in exported videos.
- **Route trimming and languages:** Trim imported GPX routes before using them in a replay, and use the editor in Traditional Chinese (Taiwan).
- **Annotation placement:** Choose between a short map caption and a larger field note, then place it at a specific kilometre or at the playhead. Annotation opacity is adjustable.
- **Route colouring:** Define coloured route segments using either percentages or distances in kilometres. Heart-rate colour controls have also been reorganized.
- **Landmark icons:** Search a larger icon library or select an emoji for route landmarks; selected icons and colours are retained in saved projects and exports.
- **Experimental recorded elevation:** An optional map setting displays a route at its recorded altitude instead of following the terrain. Terrain clearance depends on loaded tiles, missing elevations may appear at sea level, and comparison tracks retain their existing behaviour. Further real-flight and export validation is needed.

### Improved

- **Editor navigation:** Redesigned Routes, Style, Map & Camera, Media and Generate panels organize controls around the task at hand. Workflow headers link to the next step, and secondary options take less space.
- **Map and camera:** Camera controls are more prominent, map styles have visual previews, and overlays and points of interest are more compact. Pitch and bearing can also be adjusted with sliders.
- **Route styling:** Route name and colour are easier to find, followed by advanced colouring, marker, label and statistics options. Comparison and route ordering are managed in the timeline instead of duplicated in Routes.
- **Video export:** Configure format, visual aspect ratio, quality and frame rate directly in Generate. The file-size estimate now reflects resolution, frame rate and rendering quality. Studio uses a higher target bitrate to preserve map detail.
- **Image and cover export:** Visual presets and expandable design, photo, map, title, statistics, route and logo controls make the image editor easier to scan. The interactive preview and video-cover workflow remain available. Project saving is accessible from both video and image modes.
- **Replay and presentation:** Improved cinematic camera behaviour, elevation sections, cover editing and export sky. Elevation gain is less affected by noisy data, and replay totals stay consistent. The replay marker follows the painted route more closely.
- **Export branding and localization:** Preview the watermark while arranging overlays, use the transparent white logo in video and cover exports, and benefit from more consistent German translations.
- Updated application dependencies and improved manual preview support for contributions from forks.

### Fixed

- Prevent route trimming from invalidating route-anchored elevation sections and colour zones.
- Improve landmark coordinate editing and prevent landmark-layer errors when the map style changes.
- Update the Zod dependency to address a known vulnerability.

## [1.3.0] - 2026-10-19

### Added

- Design an optional one-second opening cover for video exports directly over the map. Four starting layouts, including Long Way and two photo-and-map designs, support movable and resizable map, title, stats, and photo frames. Photos can be added from the project or dropped into frames, then cropped and zoomed.
- Customize cover stats with activity icons, labels, values, colors, order, and layout. The cover shares the selected video typography and can be configured by agent recipes.
- Dynamic elevation sections focus the profile on notable climbs and descents during replay and Studio export, with section markers and gain or loss labels.
- Import a Strava activity GPX through a browser bookmarklet, with a guided setup and import walkthrough.
- Paste or enter coordinates when adding a route landmark.
- Choose from additional bundled typography styles, including bold condensed options for covers.

### Improved

- Real Pace follows GPX and FIT timestamps, including pauses and stationary periods, so the marker, media, annotations, camera, and exports stay synchronized.
- Studio export uses deterministic map timing, waits for tiles before encoding, and produces higher-bitrate, more compatible H.264 video.
- Annotation text scales more clearly on mobile and portrait videos, and large route imports show progress while processing off the main interface thread.
- Map First poster editing pans and zooms the underlying map while keeping the trail aligned; route landmarks are localized across the five supported languages.
- Fresh projects start with the satellite map style, and the tutorial now covers camera modes and dynamic elevation more clearly.

## [1.2.0] - 2026-10-06

### Added

- Cinematic camera keyframes now support MapLibre's full zoom range, enabling continent-scale overview shots and smooth transitions into close route details.
- The cinematic camera editor shows the current zoom value while composing a shot.

### Improved

- German translations use consistent informal language and correct activity terminology, including heart-rate labels.
- React, Zustand, Radix Slider, Tailwind Merge, and the development toolchain have been updated to compatible current versions.

### Security

- Updated `source-map-js` and `brace-expansion` to patched versions.

## [1.1.0] - 2026-09-27

### Added

- Missing pictures restored from a `.replay` project can be re-linked automatically by uploading files with the same names, while preserving their route positions, durations, titles, and descriptions.
- An opt-in export profiler and repeatable browser benchmark report map rendering, overlay capture, frame compositing, and encoding time.

### Fixed

- Photos and video clips open when the route marker reaches them instead of appearing early on long replays.
- Long MP4 exports release temporary document clones and media URLs instead of retaining them across repeated captures or re-links.
- Concurrent overlay captures clean up only their own temporary iframe, preventing missing or corrupted overlays.

### Improved

- Video export reuses static overlay captures and lightweight document clones, substantially reducing export time and memory growth while keeping map frames, media, stats, and elevation progress at full output frame rate.
- Picture holds default to three seconds, producing more concise replays while keeping existing custom durations unchanged.
- The 1080p/30 fps release candidate was verified as H.264 High profile at approximately 5 Mbps, with a valid downloadable duration and full-resolution overlays.

## [1.0.2] - 2026-09-21

Version 1.0.1 was prepared but never published as a release; its changes ship here.

### Added

- Route annotations: notes and icon changes anchored to a point on the route, shown on the map or in a side panel, with a playback hold and localized content. Recipes can author them too.

### Fixed

- Annotations and icon changes stay at the right place on the route when switching between Constant Pace and Real Pace, including annotations from older projects.
- Route-note content is fully editable.
- Stat icons and labels appear again in exported videos.
- Local Studio export works and reports frame progress.

### Improved

- Video exports with annotations use far less memory and finish faster: redundant slowdown frames are skipped, the background map warm-up is released during export, and encoded video is no longer held in memory until the end.
- Product analytics records the camera stability and follow-distance actually used during replay and export, including default values.
- Replay, video export, and poster export report bounded choices for major camera, map, annotation, media, video-format, and presentation options. Disabled choices are explicit; private annotation and poster text is never sent.
- Annotation creation is counted separately from annotations present in a replay or export.

### Reporting

- The GA4 product-usage exploration and custom dimensions are prepared. Breakdowns require new production events after deployment; historical parameters cannot be backfilled through custom dimensions.

## [1.0.0] - 2026-09-17

### Added

- A browser-based GPX storytelling studio with route replay, comparisons, annotations, media placement, live stats, elevation profiles, and export-ready video.
- Public release, contribution, security, and maintenance practices for the project.

### Security

- Updated MapLibre and other dependencies to resolve known advisories. MapLibre 6 now requires WebGL2 for map rendering.

### Licensing

- TrailReplay remains available under its existing attribution license. Apps using the software must display the attribution described in `LICENSE`.

[1.4.0]: https://github.com/bresca-ai/TrailReplay/releases/tag/v1.4.0
[1.3.0]: https://github.com/bresca-ai/TrailReplay/releases/tag/v1.3.0
[1.2.0]: https://github.com/bresca-ai/TrailReplay/releases/tag/v1.2.0
[1.1.0]: https://github.com/bresca-ai/TrailReplay/releases/tag/v1.1.0
[1.0.2]: https://github.com/bresca-ai/TrailReplay/releases/tag/v1.0.2
[1.0.0]: https://github.com/bresca-ai/TrailReplay/releases/tag/v1.0.0
