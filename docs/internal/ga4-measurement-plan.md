# TrailReplay GA4 Measurement Plan

Last updated: 2026-08-17

## Implementation status

The phase-one measurement foundation is implemented on `codex/seo-foundation-ga4`:

- duplicate pageviews are prevented with `send_page_view: false`
- app, tutorial, and GPX guide entrypoints initialize analytics with page context
- localhost, `*.vercel.app`, and `*.pages.dev` are excluded by default
- filenames and custom timestamps are no longer sent
- route imports, video exports, feedback submissions, support clicks, help CTAs, and Web Vitals have reporting context
- map styles, overlays, 3D terrain, camera modes, follow-behind presets, and replay controls are measured
- Google Signals and advertising-personalization signals are disabled
- the privacy policy discloses GA4 collection

GA4 Admin configuration and production DebugView verification remain manual. Follow `docs/internal/ga4-rollout-checklist.md` after deployment.

## Scope

This document defines the GA4 event model for the web product in `trailreplay/app`.

It covers:

- data-quality fixes for the current setup
- exact event names
- exact event parameters
- recommended GA4 custom dimensions
- recommended GA4 key events
- the first three GA4 explorations to build after rollout

This plan does not yet cover native iOS analytics. The current iOS app has no Firebase/GA instrumentation in the repository.

## Current State Summary

The current repository already sends GA4 events from the web app for:

- `page_view`
- `route_import_started`
- `route_import_completed`
- `route_import_failed`
- `photo_import_started`
- `photo_import_file_processed`
- `photo_import_completed`
- `export_started`
- `export_completed`
- `generate_lead` (new Studio delivery email captured; no email address is sent to GA4)
- `export_failed`
- `export_cancelled`
- `web_vital`
- `project_save_started`
- `project_save_completed`
- `project_save_cancelled`
- `project_save_failed`
- `project_open_started`
- `project_open_completed`
- `project_open_failed`
- `project_open_cancelled`

Current issues to fix before expanding coverage:

1. The app likely sends duplicate page views because it calls both `gtag('config', ...)` and a manual `page_view`.
2. The tutorial and GPX guide entrypoints do not initialize analytics.
3. Preview deployments can pollute production analytics because `.pages.dev` is not excluded.
4. `photo_file_name` is high-cardinality and should not be sent.
5. The custom `timestamp` event parameter is unnecessary because GA4 already stores event time.
6. The privacy page does not disclose Google Analytics usage.

## Measurement Principles

Use these rules for all new analytics work:

1. Keep event names short, stable, and product-oriented.
2. Prefer low-cardinality parameters.
3. Do not send raw filenames, full free text, email addresses, or route titles.
4. Prefer enums like `manual`, `gps`, `timestamp`, `webm`, `mp4`.
5. Only register custom dimensions for parameters that will be used in reporting.
6. Treat imports and exports as the primary activation funnel.

## Immediate Implementation Changes

These changes should happen before or alongside event expansion:

| Change | Action |
| --- | --- |
| Page view duplication | Keep automatic GA4 pageviews or set `send_page_view: false` and manage them manually. Do not do both. |
| Tutorial and GPX guide coverage | Call `initAnalytics()` in `tutorial-main.tsx` and `gpx-guide-main.tsx`. |
| Preview deployment exclusion | Disable analytics on `*.pages.dev` hosts unless explicitly enabled. |
| High-cardinality photo params | Remove `photo_file_name`. |
| Redundant timestamp param | Remove custom `timestamp` from the shared event payload. |
| Privacy disclosure | Update privacy copy to mention Google Analytics / GA4. |

## Event Taxonomy

### 1. Navigation and Page Context

| Event | Trigger | Parameters | Key Event |
| --- | --- | --- | --- |
| `page_view` | Every tracked page load | `page_type`, `page_group` | No |
| `help_cta_clicked` | User clicks tutorial or GPX guide links from the app | `cta_location`, `target_page` | No |
| `outbound_link_clicked` | User clicks external links from info/support/footer areas | `link_type`, `link_location`, `destination_host` | No |

Parameter definitions:

- `page_type`: `app`, `tutorial`, `gpx_guide`, `privacy`, `terms`, `acknowledgments`
- `page_group`: `product`, `help`, `legal`
- `cta_location`: `welcome_overlay`, `app_header`, `info_panel`, `gpx_guide`, `tutorial`
- `target_page`: `tutorial`, `gpx_guide`, `app`
- `link_type`: `support`, `github`, `instagram`, `provider`, `legal`, `feedback`
- `link_location`: `header`, `info_panel`, `footer`, `help_page`
- `destination_host`: normalized host only, for example `ko-fi.com`

### 2. Activation Funnel

| Event | Trigger | Parameters | Key Event |
| --- | --- | --- | --- |
| `welcome_action_clicked` | User clicks upload or explore from the empty-state overlay | `welcome_action` | No |
| `file_picker_opened` | User opens the route file picker | `picker_location` | No |
| `route_import_started` | Import begins | `route_file_count`, `route_input_method` | No |
| `route_import_completed` | At least one route was parsed and added | `route_file_count`, `route_imported_track_count`, `route_import_is_multi_file`, `route_total_distance_bucket`, `route_has_timestamps` | Yes |
| `route_import_failed` | Route import throws | `route_file_count`, `route_error_type` | No |

Parameter definitions:

- `welcome_action`: `upload`, `explore`
- `picker_location`: `welcome_overlay`, `tracks_panel`
- `route_input_method`: `file_picker`, `dropzone`
- `route_import_is_multi_file`: whether the user selected more than one file in the import action
- `route_total_distance_bucket`: `short`, `medium`, `long`, `ultra`
- `route_has_timestamps`: `true`, `false`
- `route_error_type`: `parse_error`, `empty_result`, `unsupported_format`, `unknown`

Recommended bucket thresholds:

- `short`: `< 10km`
- `medium`: `10km-42km`
- `long`: `42km-80km`
- `ultra`: `80km+`

### 3. Route and Journey Editing

| Event | Trigger | Parameters | Key Event |
| --- | --- | --- | --- |
| `comparison_track_added` | User adds a comparison route | `comparison_track_count` | No |
| `track_visibility_changed` | User toggles route visibility | `visible`, `track_count_visible` | No |
| `journey_segment_changed` | User edits journey structure | `journey_action`, `journey_segment_count` | No |
| `transport_added` | User inserts a transfer between route segments | `transport_mode`, `journey_segment_count`, `journey_track_count` | No |
| `settings_changed` | User changes reporting-relevant settings | `setting_name`, `setting_value` | No |
| `feature_enabled` | User turns a toggleable map feature on or off | `feature_name`, `feature_state`, `feature_context` | No |

Parameter definitions:

- `journey_action`: `added`, `removed`, `reordered`, `updated`
- `transport_mode`: `car`, `bus`, `train`, `plane`, `bike`, `walk`, or `ferry`
- `setting_name`: `language`, `unit_system`, `map_style`, `camera_mode`, `show_pictures`
- `setting_value`: bounded enum only

For `feature_enabled`, use only product-owned bounded names such as `terrain_3d` and `map_overlay_skiPistes`; `feature_state` is `enabled` or `disabled`, and `feature_context` is currently `settings`.

Only send `settings_changed` for settings that materially affect usage analysis. Do not send every transient slider update.

### 4. Playback and Replay Engagement

| Event | Trigger | Parameters | Key Event |
| --- | --- | --- | --- |
| `playback_started` | User starts playback from a stopped state | `playback_source`, `has_pictures`, `has_annotations`, `track_count`, `camera_mode`, `camera_preset`, `map_style`, `terrain_3d_enabled` | No |
| `playback_paused` | User pauses playback | `playback_progress_bucket` | No |
| `playback_seeked` | User scrubs or skips the timeline | `seek_method`, `playback_progress_bucket` | No |
| `playback_speed_changed` | User changes speed | `playback_speed` | No |
| `playback_completed` | Playback reaches the end | `track_count`, `journey_segment_count` | No |

Parameter definitions:

- `playback_source`: `play_button`, `restart_button`, `auto_resume`
- `has_pictures`: `true`, `false`
- `has_annotations`: `true`, `false`
- `seek_method`: `slider`, `skip_forward`, `skip_backward`, `jump_to_media`
- `playback_progress_bucket`: `0_25`, `25_50`, `50_75`, `75_100`
- `playback_speed`: `0.25`, `0.5`, `1`, `2`, `4`, `8`

### 5. Media Workflow

| Event | Trigger | Parameters | Key Event |
| --- | --- | --- | --- |
| `photo_import_started` | Photo import begins | `photo_received_file_count`, `photo_image_file_count` | No |
| `photo_import_file_processed` | One photo is processed | `photo_has_gps`, `photo_has_timestamp`, `photo_placement_result`, `photo_manual_reason` | No |
| `photo_import_completed` | Photo import finishes | `photo_picture_count_added`, `photo_queued_for_manual_placement` | No |
| `pending_photo_resolved` | User resolves queued manual placement | `resolution_method` | No |
| `annotation_created` | User adds a text annotation | `annotation_type` | No |

Parameter definitions:

- `photo_has_gps`: `true`, `false`
- `photo_has_timestamp`: `true`, `false`
- `photo_placement_result`: `gps`, `timestamp`, `manual`, `pending`, `unknown`
- `photo_manual_reason`: `no_route_match`, `missing_metadata`, `timestamp_out_of_range`, `unknown`
- `resolution_method`: `manual_map`, `timestamp_fallback`, `skip`
- `annotation_type`: `text`

Do not send raw filenames.

### 6. Export Funnel

| Event | Trigger | Parameters | Key Event |
| --- | --- | --- | --- |
| `export_started` | User starts export | `export_format`, `export_quality`, `export_fps`, `export_aspect_ratio`, `export_include_stats`, `export_include_elevation`, `track_count`, `picture_count`, `export_duration_bucket` | No |
| `export_completed` | Export finishes with a downloadable blob | `export_format`, `export_blob_size_bucket`, `export_encoder_path`, `export_duration_bucket` | Yes |
| `export_failed` | Export fails | `export_failure_scope`, `export_format`, `export_encoder_path` | No |
| `export_cancelled` | User cancels export | `export_progress_bucket`, `export_stage` | No |
| `export_downloaded_again` | User re-downloads a completed export | `export_format` | No |

Parameter definitions:

- `export_format`: `mp4`, `webm`
- `export_quality`: existing app enum
- `export_fps`: numeric, expected set `30`, `60`
- `export_aspect_ratio`: `16:9`, `1:1`, `9:16`
- `export_include_stats`: `true`, `false`
- `export_include_elevation`: `true`, `false`
- `track_count`: integer
- `picture_count`: integer
- `export_duration_bucket`: `short`, `medium`, `long`
- `export_blob_size_bucket`: `small`, `medium`, `large`, `xlarge`
- `export_encoder_path`: `webcodecs`, `mediarecorder`
- `export_failure_scope`: `setup`, `no_data`, `encoder_finalize`, `recorder_error`, `unknown`
- `export_progress_bucket`: `0_25`, `25_50`, `50_75`, `75_100`

Recommended thresholds:

- `export_duration_bucket`: `short < 30s`, `medium 30s-90s`, `long > 90s`
- `export_blob_size_bucket`: `small < 25MB`, `medium 25MB-100MB`, `large 100MB-250MB`, `xlarge > 250MB`

### 7. Feedback and Support

| Event | Trigger | Parameters | Key Event |
| --- | --- | --- | --- |
| `feedback_prompt_shown` | Feedback solicitation popup appears | `activity_count_bucket` | No |
| `feedback_prompt_action` | User chooses yes, later, or dismiss | `feedback_prompt_action` | No |
| `feedback_submitted` | Feedback form submits successfully | `feedback_category`, `has_email` | Yes |
| `feedback_submit_failed` | Feedback submission fails | `feedback_category` | No |
| `support_clicked` | User clicks Ko-fi | `support_location` | Optional |

Parameter definitions:

- `activity_count_bucket`: `3_5`, `6_10`, `10_plus`
- `feedback_prompt_action`: `open_form`, `maybe_later`, `dismiss`
- `feedback_category`: `love_it`, `needs_work`, `feature_request`
- `has_email`: `true`, `false`
- `support_location`: `header`, `info_panel`

### 8. Performance

| Event | Trigger | Parameters | Key Event |
| --- | --- | --- | --- |
| `web_vital` | When web-vitals reports | `web_vital_name`, `web_vital_value`, `page_type` | No |

Current coverage is already present. Add `page_type` to make the metrics usable across the app and help pages.

### 9. Project File (Save / Open)

Tracks usage of the `.replay` project save/open feature (issue #79), which lets a user
persist the current project (routes, journey, annotations, settings — never photo/video
bytes) to a downloadable archive and later reopen it instead of re-importing GPX/KML.

The project has an editable name (`journey.name`, edited in the Generate tab's Save
Project card) that drives the saved file name. On Chromium browsers, saving uses the
File System Access API (`showSaveFilePicker`) so the user can overwrite an existing file
in place instead of the browser auto-suffixing a new download; the chosen file handle is
remembered for the rest of the page session so repeat saves silently overwrite the same
file. Firefox/Safari (no File System Access API support) fall back to a plain anchor
download, same as before.

| Event | Trigger | Parameters | Key Event |
| --- | --- | --- | --- |
| `project_save_started` | User clicks Save Project (sidebar) or the popup-blocked feedback fallback | `save_source` | No |
| `project_save_completed` | The `.replay` archive was written (overwritten via File System Access, or downloaded) | `save_source`, `save_method`, `track_count`, `picture_count`, `video_count` | Yes |
| `project_save_cancelled` | User dismissed the native save-file picker without choosing a location | `save_source` | No |
| `project_save_failed` | Archive build or write/download failed | `save_source` | No |
| `project_open_started` | User selects a `.replay` file to open | — | No |
| `project_open_completed` | The archive was parsed and the project state restored | `format_version`, `track_count`, `picture_count`, `video_count` | Yes |
| `project_open_failed` | The archive was corrupt, oversized, an unsupported version, or missing an asset | `error_code` | No |
| `project_open_cancelled` | User declined the "this will replace your current work" confirmation | `reason` | No |

Parameter definitions:

- `save_source`: `sidebar`, `feedback_popup_blocked`
- `save_method`: `file_system_access`, `download`
- `track_count`, `picture_count`, `video_count`: integers
- `format_version`: integer, the `.replay` archive's `formatVersion`
- `error_code`: `corrupt`, `unsupported-version`, `missing-asset`, `too-large`, `unknown`
- `reason`: `confirm_replace_declined`

Break down `project_save_completed` by `save_method` to see what share of saves land as
a true in-place overwrite (`file_system_access`) versus a plain download that the browser
may auto-suffix (`download`).

Compare `project_open_completed` against `route_import_completed` to see what share of
route-loading sessions come from reopening a saved project rather than importing a fresh
GPX/KML file, and compare `project_save_completed` counts against `export_completed` to
gauge Save-Project adoption relative to video export.

## GA4 Custom Dimensions to Register

Register only the dimensions needed for reporting. Suggested event-scoped dimensions:

| Dimension Name | Parameter |
| --- | --- |
| `page_type` | `page_type` |
| `page_group` | `page_group` |
| `cta_location` | `cta_location` |
| `target_page` | `target_page` |
| `route_input_method` | `route_input_method` |
| `route_import_is_multi_file` | `route_import_is_multi_file` |
| `route_total_distance_bucket` | `route_total_distance_bucket` |
| `route_error_type` | `route_error_type` |
| `photo_placement_result` | `photo_placement_result` |
| `photo_manual_reason` | `photo_manual_reason` |
| `resolution_method` | `resolution_method` |
| `export_aspect_ratio` | `export_aspect_ratio` |
| `export_quality` | `export_quality` |
| `export_encoder_path` | `export_encoder_path` |
| `export_failure_scope` | `export_failure_scope` |
| `export_duration_bucket` | `export_duration_bucket` |
| `export_blob_size_bucket` | `export_blob_size_bucket` |
| `feedback_category` | `feedback_category` |
| `support_location` | `support_location` |
| `feature_name` | `feature_name` |
| `feature_state` | `feature_state` |
| `feature_context` | `feature_context` |
| `setting_name` | `setting_name` |
| `setting_value` | `setting_value` |
| `transport_mode` | `transport_mode` |
| `camera_mode` | `camera_mode` |
| `camera_preset` | `camera_preset` |
| `map_style` | `map_style` |
| `terrain_3d_enabled` | `terrain_3d_enabled` |
| `link_location` | `link_location` |
| `link_type` | `link_type` |
| `save_source` | `save_source` |
| `save_method` | `save_method` |
| `error_code` | `error_code` |

Do not register dimensions for:

- raw file names
- timestamps
- free text feedback
- route titles
- full URLs unless absolutely necessary

## GA4 Key Events

Mark these as key events after rollout:

| Event | Why |
| --- | --- |
| `route_import_completed` | Primary activation event |
| `export_completed` | Primary product success event |
| `feedback_submitted` | Strong engagement / user intent signal |
| `support_clicked` | Optional, only if support behavior matters commercially |
| `project_save_completed` | Direct answer to "how many users download a `.replay` file" |
| `project_open_completed` | Direct answer to "how many users reopen a project instead of importing a fresh GPX" |
| `generate_lead` | A Studio video delivery was successfully registered with an email address |

Do not mark low-intent events like `page_view`, `playback_started`, or `help_cta_clicked` as key events.

The Studio registration endpoint stores normalized first- and last-touch source,
medium, campaign, referring host, and landing-page path with the lead record.
Browser attribution expires after 90 days. Direct visits without a measurable
referrer are labeled `unknown`, since an AI or other app may have removed the
referrer. The `generate_lead` event carries only non-identifying first/last-touch
parameters; email addresses and route data must never be sent to GA4. The D1
`leads` table is the source of truth for unique captured emails; `generate_lead`
counts successful Studio delivery registrations, so repeat exports can produce
more GA4 events than new D1 lead rows. GA4 event counts can also differ when
Analytics is blocked.

## Recommended Audiences

Build these GA4 audiences after the new events are live:

| Audience | Definition |
| --- | --- |
| Imported route, no export | Users with `route_import_completed` and no `export_completed` |
| Started export, no completion | Users with `export_started` and no `export_completed` |
| Help-first activators | Users who viewed `tutorial` or `gpx_guide` before `route_import_completed` |
| Media-heavy users | Users with `photo_import_completed` where queued count or added count is greater than zero |

## First Three GA4 Explorations

### 1. Acquisition to Activation

Use:

- dimensions: `Landing page + query string`, `page_type`, `target_page`
- metrics: users, sessions, key events
- funnel steps:
  - `page_view` on `tutorial` or `gpx_guide`
  - `help_cta_clicked` to `app`
  - `route_import_completed`

Goal:

- determine whether help content drives activation

### 2. Product Funnel

Use a funnel exploration with:

1. `route_import_completed`
2. `playback_started`
3. `photo_import_completed` or `annotation_created`
4. `export_started`
5. `export_completed`

Break down by:

- device category
- browser
- `export_aspect_ratio`
- `export_encoder_path`

Goal:

- identify where users drop before export

### 3. Export Diagnostics

Use free-form exploration with:

- dimensions: `browser`, `device category`, `export_format`, `export_encoder_path`, `export_failure_scope`
- metrics: event count, users, event count per user

Goal:

- identify compatibility and stability problems in the export path

## Rollout Order

Implement in this order:

1. fix pageview duplication
2. add analytics to tutorial and GPX guide entrypoints
3. remove high-cardinality and redundant params
4. add activation and support events
5. add playback and help CTA events
6. add export enrichment params
7. register GA4 custom dimensions
8. mark key events
9. build the first three explorations

## Minimal First Implementation Set

If implementation time is limited, ship this subset first:

- fixed `page_view`
- `help_cta_clicked`
- `welcome_action_clicked`
- `file_picker_opened`
- improved `route_import_*`
- improved `export_*`
- `support_clicked`
- `feedback_prompt_*`
- `feedback_submitted`

That subset is enough to build a real acquisition-to-export funnel without over-instrumenting the app.

## Notes for the Next Step

When implementing this plan:

- centralize event names and parameter enums in one analytics helper
- add small wrappers like `trackHelpCtaClick(...)` instead of inline string literals everywhere
- keep rollout behind a single production-safe analytics gate
- verify events in GA4 DebugView before registering dimensions and key events
