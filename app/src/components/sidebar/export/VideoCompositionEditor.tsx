import { useMemo, useState } from 'react';
import type { AspectRatio } from '@/types';
import {
  addBlock,
  applyPreset,
  duplicateBlock,
  moveBlockBy,
  removeBlock,
  toggleLock,
  toggleVisibility,
  updateRect,
  type ReplayBlock,
  type ReplayComposition,
} from './replayComposition';

export interface VideoAnnotationOption { id: string; label?: string; source?: string; }

export interface VideoCompositionEditorProps {
  open: boolean;
  onClose: () => void;
  currentAspectRatio: AspectRatio;
  composition: ReplayComposition;
  onChange: (composition: ReplayComposition) => void;
  availableVideoAnnotations?: VideoAnnotationOption[];
  journeyTitle?: string;
  visibleStatIds?: string[];
}

const kindLabels: Record<string, string> = { map: 'Map', video: 'Action video', stats: 'Stats', elevation: 'Elevation', title: 'Title', branding: 'Attribution' };
const labelFor = (block: ReplayBlock) => block.kind === 'title' && 'text' in block.config && block.config.text ? String(block.config.text) : kindLabels[block.kind] ?? block.kind;

const statSamples: Record<string, string> = {
  distance: '38.9 km',
  duration: '01:42:18',
  movingDuration: '01:31:04',
  pace: '4:38 /km',
  elevation: '931 m',
  heartRate: '148 bpm',
  speed: '32.4 km/h',
  altitude: '1,216 m',
};

function BlockPreview({
  block,
  videos,
  journeyTitle,
  visibleStatIds,
}: {
  block: ReplayBlock;
  videos: VideoAnnotationOption[];
  journeyTitle: string;
  visibleStatIds: string[];
}) {
  if (block.kind === 'map') {
    return (
      <div className="absolute inset-0 overflow-hidden bg-[linear-gradient(145deg,#29463d,#10241f)]">
        <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:18px_18px]" />
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
          <path d="M8 48 C22 43 20 18 38 26 S57 49 68 28 S84 8 94 15" fill="none" stroke="#f4eee0" strokeWidth="4" opacity=".6" />
          <path d="M8 48 C22 43 20 18 38 26 S57 49 68 28 S84 8 94 15" fill="none" stroke="#c1652f" strokeWidth="2" />
        </svg>
      </div>
    );
  }
  if (block.kind === 'video') {
    const sourceId = String((block.config as { source?: string }).source ?? '');
    const source = videos.find((video) => video.id === sourceId)?.source;
    return source ? (
      <video
        className="absolute inset-0 h-full w-full"
        style={{ objectFit: String((block.config as { fit?: string }).fit ?? 'cover') as 'cover' | 'contain' }}
        src={source}
        muted
        loop
        autoPlay
        playsInline
      />
    ) : (
      <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_70%_20%,#405d51,#07100d_65%)] text-[9px] uppercase tracking-[.16em] text-white/55">Choose action video</div>
    );
  }
  if (block.kind === 'stats') {
    const configured = (block.config as { metrics?: string[] }).metrics ?? [];
    const metrics = (configured.length ? configured : visibleStatIds).slice(0, 6);
    const columns = Math.max(1, Math.min(metrics.length || 1, Number((block.config as { columns?: number }).columns ?? metrics.length ?? 1)));
    return (
      <div className="absolute inset-0 grid items-center gap-1 bg-[#071512]/90 px-2 text-white" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {metrics.map((metric) => <div key={metric} className="min-w-0 text-center"><div className="truncate text-[6px] uppercase tracking-wider text-white/60">{metric}</div><div className="truncate text-[9px] font-bold tabular-nums">{statSamples[metric] ?? '123'}</div></div>)}
      </div>
    );
  }
  if (block.kind === 'elevation') {
    return <svg className="absolute inset-0 h-full w-full bg-[#071512]" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"><path d="M0 22 L8 17 L18 19 L30 8 L42 13 L55 4 L66 11 L78 7 L88 15 L100 5 L100 24 L0 24 Z" fill="#c1652f44" stroke="#c1652f" strokeWidth="1.5" /></svg>;
  }
  if (block.kind === 'title') {
    const title = String((block.config as { text?: string }).text || journeyTitle || 'Your route');
    return <div className="absolute inset-0 flex items-center bg-[#071512]/75 px-[6%] text-left text-[clamp(8px,1.2vw,18px)] font-black uppercase tracking-tight text-[#f7f4e8]">{title}</div>;
  }
  return <div className="absolute inset-0 flex items-center justify-center bg-[#071512] text-[8px] font-black tracking-[.16em] text-[#f7f4e8]">TRAILREPLAY</div>;
}

export function VideoCompositionEditor({ open, onClose, currentAspectRatio, composition, onChange, availableVideoAnnotations = [], journeyTitle = '', visibleStatIds = [] }: VideoCompositionEditorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const layout = composition.layouts[currentAspectRatio];
  const selected = layout.blocks.find((block) => block.id === selectedId) ?? layout.blocks[0];
  const sorted = useMemo(() => [...layout.blocks].sort((a, b) => a.zIndex - b.zIndex), [layout.blocks]);
  if (!open) return null;
  const change = (next: ReplayComposition) => onChange(next);
  const update = (id: string, patch: Partial<ReplayBlock>) => change({ ...composition, layouts: { ...composition.layouts, [currentAspectRatio]: { ...layout, blocks: layout.blocks.map((block) => block.id === id ? { ...block, ...patch } as ReplayBlock : block) } } });
  const updateConfig = (id: string, patch: Record<string, unknown>) => { const block = layout.blocks.find((item) => item.id === id); if (!block) return; update(id, { config: { ...block.config, ...patch } } as Partial<ReplayBlock>); };
  const add = (kind: ReplayBlock['kind']) => { let suffix = 1; while (layout.blocks.some((item) => item.id === `${kind}-${suffix}`)) suffix += 1; const block = { id: `${kind}-${suffix}`, kind, x: .08, y: .08, width: .4, height: .18, zIndex: Math.max(0, ...layout.blocks.map((item) => item.zIndex)) + 1, visible: true, locked: false, config: kind === 'title' ? { text: journeyTitle, style: 'minimal' } : kind === 'stats' ? { metrics: visibleStatIds.slice(0, 4), columns: 2, style: 'minimal' } : kind === 'video' ? { fit: 'cover', sync: 'timeline', mute: true } : kind === 'elevation' ? { style: 'line' } : kind === 'map' ? { fit: 'cover', padding: 0 } : { attribution: true } } as ReplayBlock; change(addBlock(composition, currentAspectRatio, block)); setSelectedId(block.id); };
  const moveSelected = (dx: number, dy: number) => { if (selected) change(updateRect(composition, currentAspectRatio, selected.id, { x: selected.x + dx, y: selected.y + dy })); };
  const resize = (width: number, height: number) => { if (selected && !selected.locked) change(updateRect(composition, currentAspectRatio, selected.id, { width, height })); };
  const onCanvasPointerDown = (event: React.PointerEvent<HTMLDivElement>, block: ReplayBlock) => { if (block.locked) return; setSelectedId(block.id); const startX = event.clientX; const startY = event.clientY; const rect = event.currentTarget.parentElement?.getBoundingClientRect(); if (!rect) return; const move = (moveEvent: PointerEvent) => change(updateRect(composition, currentAspectRatio, block.id, { x: block.x + (moveEvent.clientX - startX) / rect.width, y: block.y + (moveEvent.clientY - startY) / rect.height })); const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); }; window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop); };
  const onResizePointerDown = (event: React.PointerEvent<HTMLButtonElement>, block: ReplayBlock) => { event.stopPropagation(); const parent = event.currentTarget.parentElement?.parentElement?.getBoundingClientRect(); if (!parent || block.locked) return; const startX = event.clientX; const startY = event.clientY; const move = (moveEvent: PointerEvent) => change(updateRect(composition, currentAspectRatio, block.id, { width: block.width + (moveEvent.clientX - startX) / parent.width, height: block.height + (moveEvent.clientY - startY) / parent.height })); const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); }; window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop); };
  const addKinds: ReplayBlock['kind'][] = ['map', 'video', 'stats', 'elevation', 'title', 'branding'];
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Video composition editor">
    <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-[var(--evergreen)]/20 bg-[var(--canvas)] text-[var(--evergreen)] shadow-2xl">
      <header className="flex items-center justify-between border-b border-[var(--evergreen)]/15 px-4 py-3"><div><h2 className="text-base font-bold">Compose your replay</h2><p className="text-xs opacity-65">Arrange every layer for {currentAspectRatio}</p></div><button className="rounded px-3 py-1 text-sm hover:bg-[var(--evergreen)]/10 focus:outline-none focus:ring-2 focus:ring-[var(--trail-orange)]" onClick={onClose} aria-label="Close editor">Close</button></header>
      <div className="grid min-h-0 flex-1 gap-3 overflow-auto p-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <main className="min-h-0 rounded-lg bg-[#dce5dd] p-3 sm:p-5"><div className="mb-2 flex items-center justify-between gap-3 text-xs"><span className="font-semibold">Canvas</span><span className="truncate opacity-60">Drag blocks to move them</span></div><div className={`relative mx-auto ${currentAspectRatio === '9:16' ? 'h-[58vh] max-h-[680px] w-auto max-w-full aspect-[9/16]' : currentAspectRatio === '1:1' ? 'w-full max-w-[64vh] aspect-square' : 'w-full max-w-3xl aspect-video'} overflow-hidden rounded-md bg-[#273d35] shadow-inner`} tabIndex={0} onKeyDown={(event) => { if (!selected || selected.locked) return; const amount = event.shiftKey ? .02 : .005; if (event.key === 'ArrowLeft') moveSelected(-amount, 0); if (event.key === 'ArrowRight') moveSelected(amount, 0); if (event.key === 'ArrowUp') moveSelected(0, -amount); if (event.key === 'ArrowDown') moveSelected(0, amount); }} aria-label="Composition canvas. Use arrow keys to move the selected block">
          {sorted.filter((block) => block.visible).map((block) => <div key={block.id} className={`absolute cursor-move overflow-hidden rounded border-2 text-[10px] font-semibold ${selected?.id === block.id ? 'border-[var(--trail-orange)] ring-2 ring-[var(--trail-orange)]/35' : 'border-white/35'} ${block.locked ? 'cursor-not-allowed opacity-70' : ''}`} style={{ left: `${block.x * 100}%`, top: `${block.y * 100}%`, width: `${block.width * 100}%`, height: `${block.height * 100}%`, zIndex: block.zIndex }} onPointerDown={(event) => onCanvasPointerDown(event, block)} onClick={() => setSelectedId(block.id)} aria-label={`${labelFor(block)} block`}>
            <BlockPreview block={block} videos={availableVideoAnnotations} journeyTitle={journeyTitle} visibleStatIds={visibleStatIds} />
            <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[7px] uppercase tracking-wider text-white">{labelFor(block)}</span>
            {selected?.id === block.id && !block.locked && <button className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize rounded-tl-sm bg-[var(--trail-orange)]" aria-label={`Resize ${labelFor(block)}`} onPointerDown={(event) => onResizePointerDown(event, block)} />}
          </div>)}
        </div></main>
        <aside className="min-h-0 overflow-y-auto rounded-lg border border-[var(--evergreen)]/15 bg-white/60 p-3"><div className="mb-3 flex gap-2"><button className="flex-1 rounded bg-[var(--evergreen)] px-2 py-1.5 text-xs font-semibold text-white hover:opacity-90" onClick={() => change(applyPreset(composition, currentAspectRatio, 'classic'))}>Classic</button><button className="flex-1 rounded bg-[var(--trail-orange)] px-2 py-1.5 text-xs font-semibold text-white hover:opacity-90" onClick={() => change(applyPreset(composition, currentAspectRatio, 'reel'))}>Action + map</button></div>
          <div className="mb-4"><div className="mb-1 text-[11px] font-bold uppercase tracking-wide opacity-60">Add element</div><div className="grid grid-cols-2 gap-1">{addKinds.map((kind) => { const disabled = kind === 'map' && layout.blocks.some((block) => block.kind === 'map'); return <button key={kind} disabled={disabled} className="rounded border border-[var(--evergreen)]/20 px-2 py-1 text-left text-xs hover:bg-[var(--evergreen)]/10 focus:outline-none focus:ring-2 focus:ring-[var(--trail-orange)] disabled:cursor-not-allowed disabled:opacity-35" onClick={() => add(kind)}>+ {kindLabels[kind]}</button>; })}</div></div>
          <div className="space-y-1">{sorted.map((block) => <div key={block.id} className={`flex items-center gap-1 rounded border p-1.5 ${selected?.id === block.id ? 'border-[var(--trail-orange)]' : 'border-transparent'}`}>
            <button className="min-w-0 flex-1 truncate text-left text-xs" onClick={() => setSelectedId(block.id)}>{labelFor(block)}</button>
            <button className="rounded px-1 text-xs hover:bg-black/10" onClick={() => change(toggleVisibility(composition, currentAspectRatio, block.id))} aria-label={`${block.visible ? 'Hide' : 'Show'} ${labelFor(block)}`}>{block.visible ? '◉' : '○'}</button>
            <button className="rounded px-1 text-xs hover:bg-black/10" onClick={() => change(toggleLock(composition, currentAspectRatio, block.id))} aria-label={`${block.locked ? 'Unlock' : 'Lock'} ${labelFor(block)}`}>{block.locked ? '🔒' : '⌑'}</button>
            <button className="rounded px-1 text-xs hover:bg-black/10" onClick={() => change(duplicateBlock(composition, currentAspectRatio, block.id))} aria-label={`Duplicate ${labelFor(block)}`}>＋</button>
            <button className="rounded px-1 text-xs hover:bg-black/10" onClick={() => change(moveBlockBy(composition, currentAspectRatio, block.id, 1))} aria-label={`Move ${labelFor(block)} forward`}>↑</button>
            <button className="rounded px-1 text-xs hover:bg-black/10" onClick={() => change(moveBlockBy(composition, currentAspectRatio, block.id, -1))} aria-label={`Move ${labelFor(block)} backward`}>↓</button>
            <button className="rounded px-1 text-xs text-red-700 hover:bg-red-50" onClick={() => change(removeBlock(composition, currentAspectRatio, block.id))} aria-label={`Delete ${labelFor(block)}`}>×</button>
          </div>)}</div>
          {selected && <section className="mt-4 border-t border-[var(--evergreen)]/15 pt-3">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wide opacity-60">Properties</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <label>X<input className="w-full rounded border p-1" type="number" step=".01" min="0" max="1" value={selected.x} onChange={(event) => change(updateRect(composition, currentAspectRatio, selected.id, { x: Number(event.target.value) }))} /></label>
              <label>Y<input className="w-full rounded border p-1" type="number" step=".01" min="0" max="1" value={selected.y} onChange={(event) => change(updateRect(composition, currentAspectRatio, selected.id, { y: Number(event.target.value) }))} /></label>
              <label>Width<input className="w-full rounded border p-1" type="number" step=".01" min=".01" max="1" value={selected.width} onChange={(event) => resize(Number(event.target.value), selected.height)} /></label>
              <label>Height<input className="w-full rounded border p-1" type="number" step=".01" min=".01" max="1" value={selected.height} onChange={(event) => resize(selected.width, Number(event.target.value))} /></label>
            </div>

            {selected.kind === 'map' && <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <label>Fit<select className="w-full rounded border p-1" value={String((selected.config as { fit?: string }).fit ?? 'cover')} onChange={(event) => updateConfig(selected.id, { fit: event.target.value })}><option value="cover">Cover</option><option value="contain">Contain</option></select></label>
              <label>Padding<input className="w-full rounded border p-1" type="number" min="0" max=".25" step=".01" value={Number((selected.config as { padding?: number }).padding ?? 0)} onChange={(event) => updateConfig(selected.id, { padding: Number(event.target.value) })} /></label>
            </div>}

            {selected.kind === 'video' && <div className="mt-3 space-y-2 text-xs">
              <label className="block">Source<select className="w-full rounded border p-1" value={String((selected.config as { source?: string }).source ?? '')} onChange={(event) => updateConfig(selected.id, { source: event.target.value })}><option value="">Choose video</option>{availableVideoAnnotations.map((video) => <option key={video.id} value={video.id}>{video.label ?? video.id}</option>)}</select></label>
              <div className="grid grid-cols-2 gap-2">
                <label>Fit<select className="w-full rounded border p-1" value={String((selected.config as { fit?: string }).fit ?? 'cover')} onChange={(event) => updateConfig(selected.id, { fit: event.target.value })}><option value="cover">Cover</option><option value="contain">Contain</option></select></label>
                <label>Sync<select className="w-full rounded border p-1" value={String((selected.config as { sync?: string }).sync ?? 'timeline')} onChange={(event) => updateConfig(selected.id, { sync: event.target.value })}><option value="timeline">Loop timeline</option><option value="route">Stretch to route</option><option value="manual">Hold first frame</option></select></label>
                <label>Trim start<input className="w-full rounded border p-1" type="number" min="0" step=".1" value={Number((selected.config as { trim?: { start?: number } }).trim?.start ?? 0)} onChange={(event) => updateConfig(selected.id, { trim: { ...(selected.config as { trim?: object }).trim, start: Number(event.target.value) } })} /></label>
                <label>Trim end<input className="w-full rounded border p-1" type="number" min="0" step=".1" value={Number((selected.config as { trim?: { end?: number } }).trim?.end ?? 0)} onChange={(event) => updateConfig(selected.id, { trim: { ...(selected.config as { trim?: object }).trim, end: Number(event.target.value) || undefined } })} /></label>
              </div>
              <p className="text-[11px] opacity-60">Action video is a visual layer; replay export audio stays unchanged.</p>
            </div>}

            {selected.kind === 'title' && <div className="mt-3 space-y-2 text-xs">
              <label className="block">Text<input className="w-full rounded border p-1" value={String((selected.config as { text?: string }).text ?? '')} onChange={(event) => updateConfig(selected.id, { text: event.target.value })} /></label>
              <label className="block">Style<select className="w-full rounded border p-1" value={String((selected.config as { style?: string }).style ?? 'minimal')} onChange={(event) => updateConfig(selected.id, { style: event.target.value })}><option value="minimal">Minimal</option><option value="hero">Hero</option><option value="badge">Badge</option></select></label>
            </div>}

            {selected.kind === 'elevation' && <label className="mt-3 block text-xs">Style<select className="w-full rounded border p-1" value={String((selected.config as { style?: string }).style ?? 'line')} onChange={(event) => updateConfig(selected.id, { style: event.target.value })}><option value="line">Line</option><option value="filled">Filled panel</option><option value="minimal">Minimal</option></select></label>}

            {selected.kind === 'stats' && <div className="mt-3 space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <label>Columns<input className="w-full rounded border p-1" type="number" min="1" max="6" value={Number((selected.config as { columns?: number }).columns ?? 2)} onChange={(event) => updateConfig(selected.id, { columns: Number(event.target.value) })} /></label>
                <label>Style<select className="w-full rounded border p-1" value={String((selected.config as { style?: string }).style ?? 'minimal')} onChange={(event) => updateConfig(selected.id, { style: event.target.value })}><option value="minimal">Minimal</option><option value="cards">Panel</option><option value="large">Large</option></select></label>
              </div>
              <div><div className="mb-1 font-semibold">Metrics and order</div>{visibleStatIds.map((metric) => {
                const metrics = (selected.config as { metrics?: string[] }).metrics ?? [];
                const enabled = metrics.includes(metric);
                const index = metrics.indexOf(metric);
                return <div key={metric} className="flex items-center gap-1 border-t border-black/5 py-1"><label className="flex min-w-0 flex-1 items-center gap-2"><input type="checkbox" checked={enabled} onChange={() => updateConfig(selected.id, { metrics: enabled ? metrics.filter((item) => item !== metric) : [...metrics, metric] })} /><span className="truncate">{metric}</span></label><button type="button" disabled={!enabled || index <= 0} className="rounded px-1 disabled:opacity-25" aria-label={`Move ${metric} up`} onClick={() => { const next = [...metrics]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; updateConfig(selected.id, { metrics: next }); }}>↑</button><button type="button" disabled={!enabled || index < 0 || index >= metrics.length - 1} className="rounded px-1 disabled:opacity-25" aria-label={`Move ${metric} down`} onClick={() => { const next = [...metrics]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; updateConfig(selected.id, { metrics: next }); }}>↓</button></div>;
              })}</div>
            </div>}
          </section>}
        </aside>
      </div>
    </div>
    </div>
}

export default VideoCompositionEditor;
