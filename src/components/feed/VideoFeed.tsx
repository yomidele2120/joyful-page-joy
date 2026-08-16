import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Users } from 'lucide-react';
import VideoPost from './VideoPost';
import CommentsSheet from './CommentsSheet';
import SearchResultsGrid from './SearchResultsGrid';
import { usePostsFeed, useFollowingFeed, useUserLikedPosts, type FeedPost } from '@/hooks/usePosts';

// How many posts on either side of the active one stay mounted. Everything
// outside this window is unmounted so we never keep more than a handful of
// <video> elements (and their decoders) alive on the page at once.
const RENDER_WINDOW = 1;

interface VideoFeedProps {
  hashtag?: string;
  search?: string;
  postId?: string;
  following?: boolean;
}

export default function VideoFeed({ hashtag, search, postId, following }: VideoFeedProps) {
  const regular = usePostsFeed({ hashtag, search, postId, enabled: !following });
  const followingFeed = useFollowingFeed(!!following);
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = following ? followingFeed : regular;

  const posts = useMemo(() => data?.pages.flat() ?? [], [data]);

  // Search results render as a browsable grid (TikTok-style small cards),
  // not the immersive swipe feed — everything else stays swipeable.
  if (search) {
    return (
      <SearchResultsGrid
        posts={posts}
        isLoading={isLoading}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={fetchNextPage}
        query={search}
      />
    );
  }

  return (
    <SwipeFeed
      posts={posts}
      isLoading={isLoading}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      fetchNextPage={fetchNextPage}
      resetKey={`${hashtag ?? ''}:${postId ?? ''}:${following ? 'following' : 'foryou'}`}
      emptyMessage={
        following
          ? "You haven't connected with any shops yet — hit Connect on a vendor's profile to see their updates here."
          : hashtag
            ? `No videos tagged #${hashtag} yet.`
            : "Vendors haven't posted any videos. Check back soon."
      }
      emptyIcon={following ? <Users className="w-8 h-8" /> : undefined}
    />
  );
}

interface SwipeFeedProps {
  posts: FeedPost[];
  isLoading: boolean;
  hasNextPage?: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  resetKey: string;
  emptyMessage: string;
  emptyIcon?: React.ReactNode;
}

// The original immersive, full-screen, vertically-swipeable video feed —
// used for "For You", hashtag browsing, "Following", and single-post deep
// links. Kept separate from VideoFeed so search's grid mode doesn't have to
// carry any of this machinery.
function SwipeFeed({
  posts,
  isLoading,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  resetKey,
  emptyMessage,
  emptyIcon,
}: SwipeFeedProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Jump back to the top whenever the filter changes (switching between
  // "For You", a hashtag, "Following", or a deep-linked post) so
  // activeIndex never points past the end of a different result set.
  useEffect(() => {
    setActiveIndex(0);
    containerRef.current?.scrollTo({ top: 0 });
  }, [resetKey]);

  const likedIds = useMemo(() => posts.map((p) => p.id), [posts]);
  const { data: likedSet } = useUserLikedPosts(likedIds);

  // Track which post is on screen via IntersectionObserver — cheaper and
  // smoother than computing scrollTop math on every scroll event.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
            const index = Number((entry.target as HTMLElement).dataset.index);
            setActiveIndex(index);
          }
        });
      },
      { root: container, threshold: [0.6] }
    );

    itemRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [posts.length]);

  // Load the next page a couple of posts before the user reaches the end.
  useEffect(() => {
    if (activeIndex >= posts.length - 2 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [activeIndex, posts.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-black">
        <Loader2 className="w-8 h-8 text-white animate-spin" />
      </div>
    );
  }

  if (!posts.length) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-black text-white gap-2 px-6 text-center">
        {emptyIcon && <div className="text-white/60 mb-1">{emptyIcon}</div>}
        <p className="text-sm text-white/60">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        className="h-full w-full overflow-y-scroll snap-y snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {posts.map((post: FeedPost, index) => {
          const withinWindow = Math.abs(index - activeIndex) <= RENDER_WINDOW;
          return (
            <div
              key={post.id}
              ref={(el) => (itemRefs.current[index] = el)}
              data-index={index}
              className="h-full w-full snap-start"
            >
              {withinWindow ? (
                <VideoPost
                  post={post}
                  isActive={index === activeIndex}
                  isLiked={likedSet?.has(post.id) ?? false}
                  onOpenComments={setCommentsPostId}
                />
              ) : (
                // Placeholder keeps scroll height correct without mounting a <video>
                <div className="h-full w-full bg-black" />
              )}
            </div>
          );
        })}
        {isFetchingNextPage && (
          <div className="h-16 w-full flex items-center justify-center bg-black">
            <Loader2 className="w-5 h-5 text-white animate-spin" />
          </div>
        )}
      </div>

      <CommentsSheet
        postId={commentsPostId}
        open={!!commentsPostId}
        onOpenChange={(open) => !open && setCommentsPostId(null)}
      />
    </>
  );
}
