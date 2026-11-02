import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { getInitialLanguage } from './translations';
import { useI18n } from './useI18n';

afterEach(() => {
  cleanup();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  useAppStore.getState().reset();
});

it('updates the localized homepage URL when the language changes without losing the query or fragment', () => {
  window.history.replaceState(null, '', '/de/?source=test#map');
  useAppStore.getState().setSettings({ language: 'de' });
  const { result } = renderHook(() => useI18n());
  act(() => result.current.setLanguage('fr'));
  expect(window.location.pathname).toBe('/fr/');
  expect(window.location.search).toBe('?source=test');
  expect(window.location.hash).toBe('#map');
  expect(getInitialLanguage()).toBe('fr');
  act(() => result.current.setLanguage('en'));
  expect(window.location.pathname).toBe('/');
  expect(getInitialLanguage()).toBe('en');
});
