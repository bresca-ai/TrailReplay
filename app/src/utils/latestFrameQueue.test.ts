import { describe, expect, it, vi } from 'vitest';
import { createLatestFrameQueue } from './latestFrameQueue';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('createLatestFrameQueue', () => {
  it('commits painted frames and skips superseded waiting frames', async () => {
    const paints = [deferred(), deferred()];
    const paint = vi.fn((frame: number) => paints[frame === 1 ? 0 : 1].promise);
    const commit = vi.fn();
    const queue = createLatestFrameQueue({ paint, commit });

    queue.enqueue(1);
    queue.enqueue(2);
    queue.enqueue(3);
    expect(paint).toHaveBeenCalledTimes(1);

    paints[0].resolve();
    await flushMicrotasks();
    expect(commit).toHaveBeenCalledWith(1);
    expect(paint).toHaveBeenLastCalledWith(3);

    paints[1].resolve();
    await flushMicrotasks();
    expect(commit.mock.calls).toEqual([[1], [3]]);
  });

  it('does not commit an in-flight frame after disposal', async () => {
    const painting = deferred();
    const commit = vi.fn();
    const queue = createLatestFrameQueue({ paint: () => painting.promise, commit });

    queue.enqueue(1);
    queue.dispose();
    painting.resolve();
    await flushMicrotasks();

    expect(commit).not.toHaveBeenCalled();
  });
});
