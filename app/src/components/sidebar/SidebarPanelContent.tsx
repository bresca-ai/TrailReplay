import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { useI18n } from '@/i18n/useI18n';
import { useAppStore } from '@/store/useAppStore';
import type { AppState } from '@/store/storeTypes';
import { WorkflowGuide } from './WorkflowGuide';

const TracksPanel = lazy(() => import('./TracksPanel').then((module) => ({ default: module.TracksPanel })));
const JourneyPanel = lazy(() => import('./JourneyPanel').then((module) => ({ default: module.JourneyPanel })));
const AnnotationsPanel = lazy(() => import('./AnnotationsPanel').then((module) => ({ default: module.AnnotationsPanel })));
const PicturesPanel = lazy(() => import('./PicturesPanel').then((module) => ({ default: module.PicturesPanel })));
const ExportPanel = lazy(() => import('./ExportPanel').then((module) => ({ default: module.ExportPanel })));
const SettingsPanel = lazy(() => import('./SettingsPanel').then((module) => ({ default: module.SettingsPanel })));

function PanelFallback() {
  const { t } = useI18n();

  return (
    <div className="flex h-48 items-center justify-center rounded-xl border border-[var(--evergreen)]/10 bg-[var(--evergreen)]/3">
      <div className="flex items-center gap-3 text-sm text-[var(--evergreen-60)]">
        <div className="h-4 w-4 rounded-full border-2 border-[var(--trail-orange)] border-t-transparent animate-spin" />
        <span>{t('playback.loadingPanel')}</span>
      </div>
    </div>
  );
}

const panelRegistry: Record<
  AppState['activePanel'],
  () => ReactNode
> = {
  tracks: () => <TracksPanel />,
  journey: () => <JourneyPanel />,
  annotations: () => <AnnotationsPanel />,
  pictures: () => <PicturesPanel />,
  export: () => <ExportPanel />,
  settings: () => <SettingsPanel />,
};

export function SidebarPanelContent() {
  const activePanel = useAppStore((state) => state.activePanel);
  const renderPanel = panelRegistry[activePanel];

  return (
    <>
      <WorkflowGuide />
      <Suspense fallback={<PanelFallback />}>{renderPanel()}</Suspense>
    </>
  );
}
