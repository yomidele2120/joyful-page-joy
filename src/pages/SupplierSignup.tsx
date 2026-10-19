import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useCaptcha } from '@/components/auth/Captcha';
import { trackRegistration } from '@/lib/tracking';
import SupplierTermsBox, { type CurrentTerms } from '@/components/suppliers/SupplierTermsBox';
import { BANKS, BANK_PLACEHOLDER, isValidAccountNumber } from '@/lib/banks';
import { Upload } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  AuthShell, AuthFooterLink, Field, PasswordField, SelectField, PhoneField, ChoiceGroup,
  CheckboxRow, SubmitButton, SecondaryButton, LegalText, COUNTRIES,
} from '@/components/auth/AuthShell';

const BUSINESS_TYPES: Record<string, string> = {
  starter: 'Starter business',
  registered: 'Registered business',
};

interface Form {
  country: string; businessName: string; firstName: string; lastName: string; email: string;
  phone: string; whatsappNumber: string; password: string; businessType: string; marketing: boolean;
  companyAddress: string; productCategories: string; storeDescription: string;
  bankName: string; bankAccountNumber: string; bankAccountName: string;
}

const STEP_TITLES = ['Create your account', 'Tell buyers about your business', 'Where should we pay you?'];

export default function SupplierSignup() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const captcha = useCaptcha();
  const [step, setStep] = useState(1);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [terms, setTerms] = useState<CurrentTerms | null>(null);
  const [form, setForm] = useState<Form>({
    country: 'Nigeria', businessName: '', firstName: '', lastName: '', email: '',
    phone: '', whatsappNumber: '', password: '', businessType: '', marketing: false,
    companyAddress: '', productCategories: '', storeDescription: '',
    bankName: '', bankAccountNumber: '', bankAccountName: '',
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [docFile, setDocFile] = useState<File | null>(null);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm(p => ({ ...p, [key]: value }));

  const step1Ready =
    !!form.businessName.trim() && !!form.firstName.trim() && !!form.lastName.trim() && !!form.email.trim() &&
    !!form.phone && !!form.whatsappNumber && form.password.length >= 8 && !!form.businessType;
  const step2Ready = !!form.companyAddress.trim();
  const bankReady =
    !!form.bankName && form.bankName !== BANK_PLACEHOLDER &&
    isValidAccountNumber(form.bankAccountNumber) && !!form.bankAccountName.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step < 3) return;
    if (!termsAccepted || !terms) { toast.error('Please read and accept the Supplier Terms and Commission Policy to register.'); return; }
    if (!bankReady) { toast.error('Please choose your bank and enter your 10-digit account number and account name'); return; }
    if (logoFile && logoFile.size > 10 * 1024 * 1024) { toast.error('The logo must be smaller than 10MB'); return; }
    if (docFile && docFile.size > 10 * 1024 * 1024) { toast.error('The verification document must be smaller than 10MB'); return; }
    setLoading(true);
    try {
      const fullName = `${form.firstName.trim()} ${form.lastName.trim()}`;

      // 1. Create the auth user (email confirmation must be OFF in Supabase so
      //    the new user is signed in straight away).
      const { data: signUpData, error: authError } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: { data: { full_name: fullName, country: form.country, marketing_opt_in: form.marketing }, ...(captcha.token ? { captchaToken: captcha.token } : {}) },
      });
      if (authError) throw authError;
      const newUser = signUpData.user;
      if (!newUser) throw new Error('Signup failed');
      if (!signUpData.session) {
        throw new Error('Account created, but email confirmation is still on. Turn it off in Supabase > Authentication > Providers > Email.');
      }

      const userId = newUser.id;

      // 2. Upload logo
      let logoUrl = null;
      if (logoFile) {
        const ext = logoFile.name.split('.').pop();
        const path = `${userId}/logo.${ext}`;
        const { error: uploadErr } = await supabase.storage.from('vendor-assets').upload(path, logoFile);
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from('vendor-assets').getPublicUrl(path);
          logoUrl = urlData.publicUrl;
        }
      }

      // 3. Upload verification doc to the PRIVATE bucket (only you and the admin can open it)
      let docPath: string | null = null;
      if (docFile) {
        const ext = docFile.name.split('.').pop();
        const path = `${userId}/verification.${ext}`;
        const { error: uploadErr } = await supabase.storage.from('vendor-docs').upload(path, docFile);
        if (!uploadErr) docPath = path;
      }

      // 4. Create the supplier account on the server. register_supplier() refuses to run unless
      //    the agreement is accepted, and it records the acceptance, the terms version and the date.
      const categories = form.productCategories.split(',').map(c => c.trim()).filter(Boolean);
      const { data: newVendorId, error: vendorError } = await (supabase as any).rpc('register_supplier', {
        _payload: {
          store_name: form.businessName.trim(),
          store_description: form.storeDescription || null,
          phone: form.phone,
          whatsapp_number: form.whatsappNumber,
          company_name: form.businessName.trim(),
          address: form.companyAddress,
          logo_url: logoUrl,
          business_type: BUSINESS_TYPES[form.businessType],
          product_categories: categories,
        },
        _terms_version: terms.version,
        _accepted: termsAccepted,
      });
      if (vendorError) throw vendorError;
      const vendorRow = { id: newVendorId as string };

      // 4b. Bank details and the verification document live in a private table
      if (form.bankName || form.bankAccountNumber || form.bankAccountName || docPath) {
        const { error: privateError } = await supabase.from('vendor_private').insert({
          vendor_id: vendorRow.id,
          user_id: userId,
          bank_name: form.bankName || null,
          bank_account_number: form.bankAccountNumber || null,
          bank_account_name: form.bankAccountName || null,
          verification_document_path: docPath,
        });
        if (privateError) console.error('Private vendor details:', privateError);
      }

      // (The vendor role is now granted by register_supplier(), together with the agreement.)

      trackRegistration('supplier');
      toast.success('Supplier account created! You can now sign in.');
      navigate('/suppliers-login');
    } catch (err: any) {
      toast.error(err.message || 'Signup failed');
    } finally {
      setLoading(false);
      if (captcha.required) captcha.reset();
    }
  };

  return (
    <AuthShell
      title={STEP_TITLES[step - 1]}
      footer={<AuthFooterLink text="Already have a supplier account?" to="/suppliers-login" label="Sign in" />}
    >
      <div className="mb-6 -mt-2">
        <div className="flex gap-1.5" aria-hidden="true">
          {[1, 2, 3].map(s => (
            <div key={s} className={`h-1 flex-1 rounded-full ${s <= step ? 'bg-primary' : 'bg-slate-200'}`} />
          ))}
        </div>
        <p className="mt-2 text-center text-sm text-slate-500">Step {step} of 3</p>
      </div>

      <form onSubmit={handleSubmit}>
        {step === 1 && (
          <>
            <SelectField label="Country" value={form.country} onChange={v => set('country', v)} options={COUNTRIES} />
            <Field label="Business name" value={form.businessName} onChange={e => set('businessName', e.target.value)} autoComplete="organization" required />
            <Field label="First name" value={form.firstName} onChange={e => set('firstName', e.target.value)} autoComplete="given-name" required />
            <Field label="Last name" value={form.lastName} onChange={e => set('lastName', e.target.value)} autoComplete="family-name" required />
            <Field label="Email address" type="email" value={form.email} onChange={e => set('email', e.target.value)} autoComplete="email" required />
            <PhoneField value={form.phone} onChange={v => set('phone', v)} required />
            <PhoneField label="WhatsApp number" value={form.whatsappNumber} onChange={v => set('whatsappNumber', v)} required />
            <PasswordField value={form.password} onChange={e => set('password', e.target.value)} autoComplete="new-password" minLength={8} required />

            <ChoiceGroup
              legend="What type of business do you own?"
              name="businessType"
              value={form.businessType}
              onChange={v => set('businessType', v)}
              options={[
                { value: 'starter', label: 'Starter business', hint: 'I’m testing my ideas with real customers, and preparing to register my company' },
                { value: 'registered', label: 'Registered business', hint: 'My business has the approval, documentation, and licences required to operate legally' },
              ]}
            />

            <p className="-mt-2 mb-2 text-sm font-semibold text-slate-600">Email marketing (optional)</p>
            <CheckboxRow checked={form.marketing} onChange={v => set('marketing', v)}>
              I consent to IT Hub Africa sending me marketing emails (seller tips, new features, etc.)
            </CheckboxRow>

            <SubmitButton
              type="button"
              disabled={!step1Ready}
              onClick={() => {
                if (form.password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
                setStep(2);
              }}
            >
              Continue
            </SubmitButton>
            <LegalText />
          </>
        )}

        {step === 2 && (
          <>
            <Field label="Business address" value={form.companyAddress} onChange={e => set('companyAddress', e.target.value)} autoComplete="street-address" required />
            <Field label="Product categories (optional)" value={form.productCategories} onChange={e => set('productCategories', e.target.value)} placeholder="Fashion, Electronics, Home & Kitchen" />
            <div className="mb-5">
              <label htmlFor="storeDescription" className="mb-2 block text-sm font-semibold text-slate-600">Store description (optional)</label>
              <textarea
                id="storeDescription"
                rows={3}
                value={form.storeDescription}
                onChange={e => set('storeDescription', e.target.value)}
                placeholder="Tell buyers what you sell and where you ship from"
                className="block w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-[15px] text-slate-800 placeholder:text-slate-400 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <UploadRow label="Business logo (optional)" cta="Choose a logo" file={logoFile} accept="image/*" onFile={setLogoFile} />
            <UploadRow label="Verification document (optional)" cta="Choose a document" file={docFile} accept=".pdf,.jpg,.jpeg,.png" onFile={setDocFile} />
            <div className="flex gap-3">
              <SecondaryButton onClick={() => setStep(1)}>Back</SecondaryButton>
              <SubmitButton type="button" disabled={!step2Ready} onClick={() => setStep(3)}>Continue</SubmitButton>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <p className="-mt-3 mb-5 text-sm text-slate-500">Required. Your payment account is set up automatically from these details once an admin approves you. You can change them later in your dashboard.</p>
            <SelectField label="Bank name" value={form.bankName || BANK_PLACEHOLDER} onChange={v => set('bankName', v === BANK_PLACEHOLDER ? '' : v)} options={[BANK_PLACEHOLDER, ...BANKS]} />
            <Field label="Account number (10 digits)" inputMode="numeric" maxLength={10} value={form.bankAccountNumber} onChange={e => set('bankAccountNumber', e.target.value.replace(/\D/g, ''))} />
            <Field label="Account name" value={form.bankAccountName} onChange={e => set('bankAccountName', e.target.value)} />
            <SupplierTermsBox onChange={(a, t) => { setTermsAccepted(a); setTerms(t); }} />
            <div className="flex gap-3">
              <SecondaryButton onClick={() => setStep(2)}>Back</SecondaryButton>
              {captcha.widget}
              <SubmitButton loading={loading} disabled={!bankReady || !captcha.ready || !termsAccepted}>Create my account</SubmitButton>
            </div>
          </>
        )}
      </form>
    </AuthShell>
  );
}

function UploadRow({
  label, cta, file, accept, onFile,
}: { label: string; cta: string; file: File | null; accept: string; onFile: (f: File | null) => void }) {
  return (
    <div className="mb-5">
      <span className="mb-2 block text-sm font-semibold text-slate-600">{label}</span>
      <label className="flex h-11 cursor-pointer items-center gap-2 rounded-md border border-dashed border-slate-300 px-3 text-[15px] text-slate-600 hover:bg-slate-50 focus-within:ring-2 focus-within:ring-primary/30">
        <Upload className="h-4 w-4 shrink-0" />
        <span className="truncate">{file ? file.name : cta}</span>
        <input type="file" accept={accept} className="sr-only" onChange={e => onFile(e.target.files?.[0] || null)} />
      </label>
    </div>
  );
}
