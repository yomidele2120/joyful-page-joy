import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, MessageCircle, Share2, ShoppingBag, Volume2, VolumeX, Flag } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import PostMedia from './PostMedia';
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

// Renders one post in the feed (video or image carousel). Only the "active"
// post plays, so we never have more than one decoder running at a time.
export default function VideoPost({ post, isActive, isLiked, onOpenComments }: VideoPostProps) {
  const [muted, setMuted] = useState(true);
  const { user } = useAuth();
  const toggleLike = useToggleLike();
  const toggleFollow = useToggleFollow();
  const { data: isFollowing } = useIsFollowing(post.vendor_id);
  const recordView = useRecordView();
  const reportContent = useReportContent();

  const handleFirstPlay = useCallback(() => recordView(post.id), [recordView, post.id]);

  const handleLike = () => {
    if (!user) {
      toast.error('Sign in to like this video');
      return;
    }
    toggleLike.mutate({ postId: post.id, isLiked });
  };

  const handleFollow = () => {
    if (!user) {
      toast.error('Sign in to connect with this vendor');
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

  const isImagePost = post.media_type === 'images';

  return (
    <div className="relative h-full w-full snap-start snap-always bg-black flex items-center justify-center overflow-hidden">
      <PostMedia post={post} isActive={isActive} muted={muted} onFirstPlay={handleFirstPlay} />


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

        {!isImagePost && (
          <Button
            size="icon"
            variant="ghost"
            className="text-white hover:text-white hover:bg-white/10"
            onClick={() => setMuted((m) => !m)}
          >
            {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </Button>
        )}

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
