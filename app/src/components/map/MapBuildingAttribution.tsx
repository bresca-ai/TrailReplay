import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n/useI18n';

/** OpenFreeMap supplies the optional 3D buildings, including over Esri imagery. */
export function MapBuildingAttribution() {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setExpanded(false), 5000);
    return () => window.clearTimeout(timer);
  }, []);
  return <div className="absolute bottom-1 left-1 z-10 flex items-center gap-1 rounded bg-black/70 px-1 text-[10px] text-white">
    {expanded && <span><a href="https://openfreemap.org/" target="_blank" rel="noreferrer">OpenFreeMap</a> · © <a href="https://openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></span>}
    <button type="button" aria-label={t('info.mapDataCredits')} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} className="grid h-5 w-5 place-items-center rounded-full text-xs font-bold hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white">ⓘ</button>
  </div>;
}
