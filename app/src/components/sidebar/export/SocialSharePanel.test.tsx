import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { createDefaultSocialShareSettings } from '@/store/defaults';
import { resolveSocialShareTitle } from './socialShareData';
import { SocialSharePanel } from './SocialSharePanel';

const names = {
  tracks: [{ id: 'alba', name: "Cursa de l'Alba" }],
  journey: { name: "Cursa de l'Alba + MitjAlba" },
};

vi.mock('./useSocialShareExport', () => ({
  useSocialShareExport: () => {
    const state = useAppStore();
    return {
      settings: state.socialShareSettings,
      setSocialShareSettings: state.setSocialShareSettings,
      resolvedTitle: resolveSocialShareTitle(state.socialShareSettings, names.tracks, 'alba', names.journey),
      previewUrl: null, isRendering: false, pictures: [], hasTracks: false,
      routeBboxNorm: null, dataPanelBboxNorm: null, titleBboxNorm: { x: 0, y: 0, w: 0.7, h: 0.2 }, logoBboxNorm: { x: 0.76, y: 0.04, w: 0.2, h: 0.08 },
      generatePreview: vi.fn(), exportPng: vi.fn(), fitTrackToMap: vi.fn(), transformMapViewport: vi.fn(),
    };
  },
}));
const initial = useAppStore.getState();
beforeEach(() => {
  useAppStore.setState(initial, true);
  useAppStore.getState().setSettings({ language: 'en' });
  useAppStore.getState().setSocialShareSettings(createDefaultSocialShareSettings());
});
afterEach(() => { cleanup(); useAppStore.setState(initial, true); });

describe('cover title and places controls', () => {
  it.each(['journey-name', 'track-name'] as const)('always exposes the resolved %s title for editing', (titleMode) => {
    useAppStore.getState().setSocialShareSettings({ titleMode });
    render(<SocialSharePanel />);
    const title = titleMode === 'journey-name' ? names.journey.name : names.tracks[0].name;
    const input = screen.getByRole('textbox', { name: 'Title' });
    expect(input).toHaveValue(title);
    fireEvent.change(input, { target: { value: `${title} — edició` } });
    expect(input).toHaveValue(`${title} — edició`);
    expect(useAppStore.getState().socialShareSettings.titleMode).toBe('custom');
    fireEvent.click(screen.getByRole('button', { name: 'Track' }));
    expect(input).toHaveValue(names.tracks[0].name);
  });

  it('lets a user intentionally clear the title', () => {
    render(<SocialSharePanel />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: '' } });
    expect(useAppStore.getState().socialShareSettings.customTitle).toBe('');
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('');
  });

  it('defaults cover places off and exposes one action to show or hide them', () => {
    render(<SocialSharePanel />);
    const show = screen.getByRole('button', { name: 'Show places' });
    expect(show).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(show);
    expect(screen.getByRole('button', { name: 'Hide places' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Hide places' }));
    expect(useAppStore.getState().socialShareSettings.showMapPlaces).toBe(false);
  });
});
