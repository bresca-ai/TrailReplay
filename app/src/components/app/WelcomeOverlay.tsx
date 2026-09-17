import { BookOpen, Upload } from 'lucide-react';
import { useI18n } from '@/i18n/useI18n';
import { trackEvent } from '@/utils/analytics';

interface WelcomeOverlayProps {
  onExplore: () => void;
  onOpenFilePicker: () => void;
}

export function WelcomeOverlay({
  onExplore,
  onOpenFilePicker,
}: WelcomeOverlayProps) {
  const { t } = useI18n();

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
      <div className="max-w-md rounded-xl border-2 border-[var(--evergreen)] bg-[var(--canvas)] p-8 text-center">
        <div className="mb-4 flex justify-center">
          <img
            src="/media/images/logohorizontal.svg"
            alt="TrailReplay"
            className="h-12 w-auto"
          />
        </div>
        <h2 className="mb-2 text-xl font-bold text-[var(--evergreen)]">
          {t('app.welcomeTitle')}
        </h2>
        <p className="mb-4 text-[var(--evergreen-60)]">
          {t('app.welcomeBody')}
        </p>

        <div className="mb-6 rounded-lg border border-[var(--evergreen)]/20 bg-[var(--evergreen)]/5 p-3">
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-[var(--evergreen-60)]">
            <span className="inline-flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              {t('app.welcomeNotice')}
            </span>
            <a
              href="/tutorial"
              onClick={() => trackEvent('help_cta_clicked', {
                cta_location: 'welcome_overlay',
                target_page: 'tutorial',
              })}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--evergreen)]/15 bg-white px-3 py-1 font-semibold text-[var(--evergreen)] transition-colors hover:border-[var(--trail-orange)]/40 hover:text-[var(--trail-orange)]"
            >
              <BookOpen className="h-3.5 w-3.5" />
              {t('app.tutorial')}
            </a>
          </div>
        </div>

        <div className="flex justify-center gap-2">
          <button
            onClick={() => {
              trackEvent('welcome_action_clicked', { welcome_action: 'upload' });
              onOpenFilePicker();
            }}
            className="tr-btn tr-btn-primary flex items-center gap-2"
          >
            <Upload className="h-4 w-4" />
            {t('app.uploadButton')}
          </button>
          <button
            onClick={() => {
              trackEvent('welcome_action_clicked', { welcome_action: 'explore' });
              onExplore();
            }}
            className="tr-btn tr-btn-secondary"
          >
            {t('app.exploreButton')}
          </button>
        </div>
      </div>
    </div>
  );
}
