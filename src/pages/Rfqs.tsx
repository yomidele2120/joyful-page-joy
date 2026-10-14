import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BadgeCheck, FileText, Loader2, MessageSquare, Plus } from 'lucide-react';
import { toast } from 'sonner';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { useMyVendor } from '@/hooks/useMyVendor';
import {
  useCloseRfq, useMyQuotes, useMyRfqs, useOpenRfqs, useRfqQuotes, useSubmitQuote, type RfqRow,
} from '@/hooks/useRfqs';
import { formatNaira } from '@/lib/format';

export default function Rfqs() {
  const { user, isVendor, loading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'mine';

  if (loading) return <Layout><div className="container py-16 text-center text-muted-foreground">Loading...</div></Layout>;

  if (!user) {
    return (
      <Layout>
        <div className="container py-16 text-center">
          <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
          <h1 className="font-heading text-2xl font-bold">Sign in to see your quotations</h1>
          <Link to="/users-login"><Button className="mt-5">Sign in</Button></Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container max-w-4xl py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-heading text-2xl font-bold sm:text-3xl">Quotations</h1>
          <Link to="/rfq/new"><Button className="gap-1.5"><Plus className="h-4 w-4" /> Post a request</Button></Link>
        </div>
        <Tabs value={tab} onValueChange={t => setSearchParams({ tab: t })} className="mt-5">
          <TabsList>
            <TabsTrigger value="mine">My requests</TabsTrigger>
            {isVendor && <TabsTrigger value="open">Open requests</TabsTrigger>}
          </TabsList>
          <TabsContent value="mine"><MyRequests highlightId={searchParams.get('id')} /></TabsContent>
          {isVendor && <TabsContent value="open"><OpenRequests /></TabsContent>}
        </Tabs>
      </div>
    </Layout>
  );
}

function RfqSummary({ rfq }: { rfq: RfqRow }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold sm:text-base">{rfq.title}</h2>
        <Badge className={`border-none text-[10px] capitalize ${rfq.status === 'open' ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'}`}>{rfq.status}</Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {rfq.quantity} {rfq.unit}(s)
        {rfq.categories?.name ? ` - ${rfq.categories.name}` : ''}
        {rfq.destination ? ` - to ${rfq.destination}` : ''}
        {rfq.target_price !== null ? ` - target ${formatNaira(rfq.target_price)}/unit` : ''}
      </p>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{rfq.description}</p>
    </>
  );
}

function MyRequests({ highlightId }: { highlightId: string | null }) {
  const { data, isLoading } = useMyRfqs();
  const [openId, setOpenId] = useState<string | null>(highlightId);
  const close = useCloseRfq();

  if (isLoading) return <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>;
  if (!data?.length) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-border py-14 text-center">
        <FileText className="mx-auto mb-2 h-9 w-9 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">You have not posted any requests yet.</p>
        <Link to="/rfq/new"><Button variant="outline" size="sm" className="mt-4">Post your first request</Button></Link>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {data.map(rfq => {
        const quoteCount = rfq.rfq_quotes?.length ?? 0;
        return (
          <div key={rfq.id} className={`rounded-lg border bg-card p-4 ${rfq.id === highlightId ? 'border-primary' : 'border-border'}`}>
            <RfqSummary rfq={rfq} />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
              <Button variant="outline" size="sm" onClick={() => setOpenId(openId === rfq.id ? null : rfq.id)}>
                {quoteCount} quote{quoteCount === 1 ? '' : 's'} {openId === rfq.id ? '- hide' : '- view'}
              </Button>
              {rfq.status === 'open' && (
                <Button variant="ghost" size="sm" onClick={() => close.mutate(rfq.id, { onError: () => toast.error('Could not close the request') })}>
                  Close request
                </Button>
              )}
            </div>
            {openId === rfq.id && <Quotes rfqId={rfq.id} />}
          </div>
        );
      })}
    </div>
  );
}

function Quotes({ rfqId }: { rfqId: string }) {
  const { data, isLoading } = useRfqQuotes(rfqId);
  if (isLoading) return <p className="mt-3 text-sm text-muted-foreground">Loading quotes...</p>;
  if (!data?.length) return <p className="mt-3 text-sm text-muted-foreground">No quotes yet. Suppliers usually respond within a few days.</p>;
  return (
    <div className="mt-3 space-y-2">
      {data.map(quote => (
        <div key={quote.id} className="rounded-md border border-border bg-background p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              {quote.vendors?.is_approved && <BadgeCheck className="h-4 w-4 text-primary" aria-label="Verified supplier" />}
              {quote.vendors?.store_name || 'Supplier'}
            </span>
            <span className="font-heading text-lg font-bold">{formatNaira(quote.unit_price)} <span className="text-xs font-normal text-muted-foreground">/ unit</span></span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {quote.moq ? `MOQ ${quote.moq}` : 'MOQ not stated'}{quote.lead_time ? ` - Lead time: ${quote.lead_time}` : ''}
          </p>
          {quote.message && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{quote.message}</p>}
          {quote.vendors?.user_id && (
            <Link to={`/messages?vendor=${quote.vendors.user_id}`}>
              <Button size="sm" variant="outline" className="mt-2 gap-1.5"><MessageSquare className="h-3.5 w-3.5" /> Chat with supplier</Button>
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}

function OpenRequests() {
  const { data: vendor } = useMyVendor();
  const { data, isLoading } = useOpenRfqs();
  const { data: myQuotes } = useMyQuotes();
  const [quotingId, setQuotingId] = useState<string | null>(null);
  const quoted = new Set((myQuotes ?? []).map(q => q.rfq_id));

  if (vendor && !vendor.is_approved) {
    return <p className="mt-4 rounded-lg border border-border p-5 text-sm text-muted-foreground">Your store must be approved before you can view and answer buyer requests.</p>;
  }
  if (isLoading) return <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>;
  if (!data?.length) return <p className="mt-4 rounded-lg border border-dashed border-border py-14 text-center text-sm text-muted-foreground">There are no open buyer requests right now.</p>;

  return (
    <div className="mt-4 space-y-3">
      {data.map(rfq => (
        <div key={rfq.id} className="rounded-lg border border-border bg-card p-4">
          <RfqSummary rfq={rfq} />
          <p className="mt-2 text-xs text-muted-foreground">Expires {new Date(rfq.expires_at).toLocaleDateString()}</p>
          <div className="mt-3 border-t border-border pt-3">
            {quoted.has(rfq.id) ? (
              <Badge className="border-none bg-primary/10 text-primary">You have sent a quote</Badge>
            ) : quotingId === rfq.id ? (
              <QuoteForm rfqId={rfq.id} onDone={() => setQuotingId(null)} />
            ) : (
              <Button size="sm" onClick={() => setQuotingId(rfq.id)}>Send quote</Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function QuoteForm({ rfqId, onDone }: { rfqId: string; onDone: () => void }) {
  const submit = useSubmitQuote();
  const [price, setPrice] = useState('');
  const [moq, setMoq] = useState('');
  const [leadTime, setLeadTime] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const unit_price = Number(price);
    if (!(unit_price >= 0) || !price.trim()) { toast.error('Enter your unit price'); return; }
    submit.mutate({
      rfq_id: rfqId,
      unit_price,
      moq: moq.trim() ? Math.max(1, Math.floor(Number(moq))) : null,
      lead_time: leadTime.trim() || null,
      message: message.trim() || null,
    }, {
      onSuccess: () => { toast.success('Quote sent'); onDone(); },
      onError: (err: Error) => toast.error(err.message || 'Could not send your quote'),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Input type="number" min={0} placeholder="Unit price (naira)" value={price} onChange={e => setPrice(e.target.value)} required />
        <Input type="number" min={1} placeholder="Your MOQ" value={moq} onChange={e => setMoq(e.target.value)} />
        <Input placeholder="Lead time, e.g. 7 days" value={leadTime} onChange={e => setLeadTime(e.target.value)} />
      </div>
      <Textarea rows={3} placeholder="Message to the buyer (optional)" value={message} onChange={e => setMessage(e.target.value)} maxLength={4000} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={submit.isPending}>
          {submit.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />} Send quote
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}
