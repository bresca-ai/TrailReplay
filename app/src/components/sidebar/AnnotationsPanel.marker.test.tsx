import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useAppStore } from '@/store/useAppStore';
import { AnnotationsPanel } from './AnnotationsPanel';

vi.mock('./ActivityIconPicker', () => ({ ActivityIconPicker: ({ onSelect }: { onSelect: (value: string) => void }) => <button onClick={() => onSelect('3d-runner')}>Choose runner</button> }));
beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); useAppStore.getState().reset(); useAppStore.getState().setSettings({ language: 'en' }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('offers the marker picker up front and activates the chosen icon from dot mode', () => {
  useAppStore.getState().setTrailStyle({ showMarker: true, markerType: 'dot' });
  render(<AnnotationsPanel />);
  fireEvent.click(screen.getByRole('button', { name: /change icon/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Choose runner' }));
  expect(useAppStore.getState().settings.trailStyle).toMatchObject({ markerType: 'icon', currentIcon: '3d-runner' });
});

it('shows route controls first and expanded on opening', () => {
  const { container } = render(<AnnotationsPanel />);
  const firstSection = container.querySelector('details');
  expect(firstSection?.open).toBe(true);
  expect(firstSection?.contains(screen.getByText(/route name/i))).toBe(true);
  expect(firstSection?.compareDocumentPosition(screen.getByRole('button', { name: /change icon/i }))! & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
