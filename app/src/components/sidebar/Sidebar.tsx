import { useAppStore } from '@/store/useAppStore';
import { SidebarPanelContent } from './SidebarPanelContent';
import { useI18n } from '@/i18n/useI18n';
import { languageLabels } from '@/i18n/translations';
import { useRailMapResize } from './useRailMapResize';
import { useContext, useEffect, useRef, type TransitionEvent } from 'react';
import { MenuDesignContext } from './menuDesign';
import type { UnitSystem } from '@/types';
import {
  Route,
  ListOrdered,
  Images,
  Paintbrush,
  Clapperboard,
  Camera,
  Map,
  Globe2,
  ChevronDown,
  MapPin,
  Palette,
  Image,
  Video,
  Eye,
  X,
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
  const panelOpen = useAppStore((state) => state.isSidebarOpen);
  const setPanelOpen = useAppStore((state) => state.setSidebarOpen);
  const isExporting = useAppStore((state) => state.isExporting);
  const { t } = useI18n();
  const railResize = useRailMapResize();
  const legacy = useContext(MenuDesignContext) === 'previous';
  const movingElements = useRef(new Set<HTMLElement>());
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (panelOpen && scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [activeTab, panelOpen]);
  const startResize = (event: TransitionEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget || event.nativeEvent.propertyName !== 'width') return;
    movingElements.current.add(event.currentTarget);
    railResize.start();
  };
  const stopResize = (event: TransitionEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget || event.nativeEvent.propertyName !== 'width') return;
    movingElements.current.delete(event.currentTarget);
    if (!movingElements.current.size) railResize.stop();
  };

  const tracks = useAppStore((state) => state.tracks);
  const pictures = useAppStore((state) => state.pictures);
  const videos = useAppStore((state) => state.videos);
  const textAnnotations = useAppStore((state) => state.textAnnotations);

  const tabs = [
    { id: 'tracks' as const, label: t('sidebar.tabs.tracks'), icon: Route, count: tracks.length },
    { id: 'journey' as const, label: t('sidebar.tabs.journey'), icon: ListOrdered, count: 0 },
    { id: 'annotations' as const, label: t('sidebar.tabs.annotations'), icon: Paintbrush, count: 0 },
    { id: 'settings' as const, label: t('sidebar.tabs.map'), icon: Map, count: 0 },
    { id: 'camera' as const, label: t('sidebar.tabs.camera'), icon: Camera, count: 0 },
    { id: 'pictures' as const, label: t('sidebar.tabs.pictures'), icon: Images, count: pictures.length + videos.length + textAnnotations.length },
    { id: 'export' as const, label: t('sidebar.tabs.export'), icon: Clapperboard, count: 0 },
  ];

  return (
    <div className={`relative flex min-h-0 lg:h-full lg:w-max ${legacy ? 'h-full bg-[var(--canvas)]' : 'flex-col-reverse lg:flex-row lg:bg-[var(--canvas)]'}`}>
      <nav aria-label={t('sidebar.navigation')}
        onTransitionStart={startResize} onTransitionEnd={stopResize} onTransitionCancel={stopResize}
        className={`relative z-10 hidden w-14 shrink-0 flex-col border-r border-[var(--evergreen)]/15 bg-[var(--evergreen)] pt-3 ${legacy ? '' : 'lg:flex'}`}>
          <div className="flex flex-col gap-1 px-1.5">
            {tabs.map((tab) => {
              const isLockedByExport = isExporting && tab.id !== 'export';
              const selected = panelOpen && activeTab === tab.id;
              return <button key={tab.id} type="button" aria-label={tab.label} aria-current={selected ? 'page' : undefined}
                disabled={isLockedByExport} onClick={(event) => {
                  setActiveTab(tab.id);
                  setPanelOpen(true);
                  // Pointer clicks leave the label controlled by hover; keyboard focus
                  // keeps it visible for navigation.
                  if (event.detail > 0) event.currentTarget.blur();
                }}
                className={`group/item relative flex h-11 w-full min-w-0 items-center rounded-lg px-3 text-left text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--trail-orange)] disabled:cursor-not-allowed disabled:opacity-35 ${selected ? 'bg-[var(--canvas)] text-[var(--evergreen)]' : 'text-[var(--canvas)]/75 hover:bg-white/10 hover:text-white'}`}>
                {selected && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-[var(--trail-orange)]" aria-hidden="true" />}
                <tab.icon className={`h-5 w-5 shrink-0 ${selected ? 'text-[var(--trail-orange)]' : ''}`} strokeWidth={1.8} aria-hidden="true" />
                <span aria-hidden="true" className={`pointer-events-none absolute left-full top-0 z-10 flex h-full -translate-x-2 items-center whitespace-nowrap rounded-r-lg pl-3 pr-4 opacity-0 shadow-md transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none group-hover/item:translate-x-0 group-hover/item:opacity-100 group-focus-visible/item:translate-x-0 group-focus-visible/item:opacity-100 bg-[var(--evergreen)] text-white`}>{tab.label}</span>
                {tab.count > 0 && <span aria-hidden="true" className={`absolute right-1 top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[9px] leading-none ${selected ? 'bg-[var(--trail-orange)] text-white' : 'bg-white/20 text-white'}`}>{tab.count}</span>}
              </button>;
            })}
          </div>
      </nav>
      {!legacy && <div role="group" aria-label={t('sidebar.navigation')} className="relative z-10 flex shrink-0 items-stretch bg-[var(--evergreen)] px-1 pb-[env(safe-area-inset-bottom)] lg:hidden">
        {tabs.map((tab) => {
          const selected = panelOpen && activeTab === tab.id;
          const locked = isExporting && tab.id !== 'export';
          return <button key={tab.id} type="button" aria-label={tab.label} aria-pressed={selected} disabled={locked}
            onClick={() => { if (selected) setPanelOpen(false); else { setActiveTab(tab.id); setPanelOpen(true); } }}
            className={`relative flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1 text-[9px] font-semibold focus-visible:outline-2 focus-visible:outline-[var(--trail-orange)] disabled:opacity-35 ${selected ? 'bg-[var(--canvas)] text-[var(--evergreen)]' : 'text-[var(--canvas)]/75'}`}>
            <tab.icon className={`h-5 w-5 shrink-0 ${selected ? 'text-[var(--trail-orange)]' : ''}`} strokeWidth={1.8} aria-hidden="true" />
            {tab.count > 0 && <span aria-hidden="true" className="absolute right-1 top-1 rounded-full bg-[var(--trail-orange)] px-1 text-[9px] leading-4 text-white">{tab.count}</span>}
          </button>;
        })}
      </div>}
      <div
        onTransitionStart={startResize} onTransitionEnd={stopResize} onTransitionCancel={stopResize}
        className={`min-w-0 overflow-hidden transition-[height,width] duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none lg:flex-none ${legacy ? 'flex-1' : panelOpen ? 'h-[min(55vh,32rem)] px-2 pb-2 lg:px-0 lg:pb-0' : 'h-0 px-2 lg:px-0'} ${panelOpen || legacy ? 'lg:w-80 lg:h-full' : 'lg:w-0 lg:h-full'}`}>
      <div className={`flex w-full min-w-0 flex-col bg-[var(--canvas)] lg:h-full lg:w-80 ${legacy ? 'h-full' : 'h-[calc(min(55vh,32rem)-0.5rem)] overflow-hidden rounded-t-2xl border border-[var(--evergreen)]/15 shadow-xl lg:rounded-none lg:border-0 lg:shadow-none'}`} inert={!panelOpen}>
      {!legacy && <div className="flex shrink-0 items-center justify-between px-4 pt-1.5 lg:hidden"><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--evergreen)]/60">{tabs.find((tab) => tab.id === activeTab)?.label}</span><button type="button" aria-label={t('common.close')} onClick={() => setPanelOpen(false)} className="grid h-8 w-8 place-items-center rounded-full text-[var(--evergreen)]/70 transition-colors hover:bg-[var(--evergreen)]/10 focus-visible:outline-2 focus-visible:outline-[var(--trail-orange)]"><X className="h-4 w-4" aria-hidden="true" /></button></div>}
      {/* Tabs */}
      <div className={`grid grid-cols-3 border-b-2 border-[var(--evergreen)] flex-shrink-0 ${legacy ? '' : 'hidden'}`}>
        {tabs.filter((tab) => tab.id !== 'camera').map((entry) => {
          const tab = entry.id === 'settings' ? { ...entry, label: t('sidebar.tabs.settings') } : entry;
          const isLockedByExport = isExporting && tab.id !== 'export';
          const selected = activeTab === tab.id || (tab.id === 'settings' && activeTab === 'camera');
          const legacyIcons = { tracks: MapPin, journey: Route, annotations: Palette, settings: Eye, pictures: Image, export: Video };
          const Icon = legacy ? legacyIcons[tab.id as keyof typeof legacyIcons] : tab.icon;

          return (
          <button
            key={tab.id}
            onClick={() => {
              if (isLockedByExport) return;
              setActiveTab(tab.id);
            }}
            disabled={isLockedByExport}
            className={`
              flex min-h-[56px] items-center justify-center gap-1.5 px-2 py-3 text-xs font-medium text-center transition-colors
              border-r border-b border-[var(--evergreen)]/15 last:border-r-0
              ${selected
                ? 'bg-[var(--evergreen)] text-[var(--canvas)]'
                : 'text-[var(--evergreen)] hover:bg-[var(--evergreen)]/10'
              }
              ${isLockedByExport ? 'cursor-not-allowed opacity-45 hover:bg-transparent' : ''}
            `}
          >
            <Icon className="h-4 w-4 shrink-0 stroke-[2.25]" />
            <span>{tab.label}</span>
            {tab.count > 0 && (
              <span className={`
                ml-1 px-1.5 py-0.5 rounded-full text-[10px]
                ${selected
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
      <div ref={scrollRef} data-sidebar-scroll className={`flex-1 overflow-y-auto p-4 flex flex-col min-h-0 ${legacy ? '' : 'pt-1 lg:pt-4'}`}>
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
      </div>
    </div>
  );
}
