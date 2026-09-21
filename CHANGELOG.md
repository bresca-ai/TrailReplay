# Changelog

All notable user-facing changes are recorded here. TrailReplay follows [Semantic Versioning](https://semver.org/).

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

[1.0.2]: https://github.com/bresca-ai/TrailReplay/releases/tag/v1.0.2
[1.0.0]: https://github.com/bresca-ai/TrailReplay/releases/tag/v1.0.0
