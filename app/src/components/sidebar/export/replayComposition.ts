export const REPLAY_COMPOSITION_VERSION = 1 as const;
export type ReplayAspectRatio = '16:9' | '1:1' | '9:16';
export type ReplayBlockKind = 'map' | 'video' | 'stats' | 'elevation' | 'title' | 'branding' | (string & {});
export interface ReplayRect { x: number; y: number; width: number; height: number; }
export interface MapConfig { fit: 'cover' | 'contain'; padding: number; }
export interface VideoConfig { source?: string; fit: 'cover' | 'contain'; trim?: { start: number; end?: number }; sync: 'timeline' | 'route' | 'manual'; mute: boolean; }
export interface StatsConfig { metrics: string[]; columns: number; style: 'minimal' | 'cards' | 'large'; }
export interface ElevationConfig { style: 'line' | 'filled' | 'minimal'; }
export interface TitleConfig { text: string; style: 'minimal' | 'hero' | 'badge'; }
export interface BrandingConfig { attribution: true; }
export interface CustomConfig { [key: string]: unknown; }
export type ReplayBlock = ReplayRect & { id: string; zIndex: number; visible: boolean; locked: boolean } & ({ kind: 'map'; config: MapConfig } | { kind: 'video'; config: VideoConfig } | { kind: 'stats'; config: StatsConfig } | { kind: 'elevation'; config: ElevationConfig } | { kind: 'title'; config: TitleConfig } | { kind: 'branding'; config: BrandingConfig } | { kind: (string & {}); config: CustomConfig });
export interface ReplayLayout { aspectRatio: ReplayAspectRatio; blocks: ReplayBlock[]; }
export interface ReplayComposition { version: typeof REPLAY_COMPOSITION_VERSION; layouts: Record<ReplayAspectRatio, ReplayLayout>; }
export type ReplayPreset = 'classic' | 'reel';

const ASPECTS: ReplayAspectRatio[] = ['16:9', '1:1', '9:16'];
const clamp = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
const size = (value: unknown, fallback: number) => Math.min(1, Math.max(0.001, typeof value === 'number' && Number.isFinite(value) ? value : fallback));
const bool = (value: unknown, fallback: boolean) => typeof value === 'boolean' ? value : fallback;
const text = (value: unknown, fallback: string) => typeof value === 'string' ? value : fallback;
const enumValue = <T extends string>(value: unknown, values: readonly T[], fallback: T) => values.includes(value as T) ? value as T : fallback;

function normalizeRect(raw: Record<string, unknown>): ReplayRect {
  const rect = raw.rect && typeof raw.rect === 'object' ? raw.rect as Record<string, unknown> : raw;
  const x = clamp(rect.x, 0), y = clamp(rect.y, 0);
  return { x, y, width: Math.max(.001, Math.min(size(rect.width ?? rect.w, 1), 1 - x)), height: Math.max(.001, Math.min(size(rect.height ?? rect.h, 1), 1 - y)) };
}
function normalizeConfig(kind: string, raw: Record<string, unknown>): ReplayBlock['config'] {
  const source = raw.config && typeof raw.config === 'object' ? raw.config as Record<string, unknown> : raw;
  switch (kind) {
    case 'map': return { fit: enumValue(source.fit, ['cover', 'contain'] as const, 'cover'), padding: clamp(source.padding, 0) };
    case 'video': { const trim = source.trim && typeof source.trim === 'object' ? source.trim as Record<string, unknown> : undefined; return { source: typeof source.source === 'string' ? source.source : undefined, fit: enumValue(source.fit, ['cover', 'contain'] as const, 'cover'), sync: enumValue(source.sync, ['timeline', 'route', 'manual'] as const, 'timeline'), mute: bool(source.mute, true), ...(trim ? { trim: { start: Math.max(0, typeof trim.start === 'number' ? trim.start : 0), end: typeof trim.end === 'number' ? Math.max(0, trim.end) : undefined } } : {}) }; }
    case 'stats': return { metrics: Array.isArray(source.metrics) ? source.metrics.filter((item): item is string => typeof item === 'string') : [], columns: Math.max(1, Math.round(typeof source.columns === 'number' ? source.columns : 2)), style: enumValue(source.style, ['minimal', 'cards', 'large'] as const, 'minimal') };
    case 'elevation': return { style: enumValue(source.style, ['line', 'filled', 'minimal'] as const, 'line') };
    case 'title': return { text: text(source.text, ''), style: enumValue(source.style, ['minimal', 'hero', 'badge'] as const, 'minimal') };
    case 'branding': return { attribution: true };
    default: return { ...source };
  }
}
function normalizeBlock(input: unknown, index: number): ReplayBlock | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>; const kind = typeof raw.kind === 'string' ? raw.kind : typeof raw.type === 'string' ? raw.type : null;
  if (!kind) return null;
  return { ...normalizeRect(raw), id: text(raw.id, `${kind}-${index + 1}`), kind, zIndex: typeof raw.zIndex === 'number' && Number.isFinite(raw.zIndex) ? raw.zIndex : index, visible: bool(raw.visible, !bool(raw.hidden, false)), locked: bool(raw.locked, false), config: normalizeConfig(kind, raw) } as ReplayBlock;
}
function constraints(blocks: ReplayBlock[]): ReplayBlock[] { let mapSeen = false; return blocks.filter((block) => { if (block.kind !== 'map') return true; if (mapSeen) return false; mapSeen = true; return true; }).map((block) => block.kind === 'branding' ? { ...block, config: { attribution: true } } : block).sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id)); }
export function getLayout(composition: ReplayComposition, aspectRatio: ReplayAspectRatio): ReplayLayout { return composition.layouts[aspectRatio]; }
function block(kind: string, rect: ReplayRect, zIndex: number): ReplayBlock { return { ...rect, id: `${kind}-${zIndex}`, kind, zIndex, visible: true, locked: false, config: normalizeConfig(kind, {}) } as ReplayBlock; }

export function createReplayComposition(preset: ReplayPreset = 'classic'): ReplayComposition {
  const layouts = {} as Record<ReplayAspectRatio, ReplayLayout>;
  for (const aspectRatio of ASPECTS) {
    const classic = [block('map', { x: 0, y: 0, width: 1, height: 1 }, 0), block('stats', { x: .03, y: .78, width: .5, height: .18 }, 10), block('elevation', { x: .56, y: .82, width: .4, height: .14 }, 11), block('branding', { x: .74, y: .03, width: .23, height: .06 }, 20)];
    const reel = aspectRatio === '9:16' ? [block('video', { x: 0, y: 0, width: 1, height: .45 }, 0), block('stats', { x: 0, y: .45, width: 1, height: .14 }, 1), block('map', { x: 0, y: .59, width: 1, height: .31 }, 2), block('elevation', { x: 0, y: .90, width: 1, height: .06 }, 3), block('branding', { x: 0, y: .96, width: 1, height: .04 }, 4)] : [block('video', { x: 0, y: 0, width: 1, height: .55 }, 0), block('stats', { x: 0, y: .55, width: 1, height: .15 }, 1), block('map', { x: 0, y: .70, width: 1, height: .22 }, 2), block('elevation', { x: 0, y: .92, width: 1, height: .05 }, 3), block('branding', { x: 0, y: .97, width: 1, height: .03 }, 4)];
    layouts[aspectRatio] = { aspectRatio, blocks: constraints(preset === 'reel' ? reel : classic) };
  }
  return { version: REPLAY_COMPOSITION_VERSION, layouts };
}
export function normalizeReplayComposition(input: unknown, fallbackPreset: ReplayPreset = 'classic'): ReplayComposition {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {}; const source = raw.layouts && typeof raw.layouts === 'object' ? raw.layouts as Record<string, unknown> : {}; const layouts = {} as Record<ReplayAspectRatio, ReplayLayout>;
  for (const aspectRatio of ASPECTS) { const candidate = source[aspectRatio] && typeof source[aspectRatio] === 'object' ? source[aspectRatio] as Record<string, unknown> : aspectRatio === '16:9' ? raw : {}; const blocks = Array.isArray(candidate.blocks) ? candidate.blocks.map(normalizeBlock).filter((item): item is ReplayBlock => item !== null) : []; layouts[aspectRatio] = { aspectRatio, blocks: constraints(blocks) }; }
  if (!Object.values(layouts).some((layout) => layout.blocks.length)) return createReplayComposition(fallbackPreset);
  const fallback = createReplayComposition(fallbackPreset);
  for (const aspectRatio of ASPECTS) {
    if (layouts[aspectRatio].blocks.length === 0) layouts[aspectRatio] = fallback.layouts[aspectRatio];
  }
  return { version: REPLAY_COMPOSITION_VERSION, layouts };
}
function update(c: ReplayComposition, a: ReplayAspectRatio, fn: (blocks: ReplayBlock[]) => ReplayBlock[]): ReplayComposition { return { ...c, layouts: { ...c.layouts, [a]: { ...c.layouts[a], blocks: constraints(fn(c.layouts[a].blocks)) } } }; }
export function addBlock(c: ReplayComposition, a: ReplayAspectRatio, b: ReplayBlock): ReplayComposition { return update(c, a, (blocks) => [...blocks, normalizeBlock(b, blocks.length)!]); }
export function removeBlock(c: ReplayComposition, a: ReplayAspectRatio, id: string): ReplayComposition { return update(c, a, (blocks) => blocks.filter((item) => item.id !== id)); }
export function updateRect(c: ReplayComposition, a: ReplayAspectRatio, id: string, rect: Partial<ReplayRect>): ReplayComposition { return update(c, a, (blocks) => blocks.map((b) => b.id === id && !b.locked ? { ...b, ...normalizeRect({ ...b, ...rect }) } : b)); }
export function reorder(c: ReplayComposition, a: ReplayAspectRatio, id: string, zIndex: number): ReplayComposition { return update(c, a, (blocks) => blocks.map((b) => b.id === id ? { ...b, zIndex: Number.isFinite(zIndex) ? zIndex : b.zIndex } : b)); }
export function moveBlockBy(c: ReplayComposition, a: ReplayAspectRatio, id: string, direction: -1 | 1): ReplayComposition {
  return update(c, a, (blocks) => {
    const ordered = [...blocks].sort((left, right) => left.zIndex - right.zIndex);
    const index = ordered.findIndex((block) => block.id === id);
    if (index < 0) return blocks;
    const nextIndex = Math.max(0, Math.min(ordered.length - 1, index + direction));
    if (nextIndex === index) return blocks;
    const [moving] = ordered.splice(index, 1);
    ordered.splice(nextIndex, 0, moving);
    return ordered.map((block, zIndex) => ({ ...block, zIndex }));
  });
}
export function toggleVisibility(c: ReplayComposition, a: ReplayAspectRatio, id: string): ReplayComposition { return update(c, a, (blocks) => blocks.map((b) => b.id === id ? { ...b, visible: !b.visible } : b)); }
export function toggleLock(c: ReplayComposition, a: ReplayAspectRatio, id: string): ReplayComposition { return update(c, a, (blocks) => blocks.map((b) => b.id === id ? { ...b, locked: !b.locked } : b)); }
export function duplicateBlock(c: ReplayComposition, a: ReplayAspectRatio, id: string): ReplayComposition { const original = c.layouts[a].blocks.find((b) => b.id === id); if (!original || original.kind === 'map') return c; let suffix = 1; let copyId = `${original.id}-copy`; while (c.layouts[a].blocks.some((block) => block.id === copyId)) { suffix += 1; copyId = `${original.id}-copy-${suffix}`; } return addBlock(c, a, { ...original, id: copyId, zIndex: original.zIndex + 1, config: structuredClone(original.config) } as ReplayBlock); }
export function applyPreset(c: ReplayComposition, a: ReplayAspectRatio, preset: ReplayPreset): ReplayComposition { return { ...c, layouts: { ...c.layouts, [a]: createReplayComposition(preset).layouts[a] } }; }
export function isClassicReplayLayout(layout: ReplayLayout): boolean {
  const classic = createReplayComposition('classic').layouts[layout.aspectRatio];
  if (layout.blocks.length !== classic.blocks.length) return false;
  return layout.blocks.every((block, index) => {
    const expected = classic.blocks[index];
    return expected
      && block.kind === expected.kind
      && block.visible === expected.visible
      && block.x === expected.x
      && block.y === expected.y
      && block.width === expected.width
      && block.height === expected.height
      && block.zIndex === expected.zIndex
      && block.locked === expected.locked
      && JSON.stringify(block.config) === JSON.stringify(expected.config);
  });
}
export const normalizeComposition = normalizeReplayComposition;
export const createComposition = createReplayComposition;
