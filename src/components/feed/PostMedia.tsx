import { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import useEmblaCarousel from 'embla-carousel-react';
import { Loader2, Play, AlertCircle, RotateCcw } from 'lucide-react';
import type { FeedPost } from '@/hooks/usePosts';
import { cn } from '@/lib/utils';

interface PostMediaProps {
  post: FeedPost;
  isActive: boolean;
  muted: boolean;
  onFirstPlay?: () => void;
}

// Renders the media surface of a feed post: either a single video or a
// swipeable image carousel. Keeping this separate from VideoPost means the
// overlay/action-rail UI stays untouched for both post types.
export default function PostMedia(props: PostMediaProps) {
  const { post } = props;
  const isImagePost = post.media_type === 'images' && (post.image_urls?.length ?? 0) > 0;
  return isImagePost ? <ImageCarousel post={post} isActive={props.isActive} /> : <VideoSurface {...props} />;
}

/* ---------------------------------- video --------------------------------- */

function VideoSurface({ post, isActive, muted, onFirstPlay }: PostMediaProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasCountedView = useRef(false);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const [paused, setPaused] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Attach the playback source. Cloudflare Stream posts are adaptive HLS
  // (native on Safari/iOS, hls.js elsewhere); older posts are plain files.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setLoading(true);
    setErrored(false);
    let hls: Hls | null = null;

    const src = post.hls_url || post.video_url;
    if (!src) {
      setErrored(true);
      setLoading(false);
      return;
    }

    if (post.hls_url && !video.canPlayType('application/vnd.apple.mpegurl') && Hls.isSupported()) {
      hls = new Hls({ maxBufferLength: 15, maxMaxBufferLength: 30 });
      hls.loadSource(post.hls_url);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls?.startLoad();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls?.recoverMediaError();
        else setErrored(true);
      });
    } else {
      video.src = src;
      video.load();
    }

    return () => {
      hls?.destroy();
    };
  }, [post.hls_url, post.video_url, attempt]);

  // Only the active post plays; everything else is paused and rewound so we
  // never keep more than one decoder busy on a low-end device.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isActive) {
      video.play().then(
        () => {
          setPaused(false);
          if (!hasCountedView.current) {
            hasCountedView.current = true;
            onFirstPlay?.();
          }
        },
        () => {
          // Autoplay blocked before any user gesture — show a normal-sized
          // play button over the poster instead of blocking the feed.
          setPaused(true);
        }
      );
    } else {
      video.pause();
      video.currentTime = 0;
      hasCountedView.current = false;
    }
  }, [isActive, post.id, onFirstPlay]);

  const handleTap = useCallback(() => {
    const video = videoRef.current;
    if (!video || errored) return;
    if (video.paused) void video.play().catch(() => setPaused(true));
    else video.pause();
  }, [errored]);

  const retry = () => {
    setAttempt((a) => a + 1);
  };

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <video
        ref={videoRef}
        poster={post.thumbnail_url ?? undefined}
        className="h-full w-full object-contain"
        loop
        muted={muted}
        playsInline
        preload={isActive ? 'auto' : 'metadata'}
        onClick={handleTap}
        onLoadedData={() => setLoading(false)}
        onCanPlay={() => setLoading(false)}
        onWaiting={() => setLoading(true)}
        onPlaying={() => {
          setLoading(false);
          setPaused(false);
        }}
        onPause={() => setPaused(true)}
        onError={() => {
          setLoading(false);
          setErrored(true);
        }}
      />

      {/* Subtle spinner only — never a full-screen black placeholder. */}
      {loading && !errored && isActive && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Loader2 className="w-6 h-6 text-white/70 animate-spin" />
        </div>
      )}

      {paused && !loading && !errored && (
        <button
          onClick={handleTap}
          aria-label="Play video"
          className="absolute inset-0 flex items-center justify-center"
        >
          <span className="h-14 w-14 rounded-full bg-black/45 backdrop-blur-sm flex items-center justify-center">
            <Play className="w-6 h-6 text-white ml-0.5" fill="white" />
          </span>
        </button>
      )}

      {errored && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center bg-black/60">
          <AlertCircle className="w-8 h-8 text-white/70" />
          <p className="text-sm text-white/80">This video couldn&apos;t be played.</p>
          <button
            onClick={retry}
            className="flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-1.5 text-sm text-white"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Try again
          </button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------- carousel -------------------------------- */

function ImageCarousel({ post, isActive }: { post: FeedPost; isActive: boolean }) {
  const images = post.image_urls ?? [];
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false, align: 'center', containScroll: 'trimSnaps' });
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setIndex(emblaApi.selectedScrollSnap());
    emblaApi.on('select', onSelect);
    onSelect();
    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi]);

  return (
    <div className="absolute inset-0">
      {/* touch-pan-y keeps vertical feed scrolling working while embla owns
          the horizontal axis, so swiping never feels broken. */}
      <div ref={emblaRef} className="h-full w-full overflow-hidden touch-pan-y">
        <div className="flex h-full">
          {images.map((url, i) => (
            <div key={url + i} className="relative h-full w-full shrink-0 grow-0 basis-full">
              <img
                src={url}
                alt={post.caption ?? `Post image ${i + 1}`}
                className="h-full w-full object-contain"
                // Load the current + neighbouring slides eagerly, defer the rest.
                loading={isActive && Math.abs(i - index) <= 1 ? 'eager' : 'lazy'}
                decoding="async"
                draggable={false}
              />
            </div>
          ))}
        </div>
      </div>

      {images.length > 1 && (
        <>
          <div className="absolute top-4 right-4 rounded-full bg-black/50 px-2.5 py-1 text-xs font-medium text-white">
            {index + 1}/{images.length}
          </div>
          <div className="absolute bottom-2 inset-x-0 flex items-center justify-center gap-1.5 pointer-events-none">
            {images.map((_, i) => (
              <span
                key={i}
                className={cn('h-1.5 rounded-full transition-all', i === index ? 'w-4 bg-white' : 'w-1.5 bg-white/50')}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
