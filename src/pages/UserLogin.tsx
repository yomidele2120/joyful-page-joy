import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import {
  AuthShell, AuthFooterLink, Field, PasswordField, SelectField, PhoneField, ChoiceGroup,
  CheckboxRow, SubmitButton, LegalText, COUNTRIES,
} from '@/components/auth/AuthShell';

// Buyer sign in + create account (one page, switched with ?mode=signup).
export default function UserLogin() {
  const [params, setParams] = useSearchParams();
  const isLogin = params.get('mode') !== 'signup';
  const setMode = (mode: 'login' | 'signup') => setParams(mode === 'signup' ? { mode } : {}, { replace: true });

  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    country: 'Nigeria', businessName: '', firstName: '', lastName: '', email: '', phone: '', password: '',
    buyerType: '', resells: '', marketing: false,
  });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm(f => ({ ...f, [key]: value }));

  const { signIn, signUp, user, isAdmin, isVendor, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Redirect already-logged-in users to the right dashboard.
  useEffect(() => {
    if (!authLoading && user) {
      if (isAdmin) navigate('/admin', { replace: true });
      else if (isVendor) navigate('/supplier-dashboard', { replace: true });
      else navigate('/user-dashboard', { replace: true });
    }
  }, [authLoading, user, isAdmin, isVendor, navigate]);

  const canSignUp =
    !!form.firstName.trim() && !!form.lastName.trim() && !!form.email.trim() && !!form.phone &&
    form.password.length >= 6 && !!form.buyerType && !!form.resells;
  const canSignIn = !!form.email.trim() && form.password.length >= 6;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await signIn(form.email.trim(), form.password);
        if (error) throw error;
        toast.success('Welcome back!');
      } else {
        const fullName = `${form.firstName.trim()} ${form.lastName.trim()}`;
        const { error } = await signUp(form.email.trim(), form.password, fullName, {
          country: form.country,
          phone: form.phone,
          business_name: form.businessName.trim(),
          buyer_type: form.buyerType,
          buys_to_resell: form.resells === 'yes',
          marketing_opt_in: form.marketing,
        });
        if (error) throw error;
        toast.success('Account created successfully!');
        const { error: loginError } = await signIn(form.email.trim(), form.password);
        if (loginError) setMode('login');
      }
    } catch (err: any) {
      toast.error(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={isLogin ? 'Sign in to your account' : 'Create your account'}
      footer={
        isLogin
          ? <>Don’t have an account?{' '}<button type="button" onClick={() => setMode('signup')} className="font-semibold text-white underline-offset-4 hover:underline">Sign up</button></>
          : <>Already have an account?{' '}<button type="button" onClick={() => setMode('login')} className="font-semibold text-white underline-offset-4 hover:underline">Sign in</button></>
      }
    >
      <form onSubmit={handleSubmit} noValidate={false}>
        {!isLogin && (
          <>
            <SelectField label="Country" value={form.country} onChange={v => set('country', v)} options={COUNTRIES} />
            <Field label="Business name (optional)" value={form.businessName} onChange={e => set('businessName', e.target.value)} autoComplete="organization" />
            <Field label="First name" value={form.firstName} onChange={e => set('firstName', e.target.value)} autoComplete="given-name" required />
            <Field label="Last name" value={form.lastName} onChange={e => set('lastName', e.target.value)} autoComplete="family-name" required />
          </>
        )}

        <Field label="Email address" type="email" value={form.email} onChange={e => set('email', e.target.value)} autoComplete="email" required />

        {!isLogin && <PhoneField value={form.phone} onChange={v => set('phone', v)} required />}

        <PasswordField
          value={form.password}
          onChange={e => set('password', e.target.value)}
          autoComplete={isLogin ? 'current-password' : 'new-password'}
          minLength={6}
          required
        />

        {!isLogin && (
          <>
            <ChoiceGroup
              legend="What type of buyer are you?"
              name="buyerType"
              value={form.buyerType}
              onChange={v => set('buyerType', v)}
              options={[
                { value: 'individual', label: 'Individual buyer', hint: 'I’m buying for myself, my shop or a small project.' },
                { value: 'registered_business', label: 'Registered business', hint: 'My company buys in bulk and may need invoices and quotations.' },
              ]}
            />
            <ChoiceGroup
              legend="Do you buy to resell?"
              name="resells"
              value={form.resells}
              onChange={v => set('resells', v)}
              inline
              options={[{ value: 'yes', label: 'Yes, I do' }, { value: 'no', label: 'No, I don’t' }]}
            />
            <p className="-mt-2 mb-2 text-sm font-semibold text-slate-600">Email marketing (optional)</p>
            <CheckboxRow checked={form.marketing} onChange={v => set('marketing', v)}>
              I consent to IT Hub Africa sending me marketing emails (special offers, new products, etc.)
            </CheckboxRow>
          </>
        )}

        <SubmitButton loading={loading} disabled={isLogin ? !canSignIn : !canSignUp}>
          {isLogin ? 'Sign in' : 'Create my account'}
        </SubmitButton>

        {!isLogin && <LegalText />}
      </form>

      <div className="mt-6 border-t border-slate-200 pt-5 text-center text-[15px] text-slate-600">
        Selling on IT Hub Africa?{' '}
        <Link to={isLogin ? '/suppliers-login' : '/supplier-signup'} className="font-semibold text-primary hover:underline">
          {isLogin ? 'Sign in as a supplier' : 'Create a supplier account'}
        </Link>
      </div>
    </AuthShell>
  );
}
