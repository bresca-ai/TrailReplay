import { useEffect } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ExportAwareSidebar } from './ExportAwareSidebar';

afterEach(cleanup);

it('keeps the recorder mounted while hidden until the export finishes', () => {
  const unmounted = vi.fn();
  function Recorder() {
    useEffect(() => unmounted, []);
    return <span>Recorder</span>;
  }
  const view = render(<ExportAwareSidebar open exporting><Recorder /></ExportAwareSidebar>);
  view.rerender(<ExportAwareSidebar open={false} exporting><Recorder /></ExportAwareSidebar>);
  expect(unmounted).not.toHaveBeenCalled();
  expect(screen.getByText('Recorder')).not.toBeVisible();
  view.rerender(<ExportAwareSidebar open={false} exporting={false}><Recorder /></ExportAwareSidebar>);
  expect(unmounted).toHaveBeenCalledOnce();
});
