import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, FileText, Loader2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';

const db = supabase as any;
const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

// Supplier side of business verification: send company details and documents, see the decision.
export default function SupplierVerification({ vendor }: { vendor: { id: string; store_name: string; is_approved: boolean | null } }) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [businessName, setBusinessName] = useState(vendor.store_name || '');
  const [registration, setRegistration] = useState('');
  const [address, setAddress] = useState('');
  const [files, setFiles] = useState<File[]>([]);

  const { data: latest, isLoading } = useQuery({
    queryKey: ['my-verification', vendor.id],
    queryFn: async () => {
      const { data, error } = await db.from('vendor_verification_requests').select('*').eq('vendor_id', vendor.id).order('created_at', { ascending: false }).limit(1);
      if (error) throw error;
      return (data?.[0] ?? null) as { status: 'pending' | 'approved' | 'rejected'; admin_note: string | null; created_at: string } | null;
    },
  });

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (!OK_TYPES.includes(f.type)) { toast.error(`${f.name}: use a PDF, JPG, PNG or WebP`); continue; }
      if (f.size > MAX_BYTES) { toast.error(`${f.name} is larger than 10 MB`); continue; }
      if (next.length < MAX_FILES) next.push(f);
    }
    setFiles(next);
  };

  const submit = useMutation({
    mutationFn: async () => {
      if (businessName.trim().length < 2) throw new Error('Enter your registered business name');
      if (!files.length) throw new Error('Attach at least one business document');
      const paths: string[] = [];
      for (const f of files) {
        const ext = (f.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'pdf';
        const path = `${vendor.id}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from('vendor-verification').upload(path, f, { contentType: f.type });
        if (error) throw new Error(`Could not upload ${f.name}`);
        paths.push(path);
      }
      const { error } = await db.rpc('submit_vendor_verification', { _business_name: businessName, _registration: registration, _address: address, _paths: paths });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success('Sent. We will review your documents.'); setFiles([]); queryClient.invalidateQueries({ queryKey: ['my-verification', vendor.id] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return null;
  const pending = latest?.status === 'pending';
  return (
    <section className="mt-6 rounded-lg bg-card p-5 card-shadow">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-heading text-lg font-semibold">Business verification</h3>
        {vendor.is_approved && <Badge className="gap-1"><BadgeCheck className="h-3.5 w-3.5" /> Verified</Badge>}
        {pending && <Badge variant="secondary">Under review</Badge>}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Verified suppliers get a badge on their shop, products and quotations, and buyers trust them more. Send your business registration documents (for example a CAC certificate) and your business address proof.</p>
      {latest?.status === 'rejected' && (
        <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">Your last submission was not approved{latest.admin_note ? `: ${latest.admin_note}` : '.'} You can fix it and send again.</p>
      )}
      {pending ? (
        <p className="mt-3 text-sm text-muted-foreground">Your documents were sent on {new Date(latest!.created_at).toLocaleDateString()}. You will be notified when they have been reviewed.</p>
      ) : vendor.is_approved ? (
        <p className="mt-3 text-sm text-muted-foreground">Your business is verified.</p>
      ) : (
        <form className="mt-4 space-y-3" onSubmit={e => { e.preventDefault(); submit.mutate(); }}>
          <div><Label htmlFor="vv-name">Registered business name</Label><Input id="vv-name" value={businessName} onChange={e => setBusinessName(e.target.value)} maxLength={200} required /></div>
          <div><Label htmlFor="vv-reg">Registration number (RC / BN)</Label><Input id="vv-reg" value={registration} onChange={e => setRegistration(e.target.value)} maxLength={60} /></div>
          <div><Label htmlFor="vv-addr">Business address</Label><Input id="vv-addr" value={address} onChange={e => setAddress(e.target.value)} maxLength={500} /></div>
          <div>
            <Label>Documents (up to {MAX_FILES}, PDF or image, 10 MB each)</Label>
            <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple className="hidden" onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={files.length >= MAX_FILES}><Upload className="mr-1.5 h-3.5 w-3.5" /> Add document</Button>
              {files.map((f, i) => (
                <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs">
                  <FileText className="h-3 w-3" /> {f.name.slice(0, 24)}
                  <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
          </div>
          <Button type="submit" disabled={submit.isPending}>{submit.isPending ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Sending...</> : 'Send for verification'}</Button>
        </form>
      )}
    </section>
  );
}
