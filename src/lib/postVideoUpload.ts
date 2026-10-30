import { Upload } from 'tus-js-client';
import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const RESUMABLE_UPLOAD_THRESHOLD = 6 * 1024 * 1024;
const RESUMABLE_CHUNK_SIZE = 6 * 1024 * 1024;

export async function uploadPostVideo(
  file: File,
  path: string,
  onProgress: (fraction: number) => void,
): Promise<void> {
  if (file.size <= RESUMABLE_UPLOAD_THRESHOLD) {
    const { error } = await supabase.storage.from('post-videos').upload(path, file, {
      contentType: file.type || 'video/mp4',
      cacheControl: '3600',
    });
    if (error) throw error;
    onProgress(1);
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error('Video uploads are not configured');
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Sign in to upload videos');

  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: `${SUPABASE_URL.replace(/\/$/, '')}/storage/v1/upload/resumable`,
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        authorization: `Bearer ${accessToken}`,
      },
      metadata: {
        bucketName: 'post-videos',
        objectName: path,
        contentType: file.type || 'video/mp4',
        cacheControl: '3600',
      },
      chunkSize: RESUMABLE_CHUNK_SIZE,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      fingerprint: async (sourceFile) =>
        `post-videos:${path}:${sourceFile.size}:${sourceFile.lastModified}`,
      onProgress: (bytesSent, bytesTotal) => {
        onProgress(bytesTotal ? bytesSent / bytesTotal : 0);
      },
      onSuccess: () => resolve(),
      onError: reject,
    });

    void upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length) {
        upload.resumeFromPreviousUpload(previousUploads[0]);
      }
      upload.start();
    }).catch(reject);
  });
}
