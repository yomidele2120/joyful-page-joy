import { useNavigate } from 'react-router-dom';
import { Loader2, Heart, Images, Search } from 'lucide-react';
import type { FeedPost } from '@/hooks/usePosts';

interface SearchResultsGridProps {
  posts: FeedPost[];
  isLoading: boolean;
  hasNextPage?: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  query: string;
}

// A browsable 2-column grid of small result cards, the way TikTok search
// results look — as opposed to the full-screen swipeable feed used for
// "For You" and hashtag browsing. Tapping a card jumps into the immersive
// feed anchored on that exact post.
export default function SearchResultsGrid({
  posts,
  isLoading,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  query,
}: SearchResultsGridProps) {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center pt-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!posts.length) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground pt-16">
        <Search className="w-8 h-8" />
        <p className="text-sm">No results for &ldquo;{query}&rdquo;</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto pt-16 pb-8 px-2 bg-background">
      <div className="grid grid-cols-2 gap-2">
        {posts.map((post) => (
          <button
            key={post.id}
            onClick={() => navigate(`/feed?post=${post.id}`)}
            className="relative aspect-[9/16] rounded-lg overflow-hidden bg-muted text-left active:scale-[0.98] transition-transform"
          >
            {post.thumbnail_url ? (
              <img src={post.thumbnail_url} alt={post.caption ?? ''} className="h-full w-full object-cover" loading="lazy" decoding="async" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                <Images className="w-6 h-6" />
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-2 pt-6">
              <p className="text-white text-xs font-medium truncate">{post.vendors?.store_name ?? 'Vendor'}</p>
              {post.caption && <p className="text-white/80 text-[11px] line-clamp-1">{post.caption}</p>}
              <div className="flex items-center gap-1 text-white/80 text-[11px] mt-0.5">
                <Heart className="w-3 h-3" /> {post.likes_count}
              </div>
            </div>
          </button>
        ))}
      </div>

      {hasNextPage && (
        <button
          onClick={onLoadMore}
          disabled={isFetchingNextPage}
          className="w-full mt-4 py-2 text-sm text-muted-foreground flex items-center justify-center gap-2"
        >
          {isFetchingNextPage ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Load more'}
        </button>
      )}
    </div>
  );
}
