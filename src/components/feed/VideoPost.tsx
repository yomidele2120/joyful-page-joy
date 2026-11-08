import { forwardRef, useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, MessageCircle, Share2, ShoppingBag, Volume2, VolumeX, Flag } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
import { sharePost } from '@/lib/shareLinks';
import { isTikTokPost } from '@/lib/tiktok';

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
    const result = await sharePost({ id: post.id, vendorName: post.vendors?.store_name, caption: post.caption });
    if (result === 'copied') toast.success('Link copied. Paste it anywhere to share this video.');
    else if (result === 'failed') toast.error('Could not share. Copy the link from your browser address bar.');
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
  // A TikTok embed owns its sound (so no mute button of ours) and draws its own like/comment pill on the right
  // edge. That pill lives inside TikTok's page and cannot be restyled, so PostMedia covers that strip while the
  // player runs and our own rail sits on top of the cover.
  const isTikTok = isTikTokPost(post);

  const storeName = post.vendors?.store_name ?? 'Vendor';
  const tags = (post.hashtags ?? []).slice(0, 4);

  const vendorAvatar = (size: string) => (
    <Avatar className={cn(size, 'border-2 border-white')}>
      <AvatarImage src={post.vendors?.logo_url ?? undefined} />
      <AvatarFallback>{storeName[0] ?? 'V'}</AvatarFallback>
    </Avatar>
  );

  const connectBadge = (
    <span
      className={cn(
        'flex h-5 w-5 items-center justify-center rounded-full border-2 border-black text-xs font-bold leading-none text-white',
        isFollowing ? 'bg-muted-foreground' : 'bg-primary'
      )}
    >
      {isFollowing ? '✓' : '+'}
    </span>
  );

  const reportMenu = (trigger: React.ReactNode) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleReport('spam')}>Spam or misleading</DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleReport('inappropriate')}>Inappropriate content</DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleReport('counterfeit')}>Counterfeit product</DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleReport('other')}>Other</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // Caption, hashtags and the shop card. Same on every post type.
  const details = (
    <>
      {post.caption && <p className="mb-1 line-clamp-2 text-sm text-white">{post.caption}</p>}

      {tags.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-x-2 gap-y-0.5 overflow-hidden [@media(max-height:700px)]:hidden" style={{ maxHeight: '2.5rem' }}>
          {tags.map((tag) => (
            <Link key={tag} to={`/feed?tag=${tag}`} className="text-xs font-medium text-white/90 hover:underline">
              #{tag}
            </Link>
          ))}
        </div>
      )}

      {post.products && (
        <Link
          to={`/product/${post.products.slug}`}
          className="flex max-w-xs items-center gap-3 rounded-lg bg-white/95 p-2 transition-transform active:scale-[0.98]"
        >
          {post.products.image_url && (
            <img src={post.products.image_url} alt={post.products.name} className="h-10 w-10 shrink-0 rounded object-cover" loading="lazy" decoding="async" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{post.products.name}</p>
            <p className="text-xs font-semibold text-primary">{formatNaira(post.products.price)}</p>
          </div>
          <ShoppingBag className="h-4 w-4 shrink-0 text-primary" />
        </Link>
      )}
    </>
  );

  return (
    // The black page fills the screen; the post itself is a phone-width column, centred on larger screens so the
    // action rail sits next to the video instead of floating at the far edge of a wide monitor.
    <div className="relative flex h-full w-full snap-start snap-always justify-center overflow-hidden bg-black">
      <div className="relative h-full w-full md:max-w-[480px]">
        <>
            <PostMedia post={post} isActive={isActive} muted={muted} onFirstPlay={handleFirstPlay} />

            {/* Bottom gradient + store + caption + shop card (leaves the right edge free for the rail) */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-4 pb-6 pr-20">
              <Link to={`/shop/${post.vendor_id}`} className="mb-1.5 block truncate text-sm font-semibold text-white drop-shadow">
                {storeName}
              </Link>
              {details}
            </div>

            {/* Right-side action rail. Every item uses the same 44px touch box, icon size and label style. On short
                screens the spacing tightens so the rail never runs up under the floating header. */}
            <div className="absolute bottom-6 right-2 flex flex-col items-center gap-3 [@media(max-height:700px)]:gap-1.5">
              <button onClick={handleFollow} className="flex flex-col items-center" aria-label={isFollowing ? 'Connected' : 'Connect with vendor'}>
                {vendorAvatar('h-11 w-11 [@media(max-height:700px)]:h-9 [@media(max-height:700px)]:w-9')}
                <span className="-mt-2.5">{connectBadge}</span>
              </button>

              <RailButton onClick={handleLike} label={String(post.likes_count)} aria-label={isLiked ? 'Unlike' : 'Like'}>
                <Heart className={cn('h-7 w-7', isLiked && 'fill-red-500 text-red-500')} />
              </RailButton>

              <RailButton onClick={() => onOpenComments(post.id)} label={String(post.comments_count)} aria-label="Comments">
                <MessageCircle className="h-7 w-7" />
              </RailButton>

              <RailButton onClick={handleShare} label="Share" aria-label="Share this video">
                <Share2 className="h-7 w-7" />
              </RailButton>

              {!isImagePost && !isTikTok && (
                <RailButton onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Turn sound on' : 'Turn sound off'}>
                  {muted ? <VolumeX className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
                </RailButton>
              )}

              {reportMenu(<RailButton aria-label="Report this video"><Flag className="h-5 w-5 text-white/80" /></RailButton>)}
            </div>
        </>
      </div>
    </div>
  );
}

type TapProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { label?: string };

// Vertical rail item: icon over a small count/label, white with a soft shadow so it stays readable on bright video.
const RailButton = forwardRef<HTMLButtonElement, TapProps>(({ label, children, className, ...rest }, ref) => (
  <button
    ref={ref} type="button" {...rest}
    className={cn('flex w-12 flex-col items-center text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)] transition-transform active:scale-95', className)}
  >
    <span className="flex h-11 items-center justify-center [@media(max-height:700px)]:h-9">{children}</span>
    {label !== undefined && <span className="-mt-0.5 text-xs font-medium leading-none">{label}</span>}
  </button>
));
RailButton.displayName = 'RailButton';
