import { describe, expect, it } from 'vitest';
import {
  MAX_JSON_BODY_BYTES,
  RequestBodyTooLargeError,
  readJsonBody,
} from './http.js';

function requestFromChunks(chunks, headers = {}) {
  const stream = new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk));
      controller.close();
    },
  });
  return new Request('http://localhost/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: stream,
    duplex: 'half',
  });
}

describe('readJsonBody', () => {
  it('parses a body when a multibyte character is split across chunks', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ label: 'café 🥾' }));
    const emojiByte = bytes.indexOf(0xf0);
    const request = requestFromChunks([
      bytes.slice(0, emojiByte + 1),
      bytes.slice(emojiByte + 1),
    ]);

    await expect(readJsonBody(request)).resolves.toEqual({ label: 'café 🥾' });
  });

  it('enforces the byte limit even when Content-Length is missing or false', async () => {
    const body = JSON.stringify({ padding: 'x'.repeat(MAX_JSON_BODY_BYTES) });

    await expect(readJsonBody(requestFromChunks([new TextEncoder().encode(body)])))
      .rejects.toBeInstanceOf(RequestBodyTooLargeError);
    await expect(readJsonBody(requestFromChunks([new TextEncoder().encode(body)], { 'Content-Length': '1' })))
      .rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });

  it('keeps malformed JSON and non-JSON content types as null', async () => {
    await expect(readJsonBody(requestFromChunks([new TextEncoder().encode('{"broken"')])))
      .resolves.toBeNull();
    const plainRequest = requestFromChunks(
      [new TextEncoder().encode('{"valid":true}')],
      { 'Content-Type': 'text/plain' },
    );
    await expect(readJsonBody(plainRequest)).resolves.toBeNull();
  });
});
