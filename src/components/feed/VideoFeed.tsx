import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import VideoPost from './VideoPost';
import CommentsSheet from './CommentsSheet';
import { usePostsFeed, useUserLikedPosts, type FeedPost } from '@/hooks/usePosts';

// How many posts on either side of the active one stay mounted. Everything
// outside this window is unmounted so we never keep more than a handful of
// <video> elements (and their decoders) alive on the page at once.
const RENDER_WINDOW = 1;

export default function VideoFeed({ hashtag }: { hashtag?: string }) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = usePostsFeed(hashtag);
  const posts = useMemo(() => data?.pages.flat() ?? [], [data]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

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
        <p className="text-lg font-medium">No videos yet</p>
        <p className="text-sm text-white/60">
          {hashtag ? `No videos tagged #${hashtag} yet.` : "Vendors haven't posted any videos. Check back soon."}
        </p>
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
