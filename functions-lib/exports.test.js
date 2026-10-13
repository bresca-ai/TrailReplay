import { describe, expect, it, vi } from 'vitest';
import { onRequest } from '../functions/api/exports.js';

function createDb() {
  const preparedSql = [];
  const batches = [];
  return {
    preparedSql,
    batches,
    prepare: vi.fn((sql) => {
      preparedSql.push(sql);
      return {
        bind: (...values) => ({ sql, values }),
      };
    }),
    batch: vi.fn(async (statements) => {
      batches.push(statements);
      return statements.map(() => ({ success: true }));
    }),
  };
}

function createRequest() {
  return new Request('https://trailreplay.com/api/exports', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '203.0.113.42',
    },
    body: JSON.stringify({
      email: 'rider@example.com',
      marketingConsent: false,
      locale: 'en',
      settings: {
        quality: 'high',
        qualityMode: 'studio',
        aspectRatio: '16:9',
        fps: 30,
        durationMs: 60_000,
      },
    }),
  });
}

describe('Studio export registration', () => {
  it('allows repeated jobs from the same network without querying an IP quota', async () => {
    const db = createDb();
    const env = { LEADS_DB: db };

    const responses = await Promise.all(
      Array.from({ length: 6 }, () => onRequest({ request: createRequest(), env })),
    );

    expect(responses.map((response) => response.status)).toEqual(Array(6).fill(201));
    expect(db.batches).toHaveLength(6);
    expect(db.preparedSql).not.toContainEqual(expect.stringContaining('COUNT(*)'));
    expect(db.preparedSql).not.toContainEqual(expect.stringContaining('client_ip'));
  });
});
