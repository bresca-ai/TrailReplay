# Reliability monitoring

The production build includes the Cloudflare Pages commit SHA as `app_release` on analytics events. Other build systems can provide `GITHUB_SHA`; builds without either use `local`. The GA4 event-scoped custom dimension is named **TrailReplay release**.

The browser emits `reliability_browser_error` once per category per page load for chunk and script loading errors, uncaught errors and rejections, React panel errors, and lost WebGL contexts. Its category is fixed: messages, stack traces, URLs, filenames, and route data are not sent by this monitor. GA4 itself and the application's existing analytics have their own data collection behavior. This monitor is best-effort and cannot see errors before it initializes, blocked analytics requests, or clients that leave before sending; it does not include stack traces.

Existing import and export failure events also produce `reliability_import_failure` and `reliability_export_failure` with a numeric value of 1 in `reliability_import_failures` and `reliability_export_failures` respectively. The GA4 property has custom metrics **TrailReplay import failures** and **TrailReplay export failures** for these parameters. Their counts represent observed failure events, not a verified failure rate: a single export can report more than one outcome, and analytics blockers or interruption can suppress events. Cancellations are separate.

## Activation and alerts

These changes must be deployed before new production events appear. Confirm the release ID and the failure events in GA4 DebugView or Realtime using a controlled test that does not contain private route information; custom definitions may take 24–48 hours to appear in reporting. Check browser/device and release dimensions in an exploration when investigating a spike.

No reliability alert has been activated yet. At setup time the GA4 custom insight editor offered built-in metrics only, and the failure metrics were unavailable. Recheck after processing; if they are still unavailable, use an alerting platform that supports these metrics or add a dedicated, privacy-reviewed collection and alerting service. Configure separate import and export thresholds and dashboard views, verify delivery to alex@bresca.ai, and document the thresholds after choosing a baseline. Do not use the unfiltered GA4 Event count metric as a failure alert. GA4 insight email recipients must have access to the property; verify access without silently changing permissions. Test an alert end to end before calling it active.
