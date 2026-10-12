import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { FileImportBanner } from './FileImportBanner';

describe('FileImportBanner', () => {
  afterEach(() => {
    cleanup();
    useAppStore.getState().setFileImportStatus(null);
  });

  it('stays hidden when no import is running', () => {
    render(<FileImportBanner />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('announces a replay that is still opening', () => {
    useAppStore.getState().setFileImportStatus({
      kind: 'project',
      fileName: 'mount-kenya.replay',
      fileCount: 1,
    });

    render(<FileImportBanner />);

    expect(screen.getByRole('status')).toHaveTextContent('Opening replay…');
    expect(screen.getByRole('status')).toHaveTextContent('mount-kenya.replay');
    expect(screen.getByRole('status')).toHaveTextContent('Large files can take a moment');
  });

  it('summarizes multi-file route imports', () => {
    useAppStore.getState().setFileImportStatus({
      kind: 'routes',
      fileName: 'day-one.gpx',
      fileCount: 3,
    });

    render(<FileImportBanner />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading routes…');
    expect(screen.getByRole('status')).toHaveTextContent('3 files');
  });
});
