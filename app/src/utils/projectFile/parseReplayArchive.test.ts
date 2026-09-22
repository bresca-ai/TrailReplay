import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { createAppStore } from '@/store/createAppStore';
import { parseGPX } from '@/utils/gpxParser';
import { buildReplayArchive } from './buildReplayArchive';
import { parseReplayArchive } from './parseReplayArchive';
import { ReplayArchiveError } from './validation';
import { MAX_ARCHIVE_SIZE_BYTES } from './types';

const sampleGpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="TrailReplay">
  <trk>
    <name>Ridge Loop</name>
    <trkseg>
      <trkpt lat="42.10000" lon="1.20000"><ele>1000</ele></trkpt>
      <trkpt lat="42.10050" lon="1.20050"><ele>1015</ele></trkpt>
    </trkseg>
  </trk>
</gpx>`;

async function buildSampleArchive() {
  const store = createAppStore();
  const track = parseGPX(sampleGpx, 'ridge-loop.gpx');
  store.getState().addTrack(track);
  const blob = await buildReplayArchive(store.getState());
  return { blob, track };
}

function blobToFile(blob: Blob, name = 'project.replay') {
  return new File([blob], name, { type: 'application/zip' });
}

describe('parseReplayArchive', () => {
  it('round-trips a real archive built by buildReplayArchive', async () => {
    const { blob, track } = await buildSampleArchive();

    const parsed = await parseReplayArchive(blobToFile(blob));

    expect(parsed.manifest.formatVersion).toBe(1);
    expect(parsed.tracks).toHaveLength(1);
    expect(parsed.tracks[0].meta.id).toBe(track.id);
    expect(parsed.tracks[0].gpxText).toContain('Ridge Loop');
  });

  it('rejects an oversized file before attempting to unzip', async () => {
    const oversized = new File([new Uint8Array(1)], 'huge.replay');
    Object.defineProperty(oversized, 'size', { value: MAX_ARCHIVE_SIZE_BYTES + 1 });

    await expect(parseReplayArchive(oversized)).rejects.toMatchObject({
      code: 'too-large',
    } satisfies Partial<ReplayArchiveError>);
  });

  it('rejects corrupt zip bytes', async () => {
    const corrupt = new File([new Uint8Array([1, 2, 3, 4])], 'corrupt.replay');

    await expect(parseReplayArchive(corrupt)).rejects.toMatchObject({ code: 'corrupt' });
  });

  it('rejects an entry whose declared uncompressed size exceeds the extraction limit', async () => {
    const zipped = zipSync({ 'project.json': strToU8(JSON.stringify({ tracks: [] })) });
    // The local ZIP header stores the original size at byte 22. This stays a
    // tiny test archive while exercising the pre-extraction size guard.
    new DataView(zipped.buffer, zipped.byteOffset, zipped.byteLength)
      .setUint32(22, MAX_ARCHIVE_SIZE_BYTES + 1, true);

    await expect(parseReplayArchive(blobToFile(new Blob([zipped as BlobPart])))).rejects.toMatchObject({
      code: 'too-large',
    } satisfies Partial<ReplayArchiveError>);
  });

  it('stops a highly-compressible entry as soon as its forged size is exceeded', async () => {
    const zipped = zipSync({
      // This expands to several 1 KiB extraction pushes but stays tiny on disk.
      'project.json': new Uint8Array(4 * 1024 * 1024).fill(65),
    });
    new DataView(zipped.buffer, zipped.byteOffset, zipped.byteLength).setUint32(22, 1, true);

    await expect(parseReplayArchive(blobToFile(new Blob([zipped as BlobPart])))).rejects.toMatchObject({
      code: 'corrupt',
    } satisfies Partial<ReplayArchiveError>);
  });

  it('rejects a selected entry that is truncated before its stream completes', async () => {
    const zipped = zipSync({
      'project.json': strToU8(JSON.stringify({ tracks: [], padding: 'x'.repeat(10_000) })),
    });
    const header = new DataView(zipped.buffer, zipped.byteOffset, zipped.byteLength);
    const compressedSize = header.getUint32(18, true);
    const fileNameLength = header.getUint16(26, true);
    const extraLength = header.getUint16(28, true);
    const entryEnd = 30 + fileNameLength + extraLength + compressedSize;
    const truncated = zipped.slice(0, entryEnd - 1);

    await expect(parseReplayArchive(blobToFile(new Blob([truncated as BlobPart])))).rejects.toMatchObject({
      code: 'corrupt',
    } satisfies Partial<ReplayArchiveError>);
  });

  it('skips unused archive entries instead of extracting their payloads', async () => {
    const zipped = zipSync({
      'project.json': strToU8(JSON.stringify({ tracks: [] })),
      'preview.bin': strToU8('unused preview data'),
    });

    await expect(parseReplayArchive(blobToFile(new Blob([zipped as BlobPart])))).resolves.toMatchObject({
      project: { tracks: [] },
    });
  });

  it('rejects archives with more than the supported entry count', async () => {
    const unusedEntries = Object.fromEntries(
      Array.from({ length: 1_000 }, (_, index) => [`unused/${index}.txt`, strToU8('')]),
    );
    const zipped = zipSync({
      'project.json': strToU8(JSON.stringify({ tracks: [] })),
      ...unusedEntries,
    });

    await expect(parseReplayArchive(blobToFile(new Blob([zipped as BlobPart])))).rejects.toMatchObject({
      code: 'too-large',
    } satisfies Partial<ReplayArchiveError>);
  });

  it('rejects an archive missing project.json', async () => {
    const zipped = zipSync({ 'manifest.json': strToU8('{}') });
    const file = blobToFile(new Blob([zipped as BlobPart]));

    await expect(parseReplayArchive(file)).rejects.toMatchObject({ code: 'corrupt' });
  });

  it('rejects a project.json with no tracks array', async () => {
    const zipped = zipSync({ 'project.json': strToU8('{}') });
    const file = blobToFile(new Blob([zipped as BlobPart]));

    await expect(parseReplayArchive(file)).rejects.toMatchObject({ code: 'corrupt' });
  });

  // A project written by hand or by scripts/make-replay.mjs carries no manifest
  // and only the fields it cares about; see docs/AGENT_REPLAY_FILE.md.
  it('accepts a minimal hand-authored project with no manifest', async () => {
    const zipped = zipSync({
      'routes/ridge-loop.gpx': strToU8(sampleGpx),
      'project.json': strToU8(JSON.stringify({
        formatVersion: 1,
        tracks: [{ routeFile: 'routes/ridge-loop.gpx' }],
      })),
    });

    const parsed = await parseReplayArchive(blobToFile(new Blob([zipped as BlobPart])));

    expect(parsed.manifest.formatVersion).toBe(1);
    expect(parsed.manifest.trackCount).toBe(1);
    expect(parsed.tracks[0].gpxText).toContain('Ridge Loop');
    expect(parsed.comparisonTracks).toEqual([]);
  });

  it('treats an omitted formatVersion as the current one', async () => {
    const zipped = zipSync({
      'routes/ridge-loop.gpx': strToU8(sampleGpx),
      'project.json': strToU8(JSON.stringify({ tracks: [{ routeFile: 'routes/ridge-loop.gpx' }] })),
    });

    const parsed = await parseReplayArchive(blobToFile(new Blob([zipped as BlobPart])));

    expect(parsed.manifest.formatVersion).toBe(1);
  });

  it('rejects an unsupported format version', async () => {
    const zipped = zipSync({
      'manifest.json': strToU8(JSON.stringify({ formatVersion: 999 })),
      'project.json': strToU8(JSON.stringify({ formatVersion: 999, tracks: [], comparisonTracks: [] })),
    });
    const file = blobToFile(new Blob([zipped as BlobPart]));

    await expect(parseReplayArchive(file)).rejects.toMatchObject({ code: 'unsupported-version' });
  });

  it('rejects a project.json referencing a missing route file', async () => {
    const zipped = zipSync({
      'manifest.json': strToU8(JSON.stringify({
        formatVersion: 1, appVersion: '0.0.0', projectName: 'x', createdAt: '', savedAt: '',
        trackCount: 1, pictureCount: 0, videoCount: 0,
      })),
      'project.json': strToU8(JSON.stringify({
        formatVersion: 1,
        tracks: [{ id: 't1', name: 'Missing', activityIcon: '', color: '#fff', visible: true, routeFile: 'routes/missing.gpx' }],
        comparisonTracks: [],
      })),
    });
    const file = blobToFile(new Blob([zipped as BlobPart]));

    await expect(parseReplayArchive(file)).rejects.toMatchObject({ code: 'missing-asset' });
  });
});
