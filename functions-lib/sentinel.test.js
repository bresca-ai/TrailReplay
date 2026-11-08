import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestGet } from '../functions/api/sentinel.js';
import { DatabaseSync } from 'node:sqlite';

const id = '00000000-0000-4000-8000-000000000000';
const png = new Uint8Array([137,80,78,71,13,10,26,10,0]);
const request = (query) => new Request(`https://example.test/api/sentinel?${query}`);
const valid = 'date=2025-03-30&z=12&x=2067&y=1511';
const db = (allowed = true) => ({ prepare: vi.fn(() => ({ bind: vi.fn(() => ({ first: vi.fn(async () => allowed ? { requests: 1 } : null) })) })) });
const context = (query = valid, database = db()) => ({ request: request(query), env: { SENTINEL_INSTANCE_ID: id, LANDMARKS_DB: database }, waitUntil: vi.fn() });
afterEach(() => vi.unstubAllGlobals());

describe('Sentinel tiles', () => {
  it('validates inputs and never permits arbitrary upstream URLs', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    for (const query of ['date=2025-02-30&z=1&x=0&y=0', 'date=2025-03-30&z=2&x=4&y=0', valid + '&url=https://example.org']) {
      expect((await onRequestGet(context(query))).status).toBe(400);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('protects the quota and keeps upstream credentials out of responses', async () => {
    const fetcher = vi.fn(async () => new Response(png, { headers: { 'content-type':'image/png' } })); vi.stubGlobal('fetch', fetcher);
    const result = await onRequestGet(context());
    expect(result.status).toBe(200);
    expect(new URL(fetcher.mock.calls[0][0]).searchParams.get('TIME')).toBe('2025-03-30/2025-03-30');
    expect(Buffer.from(await result.arrayBuffer())).toEqual(Buffer.from(png));
    expect((await onRequestGet(context(valid, db(false)))).status).toBe(429);
  });
  it('fails closed on missing quota binding and invalid upstream content', async () => {
    const missing = context(); delete missing.env.LANDMARKS_DB;
    expect((await onRequestGet(missing)).status).toBe(503);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('upstream details', { headers: { 'content-type':'image/png' } })));
    const result = await onRequestGet(context());
    expect(result.status).toBe(502);
    expect(await result.text()).not.toContain('upstream details');
  });
  it('rejects an oversized upstream image and malformed PNG data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(1024 * 1024 + 1), { headers: { 'content-type':'image/png' } })));
    expect((await onRequestGet(context())).status).toBe(502);
  });
  it('enforces both quota counters with real SQLite statements', async () => {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec('CREATE TABLE sentinel_quota (period TEXT PRIMARY KEY NOT NULL, requests INTEGER NOT NULL CHECK(requests >= 0))');
    const actualDb = { prepare: sql => ({ bind: (...args) => ({ first: async () => sqlite.prepare(sql).get(...args) }) }) };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(png, { headers: { 'content-type':'image/png' } })));
    expect((await onRequestGet(context(valid, actualDb))).status).toBe(200);
    const now = new Date().toISOString().slice(0,10);
    expect(sqlite.prepare('SELECT requests FROM sentinel_quota WHERE period=?').get(`day:${now}`).requests).toBe(1);
    sqlite.prepare('UPDATE sentinel_quota SET requests=20000 WHERE period=?').run(`month:${now.slice(0,7)}`);
    expect((await onRequestGet(context(valid, actualDb))).status).toBe(429);
    sqlite.close();
  });
});
