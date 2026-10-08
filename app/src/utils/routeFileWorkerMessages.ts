import type { GPXTrack } from '@/types';

export interface RouteFileWorkerRequest {
  files: File[];
}

export interface RouteFileWorkerResponse {
  parsed: Array<{ track: GPXTrack; fileName: string }>;
  failures: Array<{ fileName: string; message: string }>;
}
