import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./analytics', () => ({ trackEvent: vi.fn() }));

describe('browser monitoring', () => {
  beforeEach(() => { vi.resetModules(); });
  it('categorizes and deduplicates chunk failures without sending private error details', async () => {
    const { trackEvent } = await import('./analytics');
    const { installBrowserMonitoring } = await import('./browserMonitoring');
    const remove = installBrowserMonitoring();
    window.dispatchEvent(new ErrorEvent('error', { message: 'Failed to fetch dynamically imported module https://example.com/private-route.gpx?secret=123' }));
    window.dispatchEvent(new Event('vite:preloadError'));
    expect(trackEvent).toHaveBeenCalledOnce();
    expect(trackEvent).toHaveBeenCalledWith('reliability_browser_error', { error_category: 'chunk_load' });
    expect(JSON.stringify(vi.mocked(trackEvent).mock.calls)).not.toContain('private-route');
    remove();
  });
  it('captures webgl context loss and stops monitoring after cleanup', async () => {
    const { trackEvent } = await import('./analytics');
    const { installBrowserMonitoring } = await import('./browserMonitoring');
    const remove = installBrowserMonitoring();
    const canvas = document.createElement('canvas'); document.body.appendChild(canvas);
    canvas.dispatchEvent(new Event('webglcontextlost', { bubbles: true }));
    expect(trackEvent).toHaveBeenCalledWith('reliability_browser_error', { error_category: 'webgl_context_lost' });
    remove();
    vi.mocked(trackEvent).mockClear();
    window.dispatchEvent(new ErrorEvent('error', { message: 'error' }));
    expect(trackEvent).not.toHaveBeenCalled();
    canvas.remove();
  });
});
