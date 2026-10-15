# TrailReplay GA4 rollout checklist

Last updated: 2026-08-12

## Code configuration

The production web app now:

- sends one manual `page_view` per document and disables the automatic config pageview
- labels page views with `page_type` and `page_group`
- disables Google Signals and advertising-personalization signals
- excludes localhost, `*.vercel.app`, and `*.pages.dev` unless explicitly enabled
- omits filenames, route names, feedback text, email addresses, and custom timestamps
- tracks the import-to-export activation funnel with low-cardinality parameters

For DebugView, use a non-production measurement ID where possible:

```bash
VITE_GA_MEASUREMENT_ID=G-TESTPROPERTY
VITE_ENABLE_ANALYTICS_IN_DEVELOPMENT=true
VITE_GA_DEBUG_MODE=true
```

## Key events to activate in GA4 Admin

After the deployed property has received each event at least once, open:

`Admin -> Data display -> Events`

Mark these events as key events:

| Event | Purpose |
| --- | --- |
| `route_import_completed` | Primary activation: a usable route entered the product |
| `export_completed` | Primary success: a downloadable route video was created |
| `generate_lead` | A Studio video delivery was successfully registered with an email address |
| `feedback_submitted` | Strong product-engagement signal |

Keep `support_clicked` as a regular event initially. Promote it only if financial support becomes a reporting goal.

## Custom dimensions to register

Create event-scoped custom dimensions for:

- `page_type`
- `page_group`
- `route_input_method`
- `route_total_distance_bucket`
- `route_error_type`
- `photo_placement_result`
- `photo_manual_reason`
- `export_format`
- `export_aspect_ratio`
- `export_quality`
- `export_encoder_path`
- `export_failure_scope`
- `export_duration_bucket`
- `export_blob_size_bucket`
- `feedback_category`
- `support_location`
- `lead_first_source`
- `lead_first_medium`
- `lead_first_campaign`
- `lead_first_landing_page`
- `lead_last_source`
- `lead_last_medium`
- `lead_last_campaign`
- `lead_last_landing_page`

Do not register raw counts, booleans, filenames, timestamps, full URLs, route titles, or feedback text unless a specific report requires them.

## Production verification

Before deploying the endpoint changes, apply the lead database migration:

```bash
npx wrangler d1 migrations apply trailreplay-leads --remote
```

Then deploy and confirm a new Studio registration stores first/last attribution in D1. In GA4 Admin, mark `generate_lead` as a key event after it appears at least once; register the listed `lead_*` parameters as event-scoped custom dimensions if you want to break down the event by attribution.

1. Open the deployed site through Tag Assistant or GA4 DebugView.
2. Confirm one and only one `page_view` on `/`, `/tutorial`, and `/gpx-download-guide`.
3. Import a timestamped GPX and confirm `route_import_completed` contains:
   - `route_input_method`
   - `route_imported_track_count`
   - `route_total_distance_bucket`
   - `route_has_timestamps`
4. Export a short test MP4 and confirm `export_completed` contains:
   - `export_format`
   - `export_encoder_path`
   - `export_duration_bucket`
   - `export_blob_size_bucket`
5. Register a Studio delivery with an email address and confirm `generate_lead` contains first/last source, medium, campaign, and landing-page parameters, with no email or route data.
6. Confirm preview deployments do not send events to the production property.
7. Confirm no event parameters contain a local filename, route title, feedback body, or email address.

## First funnel exploration

Create a funnel exploration with:

1. `session_start`
2. `route_import_completed`
3. `export_started`
4. `export_completed`

Break it down by default channel group, landing page, device category, `route_input_method`, and `export_aspect_ratio`.
