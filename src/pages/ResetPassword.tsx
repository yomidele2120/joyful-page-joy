import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { AuthShell, PasswordField, SubmitButton } from '@/components/auth/AuthShell';

// Step 2: the email link brings the person here with a temporary recovery session.
export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [expired, setExpired] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });
    // The link may already have been processed before this page mounted.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && /type=recovery/.test(window.location.hash + window.location.search)) setReady(true);
    });
    const timer = window.setTimeout(() => setExpired(true), 6000);
    return () => { subscription.unsubscribe(); window.clearTimeout(timer); };
  }, []);

  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = password.length >= 8 && password === confirm;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success('Your password was changed. Please sign in with the new one.');
      await supabase.auth.signOut();
      navigate('/users-login', { replace: true });
    } catch (err: any) {
      toast.error(err.message || 'We could not change your password. Please request a new link.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Choose a new password">
      {ready ? (
        <form onSubmit={handleSubmit}>
          <PasswordField label="New password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
          <PasswordField label="Confirm new password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" minLength={8} required />
          {mismatch && <p role="alert" className="-mt-2 mb-3 text-sm text-red-600">The two passwords do not match.</p>}
          <p className="mb-3 text-sm text-slate-600">Use at least 8 characters.</p>
          <SubmitButton loading={loading} disabled={!canSubmit}>Change password</SubmitButton>
        </form>
      ) : expired ? (
        <div role="alert" className="text-[15px] text-slate-700">
          <p className="font-semibold">This link is not valid</p>
          <p className="mt-2">It may have expired or already been used.</p>
          <p className="mt-4"><Link to="/forgot-password" className="font-semibold text-primary hover:underline">Request a new link</Link></p>
        </div>
      ) : (
        <p role="status" className="text-[15px] text-slate-600">Checking your link...</p>
      )}
    </AuthShell>
  );
}
