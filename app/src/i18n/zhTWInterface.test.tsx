import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { LanguageSelectorCard } from '@/components/sidebar/tracks/LanguageSelectorCard';
import { TrackTrimControls } from '@/components/sidebar/tracks/TrackTrimControls';
import { HelpLayout } from '@/help/HelpLayout';
import { useI18n } from './useI18n';
import { createTrimTestTrack } from '@/test/fixtures/trimTrack';

beforeEach(() => {
  localStorage.clear();
  useAppStore.getState().reset();
  useAppStore.getState().setSettings({ language: 'en' });
});
afterEach(() => { cleanup(); localStorage.clear(); document.documentElement.lang = 'en'; });

describe('Traditional Chinese interface', () => {
  it('switches the actual route language selector and crop button, and remembers the choice', () => {
    const track = createTrimTestTrack();
    render(<><LanguageSelectorCard /><TrackTrimControls track={track} unitSystem="metric" /></>);
    expect(screen.getByRole('button', { name: 'Trim route' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '正體中文（台灣）' }));
    expect(useAppStore.getState().settings.language).toBe('zh-TW');
    expect(localStorage.getItem('trailReplayLang')).toBe('zh-TW');
    expect(screen.getByRole('button', { name: '裁切軌跡' })).toBeInTheDocument();
    expect(screen.getByText('請先選擇介面語言，再匯入路線。')).toBeInTheDocument();
  });

  it('switches standalone help content and the document language from its language menu', () => {
    function Help() {
      const { t } = useI18n();
      return <HelpLayout eyebrow={t('help.tutorial.eyebrow')} title={t('help.tutorial.title')} description={t('help.tutorial.description')}><p>{t('help.gpxGuide.beforeExportTitle')}</p></HelpLayout>;
    }
    render(<Help />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Language' }), { target: { value: 'zh-TW' } });
    expect(document.documentElement.lang).toBe('zh-TW');
    expect(screen.getByRole('heading', { name: '跟著實際流程學會 TrailReplay' })).toBeInTheDocument();
    expect(screen.getByText('匯出前先確認')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: '語言' }), { target: { value: 'en' } });
    expect(document.documentElement.lang).toBe('en');
    expect(screen.getByRole('heading', { name: 'Learn TrailReplay from the real workflow' })).toBeInTheDocument();
  });

  it('creates a new journey with a localized default name', () => {
    useAppStore.getState().setSettings({ language: 'zh-TW' });
    useAppStore.getState().addTrack(createTrimTestTrack());
    expect(useAppStore.getState().journey?.name).toBe('我的旅程');
  });
});
