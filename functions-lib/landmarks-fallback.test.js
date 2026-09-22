import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost } from '../functions/api/landmarks.js';
import { MAX_JSON_BODY_BYTES } from './http.js';

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

  it.each([
    ['a huge finite longitude', [[1e308, 41], [1e308, 41.1]]],
    ['a longitude just outside the valid range', [[180.0001, 41], [180.0002, 41]]],
    ['a latitude just outside the valid range', [[2, 90.0001], [2.1, 90.0002]]],
  ])('rejects %s before contacting the provider', async (_description, points) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await onRequestPost({
      request: new Request('http://localhost/api/landmarks', {
        method: 'POST',
        body: JSON.stringify({ points }),
      }),
      env: {},
      waitUntil: () => undefined,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Expected 2–180 valid [longitude, latitude] points' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an oversized JSON body before contacting the provider', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await onRequestPost({
      request: new Request('http://localhost/api/landmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ padding: 'x'.repeat(MAX_JSON_BODY_BYTES) }),
      }),
      env: {},
      waitUntil: () => undefined,
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'payload_too_large', message: 'Request body is too large' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
