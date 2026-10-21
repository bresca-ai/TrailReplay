# TrailReplay App

This package contains the active TrailReplay application: the browser-based GPX replay editor, the tutorial page, and the GPX download guide.

## Commands

```bash
npm install
npm run dev
```

Other useful commands:

```bash
npm run lint
npm run test:run
npm run build
```

## Entry Points

- `src/main.tsx`: main app entry
- `src/help/tutorial-main.tsx`: tutorial page entry
- `src/help/gpx-guide-main.tsx`: GPX guide page entry

## Structure

- `src/components/`: main UI surfaces, map components, overlays, and panels
- `src/hooks/`: feature hooks for GPX import, media handling, and computed journey data
- `src/store/`: Zustand store factory, slices, and defaults
- `src/utils/`: pure domain logic and testable helpers
- `src/help/`: standalone help pages and shared help layout/content
- `src/i18n/`: translations and i18n hooks
- `public/`: static media, legal pages, and sample GPX/demo assets

## Build Output

Vite builds this package for the site root, and production output is written to `app/dist`.

## Fork Pull Request Previews

Cloudflare Pages does not automatically preview pull requests opened from forks. A maintainer can create one from **Actions → Approved fork preview** by entering the pull request number. The workflow builds the exact fork commit in a job without deployment credentials, then deploys its static output with Wrangler and reports the Cloudflare deployment against that commit. The repository must have a `CLOUDFLARE_API_TOKEN` Actions secret scoped to edit this Pages project.
