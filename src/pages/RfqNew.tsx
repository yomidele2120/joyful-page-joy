import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useCategories } from '@/hooks/useProducts';
import { useCreateRfq } from '@/hooks/useRfqs';

export default function RfqNew() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { data: categories } = useCategories();
  const create = useCreateRfq();
  const [form, setForm] = useState({
    title: '', description: '', category: 'none', quantity: '', unit: 'Piece', targetPrice: '', destination: '',
  });
  const set = (key: keyof typeof form, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  if (loading) return <Layout><div className="container py-16 text-center text-muted-foreground">Loading...</div></Layout>;

  if (!user) {
    return (
      <Layout>
        <div className="container py-16 text-center">
          <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
          <h1 className="font-heading text-2xl font-bold">Sign in to post a request</h1>
          <p className="mb-5 mt-2 text-sm text-muted-foreground">Tell suppliers what you need and receive quotations from verified sellers.</p>
          <Link to="/users-login"><Button>Sign in</Button></Link>
        </div>
      </Layout>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const quantity = Math.floor(Number(form.quantity));
    if (!(quantity > 0)) { toast.error('Enter the quantity you need'); return; }
    const target = form.targetPrice.trim() ? Number(form.targetPrice) : null;
    if (target !== null && !(target >= 0)) { toast.error('Enter a valid target price'); return; }

    create.mutate({
      title: form.title.trim(),
      description: form.description.trim(),
      category_id: form.category === 'none' ? null : form.category,
      quantity,
      unit: form.unit.trim() || 'Piece',
      target_price: target,
      destination: form.destination.trim() || null,
    }, {
      onSuccess: () => { toast.success('Your request has been posted'); navigate('/rfq'); },
      onError: (err: Error) => toast.error(err.message || 'Could not post your request'),
    });
  };

  return (
    <Layout>
      <div className="container max-w-2xl py-6">
        <h1 className="font-heading text-2xl font-bold sm:text-3xl">Post a request for quotation</h1>
        <p className="mt-1 text-sm text-muted-foreground">Describe what you need. Verified suppliers can reply with their price, MOQ and lead time. Your request stays open for 30 days.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4 rounded-lg border border-border bg-card p-5">
          <div className="space-y-1.5">
            <Label htmlFor="rfq-title">What are you looking for?</Label>
            <Input id="rfq-title" value={form.title} onChange={e => set('title', e.target.value)} minLength={3} maxLength={200} placeholder="e.g. 500 cartons of 20L vegetable oil" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rfq-desc">Details</Label>
            <Textarea id="rfq-desc" rows={5} value={form.description} onChange={e => set('description', e.target.value)} maxLength={4000} placeholder="Specifications, quality, packaging, certifications, deadline..." required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Category (optional)</Label>
              <Select value={form.category} onValueChange={v => set('category', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not sure</SelectItem>
                  {categories?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rfq-dest">Delivery location (optional)</Label>
              <Input id="rfq-dest" value={form.destination} onChange={e => set('destination', e.target.value)} placeholder="e.g. Lagos" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rfq-qty">Quantity</Label>
              <Input id="rfq-qty" type="number" min={1} value={form.quantity} onChange={e => set('quantity', e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rfq-unit">Unit</Label>
              <Input id="rfq-unit" value={form.unit} onChange={e => set('unit', e.target.value)} placeholder="Piece, Carton, Kg..." />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="rfq-price">Target price per unit in naira (optional)</Label>
              <Input id="rfq-price" type="number" min={0} value={form.targetPrice} onChange={e => set('targetPrice', e.target.value)} />
            </div>
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={create.isPending}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Post request
          </Button>
        </form>
      </div>
    </Layout>
  );
}
