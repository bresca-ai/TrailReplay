import { trackEvent } from './analytics';

/** Correlation is per attempt, never a persistent user identifier. */
export function createAnalyticsOperation() {
  const id = crypto.randomUUID();
  const started = performance.now();
  return (name: string, params: Record<string, unknown> = {}) => trackEvent(name, {
    ...params,
    operation_id: id,
    operation_elapsed_ms: Math.max(0, performance.now() - started),
  });
}
