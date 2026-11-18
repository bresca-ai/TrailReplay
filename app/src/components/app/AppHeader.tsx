import { localizedSitePath } from '@/seo/seoLocale';
import { BookOpen, Info, Maximize2, Menu, Minimize2, Redo2, Undo2, X } from 'lucide-react';
import { SupportButton } from '@/components/header/SupportButton';
import { useI18n } from '@/i18n/useI18n';
import { trackEvent } from '@/utils/analytics';
import type { MenuDesign } from '@/components/sidebar/menuDesign';

interface AppHeaderProps {
  isFullscreen: boolean;
  showInfoPanel: boolean;
  showSidebar: boolean;
  onToggleFullscreen: () => void;
  onToggleInfoPanel: () => void;
  onToggleSidebar: () => void;
  history: { canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void };
  menuDesign: MenuDesign;
  onSwitchMenu: () => void;
  menuSwitchDisabled: boolean;
}

export function AppHeader({
  isFullscreen,
  showInfoPanel,
  showSidebar,
  onToggleFullscreen,
  onToggleInfoPanel,
  onToggleSidebar,
  history,
  menuDesign,
  onSwitchMenu,
  menuSwitchDisabled,
}: AppHeaderProps) {
  const { t, language } = useI18n();
  const modifier = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

  return (
    <header className="z-50 flex h-14 items-center justify-between bg-[var(--evergreen)] px-2 text-[var(--canvas)] sm:px-4 lg:pl-0">
      <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-3">
        <button
          onClick={onToggleSidebar}
          className="rounded-lg p-1.5 transition-colors hover:bg-white/10 sm:p-2 lg:flex lg:h-14 lg:w-14 lg:shrink-0 lg:items-center lg:justify-center"
        >
          {showSidebar ? <X className="h-4 w-4 sm:h-5 sm:w-5" /> : <Menu className="h-4 w-4 sm:h-5 sm:w-5" />}
        </button>
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <div className="rounded-md bg-white p-0.5 sm:p-1">
            <img
              src="/media/images/simplelogo.png"
              alt="TrailReplay"
              className="h-5 w-5 object-contain sm:h-6 sm:w-6"
            />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[11px] font-bold leading-none tracking-[0.02em] sm:text-sm">
              {t('app.title')}
            </h1>
            <p className="hidden truncate text-[10px] leading-tight opacity-70 sm:block">
              {t('app.subtitle')}
            </p>
          </div>
        </div>
      </div>

      <div className="ml-2 flex shrink-0 items-center gap-1 sm:gap-2">
        <SupportButton />
        <button type="button" onClick={onSwitchMenu} disabled={menuSwitchDisabled} className="hidden rounded-lg px-2.5 py-2 text-[11px] font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40 lg:inline-flex">
          {t(menuDesign === 'new' ? 'menuFeedback.tryPrevious' : 'menuFeedback.tryNew')}
        </button>
        <a
          href={localizedSitePath('/tutorial', language)}
          onClick={() => trackEvent('help_cta_clicked', {
            cta_location: 'app_header',
            target_page: 'tutorial',
          })}
          className="hidden items-center gap-1.5 rounded-lg border border-white/20 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[var(--evergreen)] shadow-sm transition-colors hover:bg-[var(--canvas)] lg:inline-flex"
        >
          <BookOpen className="h-3.5 w-3.5" />
          {t('app.tutorial')}
        </a>
        <button
          onClick={onToggleFullscreen}
          className="rounded-lg p-1.5 transition-colors hover:bg-white/10 sm:p-2"
          title={t('app.fullscreen')}
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4 sm:h-5 sm:w-5" /> : <Maximize2 className="h-4 w-4 sm:h-5 sm:w-5" />}
        </button>
        {([
          { label: t('app.undo'), shortcut: `${modifier}Z`, enabled: history.canUndo, action: history.undo, Icon: Undo2 },
          { label: t('app.redo'), shortcut: modifier === '⌘' ? '⇧⌘Z' : 'Ctrl+Shift+Z', enabled: history.canRedo, action: history.redo, Icon: Redo2 },
        ]).map(({ label, shortcut, enabled, action, Icon }) => (
          <span key={label} title={`${label} (${shortcut})`} className="inline-flex">
            <button type="button" aria-label={`${label} (${shortcut})`} disabled={!enabled} onClick={action}
              className="rounded-lg p-1.5 transition-colors hover:bg-white/10 disabled:pointer-events-none disabled:opacity-30 sm:p-2">
              <Icon className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
            </button>
          </span>
        ))}
        <button
          onClick={onToggleInfoPanel}
          className="rounded-lg p-1.5 transition-colors hover:bg-white/10 sm:p-2"
          title={t('app.aboutTitle')}
        >
          {showInfoPanel ? <X className="h-4 w-4 sm:h-5 sm:w-5" /> : <Info className="h-4 w-4 sm:h-5 sm:w-5" />}
        </button>
      </div>
    </header>
  );
}
