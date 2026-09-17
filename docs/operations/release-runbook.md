# Release runbook

TrailReplay uses a continuous deployment model: merges to `main` are production deployments through Cloudflare Pages. A GitHub Release marks a deliberate public milestone; it does not deploy a separate artifact.

## Before a release

1. Merge only reviewed pull requests with successful CI and Cloudflare Pages checks.
2. Test the deployed `main` revision on trailreplay.com: page load, GPX import, map render, replay controls, and the relevant changed workflow.
3. Update `CHANGELOG.md` and bump the same SemVer value in `package.json`, `app/package.json`, `app/package-lock.json`, and `APP_VERSION`.
4. Run `npm run lint`, `npm run test`, `npm run build`, and `npm run verify:release` locally or in CI.
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
