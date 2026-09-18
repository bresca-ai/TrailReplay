# GA4 settings usage rollout (v1.0.1)

The [product usage exploration](https://analytics.google.com/analytics/web/#/analysis/a192194722p501626719/edit/oo9up-vLS3WzKfTC6gecrw) is saved in property `trailreplay-72d80`. It has tabs for action adoption, camera mode, camera stability, follow-behind distance, settings changes, feature choices, annotation presence, camera preset, and map style. It is owned by the account that created it, not automatically shared with all property users.

## What is measured

- `playback_started` and `export_started` carry `camera_mode`, `camera_preset`, `camera_stability_bucket`, `camera_zoom_bucket`, and `has_annotations` (export now includes the latter). The two new camera buckets describe settings in use, not transient map movement. Stability is `stable` below 0.35, `balanced` from 0.35 through 0.65, and `reactive` above 0.65; overview is `not_applicable`. The follow-behind distance slider (0–100) is grouped into `far` (<25), `medium_far` (25–<50), `medium_close` (50–<75), and `close` (75+); other camera modes are `not_applicable`.
- Each replay or video-export start emits `feature_used` with `feature_context` of `playback` or `video_export` and one bounded `feature_name`/`feature_value` pair for camera, map, terrain, annotation count, picture/video count, visibility, marker, route labels, color mode, overlays, statistics, and presentation options. Video export additionally reports actual/requested format, quality, frame rate, aspect ratio, resolution, and audio. The `none` and `disabled` values are intentional. Poster export emits its own eight options with context `social_export` only after a successful export.
- `annotation_created` counts authoring separately. No annotation text, route names, custom poster title, image ID, coordinates, or filenames are included in the new events.
- `settings_changed` measures editing activity, not the share of users who **use** a setting. Do not interpret slider-change event counts as preference shares.

GA4 custom event dimensions `Camera mode`, `Camera preset`, `Camera stability bucket`, `Camera zoom bucket`, `Has annotations`, `Map style`, `Setting name`, `Setting value`, `Feature name`, `Feature value`, `Feature context`, and `Feature state` were registered on 2026-09-18. The exploration must be filtered to `feature_used` for feature-choice analysis; `feature_enabled` is a change event, not usage. Filter `Feature context` to `playback`, `video_export`, or `social_export` before comparing a particular workflow. These custom dimensions are not retroactive.

## Denominators and interpretation

Use **active users**, not event count, in each breakdown. For an option among replay creators, divide unique users with that `feature_name` + `feature_value` + `feature_context=playback` by unique users with `playback_started` over the same dates. For export choices, use `export_started` users and `video_export`; for poster choices, use `social_share_exported` users and `social_export`. For annotation creation, compare `annotation_created` users with route-imported users if the question is authoring adoption; use `has_annotations=true` / `playback_started` for annotations actually present in replays. Keep `(not set)` visible while auditing completeness, but exclude pre-deployment events from preference shares. A person can use multiple values within a date range, so shares can sum above 100%; “most common” does not imply mutually exclusive users.

## Before tagging the release

1. Merge the PR and wait for Cloudflare Pages to deploy the merge commit. The release workflow refuses to tag an undeployed SHA.
2. In production with Analytics DebugView, import a route, play with untouched defaults, change camera mode/stability/follow distance and play again, create an annotation, export video, then export a poster. Verify one `playback_started` and the bounded `feature_used` options per play, `export_started` with annotation presence, `annotation_created`, and poster context. Verify no free text or IDs appear.
3. After GA4 processing, confirm the new dimensions have values other than `(not set)` on **post-deployment** dates. The pre-deployment period cannot answer stable/reactive or zoom shares. Investigate any missing values before presenting percentages.
4. Run `npm run verify:release`, `npm test`, `npm run lint`, and `npm run build`; then dispatch the `Release` workflow from `main` with version `1.0.1` once the deployment check is green. Do not dispatch before merge/deployment.
