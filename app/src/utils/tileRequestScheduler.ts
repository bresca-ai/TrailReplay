export interface TileRequest {
  key: string;
  priority: number;
  neededAt?: number;
  sourceId: string;
  url: string;
  retain?: boolean;
}

interface QueuedTileRequest extends TileRequest {
  sequence: number;
}

export interface TileRequestSchedulerOptions {
  concurrency: number;
  load: (url: string, signal?: AbortSignal, request?: TileRequest) => Promise<void>;
  isCompletedAvailable?: (request: TileRequest) => boolean;
  isStale?: (request: TileRequest) => boolean;
  onComplete?: (request: TileRequest) => void;
  onError?: (request: TileRequest) => void;
  retryDelayMs?: number;
}

/**
 * A small, bounded priority queue for predicted tiles. Unlike MapLibre's
 * viewport-driven request lifecycle, a queued request remains active when the
 * prediction camera advances to its next pose.
 */
export class TileRequestScheduler {
  private active = 0;
  private readonly activeIds = new Set<string>();
  private readonly activeRetainedIds = new Set<string>();
  private readonly activeControllers = new Map<string, AbortController>();
  private readonly completed = new Map<string, number>();
  private readonly failed = new Set<string>();
  private readonly queued = new Map<string, QueuedTileRequest>();
  private readonly retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly retryCounts = new Map<string, number>();
  private readonly retainedRetryIds = new Set<string>();
  private sequence = 0;
  private generation = 0;
  private readonly options: TileRequestSchedulerOptions;

  constructor(options: TileRequestSchedulerOptions) {
    this.options = options;
  }

  setOnComplete(onComplete: TileRequestSchedulerOptions['onComplete']): void {
    this.options.onComplete = onComplete;
  }

  enqueue(request: TileRequest): void {
    const id = `${request.sourceId}:${request.key}`;
    const completedAt = this.completed.get(id);
    if ((this.activeIds.has(id) && !this.activeControllers.get(id)?.signal.aborted
        && (!request.retain || this.activeRetainedIds.has(id)))
      || (completedAt !== undefined && Date.now() - completedAt < 600_000
        && (this.options.isCompletedAvailable?.(request) ?? true))) return;
    const retryTimer = this.retryTimers.get(id);
    if (retryTimer !== undefined) {
      clearTimeout(retryTimer);
      this.retryTimers.delete(id);
      this.retainedRetryIds.delete(id);
    }
    this.completed.delete(id);
    this.failed.delete(id);

    const existing = this.queued.get(id);
    const wasStale = existing ? (this.options.isStale?.(existing) ?? false) : false;
    const isStale = this.options.isStale?.(request) ?? false;
    if (!existing || (wasStale && !isStale) || (wasStale === isStale && request.priority < existing.priority)) {
      this.queued.set(id, { ...request, sequence: this.sequence++ });
    }
    this.drain();
  }

  clear(): void {
    this.completed.clear();
    this.failed.clear();
    this.cancelPending();
  }

  /** Stop outstanding work while retaining recently completed cache entries. */
  cancelPending(): void {
    this.clearQueued();
    this.generation++;
    for (const controller of this.activeControllers.values()) controller.abort();
  }

  /** Drop obsolete predictions without interrupting in-flight requests. */
  clearQueued(): void {
    this.queued.clear();
    for (const timer of this.retryTimers.values()) clearTimeout(timer);
    this.retryTimers.clear();
    this.retryCounts.clear();
    this.retainedRetryIds.clear();
  }

  snapshot(): { active: number; queued: number; completed: number } {
    return { active: this.active, queued: this.queued.size + this.retryTimers.size, completed: this.completed.size };
  }

  hasFailures(): boolean { return this.failed.size > 0; }

  pendingRetained(): number {
    return this.activeRetainedIds.size + this.retainedRetryIds.size
      + [...this.queued.values()].filter(request => request.retain).length;
  }

  private drain(): void {
    while (this.active < this.options.concurrency && this.queued.size > 0) {
      const next = [...this.queued.values()].filter(request => !this.activeIds.has(`${request.sourceId}:${request.key}`)).sort((left, right) => (
        Number(this.options.isStale?.(left) ?? false) - Number(this.options.isStale?.(right) ?? false)
        || left.priority - right.priority || left.sequence - right.sequence
      ))[0];
      if (!next) return;

      const id = `${next.sourceId}:${next.key}`;
      this.queued.delete(id);
      this.active += 1;
      this.activeIds.add(id);
      if (next.retain) this.activeRetainedIds.add(id);
      const generation = this.generation;
      const controller = new AbortController();
      this.activeControllers.set(id, controller);
      void this.options.load(next.url, controller.signal, next)
        .then(() => {
          if (generation === this.generation) {
            this.completed.set(id, Date.now());
            this.retryCounts.delete(id);
            this.options.onComplete?.(next);
          }
        })
        .catch(() => {
          if (generation !== this.generation) return;
          const retries = this.retryCounts.get(id) ?? 0;
          if (retries >= 2) {
            this.retryCounts.delete(id);
            this.failed.add(id);
            this.options.onError?.(next);
            return;
          }
          this.retryCounts.set(id, retries + 1);
          const timer = setTimeout(() => {
            this.retryTimers.delete(id);
            this.retainedRetryIds.delete(id);
            if (generation === this.generation) this.enqueue(next);
          }, (this.options.retryDelayMs ?? 1000) * (retries + 1));
          this.retryTimers.set(id, timer);
          if (next.retain) this.retainedRetryIds.add(id);
        })
        .finally(() => {
          this.activeControllers.delete(id);
          this.active -= 1;
          this.activeIds.delete(id);
          this.activeRetainedIds.delete(id);
          this.drain();
        });
    }
  }
}

const TILE_TEMPLATES: Record<string, string> = {
  osm: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  opentopomap: 'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  'carto-labels': 'https://cartodb-basemaps-a.global.ssl.fastly.net/light_only_labels/{z}/{x}/{y}.png',
  'enhanced-hillshade': 'https://cloud.sdsc.edu/v1/AUTH_opentopography/Raster/ASTER_GDEM/{z}/{x}/{y}.png',
  opensnowmap: 'https://tiles.opensnowmap.org/pistes/{z}/{x}/{y}.png',
  'esri-clarity': 'https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  'terrain-dem': 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
};

export function getTileRequestUrl(sourceId: string, key: string, sourceTemplate?: string): string | null {
  const canonicalSourceId = sourceId.startsWith('fallback-')
    ? sourceId.slice('fallback-'.length)
    : sourceId;
  const template = TILE_TEMPLATES[canonicalSourceId] ?? sourceTemplate;
  const [z, x, y] = key.split('/');
  if (!template || !z || !x || !y) return null;
  return template.replace('{z}', z).replace('{x}', x).replace('{y}', y);
}

export function getTilePriority(sourceId: string): number {
  if (sourceId.startsWith('fallback-')) return -1;
  if (sourceId === 'terrain-dem') return 1;
  if (sourceId === 'carto-labels') return 2;
  if (sourceId === 'opensnowmap' || sourceId === 'slope' || sourceId === 'aspect') return 3;
  return 0;
}

function loadTileImageOnce(url: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('Tile request cancelled')); return; }
    const image = new Image();
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      signal?.removeEventListener('abort', onAbort);
      if (error) reject(error); else resolve();
    };
    const onAbort = () => {
      finish(new Error('Tile request cancelled'));
      image.src = '';
    };
    const timeout = setTimeout(() => {
      finish(new Error('Tile request timed out'));
      image.src = '';
    }, 5000);
    signal?.addEventListener('abort', onAbort, { once: true });
    // Match MapLibre's CORS-mode tile requests. Without this, the browser can
    // cache a response fetched without Origin/ACAO headers and later reject
    // that cached response when MapLibre requests the same terrain tile.
    image.crossOrigin = 'anonymous';
    image.onload = () => finish();
    image.onerror = () => finish(new Error('Tile request failed'));
    image.src = url;
  });
}

/** Retry one transient provider failure even if the discovery map retains the tile ID. */
export async function preloadTileImage(url: string, signal?: AbortSignal): Promise<void> {
  try {
    await loadTileImageOnce(url, signal);
  } catch {
    if (signal?.aborted) throw new Error('Tile request cancelled');
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => { clearTimeout(timeout); reject(new Error('Tile request cancelled')); };
      const timeout = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, 500);
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) onAbort();
    });
    await loadTileImageOnce(url, signal);
  }
}
