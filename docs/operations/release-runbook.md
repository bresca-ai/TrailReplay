# Release runbook

TrailReplay uses a continuous deployment model: merges to `main` are production deployments through Cloudflare Pages. A GitHub Release marks a deliberate public milestone; it does not deploy a separate artifact.

Production builds retain fingerprinted assets from prior deployments for 30 days
after they stop being the live build. This lets an open editor load older lazy
panels without a reload that would discard its in-memory work. The build fetches
the live site's retention manifest and fails if it cannot carry the assets
forward; the first build bootstraps from the live site's Vite dependency graph.
The manifest must remain served with `Cache-Control: no-store`. A session left
open beyond the retention period is not protected by this mechanism, so users
should save their work before reloading. Preview and local builds do not fetch
production assets unless `TRAILREPLAY_ASSET_SOURCE` is explicitly set.

## Before a release

1. Merge only reviewed pull requests with successful CI and Cloudflare Pages checks.
2. Test the deployed `main` revision on trailreplay.com: page load, GPX import, map render, replay controls, and the relevant changed workflow.
3. Date the current version's `CHANGELOG.md` section and bump the same SemVer value in `package.json`, `app/package.json`, `app/package-lock.json`, and `APP_VERSION`.
4. Run `npm run lint`, `npm run test`, `npm run build`, and `npm run verify:release -- --publish` locally or in CI.
5. Merge the release-preparation pull request into `main` and verify the Cloudflare Pages production check for that exact commit.

## Publish the GitHub Release

In GitHub Actions, run **Release → Tag and publish GitHub Release** from `main`. Enter the package version without `v`, such as `1.0.1`. The workflow validates metadata, rebuilds the app, creates an immutable `v1.0.1` tag at the deployed `main` commit, and generates GitHub release notes.

Never move, reuse, or delete a published release tag. Publish a new patch version to correct a release.

## Roll back a bad deployment

1. Identify the last known-good release tag and Cloudflare Pages deployment.
2. Use Cloudflare Pages to roll production back to that deployment immediately.
3. Open a fix pull request; do not rewrite `main` or change a published tag.
4. Record customer impact and the corrective release in the next GitHub Release.

## Versioning

- `MAJOR`: a breaking change to the public project-file format or supported public integration.
- `MINOR`: backwards-compatible functionality.
- `PATCH`: backwards-compatible fix, content correction, or operational improvement.

The `.replay` format has an independent `formatVersion`; do not bump it merely because the application version changes.
