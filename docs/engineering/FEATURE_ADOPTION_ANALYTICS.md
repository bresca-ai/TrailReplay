# Feature adoption analytics

TrailReplay sends the GA4 event `feature_used` only when a person activates a
feature or uses it while playing or exporting. Event parameters are deliberately
low-cardinality and never contain GPX content, route names, locations, filenames,
or other personal data.

| Feature | `feature_name` | `feature_value` |
| --- | --- | --- |
| Camera mode | `camera_mode` | `overview`, `follow`, `follow-behind`, or `cinematic` |
| Follow-behind distance | `follow_behind_distance` | `very-close`, `close`, `medium`, or `far` |
| Statistics | `statistic` | `distance`, `duration`, `movingDuration`, `pace`, `elevation`, `heartRate`, `speed`, or `altitude` |

`feature_context` identifies whether the use happened in `settings`,
`annotations_panel`, `playback`, or `video_export`. Count active users, not event
count, so repeated plays and exports by one person do not inflate adoption.

## GA4 setup and percentage report

Create these event-scoped custom dimensions in **Admin → Custom definitions**:
`feature_name`, `feature_value`, and `feature_context`. They apply to future
events, so create them before relying on the report.

In **Explore → Free form**, add a segment for each feature value, such as
`event name = feature_used` AND `feature_name = camera_mode` AND
`feature_value = cinematic`. Use **Active users** as the metric. The adoption
percentage is:

`users in the feature segment ÷ all active users in the same date range × 100`

For an apples-to-apples product-use rate, make the denominator a second segment
of users who triggered `playback_started` or `export_started`, rather than every
visitor who only viewed a marketing page. Keep the same date range, platform,
and any other filters for numerator and denominator.

## Detailed collection (analytics version 3)

`replayUsageAnalytics.ts` is shared by play, space-bar, restart, and accepted
video export. Each start/resume emits the selected configuration even if the
user kept every default. `usage_id` correlates these snapshots and sampled
camera poses within that replay start; export snapshots also carry the existing
operation ID. Neither ID should be registered as a custom dimension.

The additional `feature_used` rows include exact camera stability and
follow-behind distance level; map style/filter/overlays; terrain; trail color
mode; marker type/size/circle; track labels; route timing; preview speed;
available statistics and layout/background/scale; journey statistics/pace mode;
elevation profile; non-placeholder photos/clips; map-card/side-panel annotations;
visible comparison tracks; transport modes; route moments; nearby-place enablement;
and authored landmarks. Values are selected options, booleans or counts, never
user-authored labels, titles, coordinates, filenames, or media.

An included feature is not proof the user watched it appear. Nearby-place
tracking says the setting is enabled, not that network enrichment succeeded.
`replay_configuration` supplies explicit disabled flags and content counts.
Unavailable timestamp/sensor statistics are excluded from `feature_used`, as
are placeholder media; disabled photos are excluded even if files are present.
Counts describe loaded project content, not a promise all items were on-screen.
Other feature changes made after starting a preview appear in the next snapshot;
camera adjustments additionally have their dedicated events below.

### Camera values: do not conflate these measurements

| Event | Fields | Meaning |
| --- | --- | --- |
| `camera_settings_used` | `camera_mode`, `camera_distance_level`, `camera_preset`, `camera_stability_value` | Exact applied configuration: follow-behind distance 0–100 and stability 0–1. Inapplicable fields are omitted. Also emitted on camera configuration changes while the route is playing. |
| `camera_settings_used` in cinematic mode | `cinematic_keyframe_count`, `cinematic_zoom_min`, `cinematic_zoom_max` | Authored cinematic camera configuration, not a transient map pose. |
| `camera_setting_changed` | `setting_name`, `previous_value`, `setting_value`, `camera_mode`, `control_source` | A committed adjustment in settings or the map's follow-behind +/− controls. Range drags flush on pointer release, key release, blur, pagehide or unmount. Returning to the original value emits nothing. |
| `camera_view_sampled` | `camera_zoom_level`, `camera_pitch_deg`, `camera_bearing_deg`, `sample_progress_percent`, `sample_quarter` | Actual applied map pose, rounded to two decimals by the central analytics helper. Samples at most once in each of five route-progress buckets per start/resume. No map center is sent. |
| `cinematic_keyframe_saved` | `camera_zoom_level`, `camera_pitch_deg`, `camera_bearing_deg`, existing action/count/source | Exact saved shot parameters. Filter by event name to distinguish authored values from sampled map values. |

Sampling observes camera-position updates after the playback camera applies its
pose. It excludes idle/intro/outro, paused preview frames, stale positions and
mismatched preview/export contexts. Static poses may yield fewer samples. Seeking
can skip buckets; samples contain the actual progress, not an invented milestone.
A five-sample trajectory is not a frame-by-frame recording or a dwell-time measure.
Legacy `CameraSettings.zoom/pitch/bearing` fields are not reported as active
camera values because the current engine derives its camera elsewhere.

### Live GA4 setup and report

Registered and verified in property 501626719:

- **Camera actual zoom** → `camera_zoom_level`
- **Camera distance level** → `camera_distance_level`
- **Camera stability value** → `camera_stability_value`

The property now has 47 custom dimensions. Existing `feature_name`,
`feature_value`, `feature_context`, `setting_name`, and `setting_value` definitions
cover the expanded option values without adding a dimension for every feature.

Updated the **Feature adoption — unique users** tab in
[TrailReplay | Product usage and settings](https://analytics.google.com/analytics/web/#/analysis/a192194722p501626719/edit/oo9up-vLS3WzKfTC6gecrw):

- Rows: **Feature name**, **Feature value**.
- Columns: **Feature context**.
- Metric: **Active users**.
- Filters: event name matches `^feature_used$`; feature context matches
  `^(playback|video_export)$`.

This replaces the old event-name grouping, which could not answer which feature
values were used. The existing historical data already contains some detailed
feature rows; version 3 makes the checked-out code's collection explicit and
consistent. New exact camera events require deployment and new traffic. Nothing
in this change backfills historical values.

For exact camera zoom, create a free-form exploration filtered to
`camera_view_sampled`, with Camera actual zoom and Camera mode as rows, Feature
context as columns and Active users as metric. For authored cinematic shot zoom,
use `cinematic_keyframe_saved` instead. For configured distance/stability, filter
to `camera_settings_used`. Do not treat camera sample event counts as users or
average arbitrary camera bearings. Those dedicated camera explorations have not
been created by this change.
