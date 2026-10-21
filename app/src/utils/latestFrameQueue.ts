export interface LatestFrameQueue<T> {
  enqueue: (frame: T) => void;
  dispose: () => void;
}

interface LatestFrameQueueOptions<T> {
  paint: (frame: T) => Promise<void>;
  commit: (frame: T) => void;
  onError?: (error: unknown) => void;
}

/** Paint one frame at a time and keep only the newest waiting frame. */
export function createLatestFrameQueue<T>({
  paint,
  commit,
  onError = console.error,
}: LatestFrameQueueOptions<T>): LatestFrameQueue<T> {
  let pending: T | null = null;
  let running = false;
  let disposed = false;

  const drain = async () => {
    if (running || disposed) return;
    running = true;

    try {
      while (!disposed && pending !== null) {
        const frame = pending;
        pending = null;

        try {
          await paint(frame);
          if (!disposed) commit(frame);
        } catch (error) {
          if (!disposed) onError(error);
        }
      }
    } finally {
      running = false;
      if (!disposed && pending !== null) void drain();
    }
  };

  return {
    enqueue(frame) {
      if (disposed) return;
      pending = frame;
      void drain();
    },
    dispose() {
      disposed = true;
      pending = null;
    },
  };
}
