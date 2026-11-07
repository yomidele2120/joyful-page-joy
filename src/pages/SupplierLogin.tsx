import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useCaptcha } from '@/components/auth/Captcha';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { AuthShell, AuthFooterLink, Field, PasswordField, SubmitButton } from '@/components/auth/AuthShell';

export default function SupplierLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const captcha = useCaptcha();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await signIn(email.trim(), password, captcha.token);
      if (error) throw error;

      // Check if user is a vendor
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Login failed');

      const { data: vendor } = await supabase
        .from('vendors')
        .select('id, is_approved')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!vendor) {
        toast.error('No supplier account found. Please sign up first.');
        await supabase.auth.signOut();
        navigate('/supplier-signup');
        return;
      }

      if (!vendor.is_approved) {
        toast.info('Your supplier account is pending approval. You can still set up your shop.');
      }

      toast.success('Welcome back, Supplier!');
      navigate('/supplier-dashboard', { replace: true });
    } catch (err: any) {
      toast.error(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
      if (captcha.required) captcha.reset();
    }
  };

  return (
    <AuthShell
      title="Sign in to your supplier account"
      footer={<AuthFooterLink text="Don’t have a supplier account?" to="/supplier-signup" label="Sign up" />}
    >
      <form onSubmit={handleSubmit}>
        <Field label="Email address" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
        <PasswordField value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" minLength={6} required />
        <p className="-mt-2 mb-3 text-right text-sm">
          <Link to="/forgot-password" className="font-semibold text-primary hover:underline">Forgot your password?</Link>
        </p>
        {captcha.widget}
        <SubmitButton loading={loading} disabled={!email.trim() || password.length < 6 || !captcha.ready}>Sign in</SubmitButton>
      </form>

      <div className="mt-6 border-t border-slate-200 pt-5 text-center text-[15px] text-slate-600">
        Buying instead?{' '}
        <Link to="/users-login" className="font-semibold text-primary hover:underline">Sign in as a buyer</Link>
      </div>
    </AuthShell>
  );
}
