import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export function useRoleRedirect() {
  const navigate = useNavigate();
  const { isAdmin, isVendor } = useAuth();

  const redirectByRole = () => {
    if (isAdmin) {
      navigate('/admin', { replace: true });
    } else if (isVendor) {
      navigate('/supplier-dashboard', { replace: true });
    } else {
      navigate('/user-dashboard', { replace: true });
    }
  };

  return { redirectByRole };
}
