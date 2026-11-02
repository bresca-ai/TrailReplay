import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { TracksPanel } from './TracksPanel';

const parseFiles = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useGPX', () => ({ useGPX: () => ({ parseFiles, isParsing: false }) }));

beforeEach(() => {
  useAppStore.getState().reset();
  useAppStore.getState().setSettings({ language: 'en' });
  parseFiles.mockReset();
  parseFiles.mockResolvedValue(undefined);
});
afterEach(cleanup);

it('shows replay projects as uploadable and passes a selected replay to project import', async () => {
  const { container } = render(<TracksPanel />);
  expect(screen.getByText('Drop GPX, KML, FIT or .replay files')).toBeInTheDocument();
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  expect(input.accept).toContain('.replay');
  const file = new File(['test'], 'trip.REPLAY', { type: 'application/octet-stream' });
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => expect(parseFiles).toHaveBeenCalledWith([file], 'file_picker'));
});

it('accepts a dropped replay project even when the browser reports a ZIP MIME type', async () => {
  render(<TracksPanel />);
  const file = new File(['test'], 'trip.replay', { type: 'application/zip' });
  const dropzone = screen.getByText('Drop GPX, KML, FIT or .replay files').closest('[role="presentation"]')!;
  fireEvent.drop(dropzone, { dataTransfer: { files: [file], items: [{ kind: 'file', type: file.type, getAsFile: () => file }], types: ['Files'] } });
  await waitFor(() => expect(parseFiles).toHaveBeenCalledWith([file], 'dropzone'));
});
