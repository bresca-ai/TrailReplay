/**
 * MapLibre 6.16 has no public API for warming a map's decoded tile cache.
 * This small adapter is deliberately version-gated and raster-only; if its
 * internal interfaces change, byte preloading continues without it.
 */
import type { Map as MapLibreMap } from 'maplibre-gl';

type TileId = { key: string; wrapped(): TileId; overscaleFactor(): number };
type Tile = { tileID: TileId; state: string; aborted?: boolean; getExpiryTimeout(): number | void };
type TileConstructor = new (id: TileId, size: number) => Tile;
type Manager = {
  _source: { type: string; tileSize: number; loadTile(tile: Tile): Promise<void>; abortTile?(tile: Tile): void; unloadTile?(tile: Tile): void };
  _outOfViewCache: { has(id: TileId): boolean; add(id: TileId, tile: Tile, expiry: number | void): unknown };
  getTileByID(id: string): unknown;
};
type InternalMap = MapLibreMap & { style?: { tileManagers?: Record<string, Manager> } };
type Job = { sourceId: string; id: TileId; TileClass: TileConstructor; neededAt: number };

export class VisibleRasterWarmup {
  private readonly queued = new Map<string, Job>();
  private readonly active = new Map<string, { tile: Tile; manager: Manager }>();
  private disposed = false;
  private loaded = 0;
  private failed = 0;
  private readonly getMap: () => MapLibreMap | null;
  private readonly supported: boolean;
  constructor(getMap: () => MapLibreMap | null, supported: boolean) { this.getMap = getMap; this.supported = supported; }
  snapshot() { return { supported: this.supported, queued: this.queued.size, active: this.active.size, loaded: this.loaded, failed: this.failed }; }

  enqueue(sourceId: string, id: TileId, TileClass: TileConstructor, neededAt: number): void {
    if (!this.supported || this.disposed || !id || typeof id.wrapped !== 'function' || typeof id.overscaleFactor !== 'function' || typeof TileClass !== 'function') return;
    const key = `${sourceId}:${id.key}`;
    if (this.active.has(key)) return;
    const existing = this.queued.get(key);
    if (!existing || neededAt < existing.neededAt) this.queued.set(key, { sourceId, id, TileClass, neededAt });
    // Restrict speculative GPU work to a small rolling window.
    if (this.queued.size > 96) {
      const furthest = [...this.queued].reduce((a, b) => a[1].neededAt > b[1].neededAt ? a : b);
      this.queued.delete(furthest[0]);
    }
    this.drain();
  }

  private drain(): void {
    while (!this.disposed && this.active.size < 2 && this.queued.size) {
      const [key, job] = [...this.queued].reduce((a, b) => a[1].neededAt < b[1].neededAt ? a : b);
      this.queued.delete(key);
      const map = this.getMap() as InternalMap | null;
      const manager = map?.style?.tileManagers?.[job.sourceId];
      const source = manager?._source;
      const cache = manager?._outOfViewCache;
      if (!map || !manager || source?.type !== 'raster' || !cache || typeof cache.has !== 'function' || typeof cache.add !== 'function' || typeof manager.getTileByID !== 'function' || manager.getTileByID(job.id.key) || cache.has(job.id)) continue;
      let tile: Tile;
      try { tile = new job.TileClass(job.id, source.tileSize * job.id.overscaleFactor()); } catch { continue; }
      this.active.set(key, { tile, manager });
      void Promise.resolve().then(() => {
        if (this.disposed) throw new Error('Visible tile warmup cancelled');
        return source.loadTile(tile);
      }).then(() => {
        const stillCurrent = !this.disposed && this.getMap() === map && (map as InternalMap).style?.tileManagers?.[job.sourceId] === manager;
        if (stillCurrent && tile.state === 'loaded' && !manager.getTileByID(job.id.key) && !cache.has(job.id)) {
          cache.add(job.id, tile, tile.getExpiryTimeout());
          this.loaded++;
        } else {
          source.unloadTile?.(tile);
        }
      }).catch(() => { this.failed++; source.unloadTile?.(tile); }).finally(() => {
        this.active.delete(key);
        this.drain();
      });
    }
  }

  dispose(): void {
    this.disposed = true;
    this.queued.clear();
    for (const { tile, manager } of this.active.values()) {
      tile.aborted = true;
      manager._source.abortTile?.(tile);
    }
  }
}
