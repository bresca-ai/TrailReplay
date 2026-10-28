import { useAppStore } from '@/store/useAppStore';
import { useI18n } from '@/i18n/useI18n';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';

export function ComparisonLeaderboardSettings() {
  const { t } = useI18n();
  const settings = useAppStore((state) => state.settings);
  const setSettings = useAppStore((state) => state.setSettings);
  const hasComparison = useAppStore((state) => state.comparisonTracks.length > 0);
  if (!hasComparison) return null;

  return <section className="space-y-3 rounded-xl border border-[var(--evergreen)]/15 p-3">
    <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--evergreen)]">{t('tracks.leaderboard')}</h3>
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor="show-comparison-leaderboard">{t('tracks.leaderboardShow')}</Label>
      <Switch id="show-comparison-leaderboard" checked={settings.showLeaderboard} onCheckedChange={(showLeaderboard) => setSettings({ showLeaderboard })} />
    </div>
    <p className="text-xs leading-relaxed text-[var(--evergreen-60)]">{t('tracks.leaderboardMove')}</p>
    <div className="space-y-2">
      <Label>{t('tracks.leaderboardSize')} · {Math.round(settings.leaderboardScale * 100)}%</Label>
      <Slider aria-label={t('tracks.leaderboardSize')} min={0.6} max={3} step={0.05} value={[settings.leaderboardScale]} onValueChange={([leaderboardScale]) => setSettings({ leaderboardScale })} />
    </div>
    <div className="space-y-1.5">
      <Label>{t('tracks.leaderboardBackground')}</Label>
      <div className="flex overflow-hidden rounded-lg border border-[var(--evergreen)]/20">
        {(['panel', 'transparent'] as const).map((mode) => <button key={mode} type="button" aria-pressed={settings.leaderboardBackground === mode}
          onClick={() => setSettings({ leaderboardBackground: mode })}
          className={`flex-1 px-2 py-1.5 text-xs font-medium ${settings.leaderboardBackground === mode ? 'bg-[var(--evergreen)] text-[var(--canvas)]' : 'text-[var(--evergreen-60)] hover:bg-[var(--evergreen)]/5'}`}>
          {t(mode === 'panel' ? 'annotations.statsBackgroundPanel' : 'annotations.statsBackgroundTransparent')}
        </button>)}
      </div>
    </div>
    <button type="button" onClick={() => setSettings({ leaderboardPosition: null, leaderboardScale: 1 })}
      className="text-xs font-medium text-[var(--trail-orange)] underline underline-offset-2">{t('tracks.leaderboardReset')}</button>
  </section>;
}
