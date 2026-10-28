# Changelog

All notable user-facing changes are recorded here. TrailReplay follows [Semantic Versioning](https://semver.org/).

## [1.4.0] - 2026-10-28

### Added

- Compare routes by recorded time or route geometry in the timeline, with a live leaderboard, configurable separation threshold and split-camera playback.
- Trim imported GPX routes, search a larger library of landmark icons, and use Traditional Chinese (Taiwan) throughout the editor.
- Place map captions and field notes at a selected distance along a route, or at the playhead. Set annotation opacity and colour route sections by distance in kilometres or percentage.
- Try an experimental recorded-elevation mode for routes above the terrain. Terrain clearance depends on loaded map tiles, missing elevations may appear at sea level, and comparison tracks retain their existing behaviour; further flight and export validation is needed.

### Improved

- Redesign the Routes, Style, Map & Camera, Media and Generate panels, with more prominent camera controls, visual map and export presets, compact expandable controls and easier navigation between steps.
- Configure video format, visual aspect ratio, quality and frame rate directly in Generate. Image and cover editing use compact sections, while project saving remains accessible in both modes.
- Estimate video file size using the configured resolution, frame rate and rendering quality.
- Customize the comparison leaderboard and preserve its styling and position in saved projects and video exports.
- Improve cinematic camera and elevation sections, cover editing, and the export sky. Reduce noisy elevation gain and keep replay totals consistent.
- Keep the replay marker aligned with the painted route and preserve route styling in recorded-elevation mode. Preview the watermark while arranging export overlays and use a transparent white logo in exports.
- Add camera pitch and bearing sliders, refine German translations, and update application dependencies.

### Fixed

- Keep route trimming safe around route-anchored elevation sections and colour zones.
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
