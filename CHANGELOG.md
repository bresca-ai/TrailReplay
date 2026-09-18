# Changelog

All notable user-facing changes are recorded here. TrailReplay follows [Semantic Versioning](https://semver.org/).

## [1.0.1] - 2026-09-18

### Improved

- Product analytics now records the camera stability and follow-distance actually used during replay and export, including default values.
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

[1.0.1]: https://github.com/bresca-ai/TrailReplay/releases/tag/v1.0.1
[1.0.0]: https://github.com/bresca-ai/TrailReplay/releases/tag/v1.0.0
