import { create } from 'zustand';
import type { GPXTrack } from '@/types';

export interface WaypointImportBatch {
  tracks: GPXTrack[];
  groups: Array<[string, string]>;
}

interface WaypointImportQueue {
  batches: WaypointImportBatch[];
  enqueue: (batch: WaypointImportBatch) => void;
  dismiss: () => void;
}

export const useWaypointImportQueue = create<WaypointImportQueue>((set) => ({
  batches: [],
  enqueue: (batch) => set((state) => ({ batches: [...state.batches, batch] })),
  dismiss: () => set((state) => ({ batches: state.batches.slice(1) })),
}));
