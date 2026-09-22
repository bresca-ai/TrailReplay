# User journey analytics — 22 September 2026

## Audit result

Two independent reviews used GPT-5.6 Terra for code coverage and GPT-5.6 Luna
for reporting design. The website already emitted many useful events, but event
volume did not translate into a clear user journey:

- `export_started` sent 26 parameters including `app_name`, exceeding GA4's
  [25-parameter collection limit](https://support.google.com/analytics/answer/9267744?hl=en).
- Start/result events had no attempt ID, making retries difficult to pair.
- A rendered video followed by failed email delivery produced both
  `export_completed` and `export_failed`. MediaRecorder errors could similarly
  produce a completed event for a partial file.
- Editor panels had no common navigation event. Saved projects and recipes
  bypassed the route-upload funnel. Preview completion was missing.
- Unexpected photo/video import failures lacked a terminal failure event.
- Events before analytics initialization were discarded, and the string `false`
  enabled development analytics accidentally.

The live property was not inspected. Missing custom definitions are a possible
additional reporting gap, not a verified account misconfiguration. Google requires
[custom dimensions or metrics](https://developers.google.com/analytics/devguides/collection/ga4/event-parameters)
for custom parameters to appear in standard reports and explorations.

## Implemented event contract (version 2)

Custom application events include `analytics_version=2`, `page_type`,
`event_sequence`, and `app_name`. The sequence increases within one document;
it is not a cross-tab or cross-device user ID. The initial pageview retains its
existing contract. Up to 100 early application events wait for initialization.
Development and preview hosts require the exact opt-in string `true`.

Route, recipe, project, photo, video imports and video exports receive a random,
in-memory `operation_id` and `operation_elapsed_ms`. Starts and results of each
attempt share that ID. Elapsed time is milliseconds since the attempt began,
not exclusively CPU time or upload time. IDs are not persisted between visits.
Precondition failures and declined project replacement do not start an operation.

| Event | Meaning |
| --- | --- |
| `project_ready` | A successful route, recipe, or project import left a nonempty route project; `import_source` distinguishes entry paths. Re-importing emits again. |
| `editor_panel_viewed` | A sidebar panel became visible; includes `panel_name`, `previous_panel`, and `has_route`. Programmatic panel changes are included. |
| `playback_completed` | Preview reached its natural endpoint; export playback is excluded. Seeking near the end can still produce this; it does not prove the whole preview was watched. |
| `export_blocked` | An attempt could not start because the canvas, Studio support, or delivery email was unavailable. |
| `export_started` | Accepted export attempt with format, quality, frame rate, resolution, and estimated full video duration. |
| `export_settings_snapshot` | Same export operation, with map/camera, overlays, route/media counts, and annotation settings. Split out to respect the parameter budget. |
| `export_completed` | Nonempty rendered video. Studio tile timeouts remain visible in `export_studio_timed_out_frames`; this does not prove visual quality or delivery. |
| `export_partial_result_available` | MediaRecorder failed but yielded a nonempty partial file; does not count as completed. |
| `export_failed` / `export_cancelled` | Rendering/setup failure or explicit cancellation. |
| `export_download_initiated` | Browser download invoked, `download_method=automatic` or `manual`; not confirmation that the file was saved. |
| `studio_export_delivery_started` | Client began upload and delivery. |
| `studio_export_upload_completed` | Upload succeeded and the client is moving to email delivery. |
| `studio_export_delivery_completed` | Delivery API returned success; not proof the recipient opened or received the email. |
| `studio_export_delivery_failed` | Delivery failed independently of render success. |
| `photo_import_failed` / `video_import_failed` | Unexpected processing failure; earlier items may already be present. Existing completion counts distinguish placed, pending, and unreadable items. |

Existing feature/settings events remain available. `export_downloaded_again`
is retained for compatibility; do not add its count to the new download event.
Do not compare old/new export failure rates without accounting for the version
boundary and the separate delivery outcome. Export durations now consistently
use the full estimated video length, including holds, rather than route time.

All outgoing custom event payloads are capped at 25 parameters; debug mode warns
on overflow. Call sites must still fit the budget: truncation is a last safeguard.
No new event includes email addresses, filenames, route coordinates, free text,
or media content. Page URLs/referrers omit fragments and application query
parameters. The UTM and Google click-ID allowlist preserves attribution; campaign
values must themselves remain free of personal information. This is not a new
session-recording system or a change to consent behavior.

## Configure the property

In **Admin → Custom definitions**, inspect existing definitions first and add
missing event-scoped dimensions using the exact parameter names:

- Journey: `page_type`, `analytics_version`, `panel_name`, `previous_panel`,
  `import_source`, `has_route`.
- Adoption: `feature_name`, `feature_value`, `feature_context`, `setting_name`.
- Export: `export_format`, `export_quality_mode`, `export_encoder_path`,
  `export_failure_scope`, `download_method`, `reason`.

Add dimensions selectively for specific questions, rather than registering every
parameter. Do not register `operation_id` or `event_sequence` as custom dimensions:
they are for raw-event correlation, not aggregated breakdowns. Optional custom
metric `operation_elapsed_ms` uses milliseconds; filter to one terminal event
when reporting timing so starts, snapshots, and downloads do not skew it.

Mark `export_completed` and, separately, `studio_export_delivery_completed` as
key events if these are the intended product outcomes. Do not count their sum as
unique successful exports. Validate a test-property session with DebugView:
import, navigate panels, preview, export, download, then simulate an import or
delivery failure. Check operation IDs, event order, and terminal outcomes.
Use a separate measurement ID for local tests; do not pollute production traffic.
Google notes new reporting definitions may take up to 48 hours to populate.

## Reports to answer the actual product questions

1. **Where people drop off:** build a funnel `project_ready → export_started →
   export_completed`. Use indirectly-followed steps so editing between them is
   allowed. Break down by import source, device category, and export quality.
   Build a separate preview funnel adding `playback_started` and
   `playback_completed`; preview is optional, so it must not be required in the
   primary export funnel. For Studio use a second funnel from delivery started
   through upload completed to delivery completed.
2. **What people do:** use Path exploration starting at `project_ready`, with
   event name as the node type. Use a separate panel breakdown for
   `editor_panel_viewed`, and filter failure events by their reason/scope.
3. **Which features get used:** follow [the adoption guide](FEATURE_ADOPTION_ANALYTICS.md).
   Compare users with a feature event against users with `project_ready` in the
   same range and filters. Event counts overweight repeated slider adjustments.
4. **Individual attempt sequences:** enable BigQuery export if raw diagnostic
   sequences are needed. Pair events by `operation_id` within the GA session;
   use the GA native event and batch ordering fields for document/tab ordering.
   GA4 UI funnels are user-level approximations, not exact per-attempt joins.

Client analytics remains incomplete when tracking is blocked, the page closes,
or delivery fails before transmission. An operation with no terminal event is
"no observed outcome", not automatically a failure. Server-confirmed delivery
and actual email-link downloads would require separately designed backend
instrumentation and identity/consent handling. Existing slider settings events
can still be chatty; use users for adoption rather than raw event counts.

## BigQuery example

Replace the project/dataset and dates below. Restrict dates to limit scan cost.
This query uses the documented [GA4 export schema](https://support.google.com/analytics/answer/7029846?hl=en)
and shows a pseudonymous session's observed actions; it is not session video.
It has not been run against the live property.

```sql
WITH events AS (
  SELECT
    user_pseudo_id,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS session_id,
    event_timestamp, batch_page_id, batch_ordering_id, batch_event_index,
    event_name,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'operation_id') AS operation_id,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'event_sequence') AS event_sequence,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'panel_name') AS panel_name
  FROM `YOUR_PROJECT.analytics_PROPERTY_ID.events_*`
  WHERE _TABLE_SUFFIX BETWEEN '20260922' AND '20260923'
)
SELECT * FROM events
WHERE user_pseudo_id = @user_pseudo_id AND session_id = @session_id
ORDER BY batch_page_id, batch_ordering_id, batch_event_index, event_timestamp, event_sequence;
```

## Validation for this change

- 483 app tests and 54 server-function tests passed.
- ESLint, TypeScript, production build, prerender, and SEO output validation passed.
- Regression coverage includes early-event buffering/order, parameter budget,
  URL filtering, development opt-in, overlapping operation IDs, panel visibility,
  successful/failed route imports, and failed video imports without private text.
- No live GA collection, report configuration, or end-to-end export delivery was
  verified in this change. No deployment or push was performed.

## Live GA4 follow-up

Using Alex's open Chrome profile, inspected property `501626719`
(`trailreplay-72d80`) under account `192194722`. There were already 36 custom
dimensions, including feature name/value/context, camera settings, page type,
export format/encoder/failure scope, and setting name/value. The property was
therefore not missing all custom definitions.

Registered eight missing event-scoped dimensions and verified the list reached
44: `panel_name` (Editor panel), `import_source` (Import source),
`analytics_version` (Analytics version), `previous_panel` (Previous editor panel),
`has_route` (Project has route), `export_quality_mode` (Export quality mode),
`download_method` (Download method), and `reason` (Action reason).

Created exploration `TrailReplay | Import to export journey`:
https://analytics.google.com/analytics/web/#/analysis/a192194722p501626719/edit/EfIoIzAtRZWKCG5Hv8v8AA

Configured indirectly-followed steps route_import_started →
route_import_completed → export_started → export_completed, with a device
category breakdown, for existing historical events. Recovered from a GA4
component-loading failure, reapplied the steps, and verified all four saved
conditions and the resulting report.

Observed active-user funnel, 25 August–21 September 2026:

| Step | Users | Completion to next step |
| --- | ---: | ---: |
| Route import started | 2,302 | 92.62% |
| Route imported | 2,132 | 57.60% |
| Export started | 1,228 | 65.47% |
| Video rendered | 804 | — |

Desktop export starts: 880; rendered: 655 (74.43%). Mobile export starts: 334;
rendered: 141 (42.22%). Mobile users also moved from imported route to export
less frequently (46.07%) than desktop users (63.54%). These are user-level
sequences over the report range, not per-attempt error rates, and exclude
recipe/project entry paths. Abandonment means no observed next step, not a
proven encoder failure. Mobile export completion is the clearest investigation
priority revealed by this report.

The existing product-usage exploration's Camera distance preset tab had no
filters. Added and verified an event-name regex filter:
`^(playback_started|export_started|export_settings_snapshot)$`. Its total changed
from 3,624 to 1,855 active users. The `(not set)` row remains at 1,617 because
relevant historical events can lack the parameter; the camera dimension was
registered on 18 September, within the selected range. The rows overlap by user,
so their counts must not be summed. Other tabs were not changed in this follow-up.
New branch events still require deployment before populating the new dimensions.
No BigQuery link, access permissions, consent, retention, or key-event settings
were changed during this follow-up.
