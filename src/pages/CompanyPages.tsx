import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2, Mail, MapPin, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import LegalPage, { Fill, Section } from '@/components/legal/LegalPage';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BUSINESS } from '@/config/business';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatNaira } from '@/lib/format';

const B = BUSINESS;
const mail = <a href={`mailto:${B.email}`} className="text-primary hover:underline">{B.email}</a>;

// ---------------------------------------------------------------- About
export function AboutUs() {
  return (
    <LegalPage title="About Us" showUpdated={false} related={['/terms', '/privacy-policy', '/seller-agreement']}>
      <Section title="What we do">
        <p>{B.brand} is an online marketplace where buyers and independent suppliers do business. Buyers can browse products, see quantity prices and minimum orders, talk to suppliers, ask for quotations and pay securely. Suppliers can open a store, list products and receive orders.</p>
      </Section>
      <Section title="For buyers">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Browse products with clear prices, minimum order quantities and supplier details.</li>
          <li>Send an inquiry, chat with a supplier, or post a request for quotation (RFQ) and compare the quotes you receive.</li>
          <li>Pay through Paystack. Where it is available and you are eligible, pay later in instalments through Klump.</li>
          <li>Order goods that are not in stock yet as a preorder, and follow them under My orders.</li>
          <li>Get help from us if something goes wrong: see our <Link to="/dispute-resolution" className="text-primary hover:underline">dispute process</Link>.</li>
        </ul>
      </Section>
      <Section title="For suppliers">
        <p>Suppliers apply for a store, are reviewed before their products go live, set their own prices and minimum orders, and are paid out under the rules in the <Link to="/seller-agreement" className="text-primary hover:underline">Seller Agreement</Link>.</p>
      </Section>
      <Section title="Company details">
        <ul className="space-y-1">
          <li>Registered name: <Fill value={B.legalName} label="registered company name" /></li>
          <li>Registration number: <Fill value={B.registrationNumber} label="CAC number" /></li>
          <li>Address: {B.addressLines.join(' ')}</li>
          <li>Phone: <a href={B.phoneHref} className="text-primary hover:underline">{B.phone}</a></li>
          <li>Email: {mail}</li>
          <li>Website: {B.website}</li>
        </ul>
      </Section>
    </LegalPage>
  );
}

// ---------------------------------------------------------------- Contact
const CATEGORIES: { value: string; label: string }[] = [
  { value: 'general', label: 'General question' },
  { value: 'order', label: 'Problem with an order' },
  { value: 'payment', label: 'Payment or refund' },
  { value: 'account', label: 'My account' },
  { value: 'complaint', label: 'Make a complaint' },
  { value: 'seller_report', label: 'Report a seller' },
  { value: 'listing_report', label: 'Report a product listing' },
  { value: 'other', label: 'Something else' },
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS_LABEL: Record<string, string> = { open: 'Open', in_progress: 'In progress', resolved: 'Resolved', closed: 'Closed' };

export function ContactUs() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const type = params.get('type') ?? '';
  const vendorRef = params.get('vendor');
  const productRef = params.get('product');
  const orderRef = params.get('order');

  const [form, setForm] = useState({
    name: '', email: '',
    category: CATEGORIES.some(c => c.value === type) ? type : 'general',
    subject: '', message: '', orderId: UUID.test(orderRef ?? '') ? (orderRef as string) : 'none',
  });
  const set = (key: keyof typeof form, value: string) => setForm(f => ({ ...f, [key]: value }));
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  // Fill in what we already know for signed-in people.
  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('full_name').eq('user_id', user.id).maybeSingle().then(({ data }) => {
      setForm(f => ({ ...f, name: f.name || data?.full_name || '', email: f.email || user.email || '' }));
    });
  }, [user]);

  const { data: myOrders } = useQuery({
    queryKey: ['contact-orders', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('orders').select('id, total, created_at').eq('user_id', user!.id).order('created_at', { ascending: false }).limit(20);
      if (error) throw error;
      return data;
    },
  });
  const { data: myTickets, refetch } = useQuery({
    queryKey: ['my-tickets', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('support_tickets').select('id, subject, status, admin_reply, created_at').eq('user_id', user!.id).order('created_at', { ascending: false }).limit(10);
      if (error) throw error;
      return data;
    },
  });

  const reporting = useMemo(() => {
    if (form.category === 'seller_report' && UUID.test(vendorRef ?? '')) return 'a seller';
    if (form.category === 'listing_report' && UUID.test(productRef ?? '')) return 'a product listing';
    return null;
  }, [form.category, vendorRef, productRef]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    const { error } = await supabase.from('support_tickets').insert({
      name: form.name.trim(),
      email: form.email.trim(),
      category: form.category,
      subject: form.subject.trim(),
      message: form.message.trim(),
      order_id: form.orderId !== 'none' ? form.orderId : null,
      vendor_id: form.category === 'seller_report' && UUID.test(vendorRef ?? '') ? vendorRef : null,
      product_id: form.category === 'listing_report' && UUID.test(productRef ?? '') ? productRef : null,
    });
    setSending(false);
    if (error) { toast.error(error.message || 'We could not send your message. Please try again.'); return; }
    setDone(true);
    if (user) refetch();
  };

  return (
    <LegalPage title="Contact Us" showUpdated={false} related={['/dispute-resolution', '/returns-policy']}>
      <div className="mt-6 grid gap-8 md:grid-cols-[minmax(0,1fr)_260px]">
        <div>
          {done ? (
            <div role="status" className="border border-border bg-card p-6">
              <p className="font-heading text-lg font-semibold">Thank you, we have your message</p>
              <p className="mt-2 text-sm text-muted-foreground">We will reply to {form.email.trim()}. {user ? 'Updates also appear in your notifications.' : ''}</p>
              <Button className="mt-4" variant="outline" onClick={() => { setDone(false); setForm(f => ({ ...f, subject: '', message: '' })); }}>Send another message</Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {reporting && <p className="border border-border bg-secondary/50 p-3 text-sm">You are reporting {reporting}. The reference is attached automatically; please tell us what is wrong.</p>}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="c-name">Your name</Label><Input id="c-name" value={form.name} onChange={e => set('name', e.target.value)} maxLength={120} required autoComplete="name" /></div>
                <div className="space-y-1.5"><Label htmlFor="c-email">Email</Label><Input id="c-email" type="email" value={form.email} onChange={e => set('email', e.target.value)} maxLength={200} required autoComplete="email" /></div>
              </div>
              <div className="space-y-1.5">
                <Label>What is this about?</Label>
                <Select value={form.category} onValueChange={v => set('category', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {user && !!myOrders?.length && (
                <div className="space-y-1.5">
                  <Label>Related order (optional)</Label>
                  <Select value={form.orderId} onValueChange={v => set('orderId', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not about a specific order</SelectItem>
                      {myOrders.map(o => <SelectItem key={o.id} value={o.id}>#{o.id.slice(0, 8).toUpperCase()} - {formatNaira(o.total)} - {new Date(o.created_at).toLocaleDateString()}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5"><Label htmlFor="c-subject">Subject</Label><Input id="c-subject" value={form.subject} onChange={e => set('subject', e.target.value)} minLength={3} maxLength={200} required /></div>
              <div className="space-y-1.5"><Label htmlFor="c-message">Message</Label><Textarea id="c-message" rows={6} value={form.message} onChange={e => set('message', e.target.value)} minLength={3} maxLength={4000} required /></div>
              <Button type="submit" disabled={sending}>{sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Send message</Button>
              <p className="text-xs text-muted-foreground">We use your details only to answer this request. See the <Link to="/privacy-policy" className="text-primary hover:underline">Privacy Policy</Link>.</p>
            </form>
          )}

          {user && !!myTickets?.length && (
            <section className="mt-10">
              <h2 className="font-heading text-lg font-semibold">Your recent requests</h2>
              <ul className="mt-3 divide-y divide-border border border-border">
                {myTickets.map(t => (
                  <li key={t.id} className="p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{t.subject}</span>
                      <Badge variant="secondary" className="rounded-full">{STATUS_LABEL[t.status] ?? t.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</p>
                    {t.admin_reply && <p className="mt-2 whitespace-pre-wrap border-l-2 border-primary pl-3 text-muted-foreground">{t.admin_reply}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-3 text-sm">
          <p className="font-heading font-semibold">Other ways to reach us</p>
          <p className="flex gap-2"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {mail}</p>
          <p className="flex gap-2"><Phone className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> <a href={B.phoneHref} className="text-primary hover:underline">{B.phone}</a></p>
          <p className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> <span className="text-muted-foreground">{B.addressLines.join(' ')}</span></p>
          <p className="border-t border-border pt-3 text-xs text-muted-foreground">Problem with a paid order? You can also open a dispute from <Link to="/my-orders" className="text-primary hover:underline">My orders</Link>.</p>
        </aside>
      </div>
    </LegalPage>
  );
}

// ---------------------------------------------------------------- FAQ
const FAQ: { group: string; items: { q: string; a: React.ReactNode }[] }[] = [
  {
    group: 'Buying',
    items: [
      { q: 'What does MOQ mean?', a: 'MOQ is the minimum order quantity: the smallest number of units a supplier will sell in one order. Some products also get cheaper per unit as you order more. The price for your quantity is shown on the product page and checked again when you order.' },
      { q: 'Is VAT included in the price?', a: 'No. Prices are shown before VAT. VAT of 7.5% is added at checkout and shown before you pay.' },
      { q: 'How do I ask a supplier a question before buying?', a: 'Use Chat now or Send inquiry on the product page. If you cannot find a product, post a request for quotation (RFQ) and suppliers can send you quotes.' },
      { q: 'Is delivery included?', a: <>The checkout total is the goods plus VAT. Delivery charges and times are set by each supplier, so confirm them before you order. See the <Link to="/shipping-policy" className="text-primary hover:underline">Shipping and Delivery Policy</Link>.</> },
      { q: 'How do I follow my order?', a: <>Open <Link to="/my-orders" className="text-primary hover:underline">My orders</Link>. You also get a notification each time the status changes.</> },
    ],
  },
  {
    group: 'Paying',
    items: [
      { q: 'How can I pay?', a: 'Through Paystack at checkout. Where it is available and your cart is eligible, you can choose to pay later in instalments with Klump.' },
      { q: 'Who approves Pay later?', a: <>Klump decides, not us. Being shown the option does not guarantee approval. Read the <Link to="/bnpl-terms" className="text-primary hover:underline">BNPL Terms</Link> and see which products are eligible on the <Link to="/pay-later" className="text-primary hover:underline">Pay later page</Link>.</> },
      { q: 'Are my card details stored?', a: 'No. Card and bank details are entered on Paystack\'s or Klump\'s secure screens and are not stored by us.' },
    ],
  },
  {
    group: 'Preorders',
    items: [
      { q: 'What is a preorder?', a: <>You pay now for goods that are not in stock yet, and the supplier delivers when they arrive. See the <Link to="/preorder-policy" className="text-primary hover:underline">Preorder Policy</Link> and browse <Link to="/preorders" className="text-primary hover:underline">preorders</Link>.</> },
      { q: 'What if the date changes?', a: 'You are notified. If the new date is much later you can ask to cancel for a refund. The Preorder Policy shows the exact rule.' },
    ],
  },
  {
    group: 'Returns, refunds and problems',
    items: [
      { q: 'How do I cancel an order or ask for a refund?', a: <>Go to <Link to="/my-orders" className="text-primary hover:underline">My orders</Link> and choose Request cancellation or Request refund. Our <Link to="/returns-policy" className="text-primary hover:underline">Return, Refund and Cancellation Policy</Link> explains how requests are reviewed.</> },
      { q: 'What if the seller and I cannot agree?', a: <>Open a dispute from My orders. We review both sides and decide. See the <Link to="/dispute-resolution" className="text-primary hover:underline">Dispute Resolution Policy</Link>.</> },
      { q: 'How do I report a seller or a listing?', a: <>Use the <Link to="/contact?type=complaint" className="text-primary hover:underline">contact form</Link>, or the report link on a product or seller page.</> },
    ],
  },
  {
    group: 'Selling',
    items: [
      { q: 'How do I become a supplier?', a: <>Create a supplier account. Your store is reviewed before products go live. See the <Link to="/seller-agreement" className="text-primary hover:underline">Seller Agreement</Link>.</> },
      { q: 'How and when am I paid?', a: 'Earnings for an order are held until the buyer has paid, the order is delivered and a hold period has passed, then paid by bank transfer to your verified account. The Seller Agreement has the details.' },
      { q: 'Can I offer Pay later or preorders?', a: 'Yes, where the platform has enabled them and the product qualifies. You switch them on per product in your dashboard; preorder listings need approval.' },
    ],
  },
  {
    group: 'Your account and data',
    items: [
      { q: 'I forgot my password.', a: <>Use <Link to="/forgot-password" className="text-primary hover:underline">Forgot your password?</Link> and we will email you a reset link.</> },
      { q: 'How is my data used?', a: <>See the <Link to="/privacy-policy" className="text-primary hover:underline">Privacy Policy</Link> and <Link to="/cookie-policy" className="text-primary hover:underline">Cookie Policy</Link>. You can change your cookie choice any time from the footer.</> },
    ],
  },
];

export function Faq() {
  return (
    <LegalPage title="Frequently Asked Questions" showUpdated={false} related={['/terms', '/returns-policy', '/shipping-policy']}>
      <div className="mt-6 space-y-8">
        {FAQ.map(section => (
          <section key={section.group}>
            <h2 className="font-heading text-lg font-semibold">{section.group}</h2>
            <Accordion type="multiple" className="mt-2">
              {section.items.map((item, i) => (
                <AccordionItem key={item.q} value={`${section.group}-${i}`}>
                  <AccordionTrigger className="text-left text-sm">{item.q}</AccordionTrigger>
                  <AccordionContent className="text-sm leading-7 text-muted-foreground">{item.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>
        ))}
      </div>
      <p className="mt-8 text-sm text-muted-foreground">Still stuck? <Link to="/contact" className="text-primary hover:underline">Contact us</Link>.</p>
    </LegalPage>
  );
}
