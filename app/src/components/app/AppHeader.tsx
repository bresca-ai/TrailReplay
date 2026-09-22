import { BookOpen, Info, Maximize2, Menu, Minimize2, X } from 'lucide-react';
import { SupportButton } from '@/components/header/SupportButton';
import { useI18n } from '@/i18n/useI18n';
import { trackEvent } from '@/utils/analytics';

interface AppHeaderProps {
  isFullscreen: boolean;
  showInfoPanel: boolean;
  showSidebar: boolean;
  onToggleFullscreen: () => void;
  onToggleInfoPanel: () => void;
  onToggleSidebar: () => void;
}

export function AppHeader({
  isFullscreen,
  showInfoPanel,
  showSidebar,
  onToggleFullscreen,
  onToggleInfoPanel,
  onToggleSidebar,
}: AppHeaderProps) {
  const { t } = useI18n();

  return (
    <header className="z-50 flex h-14 items-center justify-between bg-[var(--evergreen)] px-2 text-[var(--canvas)] sm:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label={showSidebar ? t('sidebar.close') : t('sidebar.open')}
          aria-expanded={showSidebar}
          className="rounded-lg p-1.5 transition-colors hover:bg-white/10 sm:p-2"
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
        <a
          href="/tutorial"
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
