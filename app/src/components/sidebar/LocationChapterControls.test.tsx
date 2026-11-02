import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { LocationChapterControls } from './LocationChapterControls';

afterEach(() => useAppStore.getState().reset());
it('lets users choose regional chapters and customize the border and labels', () => {
  render(<LocationChapterControls />);
  fireEvent.change(screen.getByLabelText('Boundary level'), { target: { value: 'region' } });
  expect(useAppStore.getState().settings.locationChapters.level).toBe('region');
  fireEvent.change(screen.getByLabelText('Border color'), { target: { value: '#123456' } });
  fireEvent.change(screen.getByLabelText('Border width'), { target: { value: '5' } });
  fireEvent.click(screen.getByLabelText('Show country flag'));
  expect(useAppStore.getState().settings.locationChapters).toMatchObject({ color: '#123456', width: 5, showFlag: false });
});
