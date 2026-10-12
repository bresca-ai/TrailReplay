import { LoaderCircle } from 'lucide-react';
import { useI18n } from '@/i18n/useI18n';
import { useAppStore } from '@/store/useAppStore';

export function FileImportBanner() {
  const { t } = useI18n();
  const status = useAppStore((state) => state.fileImportStatus);

  if (!status) return null;

  const title = status.kind === 'project'
    ? t('fileImport.openingProject')
    : status.kind === 'recipe'
      ? t('fileImport.applyingRecipe')
      : t('fileImport.loadingRoutes');
  const detail = status.fileCount > 1
    ? t('fileImport.fileCount', { count: status.fileCount })
    : status.fileName;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed left-1/2 top-16 z-[100] w-[min(calc(100vw-2rem),28rem)] -translate-x-1/2"
    >
      <div className="flex items-start gap-3 rounded-xl border border-[var(--evergreen)]/20 bg-[var(--canvas)]/95 px-4 py-3 shadow-xl backdrop-blur-sm">
        <LoaderCircle
          aria-hidden="true"
          className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-[var(--trail-orange)]"
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--evergreen)]">{title}</p>
          <p className="truncate text-xs text-[var(--evergreen-60)]" title={detail}>{detail}</p>
          <p className="mt-1 text-xs text-[var(--evergreen-60)]">{t('fileImport.keepOpen')}</p>
        </div>
      </div>
    </div>
  );
}
