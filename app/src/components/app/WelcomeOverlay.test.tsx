import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { WelcomeOverlay } from './WelcomeOverlay';

afterEach(() => { cleanup(); useAppStore.getState().reset(); });

it('opens the tutorial and GPX guide in the selected language', () => {
  useAppStore.getState().setSettings({ language: 'es' });
  render(<WelcomeOverlay onExplore={vi.fn()} onOpenFilePicker={vi.fn()} />);
  expect(screen.getByRole('link', { name: /tutorial/i })).toHaveAttribute('href', '/es/tutorial');
  expect(screen.getByRole('link', { name: /animador.*gpx/i })).toHaveAttribute('href', '/es/gpx-animation');
});
