import type { RouteFileWorkerRequest, RouteFileWorkerResponse } from '@/utils/routeFileWorkerMessages';

export function canParseRouteFilesInWorker() {
  return typeof Worker !== 'undefined';
}

export function parseRouteFilesInWorker(files: File[]): Promise<RouteFileWorkerResponse> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./routeFile.worker.ts', import.meta.url), { type: 'module' });
    const finish = <T>(callback: (value: T) => void, value: T) => {
      worker.terminate();
      callback(value);
    };

    worker.onmessage = ({ data }: MessageEvent<RouteFileWorkerResponse>) => {
      finish(resolve, data);
    };
    worker.onerror = (event) => {
      finish(reject, new Error(event.message || 'Route worker failed'));
    };
    worker.onmessageerror = () => {
      finish(reject, new Error('Route worker returned an unreadable response'));
    };

    const request: RouteFileWorkerRequest = { files };
    worker.postMessage(request);
  });
}
