import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '@/i18n/useI18n';
import { useAppStore } from '@/store/useAppStore';
import { trackEvent } from '@/utils/analytics';
import { MENU_FEEDBACK_KEY, type MenuDesign } from './menuDesign';
import { useDesktopViewport } from './useDesktopSidebar';

function hasSeenPrompt() {
  try { return localStorage.getItem(MENU_FEEDBACK_KEY) !== null; } catch { return false; }
}

export function MenuFeedback({ design, onSwitch }: { design: MenuDesign; onSwitch: (design: MenuDesign) => void }) {
  const { t } = useI18n();
  const desktop = useDesktopViewport();
  const exporting = useAppStore(state => state.isExporting);
  const [eligible, setEligible] = useState(() => !hasSeenPrompt());
  const [visible, setVisible] = useState(false);
  const voted = useRef(false);

  useEffect(() => {
    if (!eligible || !desktop || exporting) return;
    const timer = window.setTimeout(() => {
      if (hasSeenPrompt()) { setEligible(false); return; }
      try { localStorage.setItem(MENU_FEEDBACK_KEY, 'seen'); } catch { /* unavailable storage: this session still shows it once */ }
      setVisible(true);
      setEligible(false);
      trackEvent('menu_feedback_shown');
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [eligible, desktop, exporting]);

  const vote = (preference: MenuDesign) => {
    if (voted.current) return;
    try {
      if (localStorage.getItem(MENU_FEEDBACK_KEY)?.startsWith('vote:')) { setVisible(false); return; }
      localStorage.setItem(MENU_FEEDBACK_KEY, `vote:${preference}`);
    } catch { /* keep the one-vote guard for this session */ }
    voted.current = true;
    trackEvent(preference === 'new' ? 'menu_vote_new' : 'menu_vote_previous');
    setVisible(false);
  };

  if (!visible || !desktop || exporting) return null;
  return (
    <section role="region" aria-label={t('menuFeedback.title')} className="absolute bottom-4 left-4 z-40 w-[min(22rem,calc(100%-2rem))] rounded-xl border border-[var(--evergreen)]/20 bg-[var(--canvas)] p-4 text-[var(--evergreen)] shadow-xl">
      <button type="button" onClick={() => setVisible(false)} aria-label={t('menuFeedback.dismiss')} className="absolute right-2 top-2 rounded-md p-1.5 text-[var(--evergreen-60)] hover:bg-[var(--evergreen)]/10"><X className="h-4 w-4" /></button>
      <h2 className="pr-7 text-sm font-bold">{t('menuFeedback.title')}</h2>
      <p className="mt-1 text-xs leading-relaxed text-[var(--evergreen-60)]">{t('menuFeedback.description')}</p>
      <button type="button" onClick={() => onSwitch(design === 'new' ? 'previous' : 'new')} className="mt-3 text-xs font-semibold underline decoration-[var(--trail-orange)] underline-offset-4">{t(design === 'new' ? 'menuFeedback.tryPrevious' : 'menuFeedback.tryNew')}</button>
      <p className="mt-4 text-xs font-semibold">{t('menuFeedback.question')}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => vote('new')} className="rounded-lg border border-[var(--evergreen)]/25 px-3 py-2 text-xs font-semibold hover:border-[var(--trail-orange)] hover:bg-[var(--trail-orange)]/10">{t('menuFeedback.new')}</button>
        <button type="button" onClick={() => vote('previous')} className="rounded-lg border border-[var(--evergreen)]/25 px-3 py-2 text-xs font-semibold hover:border-[var(--trail-orange)] hover:bg-[var(--trail-orange)]/10">{t('menuFeedback.previous')}</button>
      </div>
      <p className="mt-2 text-[10px] text-[var(--evergreen-60)]">{t('menuFeedback.oneVote')}</p>
    </section>
  );
}
