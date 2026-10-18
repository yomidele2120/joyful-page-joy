import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useCaptcha } from '@/components/auth/Captcha';
import { AuthShell, AuthFooterLink, Field, SubmitButton } from '@/components/auth/AuthShell';

// Step 1 of resetting a password: the buyer or supplier asks for an email link.
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const captcha = useCaptcha();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
        ...(captcha.token ? { captchaToken: captcha.token } : {}),
      });
      if (error) throw error;
      setSent(true);
    } catch (err: any) {
      toast.error(err.message || 'We could not send the reset email. Please try again.');
    } finally {
      setLoading(false);
      if (captcha.required) captcha.reset();
    }
  };

  return (
    <AuthShell
      title="Reset your password"
      footer={<AuthFooterLink text="Remembered it?" to="/users-login" label="Sign in" />}
    >
      {sent ? (
        <div role="status" className="text-[15px] leading-relaxed text-slate-700">
          <p className="font-semibold">Check your email</p>
          <p className="mt-2">
            If an account exists for <strong>{email.trim()}</strong>, we have sent a link to choose a new password. The link works for a limited time.
            Check your spam folder if you do not see it.
          </p>
          <p className="mt-4"><Link to="/users-login" className="font-semibold text-primary hover:underline">Back to sign in</Link></p>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <p className="mb-4 text-[15px] text-slate-600">Enter the email address you signed up with and we will send you a link to reset your password.</p>
          <Field label="Email address" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
          {captcha.widget}
          <SubmitButton loading={loading} disabled={!email.trim() || !captcha.ready}>Send reset link</SubmitButton>
        </form>
      )}
    </AuthShell>
  );
}
