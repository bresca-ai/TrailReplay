import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from '../functions/api/exports/[jobId]/complete.js';
import { hashToken } from './tokens.js';

async function fixture({ failCompletionWrite = false } = {}) {
  const token = 'owned-export-token';
  const job = {
    id: 'job-1', email: 'rider@example.com', status: 'uploaded',
    job_token_hash: await hashToken(token), object_key: 'exports/job-1/video.mp4',
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    error: null,
  };
  const lead = {
    marketing_opted_in_at: new Date().toISOString(),
    marketing_confirmed_at: null,
    marketing_unsubscribed_at: null,
    confirm_token_hash: null,
    unsubscribe_token_hash: null,
  };
  const db = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            sql,
            args,
            async first() {
              if (sql.includes('FROM export_jobs')) return { ...job };
              if (sql.includes('FROM leads')) return { ...lead };
              throw new Error(`Unexpected SELECT: ${sql}`);
            },
            async run() {
              if (sql.includes("SET status = 'emailing'")) {
                if (job.status !== 'uploaded') return { success: true, meta: { changes: 0 } };
                job.status = 'emailing';
              } else if (sql.includes("SET status = 'emailed'")) {
                if (failCompletionWrite) throw new Error('D1 write unavailable');
                if (job.status !== 'emailing') return { success: true, meta: { changes: 0 } };
                job.status = 'emailed';
              } else if (sql.includes("SET status = 'delivery_unknown'")) {
                if (job.status !== 'emailing') return { success: true, meta: { changes: 0 } };
                job.status = 'delivery_unknown';
                job.error = args[0];
              } else if (sql.includes("SET status = 'uploaded'")) {
                if (job.status !== 'emailing') return { success: true, meta: { changes: 0 } };
                job.status = 'uploaded';
                job.error = args[0];
              } else {
                throw new Error(`Unexpected UPDATE: ${sql}`);
              }
              return { success: true, meta: { changes: 1 } };
            },
          };
        },
      };
    },
    async batch(statements) {
      for (const statement of statements) {
        if (statement.sql.includes('confirm_token_hash')) lead.confirm_token_hash = statement.args[0];
        if (statement.sql.includes('unsubscribe_token_hash')) lead.unsubscribe_token_hash = statement.args[0];
      }
      return statements.map(() => ({ success: true, meta: { changes: 1 } }));
    },
  };
  const env = {
    LEADS_DB: db,
    EXPORTS_BUCKET: { head: async () => ({ size: 5 }) },
    CLOUDFLARE_ACCOUNT_ID: 'account',
    CLOUDFLARE_EMAIL_API_TOKEN: 'token',
  };
  const request = {
    method: 'POST',
    url: 'https://trailreplay.com/api/exports/job-1/complete',
    headers: new Headers({ Authorization: `Bearer ${token}` }),
  };
  const complete = () => onRequest({ request, env, params: { jobId: job.id } });
  return { complete, job, lead };
}

afterEach(() => vi.unstubAllGlobals());

describe('export delivery outcome safety', () => {
  it('does not resend after a provider timeout with an uncertain outcome', async () => {
    const setup = await fixture();
    const fetchMock = vi.fn().mockRejectedValue(new Error('connection closed after request'));
    vi.stubGlobal('fetch', fetchMock);

    const first = await setup.complete();
    expect(first.status).toBe(503);
    expect((await first.json()).error).toBe('delivery_unknown');
    expect(setup.job.status).toBe('delivery_unknown');
    const confirmHash = setup.lead.confirm_token_hash;
    const unsubscribeHash = setup.lead.unsubscribe_token_hash;

    const retry = await setup.complete();
    expect(retry.status).toBe(409);
    expect((await retry.json()).error).toBe('delivery_unknown');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(setup.lead.confirm_token_hash).toBe(confirmHash);
    expect(setup.lead.unsubscribe_token_hash).toBe(unsubscribeHash);
  });

  it('does not resend when the provider accepted but the D1 completion write failed', async () => {
    const setup = await fixture({ failCompletionWrite: true });
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      success: true,
      result: { delivered: ['rider@example.com'], message_id: 'message-1' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const first = await setup.complete();
    expect(first.status).toBe(503);
    expect(setup.job.status).toBe('delivery_unknown');
    const retry = await setup.complete();
    expect(retry.status).toBe(409);
    expect((await retry.json()).error).toBe('delivery_unknown');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('allows retry after an explicit pre-acceptance rejection', async () => {
    const setup = await fixture();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        success: false, errors: [{ message: 'Sender domain not verified' }],
      }, { status: 400 }))
      .mockResolvedValueOnce(Response.json({
        success: true, result: { delivered: ['rider@example.com'], message_id: 'message-2' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    const rejected = await setup.complete();
    expect(rejected.status).toBe(502);
    expect((await rejected.json()).error).toBe('email_failed');
    expect(setup.job.status).toBe('uploaded');

    const retried = await setup.complete();
    expect(retried.status).toBe(200);
    expect((await retried.json()).status).toBe('emailed');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps an interrupted emailing claim blocked for reconciliation', async () => {
    const setup = await fixture();
    setup.job.status = 'emailing';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await setup.complete();
    expect(response.status).toBe(409);
    expect((await response.json()).message).toMatch(/needs review/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
