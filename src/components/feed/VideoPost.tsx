import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Link } from 'react-router-dom';
import { Heart, MessageCircle, Share2, ShoppingBag, Volume2, VolumeX, Play, Flag } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatNaira } from '@/lib/format';
import { useAuth } from '@/hooks/useAuth';
import { useToggleLike, useToggleFollow, useIsFollowing, useRecordView, type FeedPost } from '@/hooks/usePosts';
import { useReportContent } from '@/hooks/useReports';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface VideoPostProps {
  post: FeedPost;
  isActive: boolean;
  isLiked: boolean;
  onOpenComments: (postId: string) => void;
}

// Renders one video in the feed. Only the "active" post actually plays —
// everything else stays paused so we never have more than one decoder
// running at a time on mobile.
export default function VideoPost({ post, isActive, isLiked, onOpenComments }: VideoPostProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [showPlayIcon, setShowPlayIcon] = useState(false);
  const { user } = useAuth();
  const toggleLike = useToggleLike();
  const toggleFollow = useToggleFollow();
  const { data: isFollowing } = useIsFollowing(post.vendor_id);
  const recordView = useRecordView();
  const reportContent = useReportContent();
  const hasCountedView = useRef(false);

  // Attach playback source once per post. Cloudflare Stream videos are
  // served as adaptive HLS: Safari/iOS play that natively, everywhere else
  // uses hls.js to pick the right rendition for the viewer's connection.
  // Posts without an hls_url (uploaded before Stream was configured) just
  // use the plain file — same as before.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls: Hls | null = null;

    if (post.hls_url) {
      const canPlayNativeHls = video.canPlayType('application/vnd.apple.mpegurl');
      if (canPlayNativeHls) {
        video.src = post.hls_url;
      } else if (Hls.isSupported()) {
        hls = new Hls({ maxBufferLength: 15 });
        hls.loadSource(post.hls_url);
        hls.attachMedia(video);
      } else {
        video.src = post.video_url;
      }
    } else {
      video.src = post.video_url;
    }

    return () => {
      hls?.destroy();
    };
  }, [post.hls_url, post.video_url]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isActive) {
      video.play().catch(() => {
        // Autoplay can be blocked before the user has interacted with the
        // page at all — that's fine, they can tap to play.
      });
      if (!hasCountedView.current) {
        hasCountedView.current = true;
        recordView(post.id);
      }
    } else {
      video.pause();
      video.currentTime = 0;
      hasCountedView.current = false;
    }
  }, [isActive, post.id, recordView]);

  const handleTap = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setShowPlayIcon(false);
    } else {
      video.pause();
      setShowPlayIcon(true);
    }
  };

  const handleLike = () => {
    if (!user) {
      toast.error('Sign in to like this video');
      return;
    }
    toggleLike.mutate({ postId: post.id, isLiked });
  };

  const handleFollow = () => {
    if (!user) {
      toast.error('Sign in to follow this vendor');
      return;
    }
    toggleFollow.mutate({ vendorId: post.vendor_id, isFollowing: !!isFollowing });
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/shop/${post.vendor_id}?post=${post.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: post.vendors?.store_name ?? 'Check this out', url });
        return;
      } catch {
        // user cancelled share — fall through to clipboard copy
      }
    }
    await navigator.clipboard.writeText(url);
    toast.success('Link copied');
  };

  const handleReport = (reason: string) => {
    if (!user) {
      toast.error('Sign in to report content');
      return;
    }
    reportContent.mutate(
      { postId: post.id, reason },
      { onSuccess: () => toast.success('Reported — our team will review this') }
    );
  };

  return (
    <div className="relative h-full w-full snap-start snap-always bg-black flex items-center justify-center overflow-hidden">
      <video
        ref={videoRef}
        poster={post.thumbnail_url ?? undefined}
        className="h-full w-full object-contain"
        loop
        muted={muted}
        playsInline
        preload={isActive ? 'auto' : 'metadata'}
        onClick={handleTap}
      />

      {showPlayIcon && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Play className="w-16 h-16 text-white/80" fill="white" />
        </div>
      )}

      {/* Bottom gradient + caption + shop card */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-4 pb-6 pr-20">
        <Link to={`/shop/${post.vendor_id}`} className="flex items-center gap-2 mb-2">
          <Avatar className="h-9 w-9 border border-white/40">
            <AvatarImage src={post.vendors?.logo_url ?? undefined} />
            <AvatarFallback>{post.vendors?.store_name?.[0] ?? 'V'}</AvatarFallback>
          </Avatar>
          <span className="text-white font-medium text-sm">{post.vendors?.store_name ?? 'Vendor'}</span>
        </Link>

        {post.caption && <p className="text-white text-sm mb-1 line-clamp-2">{post.caption}</p>}

        {post.hashtags?.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {post.hashtags.map((tag) => (
              <Link
                key={tag}
                to={`/feed?tag=${tag}`}
                className="text-xs text-white/90 font-medium hover:underline"
              >
                #{tag}
              </Link>
            ))}
          </div>
        )}

        {post.products && (
          <Link
            to={`/product/${post.products.slug}`}
            className="flex items-center gap-3 bg-white/95 rounded-lg p-2 max-w-xs active:scale-[0.98] transition-transform"
          >
            {post.products.image_url && (
              <img src={post.products.image_url} alt={post.products.name} className="h-10 w-10 rounded object-cover shrink-0" loading="lazy" decoding="async" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium truncate">{post.products.name}</p>
              <p className="text-xs text-primary font-semibold">{formatNaira(post.products.price)}</p>
            </div>
            <ShoppingBag className="w-4 h-4 text-primary shrink-0" />
          </Link>
        )}
      </div>

      {/* Right-side action rail */}
      <div className="absolute right-3 bottom-24 flex flex-col items-center gap-5">
        <button onClick={handleFollow} className="flex flex-col items-center">
          <Avatar className="h-11 w-11 border-2 border-white">
            <AvatarImage src={post.vendors?.logo_url ?? undefined} />
            <AvatarFallback>{post.vendors?.store_name?.[0] ?? 'V'}</AvatarFallback>
          </Avatar>
          <span
            className={cn(
              'h-5 w-5 -mt-2.5 rounded-full flex items-center justify-center text-xs font-bold text-white border-2 border-black',
              isFollowing ? 'bg-muted-foreground' : 'bg-primary'
            )}
          >
            {isFollowing ? '✓' : '+'}
          </span>
        </button>

        <button onClick={handleLike} className="flex flex-col items-center gap-1 text-white">
          <Heart className={cn('w-7 h-7', isLiked && 'fill-red-500 text-red-500')} />
          <span className="text-xs">{post.likes_count}</span>
        </button>

        <button onClick={() => onOpenComments(post.id)} className="flex flex-col items-center gap-1 text-white">
          <MessageCircle className="w-7 h-7" />
          <span className="text-xs">{post.comments_count}</span>
        </button>

        <button onClick={handleShare} className="flex flex-col items-center gap-1 text-white">
          <Share2 className="w-7 h-7" />
          <span className="text-xs">Share</span>
        </button>

        <Button
          size="icon"
          variant="ghost"
          className="text-white hover:text-white hover:bg-white/10"
          onClick={() => setMuted((m) => !m)}
        >
          {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex flex-col items-center gap-1 text-white/80">
              <Flag className="w-5 h-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleReport('spam')}>Spam or misleading</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleReport('inappropriate')}>Inappropriate content</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleReport('counterfeit')}>Counterfeit product</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleReport('other')}>Other</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
