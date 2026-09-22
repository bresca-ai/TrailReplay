import { describe, expect, it, vi } from 'vitest';
import { trackEvent } from './analytics';
import { createAnalyticsOperation } from './analyticsOperation';
vi.mock('./analytics', () => ({ trackEvent: vi.fn() }));

describe('operation correlation', () => {
  it('keeps overlapping attempts separate and prevents overriding their IDs', () => {
    const first = createAnalyticsOperation();
    const second = createAnalyticsOperation();
    first('started');
    second('started');
    first('completed', { operation_id: 'override' });
    const calls = vi.mocked(trackEvent).mock.calls;
    expect(calls[0][1]?.operation_id).not.toBe(calls[1][1]?.operation_id);
    expect(calls[2][1]?.operation_id).toBe(calls[0][1]?.operation_id);
    expect(calls[2][1]?.operation_elapsed_ms).toEqual(expect.any(Number));
  });
});
