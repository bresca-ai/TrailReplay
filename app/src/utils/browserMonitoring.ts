import { trackEvent } from './analytics';

type BrowserFailure = 'chunk_load' | 'script_load' | 'unhandled_error' | 'unhandled_rejection' | 'react_panel' | 'webgl_context_lost';
const emitted = new Set<BrowserFailure>();

/** Fixed categories only: never transmit exception text, URLs, stacks or route data. */
export function reportBrowserFailure(category: BrowserFailure) {
  if (emitted.has(category)) return;
  emitted.add(category);
  const send = () => {
    try {
      trackEvent('reliability_browser_error', { error_category: category });
    } catch {
      // Monitoring must never interrupt the application.
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', send, { once: true });
  } else {
    send();
  }
}

export function installBrowserMonitoring(): () => void {
  const preload = () => reportBrowserFailure('chunk_load');
  const onError = (event: Event) => {
    if (event instanceof ErrorEvent) {
      const error = `${event.message} ${event.error instanceof Error ? event.error.message : ''}`;
      reportBrowserFailure(/(?:dynamically imported module|loading chunk|failed to fetch module)/i.test(error) ? 'chunk_load' : 'unhandled_error');
    } else if (event.target instanceof HTMLScriptElement || event.target instanceof HTMLLinkElement) {
      reportBrowserFailure('script_load');
    }
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason instanceof Error ? event.reason.message : '';
    reportBrowserFailure(/(?:dynamically imported module|loading chunk|failed to fetch module)/i.test(reason) ? 'chunk_load' : 'unhandled_rejection');
  };
  const onContextLost = () => reportBrowserFailure('webgl_context_lost');
  window.addEventListener('vite:preloadError', preload);
  window.addEventListener('error', onError, true);
  window.addEventListener('unhandledrejection', onRejection);
  document.addEventListener('webglcontextlost', onContextLost, true);
  return () => {
    window.removeEventListener('vite:preloadError', preload);
    window.removeEventListener('error', onError, true);
    window.removeEventListener('unhandledrejection', onRejection);
    document.removeEventListener('webglcontextlost', onContextLost, true);
  };
}
