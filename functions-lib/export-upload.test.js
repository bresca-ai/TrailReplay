import { describe, expect, it } from 'vitest';
import { onRequest } from '../functions/api/exports/[jobId]/upload.js';
import { hashToken } from './tokens.js';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function fixture() {
  const token = 'owned-export-token';
  const row = {
    id: 'job-1',
    status: 'pending',
    job_token_hash: await hashToken(token),
    object_key: null,
    size_bytes: null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
  const objects = new Map();
  const deleted = [];
  const staged = [];
  const bothStaged = deferred();
  const env = {
    LEADS_DB: {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async first() {
                expect(sql).toMatch(/^SELECT/);
                expect(args).toEqual([row.id]);
                return { ...row };
              },
              async run() {
                expect(sql).toMatch(/^UPDATE/);
                const [key, size, id] = args;
                expect(id).toBe(row.id);
                if (row.status !== 'pending') return { success: true, meta: { changes: 0 } };
                Object.assign(row, { status: 'uploaded', object_key: key, size_bytes: size });
                return { success: true, meta: { changes: 1 } };
              },
            };
          },
        };
      },
    },
    EXPORTS_BUCKET: {
      async put(key, body) {
        const data = await new Response(body).text();
        objects.set(key, data);
        const gate = deferred();
        staged.push({ key, data, gate });
        if (staged.length === 2) bothStaged.resolve();
        await gate.promise;
      },
      async head(key) {
        const data = objects.get(key);
        return data === undefined ? null : { size: new TextEncoder().encode(data).length };
      },
      async delete(key) {
        deleted.push(key);
        objects.delete(key);
      },
    },
  };
  const request = (data, declaredSize = data.length) => ({
    method: 'PUT',
    headers: new Headers({
      Authorization: `Bearer ${token}`,
      'Content-Length': String(declaredSize),
      'Content-Type': 'video/mp4',
    }),
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(data));
        controller.close();
      },
    }),
  });
  const upload = (data, declaredSize) => onRequest({ request: request(data, declaredSize), env, params: { jobId: row.id } });
  return { row, objects, deleted, staged, bothStaged, upload };
}

describe('export upload concurrency', () => {
  for (const winningAttempt of [0, 1]) {
    it(`keeps only attempt ${winningAttempt + 1} when uploads overlap`, async () => {
      const setup = await fixture();
      const uploads = [setup.upload('AAAA'), setup.upload('BBBBBB')];
      await setup.bothStaged.promise;
      expect(setup.staged).toHaveLength(2);
      expect(setup.staged[0].key).not.toBe(setup.staged[1].key);
      const stagedByUpload = [
        setup.staged.find((attempt) => attempt.data === 'AAAA'),
        setup.staged.find((attempt) => attempt.data === 'BBBBBB'),
      ];
      expect(stagedByUpload.every(Boolean)).toBe(true);

      stagedByUpload[winningAttempt].gate.resolve();
      const winner = await uploads[winningAttempt];
      stagedByUpload[1 - winningAttempt].gate.resolve();
      const loser = await uploads[1 - winningAttempt];
      const expectedSize = winningAttempt === 0 ? 4 : 6;

      expect(winner.status).toBe(200);
      expect(loser.status).toBe(200);
      expect(await winner.json()).toEqual({ jobId: 'job-1', sizeBytes: expectedSize, status: 'uploaded' });
      expect(await loser.json()).toEqual({ jobId: 'job-1', sizeBytes: expectedSize, status: 'uploaded' });
      expect(setup.row.object_key).toBe(stagedByUpload[winningAttempt].key);
      expect(setup.objects.get(setup.row.object_key)).toBe(winningAttempt === 0 ? 'AAAA' : 'BBBBBB');
      expect(setup.deleted).toEqual([stagedByUpload[1 - winningAttempt].key]);

      const retry = await setup.upload('retry body');
      expect(retry.status).toBe(200);
      expect(await retry.json()).toEqual({ jobId: 'job-1', sizeBytes: expectedSize, status: 'uploaded' });
      expect(setup.staged).toHaveLength(2);
    });
  }

  for (const mismatchFirst of [true, false]) {
    it(`deletes only the mismatched object when it finishes ${mismatchFirst ? 'first' : 'last'}`, async () => {
      const setup = await fixture();
      const uploads = [setup.upload('bad', 4), setup.upload('valid')];
      await setup.bothStaged.promise;
      const stagedByUpload = [
        setup.staged.find((attempt) => attempt.data === 'bad'),
        setup.staged.find((attempt) => attempt.data === 'valid'),
      ];
      expect(stagedByUpload.every(Boolean)).toBe(true);

      const first = mismatchFirst ? 0 : 1;
      stagedByUpload[first].gate.resolve();
      const firstResponse = await uploads[first];
      stagedByUpload[1 - first].gate.resolve();
      const secondResponse = await uploads[1 - first];
      const mismatch = mismatchFirst ? firstResponse : secondResponse;
      const accepted = mismatchFirst ? secondResponse : firstResponse;

      expect(mismatch.status).toBe(502);
      expect((await mismatch.json()).error).toBe('upload_incomplete');
      expect(accepted.status).toBe(200);
      expect(await accepted.json()).toEqual({ jobId: 'job-1', sizeBytes: 5, status: 'uploaded' });
      expect(setup.deleted).toEqual([stagedByUpload[0].key]);
      expect(setup.row.object_key).toBe(stagedByUpload[1].key);
      expect(setup.objects.get(setup.row.object_key)).toBe('valid');
    });
  }

  it('does not acknowledge expired, failed, or missing-object retries', async () => {
    const setup = await fixture();
    setup.row.status = 'uploaded';
    setup.row.object_key = 'exports/job-1/accepted.mp4';
    setup.row.size_bytes = 5;

    const missing = await setup.upload('retry');
    expect(missing.status).toBe(410);
    expect((await missing.json()).error).toBe('object_missing');

    setup.objects.set(setup.row.object_key, 'valid');
    setup.row.status = 'failed';
    const failed = await setup.upload('retry');
    expect(failed.status).toBe(409);

    setup.row.status = 'uploaded';
    setup.row.expires_at = new Date(Date.now() - 1000).toISOString();
    const expired = await setup.upload('retry');
    expect(expired.status).toBe(410);
    expect((await expired.json()).error).toBe('expired');
    expect(setup.staged).toHaveLength(0);
  });
});
