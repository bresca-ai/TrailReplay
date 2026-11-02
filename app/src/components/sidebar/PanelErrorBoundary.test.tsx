import { lazy, Suspense } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PanelErrorBoundary } from './PanelErrorBoundary';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('keeps the surrounding app mounted after a panel fails and resets for another panel', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  function BrokenPanel(): never { throw new TypeError('Failed to fetch dynamically imported module'); }
  const boundary = (key: string, child: React.ReactNode) => (
    <PanelErrorBoundary key={key} title="Panel unavailable" message="Save before reloading" reloadLabel="Reload">{child}</PanelErrorBoundary>
  );
  const view = render(<><div>Map remains usable</div>{boundary('journey', <BrokenPanel />)}</>);
  expect(screen.getByRole('alert')).toHaveTextContent('Save before reloading');
  expect(screen.getByText('Map remains usable')).toBeInTheDocument();
  view.rerender(<><div>Map remains usable</div>{boundary('tracks', <div>Tracks panel</div>)}</>);
  expect(screen.getByText('Tracks panel')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('shows recovery instructions when a lazy import rejects', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const BrokenPanel = lazy(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module')));
  render(<PanelErrorBoundary title="Panel unavailable" message="Save before reloading" reloadLabel="Reload">
    <Suspense fallback={<div>Loading</div>}><BrokenPanel /></Suspense>
  </PanelErrorBoundary>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Save before reloading');
});
