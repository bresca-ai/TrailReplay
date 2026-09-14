import { describe, expect, it } from 'vitest';
import { readVideoMetadata } from './videoMetadata';

const QUICKTIME_EPOCH_OFFSET_SECONDS = 2_082_844_800;

function box(type: string, payload: Uint8Array): Uint8Array {
  const size = payload.length + 8;
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, size);
  for (let index = 0; index < 4; index += 1) bytes[4 + index] = type.charCodeAt(index);
  bytes.set(payload, 8);
  return bytes;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

/** `mvhd` version 0: version/flags, creation time, modification time, timescale, duration. */
function mvhd(creationTime: Date): Uint8Array {
  const payload = new Uint8Array(20);
  const view = new DataView(payload.buffer);
  const seconds = Math.round(creationTime.getTime() / 1000) + QUICKTIME_EPOCH_OFFSET_SECONDS;
  view.setUint32(0, 0);
  view.setUint32(4, seconds);
  view.setUint32(8, seconds);
  view.setUint32(12, 600);
  view.setUint32(16, 6000);
  return box('mvhd', payload);
}

/** QuickTime writes the shooting location as an ISO 6709 string in `moov/udta`. */
function locationAtom(iso6709: string): Uint8Array {
  const text = new TextEncoder().encode(iso6709);
  const payload = new Uint8Array(4 + text.length);
  const view = new DataView(payload.buffer);
  view.setUint16(0, text.length);
  view.setUint16(2, 0x15c7);
  payload.set(text, 4);
  return box('©xyz', payload);
}

function videoFile(parts: Uint8Array[], lastModified = Date.UTC(2024, 0, 2)): File {
  const mdat = box('mdat', new Uint8Array(1024));
  return new File([concat(box('ftyp', new Uint8Array(8)), ...parts, mdat) as BlobPart], 'clip.mp4', {
    type: 'video/mp4',
    lastModified,
  });
}

describe('readVideoMetadata', () => {
  it('reads the creation time and the location out of the moov box', async () => {
    const shotAt = new Date(Date.UTC(2023, 5, 17, 8, 30, 0));
    const file = videoFile([
      box('moov', concat(mvhd(shotAt), box('udta', locationAtom('+42.5750+001.6510/')))),
    ]);

    const metadata = await readVideoMetadata(file);

    expect(metadata.timestamp?.toISOString()).toBe(shotAt.toISOString());
    expect(metadata.latitude).toBeCloseTo(42.575, 4);
    expect(metadata.longitude).toBeCloseTo(1.651, 4);
  });

  it('falls back to the file date when there is no moov box', async () => {
    const lastModified = Date.UTC(2024, 2, 3, 12, 0, 0);
    const file = videoFile([], lastModified);

    const metadata = await readVideoMetadata(file);

    expect(metadata.timestamp?.getTime()).toBe(lastModified);
    expect(metadata.latitude).toBeUndefined();
  });

  it('ignores a creation time written by a camera with no clock set', async () => {
    const lastModified = Date.UTC(2024, 2, 3, 12, 0, 0);
    // 1904-01-01, what an unset QuickTime clock writes.
    const unset = new Date(-QUICKTIME_EPOCH_OFFSET_SECONDS * 1000 + 1000);
    const file = videoFile([box('moov', mvhd(unset))], lastModified);

    const metadata = await readVideoMetadata(file);

    expect(metadata.timestamp?.getTime()).toBe(lastModified);
  });
});
