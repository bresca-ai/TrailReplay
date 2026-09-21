import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost } from '../functions/api/landmarks.js';

afterEach(() => vi.unstubAllGlobals());

describe('nearby-place provider fallback', () => {
  it('uses the next provider after a failed response and returns complete coverage', async () => {
    const requests = [];
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      requests.push(String(url));
      if (requests.length === 1) return Response.json({ error: 'busy' }, { status: 503 });
      return Response.json({ elements: [{
        type: 'node', id: 42, lat: 41.7, lon: 2.2,
        tags: { name: 'Local summit', natural: 'peak' },
      }] });
    }));

    const response = await onRequestPost({
      request: new Request('http://localhost/api/landmarks', {
        method: 'POST',
        body: JSON.stringify({ points: [[2.1, 41.6], [2.2, 41.7]] }),
      }),
      env: {},
      waitUntil: () => undefined,
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requests).toHaveLength(2);
    expect(body.landmarks).toMatchObject([{ id: 'osm-node-42', title: 'Local summit' }]);
    expect(body.coverage.complete).toBe(true);
  });
});
