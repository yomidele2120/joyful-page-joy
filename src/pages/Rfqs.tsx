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
  useAddNegotiationEvent, useCloseRfq, useMyQuotes, useMyRfqs, useNegotiationHistory,
  useOpenRfqs, useRfqQuotes, useSubmitQuote, type QuoteRow, type RfqRow,
} from '@/hooks/useRfqs';
import { formatNaira } from '@/lib/format';
import { compareQuotes, type QuoteCompared } from '@/lib/quoteCompare';
import { formatResponseTime, useVendorReputation } from '@/hooks/useVendorReputation';
import { Star } from 'lucide-react';

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
            {openId === rfq.id && <Quotes rfqId={rfq.id} quantity={rfq.quantity} />}
          </div>
        );
      })}
    </div>
  );
}

function Quotes({ rfqId, quantity }: { rfqId: string; quantity: number }) {
  const { data, isLoading } = useRfqQuotes(rfqId);
  if (isLoading) return <p className="mt-3 text-sm text-muted-foreground">Loading quotes...</p>;
  if (!data?.length) return <p className="mt-3 text-sm text-muted-foreground">No quotes yet. Suppliers usually respond within a few days.</p>;
  return (
    <div className="mt-3 space-y-2">
      {data.length > 1 && <QuoteComparison quotes={data} quantity={quantity} />}
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
          <QuoteNegotiation quoteId={quote.id} initialPrice={quote.unit_price} initialQuantity={quantity} buyer />
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

function QuoteComparison({ quotes, quantity }: { quotes: QuoteRow[]; quantity: number }) {
  const rows = compareQuotes(quotes, quantity);
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[560px] text-left text-xs">
        <caption className="bg-secondary/50 px-3 py-2 text-left text-sm font-medium">Compare quotes for {quantity} units</caption>
        <thead className="text-muted-foreground">
          <tr><th className="px-3 py-2 font-medium">Supplier</th><th className="px-3 py-2 font-medium">Unit price</th><th className="px-3 py-2 font-medium">Total</th><th className="px-3 py-2 font-medium">MOQ</th><th className="px-3 py-2 font-medium">Lead time</th><th className="px-3 py-2 font-medium">Rating</th><th className="px-3 py-2 font-medium">Replies</th></tr>
        </thead>
        <tbody>
          {rows.map(r => <CompareRow key={r.quote.id} row={r} />)}
        </tbody>
      </table>
    </div>
  );
}

function CompareRow({ row }: { row: QuoteCompared<QuoteRow> }) {
  const { quote } = row;
  const { data: rep } = useVendorReputation(quote.vendor_id);
  return (
    <tr className={`border-t border-border ${row.lowest ? 'bg-primary/5' : ''}`}>
      <td className="px-3 py-2 font-medium"><span className="flex items-center gap-1">{quote.vendors?.is_approved && <BadgeCheck className="h-3.5 w-3.5 text-primary" aria-label="Verified supplier" />}{quote.vendors?.store_name || 'Supplier'}</span></td>
      <td className="px-3 py-2 tabular-nums">{formatNaira(quote.unit_price)}{row.lowest ? <span className="ml-1 rounded bg-primary px-1 py-0.5 text-[10px] text-primary-foreground">Lowest</span> : row.vsLowestPercent > 0 ? <span className="ml-1 text-muted-foreground">+{row.vsLowestPercent}%</span> : null}</td>
      <td className="px-3 py-2 tabular-nums">{formatNaira(row.total)}</td>
      <td className={`px-3 py-2 ${row.moqTooHigh ? 'text-destructive' : ''}`}>{quote.moq ?? '-'}{row.moqTooHigh ? ' (above your quantity)' : ''}</td>
      <td className="px-3 py-2">{quote.lead_time || '-'}</td>
      <td className="px-3 py-2">{rep?.average_rating != null && rep.review_count > 0 ? <span className="inline-flex items-center gap-0.5"><Star className="h-3 w-3 fill-current text-amber-500" />{rep.average_rating.toFixed(1)} ({rep.review_count})</span> : '-'}</td>
      <td className="px-3 py-2">{formatResponseTime(rep?.average_response_minutes)?.replace('Replies in about ', '') ?? '-'}</td>
    </tr>
  );
}

function OpenRequests() {
  const { data: vendor } = useMyVendor();
  const { data, isLoading } = useOpenRfqs();
  const { data: myQuotes } = useMyQuotes();
  const [quotingId, setQuotingId] = useState<string | null>(null);
  const quoted = new Set((myQuotes ?? []).map(q => q.rfq_id));
  const myQuoteByRfq = new Map((myQuotes ?? []).map(q => [q.rfq_id, q]));

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
              <>
                <Badge className="border-none bg-primary/10 text-primary">You have sent a quote</Badge>
                {myQuoteByRfq.get(rfq.id) && (
                  <QuoteNegotiation
                    quoteId={myQuoteByRfq.get(rfq.id)!.id}
                    initialPrice={myQuoteByRfq.get(rfq.id)!.unit_price}
                    initialQuantity={rfq.quantity}
                    buyer={false}
                  />
                )}
              </>
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

function QuoteNegotiation({ quoteId, initialPrice, initialQuantity, buyer }: {
  quoteId: string;
  initialPrice: number;
  initialQuantity: number;
  buyer: boolean;
}) {
  const { user } = useAuth();
  const { data: history, isLoading } = useNegotiationHistory(quoteId);
  const addEvent = useAddNegotiationEvent();
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState(String(initialQuantity));
  const [message, setMessage] = useState('');
  const last = history?.[history.length - 1];
  const finished = last?.action === 'accepted' || last?.action === 'rejected';
  const canAccept = buyer || (last?.action === 'counter' && last.actor_id !== user?.id);

  const submit = (action: 'counter' | 'accepted' | 'rejected') => {
    if (action === 'counter') {
      const amount = Number(price);
      const qty = Math.floor(Number(quantity));
      if (!price.trim() || !Number.isFinite(amount) || amount < 0 || qty < 1) {
        toast.error('Enter a valid unit price and quantity');
        return;
      }
      addEvent.mutate({
        quote_id: quoteId, action, unit_price: amount, quantity: qty, message: message.trim() || null,
      }, {
        onSuccess: () => { setPrice(''); setMessage(''); toast.success('Counteroffer sent'); },
        onError: (error: Error) => toast.error(error.message || 'Could not send counteroffer'),
      });
      return;
    }
    addEvent.mutate({ quote_id: quoteId, action }, {
      onSuccess: () => toast.success(action === 'accepted' ? 'Quotation accepted' : 'Quotation declined'),
      onError: (error: Error) => toast.error(error.message || 'Could not update quotation'),
    });
  };

  return (
    <div className="mt-3 rounded-md border border-border p-3">
      <p className="text-sm font-medium">Negotiation history</p>
      {isLoading ? <p className="mt-2 text-xs text-muted-foreground">Loading negotiation...</p> : (
        <ol className="mt-2 space-y-2">
          <li className="rounded bg-secondary/60 p-2 text-xs">
            Supplier's original offer: {formatNaira(initialPrice)} per unit for {initialQuantity}
          </li>
          {(history ?? []).map(event => (
            <li key={event.id} className="rounded bg-secondary/60 p-2 text-xs">
              <span className="font-medium">{event.actor_id === user?.id ? 'You' : buyer ? 'Supplier' : 'Buyer'}: </span>
              {event.action === 'counter' && event.unit_price !== null
                ? `Counteroffer ${formatNaira(event.unit_price)} per unit for ${event.quantity} units`
                : event.action === 'accepted' ? 'Accepted the quotation'
                  : event.action === 'rejected' ? 'Declined the quotation' : 'Message'}
              {event.message && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{event.message}</p>}
              <time className="mt-1 block text-[10px] text-muted-foreground">{new Date(event.created_at).toLocaleString()}</time>
            </li>
          ))}
        </ol>
      )}
      {!isLoading && !finished && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input type="number" min={0} step="0.01" value={price} onChange={event => setPrice(event.target.value)} placeholder="Counteroffer unit price (NGN)" />
            <Input type="number" min={1} step={1} value={quantity} onChange={event => setQuantity(event.target.value)} placeholder="Quantity" />
          </div>
          <Textarea rows={2} maxLength={4000} value={message} onChange={event => setMessage(event.target.value)} placeholder="Add a note (optional)" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={addEvent.isPending} onClick={() => submit('counter')}>Send counteroffer</Button>
            {canAccept && <Button size="sm" disabled={addEvent.isPending} onClick={() => submit('accepted')}>Accept</Button>}
            {buyer && <>
              <Button size="sm" variant="ghost" disabled={addEvent.isPending} onClick={() => submit('rejected')}>Decline</Button>
            </>}
          </div>
        </div>
      )}
      {finished && <Badge className="mt-2">{last.action === 'accepted' ? 'Accepted' : 'Declined'}</Badge>}
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
