import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ClipboardList, Inbox, Loader2, MessageSquare, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useInquiryBasket } from '@/contexts/InquiryBasketContext';
import {
  submitInquiry, useMyInquiries, useUpdateInquiryStatus, useVendorInquiries, type InquiryRow, type InquiryStatus,
} from '@/hooks/useInquiries';

const STATUS_STYLE: Record<InquiryStatus, string> = {
  open: 'bg-accent/15 text-accent-foreground',
  replied: 'bg-primary/10 text-primary',
  closed: 'bg-secondary text-muted-foreground',
};

export default function Inquiries() {
  const { user, isVendor, loading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const basket = useInquiryBasket();
  const defaultTab = searchParams.get('tab') || (isVendor ? 'received' : 'sent');

  if (loading) return <Layout><div className="container py-16 text-center text-muted-foreground">Loading...</div></Layout>;

  if (!user) {
    return (
      <Layout>
        <div className="container py-16 text-center">
          <Inbox className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
          <h1 className="font-heading text-2xl font-bold">Sign in to view your inquiries</h1>
          <p className="mb-5 mt-2 text-sm text-muted-foreground">Your sent inquiries and your inquiry basket are tied to your account.</p>
          <Link to="/users-login"><Button>Sign in</Button></Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container max-w-4xl py-6">
        <h1 className="font-heading text-2xl font-bold sm:text-3xl">Inquiries</h1>
        <Tabs value={defaultTab} onValueChange={tab => setSearchParams({ tab })} className="mt-5">
          <TabsList>
            {isVendor && <TabsTrigger value="received">Received</TabsTrigger>}
            <TabsTrigger value="sent">Sent</TabsTrigger>
            <TabsTrigger value="basket">Basket{basket.count > 0 ? ` (${basket.count})` : ''}</TabsTrigger>
          </TabsList>
          {isVendor && <TabsContent value="received"><ReceivedList /></TabsContent>}
          <TabsContent value="sent"><SentList /></TabsContent>
          <TabsContent value="basket"><BasketPanel /></TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

function InquiryCard({ inquiry, children }: { inquiry: InquiryRow; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <img src={inquiry.products?.image_url || '/placeholder.svg'} alt="" className="h-14 w-14 shrink-0 rounded-md bg-white object-contain" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {inquiry.products ? (
              <Link to={`/product/${inquiry.products.slug}`} className="truncate text-sm font-semibold hover:text-primary">{inquiry.products.name}</Link>
            ) : (
              <span className="text-sm font-semibold">General inquiry</span>
            )}
            <Badge className={`border-none text-[10px] capitalize ${STATUS_STYLE[inquiry.status]}`}>{inquiry.status}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Qty {inquiry.quantity} {inquiry.products?.unit ? `${inquiry.products.unit}(s)` : ''} - {new Date(inquiry.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">{inquiry.message}</p>
      {children}
    </div>
  );
}

function SentList() {
  const { data, isLoading } = useMyInquiries();
  if (isLoading) return <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>;
  if (!data?.length) {
    return <EmptyState text="You have not sent any inquiries yet. Open a product and tap Send inquiry." />;
  }
  return (
    <div className="mt-4 space-y-3">
      {data.map(inquiry => (
        <InquiryCard key={inquiry.id} inquiry={inquiry}>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
            <span>To: <span className="font-medium text-foreground">{inquiry.vendors?.store_name || 'Supplier'}</span></span>
            {inquiry.vendors?.user_id && (
              <Link to={`/messages?vendor=${inquiry.vendors.user_id}`}>
                <Button size="sm" variant="outline" className="gap-1.5"><MessageSquare className="h-3.5 w-3.5" /> Open chat</Button>
              </Link>
            )}
          </div>
        </InquiryCard>
      ))}
    </div>
  );
}

function ReceivedList() {
  const { data, isLoading } = useVendorInquiries();
  const update = useUpdateInquiryStatus();
  if (isLoading) return <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>;
  if (!data?.length) return <EmptyState text="No inquiries have been sent to your store yet." />;
  return (
    <div className="mt-4 space-y-3">
      {data.map(inquiry => (
        <InquiryCard key={inquiry.id} inquiry={inquiry}>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <span className="text-xs text-muted-foreground">From: <span className="font-medium text-foreground">{inquiry.buyer_name || 'Buyer'}</span></span>
            <div className="flex items-center gap-2">
              <Select
                value={inquiry.status}
                onValueChange={status => update.mutate({ id: inquiry.id, status: status as InquiryStatus }, { onError: () => toast.error('Could not update status') })}
              >
                <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="replied">Replied</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
              <Link to={`/messages?vendor=${inquiry.buyer_id}${inquiry.product_id ? `&product=${inquiry.product_id}` : ''}`}>
                <Button size="sm" className="gap-1.5"><MessageSquare className="h-3.5 w-3.5" /> Reply</Button>
              </Link>
            </div>
          </div>
        </InquiryCard>
      ))}
    </div>
  );
}

function BasketPanel() {
  const { user } = useAuth();
  const basket = useInquiryBasket();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('Hello, please send me your best price, availability and delivery time for the products below.');
  const [sending, setSending] = useState(false);

  if (!basket.items.length) {
    return <EmptyState icon="basket" text="Your inquiry basket is empty. Add products to it from a product page to ask several suppliers at once." />;
  }

  const handleSend = async () => {
    if (!user) return;
    const sendable = basket.items.filter(i => i.vendor_user_id && i.vendor_user_id !== user.id);
    if (!sendable.length) { toast.error('There is nothing in your basket that can be sent'); return; }
    if (!message.trim()) { toast.error('Please write a message for the suppliers'); return; }

    setSending(true);
    let sent = 0;
    for (const item of sendable) {
      try {
        await submitInquiry(user.id, {
          vendorId: item.vendor_id,
          vendorUserId: item.vendor_user_id!,
          productId: item.product_id,
          productName: item.name,
          quantity: Math.max(item.quantity, item.moq),
        }, message);
        basket.remove(item.product_id);
        sent += 1;
      } catch {
        toast.error(`Could not send the inquiry for "${item.name}"`);
      }
    }
    setSending(false);
    queryClient.invalidateQueries({ queryKey: ['inquiries'] });
    if (sent) {
      toast.success(`${sent} inquiry${sent > 1 ? ' messages' : ''} sent`);
      navigate('/inquiries?tab=sent');
    }
  };

  return (
    <div className="mt-4 space-y-3">
      {basket.items.map(item => (
        <div key={item.product_id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
          <img src={item.image_url || '/placeholder.svg'} alt="" className="h-14 w-14 shrink-0 rounded-md bg-white object-contain" />
          <div className="min-w-0 flex-1">
            <Link to={`/product/${item.slug}`} className="block truncate text-sm font-semibold hover:text-primary">{item.name}</Link>
            <p className="truncate text-xs text-muted-foreground">{item.vendor_name || 'Supplier'} - MOQ {item.moq}</p>
          </div>
          <Input
            type="number"
            min={item.moq}
            value={item.quantity}
            onChange={e => basket.setQuantity(item.product_id, Number(e.target.value))}
            onBlur={() => basket.setQuantity(item.product_id, Math.max(item.quantity, item.moq))}
            aria-label={`Quantity for ${item.name}`}
            className="h-9 w-20 text-center"
          />
          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => basket.remove(item.product_id)} aria-label={`Remove ${item.name}`}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}

      <div className="rounded-lg border border-border bg-card p-4">
        <p className="mb-2 text-sm font-medium">Message to all suppliers</p>
        <Textarea rows={4} value={message} onChange={e => setMessage(e.target.value)} maxLength={4000} />
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="outline" onClick={() => basket.clear()} disabled={sending}>Clear basket</Button>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Send {basket.items.length} inquir{basket.items.length === 1 ? 'y' : 'ies'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ text, icon }: { text: string; icon?: 'basket' }) {
  const Icon = icon === 'basket' ? ClipboardList : Inbox;
  return (
    <div className="mt-4 rounded-lg border border-dashed border-border py-14 text-center">
      <Icon className="mx-auto mb-2 h-9 w-9 text-muted-foreground/40" />
      <p className="mx-auto max-w-sm text-sm text-muted-foreground">{text}</p>
      <Link to="/products"><Button variant="outline" size="sm" className="mt-4">Browse products</Button></Link>
    </div>
  );
}
