# Changelog

All notable user-facing changes are recorded here. TrailReplay follows [Semantic Versioning](https://semver.org/).

## [1.1.0] - 2026-09-21

### Added

- Create localized route annotations as map captions or timed field notes with symbols, headings, editable copy, and recipe support. Field notes are the default treatment for route stops and appear in exported videos.
- Include an example seven-stop Matagalls–Montserrat recipe and more reliable nearby-place lookup for long routes.

### Improved

- Keep annotations, pictures, videos, icon changes, and live stats aligned with the moving marker in Constant Pace mode, including legacy annotations without stored route anchors.
- Make MP4 video export more reliable: preserve annotation timing, smooth the slowdown, bound encoder memory, avoid redundant frames, and restore distance/elevation icons and labels.
- Improve local Studio exports with direct downloads and clearer frame-based progress.

### Analytics

- Product analytics now records the camera stability and follow-distance actually used during replay and export, including default values.
- Replay, video export, and poster export report bounded choices for major camera, map, annotation, media, video-format, and presentation options. Disabled choices are explicit; private annotation and poster text is never sent.
- Annotation creation is counted separately from annotations present in a replay or export.
- The GA4 product-usage exploration and custom dimensions are prepared. Breakdowns require new production events after deployment; historical parameters cannot be backfilled through custom dimensions.

## [1.0.0] - 2026-09-17

### Added

- A browser-based GPX storytelling studio with route replay, comparisons, annotations, media placement, live stats, elevation profiles, and export-ready video.
- Public release, contribution, security, and maintenance practices for the project.

### Security

- Updated MapLibre and other dependencies to resolve known advisories. MapLibre 6 now requires WebGL2 for map rendering.

### Licensing

- TrailReplay remains available under its existing attribution license. Apps using the software must display the attribution described in `LICENSE`.

[1.1.0]: https://github.com/bresca-ai/TrailReplay/releases/tag/v1.1.0
[1.0.0]: https://github.com/bresca-ai/TrailReplay/releases/tag/v1.0.0
