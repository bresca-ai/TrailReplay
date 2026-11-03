import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { RouteLandmarksEditor } from './RouteLandmarksEditor';

afterEach(cleanup);

it('switches styles and prepares explicit feedback for the selected style', () => {
  useAppStore.getState().reset();
  useAppStore.getState().setSettings({ language: 'en' });
  render(<RouteLandmarksEditor />);
  expect(screen.getByRole('button', { name: 'Classic' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Minimal' }));
  expect(useAppStore.getState().settings.landmarkStyle).toBe('minimal');
  expect(screen.getByRole('button', { name: 'Minimal' })).toHaveAttribute('aria-pressed', 'true');
  const url = new URL(screen.getByRole('link', { name: 'Share your preference on GitHub' }).getAttribute('href')!);
  expect(url.searchParams.get('body')).toContain('I prefer the minimal landmark style.');
  fireEvent.click(screen.getByRole('button', { name: 'Classic' }));
  expect(new URL(screen.getByRole('link', { name: 'Share your preference on GitHub' }).getAttribute('href')!).searchParams.get('body')).toContain('classic');
});
