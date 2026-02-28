import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Store, Upload } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export default function SupplierSignup() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    fullName: '', email: '', password: '', confirmPassword: '',
    phone: '', whatsappNumber: '', companyName: '', companyAddress: '',
    storeDescription: '', productCategories: '',
    bankName: '', bankAccountNumber: '', bankAccountName: '',
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [docFile, setDocFile] = useState<File | null>(null);

  const update = (key: string, value: string) => setForm(p => ({ ...p, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      // 1. Create auth user (email verification disabled globally)
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { full_name: form.fullName } },
      });
      if (authError) throw authError;
      if (!authData.user) throw new Error('Signup failed');

      const userId = authData.user.id;

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

      // 3. Upload verification doc
      let docUrl = null;
      if (docFile) {
        const ext = docFile.name.split('.').pop();
        const path = `${userId}/verification.${ext}`;
        const { error: uploadErr } = await supabase.storage.from('vendor-assets').upload(path, docFile);
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from('vendor-assets').getPublicUrl(path);
          docUrl = urlData.publicUrl;
        }
      }

      // 4. Create vendor record
      const categories = form.productCategories.split(',').map(c => c.trim()).filter(Boolean);
      const { error: vendorError } = await supabase.from('vendors').insert({
        user_id: userId,
        store_name: form.companyName,
        store_description: form.storeDescription || null,
        phone: form.phone,
        whatsapp_number: form.whatsappNumber,
        company_name: form.companyName,
        address: form.companyAddress,
        logo_url: logoUrl,
        product_categories: categories.length ? categories : null,
        bank_name: form.bankName || null,
        bank_account_number: form.bankAccountNumber || null,
        bank_account_name: form.bankAccountName || null,
        verification_document_url: docUrl,
        is_approved: false,
      });
      if (vendorError) throw vendorError;

      // 5. Assign vendor role
      const { error: roleError } = await supabase.from('user_roles').insert({
        user_id: userId,
        role: 'vendor',
      });
      if (roleError) console.error('Role assignment:', roleError);

      toast.success('Supplier account created! You can now sign in.');
      navigate('/suppliers-login');
    } catch (err: any) {
      toast.error(err.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="container max-w-2xl py-12">
        <div className="bg-card p-8 rounded-lg card-shadow">
          <div className="flex items-center gap-2 mb-6">
            <Store className="w-6 h-6 text-primary" />
            <h1 className="font-heading text-2xl font-bold">Become a Supplier</h1>
          </div>

          {/* Progress */}
          <div className="flex items-center gap-2 mb-8">
            {[1, 2, 3].map(s => (
              <div key={s} className={`flex-1 h-1.5 rounded-full ${s <= step ? 'bg-primary' : 'bg-secondary'}`} />
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {step === 1 && (
              <SignupStep1 form={form} update={update} onNext={() => {
                if (!form.fullName || !form.email || !form.password || !form.phone || !form.whatsappNumber) {
                  toast.error('Please fill all required fields'); return;
                }
                if (form.password !== form.confirmPassword) {
                  toast.error('Passwords do not match'); return;
                }
                setStep(2);
              }} />
            )}
            {step === 2 && (
              <SignupStep2 form={form} update={update} logoFile={logoFile} setLogoFile={setLogoFile}
                docFile={docFile} setDocFile={setDocFile}
                onBack={() => setStep(1)} onNext={() => {
                  if (!form.companyName || !form.companyAddress) {
                    toast.error('Please fill required fields'); return;
                  }
                  setStep(3);
                }} />
            )}
            {step === 3 && (
              <SignupStep3 form={form} update={update} loading={loading}
                onBack={() => setStep(2)} />
            )}
          </form>

          <div className="mt-6 pt-4 border-t border-border text-center">
            <Link to="/suppliers-login" className="text-sm text-primary hover:underline">
              Already have a supplier account? Sign In
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function SignupStep1({ form, update, onNext }: { form: any; update: (k: string, v: string) => void; onNext: () => void }) {
  return (
    <>
      <h2 className="font-heading font-semibold text-lg mb-2">Account Details</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><Label>Full Name *</Label><Input value={form.fullName} onChange={e => update('fullName', e.target.value)} required /></div>
        <div><Label>Email *</Label><Input type="email" value={form.email} onChange={e => update('email', e.target.value)} required /></div>
        <div><Label>Password *</Label><Input type="password" value={form.password} onChange={e => update('password', e.target.value)} required minLength={6} /></div>
        <div><Label>Confirm Password *</Label><Input type="password" value={form.confirmPassword} onChange={e => update('confirmPassword', e.target.value)} required minLength={6} /></div>
        <div><Label>Phone Number *</Label><Input value={form.phone} onChange={e => update('phone', e.target.value)} required placeholder="+234..." /></div>
        <div><Label>WhatsApp Number *</Label><Input value={form.whatsappNumber} onChange={e => update('whatsappNumber', e.target.value)} required placeholder="+234..." /></div>
      </div>
      <Button type="button" onClick={onNext} className="w-full">Next: Company Details</Button>
    </>
  );
}

function SignupStep2({ form, update, logoFile, setLogoFile, docFile, setDocFile, onBack, onNext }: any) {
  return (
    <>
      <h2 className="font-heading font-semibold text-lg mb-2">Company Details</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><Label>Company Name *</Label><Input value={form.companyName} onChange={e => update('companyName', e.target.value)} required /></div>
        <div><Label>Company Address *</Label><Input value={form.companyAddress} onChange={e => update('companyAddress', e.target.value)} required /></div>
        <div className="col-span-full"><Label>Product Categories</Label><Input value={form.productCategories} onChange={e => update('productCategories', e.target.value)} placeholder="Laptops, Phones, Accessories (comma separated)" /></div>
        <div className="col-span-full"><Label>Store Description</Label><Textarea value={form.storeDescription} onChange={e => update('storeDescription', e.target.value)} placeholder="Tell buyers about your business..." /></div>
        <div>
          <Label>Company Logo</Label>
          <div className="mt-1">
            <label className="flex items-center gap-2 px-4 py-2 rounded-md border border-border cursor-pointer hover:bg-secondary transition-colors text-sm">
              <Upload className="w-4 h-4" />
              {logoFile ? logoFile.name : 'Upload Logo'}
              <input type="file" accept="image/*" className="hidden" onChange={e => setLogoFile(e.target.files?.[0] || null)} />
            </label>
          </div>
        </div>
        <div>
          <Label>Verification Document</Label>
          <div className="mt-1">
            <label className="flex items-center gap-2 px-4 py-2 rounded-md border border-border cursor-pointer hover:bg-secondary transition-colors text-sm">
              <Upload className="w-4 h-4" />
              {docFile ? docFile.name : 'Upload Document'}
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => setDocFile(e.target.files?.[0] || null)} />
            </label>
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onBack}>Back</Button>
        <Button type="button" className="flex-1" onClick={onNext}>Next: Bank Details</Button>
      </div>
    </>
  );
}

function SignupStep3({ form, update, loading, onBack }: any) {
  return (
    <>
      <h2 className="font-heading font-semibold text-lg mb-2">Bank Details</h2>
      <p className="text-sm text-muted-foreground mb-4">For receiving payments from sales</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><Label>Bank Name</Label><Input value={form.bankName} onChange={e => update('bankName', e.target.value)} /></div>
        <div><Label>Account Number</Label><Input value={form.bankAccountNumber} onChange={e => update('bankAccountNumber', e.target.value)} /></div>
        <div className="col-span-full"><Label>Account Name</Label><Input value={form.bankAccountName} onChange={e => update('bankAccountName', e.target.value)} /></div>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onBack}>Back</Button>
        <Button type="submit" className="flex-1" disabled={loading}>
          {loading ? 'Creating Account...' : 'Create Supplier Account'}
        </Button>
      </div>
    </>
  );
}
