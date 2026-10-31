import { AlertCircle, CheckCircle2, Film, Loader2, RotateCcw, Trash2, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useVideoUploads } from '@/hooks/useVideoUploads';
import { videoUploadQueue, type VideoJob } from '@/lib/videoUploadQueue';

// One card per video that is on its way: what is happening, and what the seller can do about it.
export default function VideoUploadStatus() {
  const jobs = useVideoUploads();
  if (!jobs.length) return null;
  return (
    <div className="space-y-2" aria-live="polite">
      {jobs.map(job => <JobCard key={job.id} job={job} />)}
    </div>
  );
}

function JobCard({ job }: { job: VideoJob }) {
  const failed = job.phase === 'failed';
  const processing = job.phase === 'processing';
  const waiting = job.phase === 'queued' && !!job.message && /connection/i.test(job.message);

  return (
    <div className={`flex gap-3 rounded-xl border p-3 ${failed ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-card'}`}>
      <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
        {job.poster ? <img src={job.poster} alt="" className="h-full w-full object-cover" /> : <Film className="absolute inset-0 m-auto h-5 w-5 text-muted-foreground" />}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          {failed ? <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
            : waiting ? <WifiOff className="h-4 w-4 shrink-0 text-muted-foreground" />
            : processing ? <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
            : <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />}
          <span className="truncate">
            {failed ? 'This video was not posted'
              : processing ? 'Uploaded, optimising'
              : waiting ? 'Waiting for connection'
              : job.phase === 'queued' ? 'Getting ready'
              : `Uploading ${job.progress}%`}
          </span>
        </div>

        {!failed && (
          <Progress
            value={processing ? 100 : job.progress}
            className={`mt-1.5 h-1.5 ${processing ? 'animate-pulse' : ''}`}
          />
        )}

        <p className={`mt-1.5 text-xs ${failed ? 'text-destructive' : 'text-muted-foreground'}`}>
          {failed ? job.error : job.message}
        </p>
        {job.caption && !failed && <p className="mt-0.5 truncate text-xs text-muted-foreground/80">“{job.caption}”</p>}

        {failed && (
          <div className="mt-2 flex gap-2">
            <Button size="sm" className="h-8 gap-1.5" onClick={() => videoUploadQueue.retry(job.id)}>
              <RotateCcw className="h-3.5 w-3.5" /> Try again
            </Button>
            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => void videoUploadQueue.remove(job.id)}>
              <Trash2 className="h-3.5 w-3.5" /> Discard
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
