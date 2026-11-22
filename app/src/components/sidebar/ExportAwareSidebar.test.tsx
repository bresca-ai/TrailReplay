import { useEffect } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ExportAwareSidebar } from './ExportAwareSidebar';
import { MenuDesignContext } from './menuDesign';

afterEach(cleanup);

it('keeps the recorder mounted while hidden until the export finishes', () => {
  const unmounted = vi.fn();
  function Recorder() {
    useEffect(() => unmounted, []);
    return <span>Recorder</span>;
  }
  const view = render(<MenuDesignContext.Provider value="previous"><ExportAwareSidebar open exporting><Recorder /></ExportAwareSidebar></MenuDesignContext.Provider>);
  view.rerender(<MenuDesignContext.Provider value="previous"><ExportAwareSidebar open={false} exporting><Recorder /></ExportAwareSidebar></MenuDesignContext.Provider>);
  expect(unmounted).not.toHaveBeenCalled();
  expect(screen.getByText('Recorder')).not.toBeVisible();
  view.rerender(<MenuDesignContext.Provider value="previous"><ExportAwareSidebar open={false} exporting={false}><Recorder /></ExportAwareSidebar></MenuDesignContext.Provider>);
  expect(unmounted).toHaveBeenCalledOnce();
});
