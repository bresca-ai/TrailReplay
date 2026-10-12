import { parseFitDocument } from '@/utils/fit/parseFitFile';
import { parseGpxDocument } from '@/utils/gpx/parseGpxDocument';
import { parseKmlDocument } from '@/utils/gpx/parseKmlDocument';
import { buildTrackFromRawPoints } from '@/utils/gpx/trackStats';
import type { RouteFileWorkerResponse } from '@/utils/routeFileWorkerMessages';

export async function parseRouteFileBatch(files: File[]): Promise<RouteFileWorkerResponse> {
  const response: RouteFileWorkerResponse = { parsed: [], failures: [] };

  for (const file of files) {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension !== 'gpx' && extension !== 'kml' && extension !== 'fit') continue;

    try {
      if (extension === 'fit') {
        const parsed = parseFitDocument(await file.arrayBuffer(), file.name);
        response.parsed.push({
          track: buildTrackFromRawPoints({ idPrefix: 'fit', ...parsed }),
          fileName: file.name,
        });
      } else {
        const parsed = extension === 'gpx'
          ? parseGpxDocument(await file.text(), file.name)
          : parseKmlDocument(await file.text(), file.name);
        response.parsed.push({
          track: buildTrackFromRawPoints({
            idPrefix: extension === 'gpx' ? 'track' : 'kml',
            ...parsed,
          }),
          fileName: file.name,
        });
      }
    } catch (error) {
      response.failures.push({
        fileName: file.name,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return response;
}
