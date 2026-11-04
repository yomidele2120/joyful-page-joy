import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

type AllowedRole = 'admin' | 'vendor' | 'user';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: AllowedRole[];
  redirectTo?: string;
}

export default function ProtectedRoute({ children, allowedRoles, redirectTo = '/users-login' }: ProtectedRouteProps) {
  const { user, loading, isAdmin, isVendor } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isTikTokCallback = location.pathname === '/tiktok/callback';

  useEffect(() => {
    if (loading) return;

    if (!user) {
      if (isTikTokCallback) return;
      navigate(redirectTo, { replace: true });
      return;
    }

    const hasAccess =
      (allowedRoles.includes('admin') && isAdmin) ||
      (allowedRoles.includes('vendor') && isVendor) ||
      (allowedRoles.includes('user') && !isAdmin && !isVendor);

    if (!hasAccess) {
      // Redirect to their correct dashboard
      if (isAdmin) navigate('/admin', { replace: true });
      else if (isVendor) navigate('/supplier-dashboard', { replace: true });
      else navigate('/user-dashboard', { replace: true });
    }
  }, [user, loading, isAdmin, isVendor, allowedRoles, navigate, redirectTo, isTikTokCallback]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) return isTikTokCallback ? <>{children}</> : null;

  const hasAccess =
    (allowedRoles.includes('admin') && isAdmin) ||
    (allowedRoles.includes('vendor') && isVendor) ||
    (allowedRoles.includes('user') && !isAdmin && !isVendor);

  if (!hasAccess) return null;

  return <>{children}</>;
}
