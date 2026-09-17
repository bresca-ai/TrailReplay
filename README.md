<p align="center">
  <img src="./docs/branding-assets/SVG/logohorizontalfondo.svg" alt="TrailReplay" width="520">
</p>

[![CI](https://github.com/bresca-ai/TrailReplay/actions/workflows/ci.yml/badge.svg)](https://github.com/bresca-ai/TrailReplay/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Live app](https://img.shields.io/badge/live-trailreplay.com-0B7285)](https://trailreplay.com)

TrailReplay is a browser-based GPX storytelling studio for runners, cyclists, hikers, and outdoor creators. It turns raw route files into polished, shareable replays with map animation, live stats, elevation, media, and export-ready video, all directly in the browser.

The active product lives in [`app/`](./app) and powers [trailreplay.com](https://trailreplay.com).

## Why It Exists

Most GPX tools stop at route inspection. TrailReplay is built for presentation: turning an activity, a trip, or a comparison between tracks into something easy to review, explain, and share.

## What You Can Do

- Import one or many GPX files and replay them on an interactive 3D map.
- Build a full journey by combining tracks, reordering them, and adding transport segments.
- Display live stats, elevation, pace, and route progress during playback.
- Attach photos to the route from metadata when available or place them manually.
- Add annotations and storytelling moments along the route.
- Compare tracks from the same time window and inspect timing differences.
- Export polished videos with map motion, stats overlays, elevation profile, and branded output.
- Keep the core GPX workflow local in the browser by default.

## Demo Videos

**Path Export with Stats**  
Export a route story with animated map playback, live stats, elevation profile, and branded video output.

https://github.com/user-attachments/assets/73c65611-8348-4b4d-b7c2-af661ab5e75f

[▶ Watch in tutorial](https://trailreplay.com/tutorial.html#demo-videos)

**Comparison Mode**  
Compare two GPX tracks from the same time window and see where each person was at every moment.

https://github.com/user-attachments/assets/c42e5efd-6c08-4591-ab66-92cc16484f24

[▶ Watch in tutorial](https://trailreplay.com/tutorial.html#demo-videos)

> If GitHub does not render the inline previews for your session, you can still watch them in the tutorial or open the original MP4 files in [`media/video/`](./media/video).

## Core Workflow

1. Import GPX tracks.
2. Clean up or combine them into a single journey.
3. Add photos, annotations, and visual context.
4. Replay the route on the map.
5. Export a ready-to-share video.

## Live Links

- App: [trailreplay.com](https://trailreplay.com)
- Tutorial: [trailreplay.com/tutorial.html](https://trailreplay.com/tutorial.html)
- GPX download guide: [trailreplay.com/gpx-download-guide.html](https://trailreplay.com/gpx-download-guide.html)

## Local Development

From the repository root:

```bash
npm --prefix app install
npm run dev
```

From the app folder:

```bash
cd app
npm install
npm run dev
```

Useful commands:

```bash
npm run lint
npm run test
npm run build
npm run preview
```

The root scripts delegate to the active frontend in `app/`.

## Contributing and Releases

TrailReplay is open source under the [MIT License](./LICENSE). Please read the
[contribution guide](./CONTRIBUTING.md) before opening an issue or pull request,
and report security-sensitive issues through the [security policy](./SECURITY.md).

`main` is continuously deployed to trailreplay.com by Cloudflare Pages. GitHub
Releases mark intentional public milestones and are tagged from the deployed
`main` commit. The current release line is **v1.0.0**; maintainers should follow
the [release runbook](./docs/operations/release-runbook.md).

## Stack

- React 19 + TypeScript + Vite for the frontend application.
- MapLibre GL for the interactive map and route playback surfaces.
- Zustand for app state and editor workflows.
- Vitest and Testing Library for test coverage.
- GitHub Discussions for community feedback and feature requests.

## Repository Layout

- `app/`: active TrailReplay frontend, help pages, public assets, and tests
- `functions/`: Cloudflare Pages Functions for the deployed site
- `docs/branding-assets/`: logo files and brand assets used by the project
- `docs/internal/`: maintainer-facing implementation notes and issue writeups
- `media/`: repository media used in documentation and demos
- `docs/operations/`: contributor-facing release and operational runbooks

## Notes

- The active runtime is the browser app inside `app/`.
- Help, tutorial, and GPX guide pages ship alongside the main app.
- GPX processing stays local in the browser by default; community feedback is posted through GitHub Discussions.
