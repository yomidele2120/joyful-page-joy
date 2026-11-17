import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Star, BadgeCheck, Trash2, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

type Review = {
  id: string; buyer_id: string; rating: number; comment: string | null; reviewer_name: string;
  verified_purchase: boolean; created_at: string; vendor_reply: string | null; vendor_replied_at: string | null;
};

function Stars({ value, size = 'h-4 w-4' }: { value: number; size?: string }) {
  return (
    <span className="inline-flex" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map(n => (
        <Star key={n} className={`${size} ${n <= Math.round(value) ? 'fill-amber-500 text-amber-500' : 'text-muted-foreground/40'}`} aria-hidden="true" />
      ))}
    </span>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? 's' : ''}`}
          onClick={() => onChange(n)} className="rounded p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <Star className={`h-8 w-8 ${n <= value ? 'fill-amber-500 text-amber-500' : 'text-muted-foreground/40'}`} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

export default function SupplierReviews({ vendorId, userId, isOwnShop }: { vendorId: string; userId?: string; isOwnShop: boolean }) {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['vendor-reviews', vendorId] });
    qc.invalidateQueries({ queryKey: ['vendor-reputation', vendorId] });
  };

  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ['vendor-reviews', vendorId],
    queryFn: async () => {
      const { data, error } = await supabase.from('vendor_reviews' as any)
        .select('id,buyer_id,rating,comment,reviewer_name,verified_purchase,created_at,vendor_reply,vendor_replied_at')
        .eq('vendor_id', vendorId).order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as Review[];
    },
    staleTime: 30_000,
  });

  const { data: canReview } = useQuery({
    queryKey: ['can-review-vendor', vendorId, userId],
    enabled: !!userId && !isOwnShop,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('can_review_vendor' as any, { _vendor: vendorId });
      if (error) throw error;
      return !!data;
    },
  });

  const mine = reviews.find(r => r.buyer_id === userId);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [editing, setEditing] = useState(false);
  const showForm = !!userId && !isOwnShop && canReview && (!mine || editing);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('submit_vendor_review' as any, { _vendor: vendorId, _rating: rating, _comment: comment });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Thanks, your review is posted'); setEditing(false); refresh(); },
    onError: (e: any) => toast.error(e?.message || 'Could not post your review'),
  });
  const remove = useMutation({
    mutationFn: async () => { const { error } = await supabase.rpc('delete_my_vendor_review' as any, { _vendor: vendorId }); if (error) throw error; },
    onSuccess: () => { toast.success('Review deleted'); setRating(0); setComment(''); refresh(); },
    onError: (e: any) => toast.error(e?.message || 'Could not delete'),
  });

  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const reply = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('reply_vendor_review' as any, { _review: id, _reply: replyText });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Reply saved'); setReplyFor(null); setReplyText(''); refresh(); },
    onError: (e: any) => toast.error(e?.message || 'Could not save reply'),
  });

  const count = reviews.length;
  const avg = count ? reviews.reduce((s, r) => s + r.rating, 0) / count : 0;
  const dist = [5, 4, 3, 2, 1].map(n => ({ n, c: reviews.filter(r => r.rating === n).length }));

  return (
    <section aria-label="Supplier reviews" className="mx-auto max-w-2xl space-y-5">
      {count > 0 && (
        <div className="flex items-center gap-5 rounded-2xl bg-card p-4 ring-1 ring-border/50">
          <div className="text-center">
            <p className="font-heading text-4xl font-bold leading-none">{avg.toFixed(1)}</p>
            <div className="mt-1.5"><Stars value={avg} /></div>
            <p className="mt-1 text-xs text-muted-foreground">{count} review{count === 1 ? '' : 's'}</p>
          </div>
          <ul className="flex-1 space-y-1">
            {dist.map(d => (
              <li key={d.n} className="flex items-center gap-2 text-xs">
                <span className="w-3 text-muted-foreground">{d.n}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                  <span className="block h-full rounded-full bg-amber-500" style={{ width: `${(d.c / count) * 100}%` }} />
                </span>
                <span className="w-6 text-right text-muted-foreground">{d.c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!userId && !isOwnShop && (
        <p className="rounded-xl bg-secondary p-3 text-sm text-muted-foreground">
          <Link to="/users-login" className="font-medium text-primary underline">Sign in</Link> to review this supplier after you buy from them.
        </p>
      )}
      {userId && !isOwnShop && canReview === false && !mine && (
        <p className="rounded-xl bg-secondary p-3 text-sm text-muted-foreground">You can review this supplier after a paid order from them.</p>
      )}

      {showForm && (
        <form onSubmit={e => { e.preventDefault(); if (!rating) { toast.error('Tap a star to rate'); return; } save.mutate(); }}
          className="space-y-3 rounded-2xl bg-card p-4 ring-1 ring-border/50">
          <p className="font-medium">{mine ? 'Update your review' : 'Rate this supplier'}</p>
          <StarPicker value={rating} onChange={setRating} />
          <textarea value={comment} onChange={e => setComment(e.target.value)} maxLength={1000} rows={3}
            placeholder="How was delivery, product quality and communication?"
            className="w-full rounded-xl border border-border bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={save.isPending}>{mine ? 'Save changes' : 'Post review'}</Button>
            {mine && <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>}
          </div>
        </form>
      )}

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading reviews…</p>
      ) : count === 0 ? (
        <p className="py-8 text-center text-muted-foreground">No reviews yet. Buyers can rate this supplier after a paid order.</p>
      ) : (
        <ul className="space-y-3">
          {reviews.map(r => (
            <li key={r.id} className="rounded-2xl bg-card p-4 ring-1 ring-border/50">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{r.reviewer_name}</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <Stars value={r.rating} size="h-3.5 w-3.5" />
                    <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </div>
                </div>
                {r.verified_purchase && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    <BadgeCheck className="h-3 w-3" aria-hidden="true" /> Verified buyer
                  </span>
                )}
              </div>
              {r.comment && <p className="mt-2 whitespace-pre-line break-words text-sm">{r.comment}</p>}

              {r.vendor_reply && (
                <div className="mt-3 rounded-xl bg-secondary p-3 text-sm">
                  <p className="text-xs font-semibold text-muted-foreground">Reply from the supplier</p>
                  <p className="mt-0.5 whitespace-pre-line break-words">{r.vendor_reply}</p>
                </div>
              )}

              {isOwnShop && (replyFor === r.id ? (
                <div className="mt-3 space-y-2">
                  <textarea value={replyText} onChange={e => setReplyText(e.target.value)} maxLength={600} rows={2}
                    className="w-full rounded-xl border border-border bg-background p-2.5 text-sm" placeholder="Write a public reply" />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={reply.isPending} onClick={() => reply.mutate(r.id)}>Save reply</Button>
                    <Button size="sm" variant="outline" onClick={() => setReplyFor(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <button className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary"
                  onClick={() => { setReplyFor(r.id); setReplyText(r.vendor_reply ?? ''); }}>
                  <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" /> {r.vendor_reply ? 'Edit reply' : 'Reply'}
                </button>
              ))}

              {r.buyer_id === userId && !editing && (
                <div className="mt-3 flex gap-3 text-xs">
                  <button className="font-medium text-primary" onClick={() => { setRating(r.rating); setComment(r.comment ?? ''); setEditing(true); }}>Edit</button>
                  <button className="inline-flex items-center gap-1 font-medium text-destructive" disabled={remove.isPending}
                    onClick={() => remove.mutate()}><Trash2 className="h-3 w-3" aria-hidden="true" /> Delete</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
