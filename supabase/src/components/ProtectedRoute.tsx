import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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

  useEffect(() => {
    if (loading) return;

    if (!user) {
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
  }, [user, loading, isAdmin, isVendor, allowedRoles, navigate, redirectTo]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) return null;

  const hasAccess =
    (allowedRoles.includes('admin') && isAdmin) ||
    (allowedRoles.includes('vendor') && isVendor) ||
    (allowedRoles.includes('user') && !isAdmin && !isVendor);

  if (!hasAccess) return null;

  return <>{children}</>;
}
