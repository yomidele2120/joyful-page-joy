import { useSyncExternalStore } from 'react';
import { videoUploadQueue, type VideoJob } from '@/lib/videoUploadQueue';

/** The videos this seller has on their way to the server (uploading, optimising, or waiting for the seller). */
export function useVideoUploads(): VideoJob[] {
  return useSyncExternalStore(videoUploadQueue.subscribe, videoUploadQueue.getSnapshot, videoUploadQueue.getSnapshot);
}
