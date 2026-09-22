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
