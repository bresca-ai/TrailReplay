import { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useI18n } from '@/i18n/useI18n';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { ACTIVITY_ICONS, isSvgActivityIcon, markerIconContrastFilter, renderActivityIcon } from '@/utils/activityIcons';
import { createId } from '@/utils/id';
import { trackEvent } from '@/utils/analytics';
import { TIME_DEPENDENT_STATS, isStatAvailable } from '@/utils/statAvailability';
import { useAvailableStats } from '@/hooks/useAvailableStats';
import { ChevronDown, Palette, Pencil, Trash2 } from 'lucide-react';
import { OverlayFontPicker } from './OverlayFontPicker';
import { ComparisonLeaderboardSettings } from './ComparisonLeaderboardSettings';
import { useComputedJourney } from '@/hooks/useComputedJourney';
import { colorZoneDistances, distanceAtZoneProgress, zoneProgressAtDistance } from '@/utils/colorZoneDistance';

function ZonePositionInput({ value, maximum, label, onChange }: {
  value: number; maximum: number; label: string; onChange: (value: number) => void;
}) {
  const format = (number: number) => Number(number.toFixed(3)).toString();
  const [raw, setRaw] = useState(() => format(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setRaw(format(value)); }, [value, focused]);
  const commit = () => {
    const parsed = Number(raw.replace(',', '.'));
    const next = raw.trim() && Number.isFinite(parsed) ? Math.max(0, Math.min(maximum, parsed)) : value;
    onChange(next);
    setRaw(format(next));
    setFocused(false);
  };
  return <input type="text" inputMode="decimal" aria-label={label} value={raw} onFocus={() => setFocused(true)}
    onChange={(event) => setRaw(event.target.value)} onBlur={commit}
    onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
    className="w-full min-w-0 rounded border border-[var(--evergreen)]/20 bg-[var(--canvas)] px-1 py-1.5 text-center text-xs tabular-nums text-[var(--evergreen)] focus:border-[var(--trail-orange)] focus:outline-none" />;
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
    <button type="button"
      className="flex min-w-0 flex-1 items-center justify-between gap-2 border-b border-[var(--evergreen)]/20 py-1 text-left text-sm font-semibold hover:underline decoration-dotted"
      style={{ color }}
      title={renameTitle}
      onClick={() => { setDraft(name); setEditing(true); }}
    >
      <span className="block truncate">{name}</span>
      <Pencil className="h-3.5 w-3.5 shrink-0 text-[var(--evergreen-60)]" aria-hidden="true" />
    </button>
  );
}

// ─── Per-track settings block ──────────────────────────────────────────────
function TrackStyleSection({
  label,
  showLabel,
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
  showLabel: boolean;
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
    <div className="space-y-2">
      {showLabel && <div className="flex items-center gap-2 pt-1">
        <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-xs font-bold text-[var(--evergreen-60)] uppercase tracking-wide">{label}</span>
      </div>}

      {/* Name row */}
      <div className="flex items-center gap-2">
        <Label className="text-xs text-[var(--evergreen-60)] w-[4.25rem] shrink-0">{nameLabel}</Label>
        <InlineName name={name} color={color} onSave={onNameChange} renameTitle={renameTitle} />
      </div>

      {/* Color row */}
      <div className="grid grid-cols-[4.25rem_minmax(0,1fr)] items-center gap-2">
        <Label className="text-xs text-[var(--evergreen)]">{colorLabel}</Label>
        <div className="flex min-w-0 items-center gap-1">
        <input
          type="color"
          value={color}
          onChange={(e) => onColorChange(e.target.value)}
          aria-label={colorLabel}
          className="h-7 w-7 rounded cursor-pointer border border-[var(--evergreen)]/20 shrink-0"
        />
        <div className="flex min-w-0 flex-wrap gap-x-0.5 gap-y-1">
          {COLOR_PRESETS.map(({ color: preset, labelKey }) => (
            <button
              key={preset}
              type="button"
              aria-label={resolveColorLabel(labelKey)}
              aria-pressed={color === preset}
              onClick={() => onColorChange(preset)}
              title={resolveColorLabel(labelKey)}
              className={`w-[18px] h-[18px] rounded-full border-2 transition-all ${
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
  const [zoneUnit, setZoneUnit] = useState<'percent' | 'km'>('percent');
  const { allCoordinates } = useComputedJourney();
  const zoneDistances = useMemo(() => colorZoneDistances(allCoordinates), [allCoordinates]);
  const routeLengthKm = zoneDistances[zoneDistances.length - 1] ?? 0;
  const distanceMode = zoneUnit === 'km' && routeLengthKm > 0;

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
    <div className="space-y-5">
      {/* ── Track colour & name sections ─────────────────────────── */}
      <div className="space-y-3">
        <h3 className="flex items-center gap-3 text-sm font-bold text-[var(--evergreen)] uppercase tracking-wide after:h-px after:flex-1 after:bg-[var(--evergreen)]/15">
          {hasMultiple ? t('annotations.tracksTitle') : t('annotations.trailTitle')}
        </h3>

        {tracks.length === 0 && comparisonTracks.length === 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-[4.25rem] shrink-0 text-xs text-[var(--evergreen-60)]">{t('annotations.routeName')}</span>
              <span className="min-w-0 flex-1 border-b border-[var(--evergreen)]/15 py-1 text-xs text-[var(--evergreen-60)]">{t('annotations.noRouteSelected')}</span>
            </div>
            <div className="grid grid-cols-[4.25rem_minmax(0,1fr)] items-center gap-2">
              <span className="text-xs text-[var(--evergreen-60)]">{t('annotations.trackColor')}</span>
              <div className="flex items-center gap-1 opacity-40" aria-label={t('annotations.noTracks')}>
                <span className="h-7 w-7 shrink-0 rounded border border-[var(--evergreen)]/20" style={{ backgroundColor: trailStyle.trailColor }} />
                <div className="flex flex-wrap gap-0.5">{COLOR_PRESETS.map(({ color }) => <span key={color} className="h-[18px] w-[18px] rounded-full" style={{ backgroundColor: color }} />)}</div>
              </div>
            </div>
            <p className="text-xs text-[var(--evergreen-60)]">{t('annotations.noTracks')}</p>
          </div>
        )}

        {/* Main tracks */}
        {tracks.map((track, i) => (
          <TrackStyleSection
            key={track.id}
            showLabel={hasMultiple}
            label={hasMultiple ? t('annotations.trackLabel', { index: i + 1 }) : t('annotations.mainTrack')}
            color={track.color}
            name={track.name}
            onColorChange={(c) => handleMainColorChange(track.id, c)}
            onNameChange={(n) => updateTrackName(track.id, n)}
            nameLabel={t('annotations.routeName')}
            colorLabel={t('annotations.trackColor')}
            renameTitle={t('common.clickRename')}
            resolveColorLabel={(key) => t(key)}
          />
        ))}

        {/* Comparison tracks */}
        {comparisonTracks.map((ct, i) => (
          <TrackStyleSection
            key={ct.id}
            showLabel
            label={
              comparisonTracks.length > 1
                ? t('annotations.comparisonNumbered', { index: i + 1 })
                : t('annotations.comparisonSingle')
            }
            color={ct.color}
            name={ct.name}
            onColorChange={(c) => updateComparisonColor(ct.id, c)}
            onNameChange={(n) => updateComparisonTrackName(ct.id, n)}
            nameLabel={t('annotations.routeName')}
            colorLabel={t('annotations.trackColor')}
            renameTitle={t('common.clickRename')}
            resolveColorLabel={(key) => t(key)}
          />
        ))}
      </div>

      {/* Ghost trail belongs to the route controls. */}
      <div className="grid grid-cols-[5rem_minmax(0,1fr)_auto] items-center gap-2" title={t('annotations.ghostTrailOpacityHint')}>
        <Label className="text-xs text-[var(--evergreen-60)]">{t('annotations.trailOpacity')}</Label>
        <Slider aria-label={t('annotations.ghostTrailTitle')} value={[trailStyle.ghostTrailOpacity]}
          onValueChange={([value]) => setTrailStyle({ ghostTrailOpacity: value })} min={0} max={1} step={0.05} className="w-full" />
        <span className="text-xs text-[var(--evergreen-60)] tabular-nums">{Math.round(trailStyle.ghostTrailOpacity * 100)}%</span>
      </div>

      <details className="group rounded-xl border border-[var(--evergreen)]/15 bg-white/20">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-3 text-[11px] font-bold text-[var(--evergreen)] transition-colors hover:text-[var(--trail-orange)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trail-orange)]">
          <Palette className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="flex-1">{t('annotations.advancedRouteColors')}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
        </summary>
        <div className="space-y-4 border-t border-[var(--evergreen)]/10 p-3">
      {/* ── Heart rate styling ─────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="heart-rate-colors" className="text-sm font-semibold text-[var(--evergreen)]">{t('settings.showHeartRate')}</Label>
          <Switch id="heart-rate-colors" checked={settings.showHeartRate} onCheckedChange={handleHeartRateToggle} />
        </div>

        {settings.showHeartRate && (
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wide text-[var(--evergreen)]">{t('settings.heartRateZones')}</h4>
              <span className="text-[10px] uppercase text-[var(--evergreen-60)]">{t('stats.bpm')}</span>
            </div>
            <div className="divide-y divide-[var(--evergreen)]/10 rounded-lg border border-[var(--evergreen)]/15 bg-[var(--canvas)]">
              {trailStyle.heartRateZones.map((zone, idx) => {
                const zoneName = t('settings.heartRateZone', { index: idx + 1 });
                return (
                  <div key={idx} className="flex min-w-0 items-center gap-1.5 px-2 py-2">
                    <input type="color" value={zone.color} aria-label={`${zoneName}: ${t('annotations.trackColor')}`}
                      onChange={(e) => setTrailStyle({ heartRateZones: trailStyle.heartRateZones.map((item, index) => index === idx ? { ...item, color: e.target.value } : item) })}
                      className="h-7 w-7 shrink-0 cursor-pointer rounded border border-[var(--evergreen)]/20" />
                    <span className="min-w-0 flex-1 text-xs font-semibold text-[var(--evergreen)]">{zoneName}</span>
                    <input type="number" min="0" max="300" value={zone.min} aria-label={`${zoneName}: ${t('annotations.colorZonesFrom')} (${t('stats.bpm')})`}
                      onChange={(e) => setTrailStyle({ heartRateZones: trailStyle.heartRateZones.map((item, index) => index === idx ? { ...item, min: Math.max(0, parseInt(e.target.value, 10) || 0) } : item) })}
                      className="w-11 min-w-0 rounded border border-[var(--evergreen)]/20 bg-[var(--canvas)] px-1 py-1.5 text-center text-xs tabular-nums text-[var(--evergreen)] focus:border-[var(--trail-orange)] focus:outline-none" />
                    <span aria-hidden="true" className="text-xs text-[var(--evergreen-60)]">–</span>
                    <input type="number" min="0" max="300" value={zone.max} aria-label={`${zoneName}: ${t('annotations.colorZonesTo')} (${t('stats.bpm')})`}
                      onChange={(e) => setTrailStyle({ heartRateZones: trailStyle.heartRateZones.map((item, index) => index === idx ? { ...item, max: Math.max(0, parseInt(e.target.value, 10) || 0) } : item) })}
                      className="w-11 min-w-0 rounded border border-[var(--evergreen)]/20 bg-[var(--canvas)] px-1 py-1.5 text-center text-xs tabular-nums text-[var(--evergreen)] focus:border-[var(--trail-orange)] focus:outline-none" />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Color zones ──────────────────────────────────────────── */}
      <div className="space-y-3 border-t border-[var(--evergreen)]/10 pt-3">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="color-zones-enabled" className="text-sm font-semibold text-[var(--evergreen)]">{t('annotations.colorZonesEnable')}</Label>
          <Switch id="color-zones-enabled" checked={trailStyle.colorMode === 'zones'} onCheckedChange={(checked) => {
            setTrailStyle({ colorMode: checked ? 'zones' : 'fixed' });
            if (checked) setSettings({ showHeartRate: false });
          }} />
        </div>
        {trailStyle.colorMode === 'zones' && <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-[var(--evergreen-60)]">{t('annotations.colorZonesMeasure')}</span>
            <div role="group" aria-label={t('annotations.colorZonesMeasure')} className="flex overflow-hidden rounded-lg border border-[var(--evergreen)]/20">
              {(['percent', 'km'] as const).map((unit) => <button key={unit} type="button" aria-pressed={(distanceMode ? 'km' : 'percent') === unit} disabled={unit === 'km' && routeLengthKm <= 0} onClick={() => setZoneUnit(unit)}
                className={`min-w-12 px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${(distanceMode ? 'km' : 'percent') === unit ? 'bg-[var(--evergreen)] text-[var(--canvas)]' : 'text-[var(--evergreen)] hover:bg-[var(--evergreen)]/5'}`}>{unit === 'percent' ? '%' : 'km'}</button>)}
            </div>
          </div>
          {distanceMode && <p className="text-[11px] text-[var(--evergreen-60)]">{t('annotations.colorZonesDistanceHint', { distance: routeLengthKm.toFixed(2) })}</p>}
          {trailStyle.colorZones.length === 0 && <p className="text-xs text-[var(--evergreen-60)]">{t('annotations.colorZonesEmpty')}</p>}
          {trailStyle.colorZones.length > 0 && <div className="space-y-2">
            <div className="grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1fr)_28px] items-center gap-1.5 px-1 text-[10px] uppercase tracking-wide text-[var(--evergreen-60)]">
              <span /><span>{t('annotations.colorZonesFrom')} ({distanceMode ? 'km' : '%'})</span><span>{t('annotations.colorZonesTo')} ({distanceMode ? 'km' : '%'})</span><span />
            </div>
            {trailStyle.colorZones.map((zone, index) => {
              const unitLabel = distanceMode ? 'km' : '%';
              const displayValue = (progress: number) => routeLengthKm > 0 ? (distanceMode ? distanceAtZoneProgress(zoneDistances, progress) : distanceAtZoneProgress(zoneDistances, progress) / routeLengthKm * 100) : progress * 100;
              const update = (field: 'fromProgress' | 'toProgress', value: number) => setTrailStyle({ colorZones: trailStyle.colorZones.map((item) => item.id === zone.id ? { ...item, [field]: routeLengthKm > 0 ? zoneProgressAtDistance(zoneDistances, distanceMode ? value : value / 100 * routeLengthKm) : value / 100 } : item) });
              const zoneLabel = t('settings.heartRateZone', { index: index + 1 });
              return <div key={zone.id} className="space-y-1">
                <div className="grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1fr)_28px] items-center gap-1.5 rounded-lg border border-[var(--evergreen)]/15 bg-[var(--canvas)] p-1.5">
                  <input type="color" value={zone.color} aria-label={`${zoneLabel}: ${t('annotations.trackColor')}`} onChange={(event) => setTrailStyle({ colorZones: trailStyle.colorZones.map((item) => item.id === zone.id ? { ...item, color: event.target.value } : item) })} className="h-7 w-7 cursor-pointer rounded border border-[var(--evergreen)]/20" />
                  <ZonePositionInput key={`${zone.id}-from-${zoneUnit}`} value={displayValue(zone.fromProgress)} maximum={distanceMode ? routeLengthKm : 100} label={`${zoneLabel}: ${t('annotations.colorZonesFrom')} (${unitLabel})`} onChange={(value) => update('fromProgress', value)} />
                  <ZonePositionInput key={`${zone.id}-to-${zoneUnit}`} value={displayValue(zone.toProgress)} maximum={distanceMode ? routeLengthKm : 100} label={`${zoneLabel}: ${t('annotations.colorZonesTo')} (${unitLabel})`} onChange={(value) => update('toProgress', value)} />
                  <button type="button" aria-label={`${t('common.remove')}: ${zoneLabel}`} onClick={() => setTrailStyle({ colorZones: trailStyle.colorZones.filter((item) => item.id !== zone.id) })} className="flex h-7 w-7 items-center justify-center rounded text-[var(--evergreen-60)] transition-colors hover:bg-red-500/10 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-[var(--trail-orange)]"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                </div>
                {zone.fromProgress >= zone.toProgress && <p role="alert" className="px-1 text-[11px] text-red-700">{t('annotations.colorZonesInvalid')}</p>}
              </div>;
            })}
          </div>}
          <button type="button" onClick={() => setTrailStyle({ colorZones: [...trailStyle.colorZones, { id: createId('zone'), fromProgress: 0, toProgress: 1, color: trailStyle.trailColor }] })}
            className="w-full rounded-lg border border-dashed border-[var(--evergreen)]/30 px-3 py-2 text-xs font-semibold text-[var(--evergreen)] transition-colors hover:border-[var(--trail-orange)] hover:bg-[var(--trail-orange-15)]">+ {t('annotations.colorZonesAdd')}</button>
        </div>}
      </div>

        </div>
      </details>

      {/* ── Marker settings ──────────────────────────────────────── */}
      <div className="space-y-3">
        <h3 className="flex items-center gap-3 text-sm font-bold text-[var(--evergreen)] uppercase tracking-wide after:h-px after:flex-1 after:bg-[var(--evergreen)]/15">
          {t('annotations.markerTitle')}
        </h3>

        <div className="space-y-3">
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
              <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-2">
                <span className="text-xs text-[var(--evergreen)]">{t('annotations.markerType')}</span>
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
              </div>

              <div className="grid grid-cols-[5rem_minmax(0,1fr)_auto] items-center gap-2">
                <Label className="text-sm text-[var(--evergreen)]">{t('annotations.size')}</Label>
                <Slider aria-label={t('annotations.size')} value={[trailStyle.markerSize]} onValueChange={([value]) => setTrailStyle({ markerSize: value })} min={0.5} max={3} step={0.1} className="w-full" />
                <span className="text-xs text-[var(--evergreen-60)] tabular-nums">{trailStyle.markerSize.toFixed(1)}x</span>
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-[4.25rem_minmax(0,1fr)] items-center gap-2">
                  <Label className="text-xs text-[var(--evergreen)]">{t('annotations.markerColor')}</Label>
                  <div className="flex min-w-0 items-center gap-1">
                  <input
                    type="color"
                    value={trailStyle.markerColor}
                    aria-label={t('annotations.markerColor')}
                    onChange={(e) => setTrailStyle({ markerColor: e.target.value })}
                    className="h-7 w-7 rounded cursor-pointer border border-[var(--evergreen)]/20 shrink-0"
                  />
                  <div className="flex min-w-0 flex-wrap gap-x-0.5 gap-y-1">
                    {COLOR_PRESETS.map(({ color: preset, labelKey }) => (
                      <button
                        key={preset}
                        type="button"
                        aria-label={t(labelKey)}
                        aria-pressed={trailStyle.markerColor === preset}
                        onClick={() => setTrailStyle({ markerColor: preset })}
                        title={t(labelKey)}
                        className={`w-[18px] h-[18px] rounded-full border-2 transition-all ${
                          trailStyle.markerColor === preset
                            ? 'border-[var(--evergreen)] scale-110'
                            : 'border-transparent hover:scale-105'
                        }`}
                        style={{ backgroundColor: preset }}
                      />
                    ))}
                  </div>
                  </div>
                </div>

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
                        className="w-12 h-12 flex items-center justify-center"
                        style={{
                          filter: trailStyle.showCircle ? markerIconContrastFilter() : 'none',
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

      {/* ── Label visibility ─────────────────────────────────────── */}
      <div className="space-y-3">
        <h3 className="flex items-center gap-3 text-sm font-bold text-[var(--evergreen)] uppercase tracking-wide after:h-px after:flex-1 after:bg-[var(--evergreen)]/15">
          {t('annotations.labelsAndText')}
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

      {/* ── Overlay typography ──────────────────────────────────── */}
      <div className="space-y-3">
        <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-2">
          <Label htmlFor="overlay-font" className="text-sm text-[var(--evergreen)]">
            {t('annotations.fontLabel')}
          </Label>
          <OverlayFontPicker
            id="overlay-font"
            value={trailStyle.overlayFont}
            onChange={(overlayFont) => {
              setTrailStyle({ overlayFont });
              trackEvent('settings_changed', { setting_name: 'overlay_font', setting_value: overlayFont });
            }}
          />
        </div>
        <details className="text-[11px] text-[var(--evergreen-60)]"><summary className="cursor-pointer">{t('annotations.typographyTitle')}</summary><p className="mt-1">{t('annotations.typographyHint')} {t('annotations.typographyOpenSource')}</p></details>
      </div>

      {/* ── Stats visibility ─────────────────────────────────────── */}
      <div className="space-y-3">
        <h3 className="flex items-center gap-3 text-sm font-bold text-[var(--evergreen)] uppercase tracking-wide after:h-px after:flex-1 after:bg-[var(--evergreen)]/15">
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
                aria-pressed={checked}
                disabled={unavailable}
                title={unavailable ? reason : undefined}
                onClick={() => {
                  const next = checked
                    ? settings.visibleStats.filter((s) => s !== id)
                    : [...settings.visibleStats, id];
                  setSettings({ visibleStats: next });
                }}
                className={`flex min-h-9 items-center gap-2 px-1 py-1 text-sm transition-colors text-left ${
                  unavailable
                    ? 'text-[var(--evergreen-40)] opacity-50 cursor-not-allowed'
                    : checked
                      ? 'text-[var(--evergreen)]'
                      : 'text-[var(--evergreen-60)] hover:text-[var(--evergreen)]'
                }`}
              >
                <span className={`w-3 h-3 rounded border flex-shrink-0 flex items-center justify-center ${
                  checked ? 'bg-[var(--trail-orange)] border-[var(--trail-orange)]' : 'border-[var(--evergreen-60)]'
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
          <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-2">
            <Label className="text-xs text-[var(--evergreen)]">
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
        <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-2">
          <Label className="text-xs text-[var(--evergreen)]">
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
        {settings.showElevationProfile && (
          <div className="ml-3 space-y-1.5 border-l border-[var(--evergreen)]/15 pl-3">
            <div className="flex items-center justify-between gap-3">
              <Label className="text-sm text-[var(--evergreen)]">
                {t('annotations.dynamicElevationProfile')}
              </Label>
              <Switch
                checked={settings.dynamicElevationProfile}
                onCheckedChange={(checked) => {
                  setSettings({ dynamicElevationProfile: checked });
                  trackEvent('feature_enabled', {
                    feature_name: 'dynamic_elevation_profile',
                    feature_state: checked ? 'enabled' : 'disabled',
                    feature_context: 'annotations_panel',
                  });
                }}
              />
            </div>
            <p className="text-xs text-[var(--evergreen-60)]">
              {t('annotations.dynamicElevationProfileHint')}
            </p>
            {settings.dynamicElevationProfile && (
              <div
                className="space-y-2 rounded-lg border border-[var(--trail-orange)]/30 bg-[var(--trail-orange-15)] p-2.5"
                role="note"
              >
                <p className="text-xs font-semibold text-[var(--evergreen)]">
                  {t('annotations.dynamicElevationProfileGuideTitle')}
                </p>
                <ol className="space-y-1.5 text-[11px] leading-relaxed text-[var(--evergreen-60)]">
                  {[
                    t('annotations.dynamicElevationProfileGuideAutomatic'),
                    t('annotations.dynamicElevationProfileGuideEdit'),
                    t('annotations.dynamicElevationProfileGuideAddRemove'),
                  ].map((instruction, index) => (
                    <li key={instruction} className="flex gap-2">
                      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-[var(--evergreen)] text-[9px] font-bold text-[var(--canvas)]">
                        {index + 1}
                      </span>
                      <span>{instruction}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
        <p className="text-xs text-[var(--evergreen-60)]">{t('annotations.statsHint')}</p>
      </div>

      {comparisonTracks.length > 0 && <details className="rounded-lg bg-[var(--evergreen)]/5">
        <summary className="cursor-pointer px-3 py-3 text-sm font-semibold text-[var(--evergreen)]">{t('tracks.leaderboard')}</summary>
        <div className="px-3 pb-3"><ComparisonLeaderboardSettings /></div>
      </details>}

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
