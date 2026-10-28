import { useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { SidebarPanelContent } from './SidebarPanelContent';
import { useI18n } from '@/i18n/useI18n';
import { languageLabels } from '@/i18n/translations';
import type { UnitSystem } from '@/types';
import {
  MapPin,
  Route,
  Image,
  Palette,
  Video,
  Eye,
  Globe2,
  ChevronDown
} from 'lucide-react';

function SidebarPreferences() {
  const { t, language, setLanguage } = useI18n();
  const unitSystem = useAppStore((state) => state.settings.unitSystem);
  const setUnitSystem = useAppStore((state) => state.setUnitSystem);

  return (
    <section className="mb-4 space-y-3" aria-labelledby="sidebar-preferences-title">
      <h3 id="sidebar-preferences-title" className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--evergreen)] after:h-px after:flex-1 after:bg-[var(--evergreen)]/15">
        {t('sidebar.preferencesTitle')}
      </h3>

      <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-2">
        <label htmlFor="sidebar-language" className="text-xs font-medium text-[var(--evergreen)]">{t('settings.language')}</label>
        <div className="relative flex min-w-0 items-center">
          <Globe2 className="pointer-events-none absolute left-3 h-4 w-4 text-[var(--evergreen-60)]" aria-hidden="true" />
          <select id="sidebar-language" value={language}
            onChange={(event) => setLanguage(event.target.value as keyof typeof languageLabels)}
            className="min-h-10 w-full min-w-0 appearance-none rounded-lg border border-[var(--evergreen)]/20 bg-[var(--canvas)] py-2 pl-9 pr-8 text-sm font-medium text-[var(--evergreen)] transition-colors hover:border-[var(--trail-orange)]/60 focus-visible:border-[var(--trail-orange)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trail-orange)]">
            {Object.entries(languageLabels).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-[var(--evergreen-60)]" aria-hidden="true" />
        </div>
      </div>

      <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-2">
        <span className="text-xs font-medium text-[var(--evergreen)]">{t('settings.units')}</span>
        <div className="flex overflow-hidden rounded-lg border border-[var(--evergreen)]/20" role="group" aria-label={t('settings.units')}>
          {(['metric', 'imperial'] as UnitSystem[]).map((unit) => (
            <button key={unit} type="button" onClick={() => setUnitSystem(unit)} aria-pressed={unitSystem === unit}
              className={`min-h-10 min-w-0 flex-1 px-1 py-2 text-xs font-medium transition-colors focus-visible:relative focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-[var(--trail-orange)] ${unitSystem === unit ? 'bg-[var(--evergreen)] text-[var(--canvas)]' : 'text-[var(--evergreen-60)] hover:bg-[var(--evergreen)]/5 hover:text-[var(--evergreen)]'}`}>
              {unit === 'metric' ? t('settings.unitMetric') : t('settings.unitImperial')}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Sidebar() {
  const activeTab = useAppStore((state) => state.activePanel);
  const setActiveTab = useAppStore((state) => state.setActivePanel);
  const isExporting = useAppStore((state) => state.isExporting);
  const { t } = useI18n();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const tracks = useAppStore((state) => state.tracks);
  const pictures = useAppStore((state) => state.pictures);
  const videos = useAppStore((state) => state.videos);
  const textAnnotations = useAppStore((state) => state.textAnnotations);

  const tabs = [
    { id: 'tracks' as const, label: t('sidebar.tabs.tracks'), icon: MapPin, count: tracks.length },
    { id: 'journey' as const, label: t('sidebar.tabs.journey'), icon: Route, count: 0 },
    { id: 'annotations' as const, label: t('sidebar.tabs.annotations'), icon: Palette, count: 0 },
    { id: 'settings' as const, label: t('sidebar.tabs.settings'), icon: Eye, count: 0 },
    { id: 'pictures' as const, label: t('sidebar.tabs.pictures'), icon: Image, count: pictures.length + videos.length + textAnnotations.length },
    { id: 'export' as const, label: t('sidebar.tabs.export'), icon: Video, count: 0 },
  ];

  return (
    <div className="h-full flex flex-col bg-[var(--canvas)]">
      {/* Tabs */}
      <div className="grid grid-cols-3 border-b-2 border-[var(--evergreen)] flex-shrink-0">
        {tabs.map((tab) => {
          const isLockedByExport = isExporting && tab.id !== 'export';

          return (
          <button
            key={tab.id}
            ref={(element) => {
              tabRefs.current[tab.id] = element;
            }}
            onClick={() => {
              if (isLockedByExport) return;
              setActiveTab(tab.id);
            }}
            disabled={isLockedByExport}
            className={`
              flex min-h-[56px] items-center justify-center gap-1.5 px-2 py-3 text-xs font-medium text-center transition-colors
              border-r border-b border-[var(--evergreen)]/15 last:border-r-0
              ${activeTab === tab.id
                ? 'bg-[var(--evergreen)] text-[var(--canvas)]'
                : 'text-[var(--evergreen)] hover:bg-[var(--evergreen)]/10'
              }
              ${isLockedByExport ? 'cursor-not-allowed opacity-45 hover:bg-transparent' : ''}
            `}
          >
            <tab.icon className="h-4 w-4 shrink-0 stroke-[2.25]" />
            <span>{tab.label}</span>
            {tab.count > 0 && (
              <span className={`
                ml-1 px-1.5 py-0.5 rounded-full text-[10px]
                ${activeTab === tab.id
                  ? 'bg-[var(--trail-orange)]'
                  : 'bg-[var(--evergreen)]/20'
                }
              `}>
                {tab.count}
              </span>
            )}
          </button>
          );
        })}
      </div>

      {/* Content */}
      <div data-sidebar-scroll className="flex-1 overflow-y-auto p-4 flex flex-col min-h-0">
        <div className="flex-1">
          <SidebarPanelContent />
        </div>
        <div className="pt-6 pb-2 border-t-2 border-[var(--evergreen)]/20">
          {activeTab === 'tracks' && <SidebarPreferences />}
          <div className="text-center">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-2">
              <img src="/media/images/simplelogo.png" alt="TrailReplay" className="w-10 h-10 object-contain" />
            </div>
            <h4 className="font-bold text-[var(--evergreen)]">{t('sidebar.footerTitle')}</h4>
            <p className="text-xs text-[var(--evergreen-60)]">{t('sidebar.footerSubtitle')}</p>
            <a
              href="https://github.com/bresca-ai/TrailReplay"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[var(--trail-orange)] hover:underline mt-2 inline-block"
            >
              {t('sidebar.footerGithub')}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
