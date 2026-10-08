import type { RouteFileWorkerRequest, RouteFileWorkerResponse } from '@/utils/routeFileWorkerMessages';
import { parseRouteFileBatch } from '@/utils/routeFileWorkerCore';

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<RouteFileWorkerRequest>) => void) | null;
  postMessage: (message: RouteFileWorkerResponse) => void;
};

workerScope.onmessage = async ({ data }) => {
  workerScope.postMessage(await parseRouteFileBatch(data.files));
};
