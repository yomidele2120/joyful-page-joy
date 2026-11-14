import { Suspense, lazy } from 'react';
import { useAuth } from '@/hooks/useAuth';
import Index from '@/pages/Index';

const Landing = lazy(() => import('@/pages/Landing'));

// "/" shows the landing page to visitors and the marketplace home to signed-in users.
// While the saved session is still being restored we show a spinner, so a signed-in user never sees the landing page flash.
export default function RootRoute() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="Loading">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  return user ? <Index /> : <Suspense fallback={null}><Landing /></Suspense>;
}
