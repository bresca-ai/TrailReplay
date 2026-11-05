import { afterEach, describe, expect, it, vi } from 'vitest';
import { startExportTiming } from './exportTiming';

afterEach(() => { vi.restoreAllMocks(); });

describe('export timing', () => {
  it('measures elapsed and visible time across visibility changes and removes its listener', () => {
    let now = 0;
    let hidden = false;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    const remove = vi.spyOn(document, 'removeEventListener');
    const stop = startExportTiming();
    now = 1200; hidden = true; document.dispatchEvent(new Event('visibilitychange'));
    now = 4200; hidden = false; document.dispatchEvent(new Event('visibilitychange'));
    now = 6000;
    expect(stop()).toEqual({ export_elapsed_seconds: 6, export_foreground_seconds: 3 });
    expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(stop()).toEqual({});
  });

  it('handles an export that starts and ends in a hidden tab', () => {
    let now = 100;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    const stop = startExportTiming();
    now = 1600;
    expect(stop()).toEqual({ export_elapsed_seconds: 1.5, export_foreground_seconds: 0 });
  });
});
