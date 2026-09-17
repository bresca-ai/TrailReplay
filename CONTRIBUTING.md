# Contributing to TrailReplay

Thanks for helping make outdoor stories easier to share. Issues, discussions, documentation improvements, tests, and code contributions are all welcome. The repository uses a [custom attribution license](LICENSE), so read its terms before reusing the code.

## Before opening an issue

Use a GitHub Discussion for questions, ideas, or early product exploration. Use an issue for a reproducible bug or a concrete, scoped proposal. Never upload private GPX files, exact home/work locations, unredacted personal media, API tokens, or account credentials.

## Local setup

TrailReplay requires Node.js 22.

```bash
git clone https://github.com/bresca-ai/TrailReplay.git
cd TrailReplay
npm --prefix app ci
npm run dev
```

Before opening a pull request, run:

```bash
npm run lint
npm run test
npm run build
npm run verify:release
```

## Pull requests

Create a focused branch from `main`, explain the user impact, and include evidence in the pull request template. Every pull request receives CI and a Cloudflare Pages preview. Do not merge a change based solely on a successful build: test the affected user flow in the preview when practical.

Keep commits and pull requests small enough to review. Add or update tests for behavior changes. Changes that alter public behavior, configuration, privacy, deployment, or project-file compatibility need matching documentation.

## Release policy

`main` is the production branch. Cloudflare Pages deploys it to trailreplay.com; CI and Cloudflare Pages checks must pass before changes can merge. GitHub Releases are deliberate product milestones, tagged from `main` as `vMAJOR.MINOR.PATCH`; see [the release runbook](docs/operations/release-runbook.md).
