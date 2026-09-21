import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useI18n } from '@/i18n/useI18n';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { ACTIVITY_ICONS, isSvgActivityIcon, renderActivityIcon } from '@/utils/activityIcons';
import { createId } from '@/utils/id';
import { trackEvent } from '@/utils/analytics';
import { TIME_DEPENDENT_STATS, isStatAvailable } from '@/utils/statAvailability';
import { useAvailableStats } from '@/hooks/useAvailableStats';
import { Trash2 } from 'lucide-react';

function parsePercent(raw: string): number | null {
  const parsed = parseFloat(raw.replace(',', '.'));
  if (isNaN(parsed)) return null;
  return Math.max(0, Math.min(100, parsed));
}

function PercentInput({ value, onChange, className }: {
  value: number;
  onChange: (v: number) => void;
  className?: string;
}) {
  const [raw, setRaw] = useState(() => (value * 100).toFixed(3).replace(/\.?0+$/, ''));

  useEffect(() => {
    const current = parsePercent(raw);
    if (current === null || Math.abs(current / 100 - value) > 1e-9) {
      setRaw((value * 100).toFixed(3).replace(/\.?0+$/, ''));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={raw}
      onChange={(e) => {
        const str = e.target.value;
        setRaw(str);
        const parsed = parsePercent(str);
        if (parsed !== null) onChange(parsed / 100);
      }}
      onBlur={() => {
        const parsed = parsePercent(raw);
        const clamped = parsed ?? value * 100;
        setRaw(clamped.toFixed(3).replace(/\.?0+$/, ''));
        onChange(clamped / 100);
      }}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        const step = e.shiftKey ? 0.05 : 1;
        const current = parsePercent(raw) ?? value * 100;
        const next = Math.max(0, Math.min(100, current + (e.key === 'ArrowUp' ? step : -step)));
        setRaw(next.toFixed(3).replace(/\.?0+$/, ''));
        onChange(next / 100);
      }}
      className={className}
    />
  );
}

const COLOR_PRESETS = [
  { color: '#C1652F', labelKey: 'colors.trailOrange' },
  { color: '#fc5200', labelKey: 'colors.stravaOrange' },
  { color: '#56C596', labelKey: 'colors.stravaGreen' },
  { color: '#28a745', labelKey: 'colors.green' },
  { color: '#7FB8AD', labelKey: 'colors.teal' },
  { color: '#3B82F6', labelKey: 'colors.blue' },
  { color: '#dc3545', labelKey: 'colors.red' },
  { color: '#8B5CF6', labelKey: 'colors.purple' },
];

// ─── Inline name editor ────────────────────────────────────────────────────
function InlineName({
  name,
  color,
  onSave,
  renameTitle,
}: {
  name: string;
  color: string;
  onSave: (name: string) => void;
  renameTitle: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  const commit = () => {
    if (draft.trim()) onSave(draft.trim());
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setDraft(name); setEditing(false); }
        }}
        autoFocus
        className="flex-1 min-w-0 px-2 py-0.5 text-sm font-semibold border border-[var(--trail-orange)] rounded bg-[var(--canvas)] outline-none"
        style={{ color }}
      />
    );
  }

  return (
    <span
      className="flex-1 min-w-0 text-sm font-semibold truncate cursor-text hover:underline decoration-dotted"
      style={{ color }}
      title={renameTitle}
      onClick={() => { setDraft(name); setEditing(true); }}
    >
      {name}
    </span>
  );
}

// ─── Per-track settings block ──────────────────────────────────────────────
function TrackStyleSection({
  label,
  color,
  name,
  onColorChange,
  onNameChange,
  nameLabel,
  colorLabel,
  renameTitle,
  resolveColorLabel,
}: {
  label: string;
  color: string;
  name: string;
  onColorChange: (c: string) => void;
  onNameChange: (n: string) => void;
  nameLabel: string;
  colorLabel: string;
  renameTitle: string;
  resolveColorLabel: (key: string) => string;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-[var(--evergreen)]/15 p-3 bg-[var(--evergreen)]/3">
      {/* Section header: dot + label */}
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <span className="text-xs font-bold text-[var(--evergreen-60)] uppercase tracking-wide">{label}</span>
      </div>

      {/* Name row */}
      <div className="flex items-center gap-2">
        <Label className="text-xs text-[var(--evergreen-60)] w-10 flex-shrink-0">{nameLabel}</Label>
        <InlineName name={name} color={color} onSave={onNameChange} renameTitle={renameTitle} />
      </div>

      {/* Color row */}
      <div className="flex items-center gap-3">
        <Label className="text-xs text-[var(--evergreen-60)] w-10 flex-shrink-0">{colorLabel}</Label>
        <input
          type="color"
          value={color}
          onChange={(e) => onColorChange(e.target.value)}
          className="w-8 h-8 rounded cursor-pointer border-2 border-[var(--evergreen)]/20 flex-shrink-0"
        />
        <div className="flex gap-1.5 flex-wrap">
          {COLOR_PRESETS.map(({ color: preset, labelKey }) => (
            <button
              key={preset}
              onClick={() => onColorChange(preset)}
              title={resolveColorLabel(labelKey)}
              className={`w-6 h-6 rounded-full border-2 transition-all ${
                color === preset
                  ? 'border-[var(--evergreen)] scale-110'
                  : 'border-transparent hover:scale-105'
              }`}
              style={{ backgroundColor: preset }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main panel ────────────────────────────────────────────────────────────
export function AnnotationsPanel() {
  const { t } = useI18n();
  const settings = useAppStore((state) => state.settings);
  const trailStyle = useAppStore((state) => state.settings.trailStyle);
  const setSettings = useAppStore((state) => state.setSettings);
  const setTrailStyle = useAppStore((state) => state.setTrailStyle);

  const tracks = useAppStore((state) => state.tracks);
  const { availability, visibleStats: availableStats } = useAvailableStats();
  const activeTrackId = useAppStore((state) => state.activeTrackId);
  const updateTrackColor = useAppStore((state) => state.updateTrackColor);
  const updateTrackIcon = useAppStore((state) => state.updateTrackIcon);
  const updateTrackName = useAppStore((state) => state.updateTrackName);

  const comparisonTracks = useAppStore((state) => state.comparisonTracks);
  const updateComparisonColor = useAppStore((state) => state.updateComparisonColor);
  const updateComparisonTrackName = useAppStore((state) => state.updateComparisonTrackName);

  const [showIconPicker, setShowIconPicker] = useState(false);

  const hasMultiple = tracks.length > 1 || comparisonTracks.length > 0;
  const activeTrack = tracks.find((track) => track.id === activeTrackId) ?? tracks[0] ?? null;
  const displayedIcon = activeTrack?.activityIcon ?? trailStyle.currentIcon;

  // When the active track color changes, also sync trailStyle
  const handleMainColorChange = (trackId: string, color: string) => {
    updateTrackColor(trackId, color);
    if (trackId === activeTrackId) {
      setTrailStyle({ trailColor: color });
    }
  };

  const handleHeartRateToggle = (checked: boolean) => {
    setSettings({ showHeartRate: checked });
    setTrailStyle({ colorMode: checked ? 'heartRate' : 'fixed' });
  };

  const currentIconColor = isSvgActivityIcon(displayedIcon)
    ? trailStyle.markerColor
    : undefined;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[var(--trail-orange)]/30 bg-[var(--trail-orange-15)] p-3">
        <h3 className="text-sm font-bold text-[var(--evergreen)]">{t('annotations.styleYourRouteTitle')}</h3>
        <p className="mt-1 text-xs leading-4 text-[var(--evergreen-80)]">{t('annotations.styleYourRouteHint')}</p>
      </div>

      {/* ── Track colour & name sections ─────────────────────────── */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-[var(--evergreen)] uppercase tracking-wide">
          {hasMultiple ? t('annotations.tracksTitle') : t('annotations.trailTitle')}
        </h3>

        {tracks.length === 0 && comparisonTracks.length === 0 && (
          <p className="text-xs text-[var(--evergreen-60)]">{t('annotations.noTracks')}</p>
        )}

        {/* Main tracks */}
        {tracks.map((track, i) => (
          <TrackStyleSection
            key={track.id}
            label={hasMultiple ? t('annotations.trackLabel', { index: i + 1 }) : t('annotations.mainTrack')}
            color={track.color}
            name={track.name}
            onColorChange={(c) => handleMainColorChange(track.id, c)}
            onNameChange={(n) => updateTrackName(track.id, n)}
            nameLabel={t('common.name')}
            colorLabel={t('annotations.trackColor')}
            renameTitle={t('common.clickRename')}
            resolveColorLabel={(key) => t(key)}
          />
        ))}

        {/* Comparison tracks */}
        {comparisonTracks.map((ct, i) => (
          <TrackStyleSection
            key={ct.id}
            label={
              comparisonTracks.length > 1
                ? t('annotations.comparisonNumbered', { index: i + 1 })
                : t('annotations.comparisonSingle')
            }
            color={ct.color}
            name={ct.name}
            onColorChange={(c) => updateComparisonColor(ct.id, c)}
            onNameChange={(n) => updateComparisonTrackName(ct.id, n)}
            nameLabel={t('common.name')}
            colorLabel={t('annotations.trackColor')}
            renameTitle={t('common.clickRename')}
            resolveColorLabel={(key) => t(key)}
          />
        ))}
      </div>

      {/* ── Label visibility ─────────────────────────────────────── */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-[var(--evergreen)] uppercase tracking-wide">
          {t('annotations.labelsTitle')}
        </h3>
        <div className="flex items-center justify-between">
          <Label className="text-sm text-[var(--evergreen)]">{t('annotations.showOnMap')}</Label>
          <Switch
            checked={trailStyle.showTrackLabels}
            onCheckedChange={(checked) => setTrailStyle({ showTrackLabels: checked })}
          />
        </div>
        {trailStyle.showTrackLabels && (
          <p className="text-xs text-[var(--evergreen-60)]">
            {t('annotations.labelsHint')}
          </p>
        )}
      </div>

      {/* ── Heart rate styling ─────────────────────────────────── */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-[var(--evergreen)] uppercase tracking-wide">
          {t('annotations.heartRateTitle')}
        </h3>

        <div className="flex items-center justify-between">
          <Label className="text-sm text-[var(--evergreen)]">{t('settings.showHeartRate')}</Label>
          <Switch
            checked={settings.showHeartRate}
            onCheckedChange={handleHeartRateToggle}
          />
        </div>

        {settings.showHeartRate && (
          <div className="space-y-3 rounded-lg border border-[var(--evergreen)]/15 p-3 bg-[var(--evergreen)]/3">
            <h4 className="text-xs font-bold text-[var(--evergreen)] uppercase tracking-wide">
              {t('settings.heartRateZones')}
            </h4>
            <div className="space-y-3">
              {trailStyle.heartRateZones.map((zone, idx) => (
                <div key={idx} className="bg-[var(--canvas)] p-2 rounded border border-[var(--evergreen)]/10">
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="color"
                      value={zone.color}
                      onChange={(e) => {
                        const newZones = [...trailStyle.heartRateZones];
                        newZones[idx].color = e.target.value;
                        setTrailStyle({ heartRateZones: newZones });
                      }}
                      className="w-6 h-6 cursor-pointer rounded border border-[var(--evergreen)]/20"
                    />
                    <span className="text-xs font-semibold text-[var(--evergreen)]">
                      {t('settings.heartRateZone', { index: idx + 1 })}
                    </span>
                    <span className="text-xs text-[var(--evergreen-60)]">{zone.color}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      max="300"
                      value={zone.min}
                      onChange={(e) => {
                        const newZones = [...trailStyle.heartRateZones];
                        newZones[idx].min = Math.max(0, parseInt(e.target.value, 10) || 0);
                        setTrailStyle({ heartRateZones: newZones });
                      }}
                      className="w-14 px-2 py-1 text-xs bg-[var(--canvas)] border border-[var(--evergreen)]/30 rounded text-[var(--evergreen)] font-medium"
                    />
                    <span className="text-xs text-[var(--evergreen-60)] font-semibold">-</span>
                    <input
                      type="number"
                      min="0"
                      max="300"
                      value={zone.max}
                      onChange={(e) => {
                        const newZones = [...trailStyle.heartRateZones];
                        newZones[idx].max = Math.max(0, parseInt(e.target.value, 10) || 0);
                        setTrailStyle({ heartRateZones: newZones });
                      }}
                      className="w-14 px-2 py-1 text-xs bg-[var(--canvas)] border border-[var(--evergreen)]/30 rounded text-[var(--evergreen)] font-medium"
                    />
                    <span className="text-xs text-[var(--evergreen-60)]">{t('stats.bpm')}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Color zones ──────────────────────────────────────────── */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-[var(--evergreen)] uppercase tracking-wide">
          {t('annotations.colorZonesTitle')}
        </h3>

        <div className="flex items-center justify-between">
          <Label className="text-sm text-[var(--evergreen)]">{t('annotations.colorZonesEnable')}</Label>
          <Switch
            checked={trailStyle.colorMode === 'zones'}
            onCheckedChange={(checked) => {
              setTrailStyle({ colorMode: checked ? 'zones' : 'fixed' });
              if (checked) {
                setSettings({ showHeartRate: false });
              }
            }}
          />
        </div>

        {trailStyle.colorMode === 'zones' && (
          <div className="space-y-2">
            {trailStyle.colorZones.length === 0 && (
              <p className="text-xs text-[var(--evergreen-60)]">{t('annotations.colorZonesEmpty')}</p>
            )}

            {trailStyle.colorZones.map((zone) => (
              <div key={zone.id} className="flex items-center gap-2 rounded-lg border border-[var(--evergreen)]/15 p-2 bg-[var(--evergreen)]/3">
                <input
                  type="color"
                  value={zone.color}
                  onChange={(e) => {
                    setTrailStyle({
                      colorZones: trailStyle.colorZones.map((z) =>
                        z.id === zone.id ? { ...z, color: e.target.value } : z
                      ),
                    });
                  }}
                  className="w-7 h-7 rounded cursor-pointer border border-[var(--evergreen)]/20 flex-shrink-0"
                />
                <span className="text-xs text-[var(--evergreen-60)] flex-shrink-0">{t('annotations.colorZonesFrom')}</span>
                <PercentInput
                  value={zone.fromProgress}
                  onChange={(val) =>
                    setTrailStyle({
                      colorZones: trailStyle.colorZones.map((z) =>
                        z.id === zone.id ? { ...z, fromProgress: val } : z
                      ),
                    })
                  }
                  className="w-16 px-1.5 py-1 text-xs bg-[var(--canvas)] border border-[var(--evergreen)]/30 rounded text-[var(--evergreen)] font-medium text-center"
                />
                <span className="text-xs text-[var(--evergreen-60)]">%</span>
                <span className="text-xs text-[var(--evergreen-60)] flex-shrink-0">{t('annotations.colorZonesTo')}</span>
                <PercentInput
                  value={zone.toProgress}
                  onChange={(val) =>
                    setTrailStyle({
                      colorZones: trailStyle.colorZones.map((z) =>
                        z.id === zone.id ? { ...z, toProgress: val } : z
                      ),
                    })
                  }
                  className="w-16 px-1.5 py-1 text-xs bg-[var(--canvas)] border border-[var(--evergreen)]/30 rounded text-[var(--evergreen)] font-medium text-center"
                />
                <span className="text-xs text-[var(--evergreen-60)]">%</span>
                <button
                  type="button"
                  onClick={() =>
                    setTrailStyle({
                      colorZones: trailStyle.colorZones.filter((z) => z.id !== zone.id),
                    })
                  }
                  className="ml-auto p-1 text-[var(--evergreen-60)] hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() =>
                setTrailStyle({
                  colorZones: [
                    ...trailStyle.colorZones,
                    { id: createId('zone'), fromProgress: 0, toProgress: 1, color: trailStyle.trailColor },
                  ],
                })
              }
              className="w-full tr-btn tr-btn-secondary text-sm"
            >
              + {t('annotations.colorZonesAdd')}
            </button>
          </div>
        )}
      </div>

      {/* ── Ghost trail opacity ──────────────────────────────────── */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-[var(--evergreen)] uppercase tracking-wide">
          {t('annotations.ghostTrailTitle')}
        </h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm text-[var(--evergreen)]">{t('annotations.ghostTrailOpacityLabel')}</Label>
            <span className="text-xs text-[var(--evergreen-60)]">
              {Math.round(trailStyle.ghostTrailOpacity * 100)}%
            </span>
          </div>
          <Slider
            value={[trailStyle.ghostTrailOpacity]}
            onValueChange={([value]) => setTrailStyle({ ghostTrailOpacity: value })}
            min={0}
            max={1}
            step={0.05}
            className="w-full"
          />
          <p className="text-xs text-[var(--evergreen-60)]">
            {t('annotations.ghostTrailOpacityHint')}
          </p>
        </div>
      </div>

      {/* ── Stats visibility ─────────────────────────────────────── */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-[var(--evergreen)] uppercase tracking-wide">
          {t('annotations.statsTitle')}
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {(['distance', 'duration', 'movingDuration', 'pace', 'elevation', 'heartRate', 'speed', 'altitude'] as const).map((id) => {
            const unavailable = !isStatAvailable(id, availability);
            const reason = TIME_DEPENDENT_STATS.includes(id)
              ? t('annotations.statsNeedTiming')
              : t('annotations.statsNeedHeartRate');
            const checked = availableStats.includes(id);
            return (
              <button
                key={id}
                type="button"
                disabled={unavailable}
                title={unavailable ? reason : undefined}
                onClick={() => {
                  const next = checked
                    ? settings.visibleStats.filter((s) => s !== id)
                    : [...settings.visibleStats, id];
                  setSettings({ visibleStats: next });
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors text-left ${
                  unavailable
                    ? 'border-[var(--evergreen)]/10 text-[var(--evergreen-40)] opacity-50 cursor-not-allowed'
                    : checked
                      ? 'border-[var(--evergreen)] bg-[var(--evergreen)]/10 text-[var(--evergreen)]'
                      : 'border-[var(--evergreen)]/20 text-[var(--evergreen-60)] hover:border-[var(--evergreen)]/40'
                }`}
              >
                <span className={`w-3 h-3 rounded border flex-shrink-0 flex items-center justify-center ${
                  checked ? 'bg-[var(--evergreen)] border-[var(--evergreen)]' : 'border-[var(--evergreen-60)]'
                }`}>
                  {checked && <span className="text-[var(--canvas)] text-[8px] leading-none">✓</span>}
                </span>
                {t(`stats.label_${id}`)}
              </button>
            );
          })}
        </div>
        {tracks.length > 0 && !availability.hasRecordedTime && (
          <p className="text-xs text-[var(--evergreen-60)] leading-snug">
            {t('annotations.statsNeedTiming')}
          </p>
        )}
        {tracks.length > 0 && !availability.hasHeartRate && (
          <p className="text-xs text-[var(--evergreen-60)] leading-snug">
            {t('annotations.statsNeedHeartRate')}
          </p>
        )}
        {availableStats.includes('pace') && (
          <div className="space-y-1.5">
            <Label className="text-xs text-[var(--evergreen-60)] uppercase tracking-wide">
              {t('annotations.paceMode')}
            </Label>
            <div className="flex rounded-lg border border-[var(--evergreen)]/20 overflow-hidden">
              {(['cumulative', 'per-km'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSettings({ paceMode: mode })}
                  className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                    settings.paceMode === mode
                      ? 'bg-[var(--evergreen)] text-[var(--canvas)]'
                      : 'text-[var(--evergreen-60)] hover:text-[var(--evergreen)] hover:bg-[var(--evergreen)]/5'
                  }`}
                >
                  {mode === 'cumulative' ? t('annotations.paceModeCumulative') : t('annotations.paceModePerKm')}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="space-y-1.5">
          <Label className="text-xs text-[var(--evergreen-60)] uppercase tracking-wide">
            {t('annotations.statsBackground')}
          </Label>
          <div className="flex rounded-lg border border-[var(--evergreen)]/20 overflow-hidden">
            {(['panel', 'transparent'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSettings({ statsBackground: mode })}
                className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                  settings.statsBackground === mode
                    ? 'bg-[var(--evergreen)] text-[var(--canvas)]'
                    : 'text-[var(--evergreen-60)] hover:text-[var(--evergreen)] hover:bg-[var(--evergreen)]/5'
                }`}
              >
                {mode === 'panel' ? t('annotations.statsBackgroundPanel') : t('annotations.statsBackgroundTransparent')}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <Label className="text-sm text-[var(--evergreen)]">{t('annotations.showElevationProfile')}</Label>
          <Switch
            checked={settings.showElevationProfile}
            onCheckedChange={(checked) => {
              setSettings({ showElevationProfile: checked });
              trackEvent('feature_enabled', {
                feature_name: 'elevation_profile',
                feature_state: checked ? 'enabled' : 'disabled',
                feature_context: 'annotations_panel',
              });
            }}
          />
        </div>
        <p className="text-xs text-[var(--evergreen-60)]">{t('annotations.statsHint')}</p>
      </div>

      {/* ── Marker settings ──────────────────────────────────────── */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-[var(--evergreen)] uppercase tracking-wide">
          {t('annotations.markerTitle')}
        </h3>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm text-[var(--evergreen)]">{t('annotations.showMarker')}</Label>
            <Switch
              checked={trailStyle.showMarker}
              onCheckedChange={(checked) => setTrailStyle({ showMarker: checked })}
            />
          </div>

          {trailStyle.showMarker && (
            <>
              {/* Icon / Dot toggle */}
              <div className="flex rounded-lg overflow-hidden border border-[var(--evergreen)]/20">
                {(['icon', 'dot'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setTrailStyle({ markerType: type })}
                    className={`flex-1 py-1.5 text-sm font-medium transition-colors ${
                      trailStyle.markerType === type
                        ? 'bg-[var(--evergreen)] text-[var(--canvas)]'
                        : 'text-[var(--evergreen-60)] hover:text-[var(--evergreen)]'
                    }`}
                  >
                    {t(type === 'icon' ? 'annotations.markerTypeIcon' : 'annotations.markerTypeDot')}
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm text-[var(--evergreen)]">{t('annotations.size')}</Label>
                  <span className="text-xs text-[var(--evergreen-60)]">
                    {trailStyle.markerSize.toFixed(1)}x
                  </span>
                </div>
                <Slider
                  value={[trailStyle.markerSize]}
                  onValueChange={([value]) => setTrailStyle({ markerSize: value })}
                  min={0.5}
                  max={3}
                  step={0.1}
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <Label className="text-sm text-[var(--evergreen)] w-16 flex-shrink-0">
                    {t('annotations.markerColor')}
                  </Label>
                  <input
                    type="color"
                    value={trailStyle.markerColor}
                    onChange={(e) => setTrailStyle({ markerColor: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer border-2 border-[var(--evergreen)]/20 flex-shrink-0"
                  />
                  <div className="flex gap-1.5 flex-wrap">
                    {COLOR_PRESETS.map(({ color: preset, labelKey }) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setTrailStyle({ markerColor: preset })}
                        title={t(labelKey)}
                        className={`w-6 h-6 rounded-full border-2 transition-all ${
                          trailStyle.markerColor === preset
                            ? 'border-[var(--evergreen)] scale-110'
                            : 'border-transparent hover:scale-105'
                        }`}
                        style={{ backgroundColor: preset }}
                      />
                    ))}
                  </div>
                </div>

                {trailStyle.markerType === 'dot' && (
                  <div className="flex items-center gap-3 mt-1">
                    <div
                      className="rounded-full border-2 border-white shadow"
                      style={{
                        width: 20,
                        height: 20,
                        backgroundColor: trailStyle.markerColor,
                        flexShrink: 0,
                      }}
                    />
                    <p className="text-xs text-[var(--evergreen-60)]">{t('annotations.markerTypeDotHint')}</p>
                  </div>
                )}

                {trailStyle.markerType === 'icon' && (
                  <>
                    <p className="text-xs text-[var(--evergreen-60)]">
                      {isSvgActivityIcon(displayedIcon)
                        ? t('annotations.markerColorSvgHint')
                        : t('annotations.markerColorEmojiHint')}
                    </p>

                    <Label className="text-sm text-[var(--evergreen)]">{t('annotations.activityIcon')}</Label>
                    <div className="flex items-center gap-3">
                      <div
                        className="w-12 h-12 rounded-full border-2 border-[var(--evergreen)]/20 flex items-center justify-center"
                        style={{
                          backgroundColor: trailStyle.showCircle ? `${trailStyle.markerColor}40` : 'transparent',
                          borderColor: trailStyle.markerColor,
                        }}
                      >
                        {renderActivityIcon(displayedIcon, { size: 32, color: currentIconColor })}
                      </div>
                      <button
                        onClick={() => setShowIconPicker(true)}
                        className="tr-btn tr-btn-secondary text-sm"
                      >
                        {t('annotations.changeIcon')}
                      </button>
                    </div>
                  </>
                )}
              </div>

              {trailStyle.markerType === 'icon' && (
                <div className="flex items-center justify-between">
                  <Label className="text-sm text-[var(--evergreen)]">{t('annotations.glowCircle')}</Label>
                  <Switch
                    checked={trailStyle.showCircle}
                    onCheckedChange={(checked) => setTrailStyle({ showCircle: checked })}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Icon Picker Modal */}
      {showIconPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--canvas)] border-2 border-[var(--evergreen)] rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-[var(--evergreen)] mb-4">
              {t('annotations.selectIcon')}
            </h3>
            <div className="grid grid-cols-6 gap-2 mb-6">
              {ACTIVITY_ICONS.map(({ value, labelKey }) => (
                <button
                  key={value}
                  onClick={() => {
                    if (activeTrack) {
                      updateTrackIcon(activeTrack.id, value);
                    } else {
                      setTrailStyle({ currentIcon: value });
                    }
                    setShowIconPicker(false);
                  }}
                  title={t(labelKey)}
                  className={`
                    flex items-center justify-center p-2 rounded-lg border-2 transition-colors
                    ${displayedIcon === value
                      ? 'border-[var(--trail-orange)] bg-[var(--trail-orange-15)]'
                      : 'border-[var(--evergreen)]/20 hover:border-[var(--trail-orange)]/50'
                    }
                  `}
                >
                  {renderActivityIcon(value, {
                    size: 32,
                    color: isSvgActivityIcon(value) ? trailStyle.markerColor : undefined,
                  })}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowIconPicker(false)}
              className="w-full tr-btn tr-btn-secondary"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
