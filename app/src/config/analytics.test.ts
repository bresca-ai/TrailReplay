import { afterEach, describe, expect, it, vi } from 'vitest';
import { shouldEnableAnalytics } from './analytics';
afterEach(() => vi.unstubAllEnvs());
describe('development analytics', () => {
  it('requires an explicit true opt-in on localhost', () => {
    vi.stubEnv('VITE_ENABLE_ANALYTICS_IN_DEVELOPMENT', 'false');
    expect(shouldEnableAnalytics()).toBe(false);
    vi.stubEnv('VITE_ENABLE_ANALYTICS_IN_DEVELOPMENT', 'true');
    expect(shouldEnableAnalytics()).toBe(true);
  });
});
