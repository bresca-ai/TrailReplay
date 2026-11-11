import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { RouteLandmarksEditor } from './RouteLandmarksEditor';

afterEach(cleanup);

it('switches landmark styles', () => {
  useAppStore.getState().reset();
  useAppStore.getState().setSettings({ language: 'en' });
  render(<RouteLandmarksEditor />);
  expect(screen.getByRole('button', { name: 'Minimal' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Classic' }));
  fireEvent.click(screen.getByRole('button', { name: 'Minimal' }));
  expect(useAppStore.getState().settings.landmarkStyle).toBe('minimal');
  expect(screen.getByRole('button', { name: 'Minimal' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Classic' }));
  expect(useAppStore.getState().settings.landmarkStyle).toBe('classic');
});
