import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ShoppingBag, X, Search } from 'lucide-react';
import VideoFeed from '@/components/feed/VideoFeed';
import BottomNav from '@/components/layout/BottomNav';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

export default function Feed() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tag = searchParams.get('tag');
  const q = searchParams.get('q');
  const post = searchParams.get('post');
  const tab = searchParams.get('tab'); // 'following' | null (For You)

  const [searchOpen, setSearchOpen] = useState(!!q);
  const [queryInput, setQueryInput] = useState(q ?? '');

  // Debounce typing before it hits the network — searches on pause, not
  // on every keystroke.
  useEffect(() => {
    if (!searchOpen) return;
    const handle = setTimeout(() => {
      const trimmed = queryInput.trim();
      setSearchParams(trimmed ? { q: trimmed } : {});
    }, 400);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryInput, searchOpen]);

  const closeSearch = () => {
    setSearchOpen(false);
    setQueryInput('');
    setSearchParams({});
  };

  const isDefaultView = !tag && !q && !post;
  const isGridMode = !!q; // search results render as a light-background grid

  return (
    <div className={cn('fixed inset-x-0 top-0 bottom-14 md:bottom-0 z-30 w-full', isGridMode ? 'bg-background' : 'bg-black')}>
      {/* Minimal floating header — feed is meant to be immersive/full-bleed */}
      <div className="absolute top-0 inset-x-0 z-10 flex items-center gap-2 p-4 pointer-events-none">
        {searchOpen ? (
          <div className="pointer-events-auto flex items-center gap-2 flex-1 rounded-full bg-black/50 backdrop-blur px-3 py-1.5">
            <Search className="w-4 h-4 text-white/70 shrink-0" />
            <input
              autoFocus
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="Search videos, #hashtags..."
              className="flex-1 bg-transparent text-white text-sm placeholder:text-white/50 outline-none min-w-0"
            />
            <button onClick={closeSearch} aria-label="Close search" className="text-white/70 shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <Link
              to="/"
              className="pointer-events-auto h-9 w-9 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>

            <div className="flex-1 flex items-center justify-center">
              {tag ? (
                <button
                  onClick={() => setSearchParams({})}
                  className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-black/40 backdrop-blur px-3 py-1.5 text-white text-sm font-medium"
                >
                  #{tag} <X className="w-3.5 h-3.5" />
                </button>
              ) : post ? (
                <span className="text-white font-semibold text-sm drop-shadow">Post</span>
              ) : isDefaultView && user ? (
                <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-black/40 backdrop-blur p-1">
                  <button
                    onClick={() => setSearchParams({})}
                    className={cn(
                      'px-3 py-1 rounded-full text-xs font-semibold transition-colors',
                      !tab ? 'bg-white text-black' : 'text-white/70'
                    )}
                  >
                    For You
                  </button>
                  <button
                    onClick={() => setSearchParams({ tab: 'following' })}
                    className={cn(
                      'px-3 py-1 rounded-full text-xs font-semibold transition-colors',
                      tab === 'following' ? 'bg-white text-black' : 'text-white/70'
                    )}
                  >
                    Following
                  </button>
                </div>
              ) : (
                <span className="text-white font-semibold text-sm drop-shadow">For You</span>
              )}
            </div>

            <button
              onClick={() => setSearchOpen(true)}
              aria-label="Search"
              className="pointer-events-auto h-9 w-9 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white shrink-0"
            >
              <Search className="w-4 h-4" />
            </button>
            <Link
              to="/products"
              className="pointer-events-auto h-9 w-9 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white shrink-0"
            >
              <ShoppingBag className="w-5 h-5" />
            </Link>
          </>
        )}
      </div>

      <VideoFeed
        hashtag={tag ?? undefined}
        search={q ?? undefined}
        postId={post ?? undefined}
        following={isDefaultView && tab === 'following'}
      />
      <BottomNav />
    </div>
  );
}
