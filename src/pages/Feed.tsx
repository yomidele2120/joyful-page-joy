import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ShoppingBag, X } from 'lucide-react';
import VideoFeed from '@/components/feed/VideoFeed';

export default function Feed() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tag = searchParams.get('tag');

  return (
    <div className="fixed inset-0 h-[100dvh] w-full bg-black z-40">
      {/* Minimal floating header — feed is meant to be immersive/full-bleed */}
      <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between p-4 pointer-events-none">
        <Link
          to="/"
          className="pointer-events-auto h-9 w-9 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        {tag ? (
          <button
            onClick={() => setSearchParams({})}
            className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-black/40 backdrop-blur px-3 py-1.5 text-white text-sm font-medium"
          >
            #{tag} <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <span className="text-white font-semibold text-sm drop-shadow">For You</span>
        )}
        <Link
          to="/products"
          className="pointer-events-auto h-9 w-9 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white"
        >
          <ShoppingBag className="w-5 h-5" />
        </Link>
      </div>

      <VideoFeed hashtag={tag ?? undefined} />
    </div>
  );
}

