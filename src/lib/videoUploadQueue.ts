// The video upload queue.
//
// What it guarantees for a seller:
//  1. Picking a video and leaving (switching apps, closing the browser, a restart) loses nothing: the video and the
//     post details are kept on the phone (see uploadStore.ts).
//  2. An upload is RESUMABLE. It carries on from the byte it reached, whenever the seller is back and online.
//  3. Once the whole file has reached the server, the phone is no longer needed. Cloudflare optimises the video and
//     the server publishes the post by itself (stream-webhook), even with the app closed or the phone off.
//  4. While the app is open the queue also checks on the post, so the seller sees it go from
//     "Uploading" to "Optimising" to live, and gets told if something went wrong (with the real reason).
//
// The queue lives outside React, so it keeps running when the seller moves between pages.

import { supabase } from '@/integrations/supabase/client';
import {
  NetworkError, StreamNotConfiguredError, checkStreamPosts, createStreamUpload,
} from '@/lib/cloudflareStream';
import { TusAbortedError, TusExpiredError, TusNetworkError, tusUpload } from '@/lib/tus';
import {
  deleteFile, deleteJob, getAllJobs, getFile, hasRoomFor, putFile, putJob, requestPersistentStorage, type VideoJob,
} from '@/lib/uploadStore';
import { compressVideo } from '@/lib/videoCompress';
import { captureVideoThumbnail } from '@/lib/videoThumbnail';
import { MAX_VIDEO_MB } from '@/lib/mediaProcessing';

export type { VideoJob } from '@/lib/uploadStore';

export interface QueueHooks {
  /** A post changed state: refresh the lists that show posts. */
  onPostsChanged: () => void;
  /** A video went live. */
  onPublished: (job: VideoJob) => void;
}

export interface EnqueueInput {
  userId: string;
  vendorId: string;
  file: File;
  caption: string;
  productId: string | null;
  poster?: string | null;
}

// After WATCH_FOR_MS the page stops watching; the server (webhook) carries on regardless.
const DEFAULT_TIMING = { watchEveryMs: 6000, watchForMs: 12 * 60 * 1000, retryAfterMs: 20_000 };

const NO_HOOKS: QueueHooks = { onPostsChanged: () => undefined, onPublished: () => undefined };

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new TusAbortedError());
    const t = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(t); reject(new TusAbortedError()); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

class VideoUploadQueue {
  private jobs = new Map<string, VideoJob>();
  private snapshot: VideoJob[] = [];
  private listeners = new Set<() => void>();
  /** Files that could not be saved on the phone (no room): kept here for as long as the page stays open. */
  private liveFiles = new Map<string, Blob>();
  private nextTry = new Map<string, number>();
  private watching = new Set<string>();
  private userId: string | null = null;
  private hooks: QueueHooks | null = null;
  private pumping = false;
  private abort: AbortController | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private notifyTimer: ReturnType<typeof setTimeout> | null = null;
  private wakeLock: { release: () => Promise<void> } | null = null;
  private listening = false;
  /** Adjustable so tests do not have to wait for real seconds. */
  timing = { ...DEFAULT_TIMING };

  // ---- React binding (useSyncExternalStore) --------------------------------------------------------------
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getSnapshot = () => this.snapshot;

  private emit() {
    this.snapshot = [...this.jobs.values()].sort((a, b) => a.createdAt - b.createdAt);
    this.listeners.forEach(fn => fn());
  }
  /** Progress ticks many times a second: update the screen at a calm pace. */
  private emitSoon() {
    if (this.notifyTimer) return;
    this.notifyTimer = setTimeout(() => { this.notifyTimer = null; this.emit(); }, 250);
  }

  // ---- lifecycle -----------------------------------------------------------------------------------------
  /** Call once a seller is signed in. Brings back anything that was in progress and carries on. */
  async start(userId: string, hooks: QueueHooks) {
    if (this.userId === userId) { this.hooks = hooks; this.kick(); return; }
    this.stop();
    this.userId = userId;
    this.hooks = hooks;
    this.abort = new AbortController();
    void requestPersistentStorage();

    try {
      const saved = (await getAllJobs()).filter(j => j.userId === userId);
      for (const job of saved) {
        // "uploading" can only be left over from a session that ended abruptly: it is just waiting now.
        if (job.phase === 'uploading') job.phase = 'queued';
        this.jobs.set(job.id, job);
      }
    } catch { /* storage unavailable: nothing to bring back */ }
    this.emit();

    if (!this.listening && typeof window !== 'undefined') {
      this.listening = true;
      window.addEventListener('online', this.kick);
      document.addEventListener('visibilitychange', this.onVisible);
    }
    // Publish anything Cloudflare finished while the app was closed (also covers a missed webhook).
    void checkStreamPosts().then(posts => { if (posts.some(p => p.status !== 'uploading')) this.hooks?.onPostsChanged(); });
    this.kick();
  }

  /** Signed out: pause everything. The saved videos stay on the phone for the next sign-in. */
  stop() {
    this.abort?.abort();
    this.abort = null;
    this.userId = null;
    this.jobs.clear();
    this.liveFiles.clear();
    this.nextTry.clear();
    this.watching.clear();
    // (`pumping` is left alone: a send that is still winding down resets it itself, then kick() restarts.)
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    void this.releaseWakeLock();
    if (this.listening) {
      window.removeEventListener('online', this.kick);
      document.removeEventListener('visibilitychange', this.onVisible);
      this.listening = false;
    }
    this.emit();
  }

  private onVisible = () => { if (document.visibilityState === 'visible') this.kick(); };

  // ---- public actions ------------------------------------------------------------------------------------
  /** Saves the video on the phone first, then starts sending it. Resolves as soon as it is safely saved. */
  async enqueue(input: EnqueueInput): Promise<string> {
    if (!this.userId) await this.start(input.userId, this.hooks ?? NO_HOOKS);
    const id = crypto.randomUUID();
    const now = Date.now();
    const job: VideoJob = {
      id, userId: input.userId, vendorId: input.vendorId,
      fileName: input.file.name || 'video.mp4', fileType: input.file.type || 'video/mp4', fileSize: input.file.size,
      poster: input.poster ?? null, caption: input.caption, productId: input.productId,
      phase: 'queued', progress: 0, message: 'Saved on your phone. Starting the upload…',
      createdAt: now, updatedAt: now,
    };

    // Keep a copy that survives closing the app. With no room left it still works while this page stays open.
    let saved = false;
    if (await hasRoomFor(input.file.size)) {
      try { await putFile(id, input.file); saved = true; } catch { /* no room after all */ }
    }
    if (!saved) {
      this.liveFiles.set(id, input.file);
      job.message = 'Your phone is low on space, so keep this page open until the upload finishes.';
    }
    try { await putJob(job); } catch { /* the job still runs; it just will not survive a restart */ }

    this.jobs.set(id, job);
    this.emit();
    this.kick();
    return id;
  }

  /** Try a failed video again. */
  retry(id: string) {
    const job = this.jobs.get(id);
    if (!job) return;
    this.nextTry.delete(id);
    void this.update(job, { phase: 'queued', error: undefined, fatal: false, message: 'Trying again…' });
    this.kick();
  }

  /** Give up on a video: removes it from the phone and deletes the unpublished post that was waiting for it. */
  async remove(id: string) {
    const job = this.jobs.get(id);
    this.jobs.delete(id);
    this.liveFiles.delete(id);
    this.nextTry.delete(id);
    this.emit();
    if (!job) return;
    await Promise.allSettled([deleteJob(id), deleteFile(id)]);
    if (job.postId) {
      await supabase.from('posts').delete().eq('id', job.postId).neq('processing_status', 'ready');
      this.hooks?.onPostsChanged();
    }
  }

  // ---- the work ------------------------------------------------------------------------------------------
  /** Starts whatever can be started. Safe to call as often as you like. */
  kick = () => {
    if (!this.userId) return;
    void this.pump();
    for (const job of this.jobs.values()) {
      if (job.phase === 'processing') void this.watch(job);
    }
  };

  private readyToSend(job: VideoJob) {
    return (job.phase === 'queued' || job.phase === 'uploading') && !job.fatal && (this.nextTry.get(job.id) ?? 0) <= Date.now();
  }

  private async pump() {
    if (this.pumping) return;
    this.pumping = true;
    const signal = this.abort?.signal;
    try {
      for (;;) {
        if (!this.userId || signal?.aborted) return;
        const job = [...this.jobs.values()].sort((a, b) => a.createdAt - b.createdAt).find(j => this.readyToSend(j));
        if (!job) break;
        await this.send(job);
      }
    } finally {
      this.pumping = false;
      void this.releaseWakeLock();
      // Signed out and straight back in while this was winding down: pick up the new session's work.
      if (signal?.aborted && this.userId) setTimeout(this.kick, 0);
    }
    // Something is only waiting for its retry time: come back then.
    const waiting = [...this.jobs.values()].filter(j => (j.phase === 'queued') && !j.fatal);
    if (waiting.length && !this.retryTimer && this.userId) {
      const soonest = Math.min(...waiting.map(j => this.nextTry.get(j.id) ?? 0));
      this.retryTimer = setTimeout(() => { this.retryTimer = null; this.kick(); }, Math.max(1000, soonest - Date.now()));
    }
  }

  private async update(job: VideoJob, patch: Partial<VideoJob>, persist = true) {
    Object.assign(job, patch, { updatedAt: Date.now() });
    this.jobs.set(job.id, job);
    this.emit();
    if (persist) { try { await putJob({ ...job }); } catch { /* keep going */ } }
  }

  private async fileFor(job: VideoJob): Promise<Blob | undefined> {
    return this.liveFiles.get(job.id) ?? (await getFile(job.id));
  }

  /** Sends one video to the server. Does not throw: problems are recorded on the job. */
  private async send(job: VideoJob) {
    const signal = this.abort?.signal;
    try {
      const blob = await this.fileFor(job);
      if (!blob) {
        await this.update(job, { phase: 'failed', fatal: true, error: 'This video is no longer saved on the phone. Please pick it again.', message: undefined });
        return;
      }
      await this.update(job, { phase: 'uploading', message: 'Uploading… you can leave this page', error: undefined });
      await this.acquireWakeLock();

      // 1) Ask the server for a resumable upload (and a hidden post that it will publish later).
      if (!job.postId || !job.uploadUrl) {
        const created = await createStreamUpload({ size: blob.size, name: job.fileName, caption: job.caption, productId: job.productId });
        await this.update(job, { postId: created.postId, uploadUrl: created.uploadUrl });
        this.hooks?.onPostsChanged();
      }

      // 2) Send the bytes. If the address expired while the app was closed, get a new one and start over.
      const onProgress = (sent: number, total: number) => {
        job.progress = total ? Math.round((sent / total) * 100) : 0;
        this.emitSoon();
      };
      try {
        await tusUpload({ uploadUrl: job.uploadUrl!, file: blob, signal, onProgress });
      } catch (err) {
        if (!(err instanceof TusExpiredError)) throw err;
        const fresh = await createStreamUpload({ size: blob.size, name: job.fileName, postId: job.postId });
        await this.update(job, { uploadUrl: fresh.uploadUrl, progress: 0 });
        await tusUpload({ uploadUrl: fresh.uploadUrl, file: blob, signal, onProgress });
      }

      // 3) Every byte is on the server. The phone is free to close: the server does the rest.
      this.liveFiles.delete(job.id);
      await deleteFile(job.id).catch(() => undefined);
      await this.update(job, {
        phase: 'processing', progress: 100,
        message: 'Uploaded. Optimising on our servers. You can close the app, it will post by itself.',
      });
      void this.watch(job);
    } catch (err) {
      await this.handleFailure(job, err);
    }
  }

  private async handleFailure(job: VideoJob, err: unknown) {
    if (err instanceof TusAbortedError) return; // paused (signed out): nothing is lost

    if (err instanceof TusNetworkError || err instanceof NetworkError || (err instanceof TypeError && /fetch|network/i.test(err.message))) {
      // Not the seller's problem. Keep everything and try again when there is signal.
      this.nextTry.set(job.id, Date.now() + this.timing.retryAfterMs);
      await this.update(job, { phase: 'queued', message: 'Waiting for a connection. Your video is saved and will carry on by itself.' });
      return;
    }
    if (err instanceof StreamNotConfiguredError) {
      await this.sendWithoutStream(job);
      return;
    }
    const message = err instanceof Error ? err.message : 'The upload failed';
    console.error('Video upload failed:', err);
    // Shown to the seller with a Try again button (they are told the real reason, not a generic message).
    await this.update(job, { phase: 'failed', fatal: true, error: message, message: undefined });
  }

  /**
   * Cloudflare Stream is not set up on the server: post through the website's own storage instead. This is the
   * old way. It has to shrink the video on the phone first (so the screen must stay on), it cannot carry on after
   * the app is closed, and the storage plan caps the size. Set up Stream (VIDEO_UPLOAD_SETUP.md) to avoid all that.
   */
  private async sendWithoutStream(job: VideoJob) {
    try {
      const blob = await this.fileFor(job);
      if (!blob) throw new Error('This video is no longer saved on the phone. Please pick it again.');
      const original = new File([blob], job.fileName, { type: job.fileType });

      await this.update(job, { phase: 'uploading', progress: 2, message: 'Optimising video… keep this screen open' }, false);
      const file = await compressVideo(original, f => {
        job.progress = 2 + Math.round(f * 48);
        job.message = `Optimising video… ${Math.round(f * 100)}% (keep this screen open)`;
        this.emitSoon();
      });
      if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
        throw new Error(`This video is ${(file.size / 1048576).toFixed(0)} MB. Without video hosting set up, videos must be under ${MAX_VIDEO_MB} MB. Pick a shorter one, or ask the site owner to finish the video setup.`);
      }

      await this.update(job, { progress: 55, message: 'Uploading video…' }, false);
      const ext = file.name.split('.').pop() || 'mp4';
      const path = `${job.vendorId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('post-videos').upload(path, file, { contentType: file.type || 'video/mp4' });
      if (uploadError) {
        const tooBig = /maximum allowed size|too large|413/i.test(uploadError.message);
        throw new Error(tooBig
          ? 'The website\'s storage rejected this video as too large. Pick a shorter video, or ask the site owner to finish the video setup.'
          : `Could not upload the video: ${uploadError.message}`);
      }
      const videoUrl = supabase.storage.from('post-videos').getPublicUrl(path).data.publicUrl;

      let thumbnailUrl: string | null = null;
      try {
        const thumb = await captureVideoThumbnail(file);
        if (thumb) {
          const thumbPath = `${job.vendorId}/${Date.now()}-thumb.jpg`;
          const { error } = await supabase.storage.from('post-videos').upload(thumbPath, thumb, { contentType: 'image/jpeg' });
          if (!error) thumbnailUrl = supabase.storage.from('post-videos').getPublicUrl(thumbPath).data.publicUrl;
        }
      } catch { /* the poster is optional */ }

      await this.update(job, { progress: 92, message: 'Publishing…' }, false);
      const { error: insertError } = await supabase.from('posts').insert({
        vendor_id: job.vendorId, media_type: 'video', video_url: videoUrl, thumbnail_url: thumbnailUrl,
        caption: job.caption.trim() || null, product_id: job.productId || null,
      });
      if (insertError) throw new Error(`Could not publish the post: ${insertError.message}`);

      await this.finish(job);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The upload failed';
      console.error('Video upload (without Stream) failed:', err);
      await this.update(job, { phase: 'failed', fatal: true, error: message, message: undefined });
    }
  }

  /** Follows a post while the server optimises it, until it is live or has failed. */
  private async watch(job: VideoJob) {
    if (this.watching.has(job.id) || !job.postId) return;
    this.watching.add(job.id);
    const signal = this.abort?.signal;
    const started = Date.now();
    try {
      for (let tick = 0; Date.now() - started < this.timing.watchForMs; tick++) {
        const { data, error } = await supabase.from('posts').select('processing_status, processing_error').eq('id', job.postId).maybeSingle();
        if (!error) {
          if (!data) { await this.dropLocal(job); return; } // the seller deleted it
          if (data.processing_status === 'ready') { await this.finish(job); return; }
          if (data.processing_status === 'failed') {
            await this.update(job, { phase: 'failed', fatal: true, error: data.processing_error || 'The video could not be processed.', message: undefined });
            this.hooks?.onPostsChanged();
            return;
          }
          // Not finished: also ask the server to check with Cloudflare now and then (in case the webhook is not set up).
          if (tick % 3 === 2) {
            const results = await checkStreamPosts();
            if (results.some(r => r.id === job.postId && r.status !== 'processing' && r.status !== 'uploading')) continue;
          }
        }
        await sleep(this.timing.watchEveryMs, signal);
      }
      await this.update(job, { message: 'Still optimising. It will appear on its own as soon as it is ready.' });
    } catch (err) {
      if (!(err instanceof TusAbortedError)) console.warn('Watching the post stopped:', err);
    } finally {
      this.watching.delete(job.id);
    }
  }

  private async dropLocal(job: VideoJob) {
    this.jobs.delete(job.id);
    this.liveFiles.delete(job.id);
    this.emit();
    await Promise.allSettled([deleteJob(job.id), deleteFile(job.id)]);
  }

  private async finish(job: VideoJob) {
    await this.dropLocal(job);
    this.hooks?.onPostsChanged();
    this.hooks?.onPublished(job);
  }

  // ---- keep the screen awake while sending (best effort) -----------------------------------------------
  private async acquireWakeLock() {
    if (this.wakeLock || typeof navigator === 'undefined') return;
    try {
      const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
      this.wakeLock = (await wl?.request('screen')) ?? null;
    } catch { /* not allowed or not supported */ }
  }
  private async releaseWakeLock() {
    const lock = this.wakeLock;
    this.wakeLock = null;
    try { await lock?.release(); } catch { /* already released */ }
  }
}

export const videoUploadQueue = new VideoUploadQueue();
