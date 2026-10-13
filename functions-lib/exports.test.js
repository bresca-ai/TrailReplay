import { describe, expect, it, vi } from 'vitest';
import { onRequest } from '../functions/api/exports.js';

function createDb(initialJobCount = 0) {
  const preparedSql = [];
  const batches = [];
  let jobCount = initialJobCount;
  return {
    preparedSql,
    batches,
    prepare: vi.fn((sql) => {
      preparedSql.push(sql);
      return {
        bind: (...values) => sql.includes('SELECT COUNT(*)')
          ? { first: async () => ({ count: jobCount }) }
          : { sql, values },
      };
    }),
    batch: vi.fn(async (statements) => {
      batches.push(statements);
      if (statements.some((statement) => statement.sql.includes('INSERT INTO export_jobs'))) {
        jobCount += 1;
      }
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
  it('allows the 50th job from a network and rejects the 51st', async () => {
    const db = createDb(49);
    const env = { LEADS_DB: db };

    const allowed = await onRequest({ request: createRequest(), env });
    const rejected = await onRequest({ request: createRequest(), env });

    expect(allowed.status).toBe(201);
    expect(rejected.status).toBe(429);
    await expect(rejected.json()).resolves.toMatchObject({ error: 'rate_limited' });
    expect(db.batches).toHaveLength(1);
    expect(db.batches[0][1].values[9]).toBe('203.0.113.42');
  });

  it('bypasses the quota for configured developer emails without storing the job IP', async () => {
    const db = createDb(50);
    const env = {
      LEADS_DB: db,
      STUDIO_EXPORT_RATE_LIMIT_BYPASS_EMAILS: 'other@example.com, RIDER@EXAMPLE.COM',
    };

    const response = await onRequest({ request: createRequest(), env });

    expect(response.status).toBe(201);
    expect(db.preparedSql).not.toContainEqual(expect.stringContaining('COUNT(*)'));
    expect(db.batches[0][1].values[9]).toBeNull();
  });
});
