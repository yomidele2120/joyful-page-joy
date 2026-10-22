import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, MessageCircle, Send, Store, User as UserIcon, X } from 'lucide-react';
import { toast } from 'sonner';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import MediaPreview from '@/components/chat/MediaPreview';
import MediaUploadButton from '@/components/chat/MediaUploadButton';
import VoiceRecorder from '@/components/chat/VoiceRecorder';
import ProductChatCard, { type ChatProduct } from '@/components/chat/ProductChatCard';
import { useAuth } from '@/hooks/useAuth';
import { getOrCreateConversation, sendMessage, useConversations, useMarkConversationRead, useMessages, type Conversation } from '@/hooks/useChat';
import MessageTicks from '@/components/chat/MessageTicks';
import { supabase } from '@/integrations/supabase/client';

function useChatProducts(ids: string[]) {
  const key = [...new Set(ids)].sort();
  return useQuery({
    queryKey: ['chat-products', key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, slug, image_url, price, moq, unit')
        .in('id', key);
      if (error) throw error;
      return new Map<string, ChatProduct>((data ?? []).map(p => [p.id, p as ChatProduct] as [string, ChatProduct]));
    },
    enabled: key.length > 0,
  });
}

// Unread incoming message count per conversation.
function useConversationUnread(conversationIds: string[], userId: string | undefined) {
  return useQuery({
    queryKey: ['conversation-unread', conversationIds, userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('messages')
        .select('conversation_id')
        .in('conversation_id', conversationIds)
        .neq('sender_id', userId!)
        .eq('is_read', false);
      const counts = new Map<string, number>();
      (data ?? []).forEach(m => counts.set(m.conversation_id, (counts.get(m.conversation_id) ?? 0) + 1));
      return counts;
    },
    enabled: conversationIds.length > 0 && !!userId,
    refetchInterval: 8000,
  });
}

const displayName = (c: Conversation) =>
  c.other_vendor?.store_name || c.other_profile?.full_name || 'IT Hub Africa user';

export default function Messages() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeId = searchParams.get('c');
  const vendorParam = searchParams.get('vendor');
  const productParam = searchParams.get('product');

  const { conversations, loading: convosLoading, refetch } = useConversations();
  const { messages, loading: msgLoading } = useMessages(activeId);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const active = conversations.find(c => c.id === activeId) || null;
  const unread = useConversationUnread(conversations.map(c => c.id), user?.id);

  const productIds = useMemo(
    () => [...messages.map(m => m.product_id).filter((id): id is string => !!id), ...(productParam ? [productParam] : [])],
    [messages, productParam],
  );
  const { data: products } = useChatProducts(productIds);
  const pendingProduct = productParam ? products?.get(productParam) ?? null : null;

  useEffect(() => {
    if (!authLoading && !user) {
      toast.error('Please sign in to view your messages');
      navigate('/users-login');
    }
  }, [user, authLoading, navigate]);

  // Deep link: /messages?vendor=<userId>[&product=<productId>] opens (or starts) that conversation.
  useEffect(() => {
    if (!user || !vendorParam || activeId) return;
    if (vendorParam === user.id) { setSearchParams({}, { replace: true }); return; }
    getOrCreateConversation(user.id, vendorParam)
      .then(convo => {
        const next: Record<string, string> = { c: convo.id };
        if (productParam) next.product = productParam;
        setSearchParams(next, { replace: true });
        refetch();
      })
      .catch(() => toast.error('Could not start the conversation'));
  }, [user, vendorParam, activeId, productParam, setSearchParams, refetch]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length, activeId]);

  // Mark incoming messages read while the thread is open and on screen.
  useMarkConversationRead(activeId, user?.id, messages.length);

  const open = (id: string) => setSearchParams({ c: id });
  const back = () => setSearchParams({});

  const uploadMedia = async (file: Blob, ext: string): Promise<string | null> => {
    const path = `${user!.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('chat-media').upload(path, file);
    if (error) { toast.error('Upload failed'); return null; }
    return path; // private bucket: store the path, sign when displayed
  };

  const send = async (content: string, mediaPath?: string, mediaType?: 'image' | 'video' | 'voice') => {
    if (!active || !user) return;
    setSending(true);
    const { error } = await sendMessage(
      active.id, user.id, active.other_user_id, content, mediaPath, mediaType, pendingProduct?.id ?? null,
    );
    if (error) toast.error('Failed to send message');
    else if (pendingProduct) setSearchParams({ c: active.id }, { replace: true });
    setSending(false);
  };

  const handleSend = async () => {
    const content = text.trim();
    if (!content) return;
    setText('');
    await send(content);
  };

  const handleMedia = async (file: File) => {
    const isVideo = file.type.startsWith('video/');
    const ext = file.name.split('.').pop() || (isVideo ? 'mp4' : 'jpg');
    setSending(true);
    const path = await uploadMedia(file, ext);
    setSending(false);
    if (path) await send(isVideo ? 'Video' : 'Photo', path, isVideo ? 'video' : 'image');
  };

  const handleVoice = async (blob: Blob) => {
    setSending(true);
    const path = await uploadMedia(blob, 'webm');
    setSending(false);
    if (path) await send('Voice note', path, 'voice');
  };

  if (authLoading || !user) {
    return <Layout><div className="container py-16 text-center text-muted-foreground">Loading...</div></Layout>;
  }

  const showThread = !!activeId;

  return (
    <Layout>
      <div className="container max-w-6xl py-4">
        <h1 className="sr-only">Messages</h1>
        <div className="grid h-[calc(100dvh-14rem)] min-h-[420px] overflow-hidden rounded-lg border border-border bg-card md:h-[72vh] md:grid-cols-[320px_minmax(0,1fr)]">
          {/* Conversation list */}
          <aside className={`${showThread ? 'hidden md:flex' : 'flex'} min-h-0 flex-col border-r border-border`}>
            <div className="border-b border-border p-3 font-heading font-semibold">Messages</div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {convosLoading ? (
                <p className="p-4 text-sm text-muted-foreground">Loading conversations...</p>
              ) : conversations.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  <MessageCircle className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  No conversations yet. Use <span className="font-medium">Chat now</span> on a product or supplier page to start one.
                </div>
              ) : (
                conversations.map(c => {
                  const count = unread.data?.get(c.id) ?? 0;
                  return (
                    <button
                      key={c.id}
                      onClick={() => open(c.id)}
                      className={`flex w-full items-center gap-3 border-b border-border/60 px-3 py-3 text-left hover:bg-secondary/60 ${c.id === activeId ? 'bg-secondary' : ''}`}
                    >
                      <Avatar conversation={c} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold">{displayName(c)}</span>
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {new Date(c.last_message_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                          </span>
                        </span>
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs text-muted-foreground">{c.last_message || 'No messages yet'}</span>
                          {count > 0 && (
                            <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-accent px-1 text-[9px] text-accent-foreground">{count}</span>
                          )}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          {/* Thread */}
          <section className={`${showThread ? 'flex' : 'hidden md:flex'} min-h-0 min-w-0 flex-col`}>
            {!activeId ? (
              <div className="m-auto p-6 text-center text-sm text-muted-foreground">
                <MessageCircle className="mx-auto mb-2 h-10 w-10 opacity-40" />
                Select a conversation to start messaging.
              </div>
            ) : (
              <>
                <header className="flex items-center gap-3 border-b border-border p-3">
                  <Button variant="ghost" size="icon" className="md:hidden" onClick={back} aria-label="Back to conversations">
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                  {active && <Avatar conversation={active} />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-heading font-semibold">{active ? displayName(active) : 'Conversation'}</p>
                    {active?.other_vendor?.vendor_id && (
                      <Link to={`/shop/${active.other_vendor.vendor_id}`} className="text-xs text-primary hover:underline">View store</Link>
                    )}
                  </div>
                </header>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-secondary/30 p-4">
                  {msgLoading ? (
                    <p className="text-center text-sm text-muted-foreground">Loading messages...</p>
                  ) : messages.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">No messages yet. Say hello!</p>
                  ) : (
                    messages.map(m => {
                      const own = m.sender_id === user.id;
                      const product = m.product_id ? products?.get(m.product_id) : null;
                      return (
                        <div key={m.id} className={`flex ${own ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${own ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md border border-border bg-card'}`}>
                            {product && <ProductChatCard product={product} dark={own} />}
                            {m.media_url && m.media_type ? (
                              <div className="mb-1"><MediaPreview url={m.media_url} type={m.media_type} isOwn={own} /></div>
                            ) : (
                              <p className="whitespace-pre-wrap break-words">{m.content}</p>
                            )}
                            <span className={`mt-1 flex items-center gap-1 text-[10px] ${own ? 'justify-end text-primary-foreground/70' : 'text-muted-foreground'}`}>
                              {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              {own && <MessageTicks isRead={!!m.is_read} readAt={m.read_at} />}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={endRef} />
                </div>

                {pendingProduct && (
                  <div className="flex items-center justify-between gap-2 border-t border-border bg-card px-3 pt-2">
                    <ProductChatCard product={pendingProduct} />
                    <Button variant="ghost" size="icon" onClick={() => setSearchParams({ c: activeId }, { replace: true })} aria-label="Remove product from message">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                <form onSubmit={e => { e.preventDefault(); handleSend(); }} className="flex items-center gap-1 border-t border-border bg-card p-2">
                  <MediaUploadButton onFileSelected={handleMedia} disabled={sending} />
                  <VoiceRecorder onRecorded={handleVoice} disabled={sending} />
                  <Input
                    value={text}
                    onChange={e => setText(e.target.value)}
                    placeholder={pendingProduct ? `Ask about ${pendingProduct.name}...` : 'Type a message...'}
                    className="flex-1"
                    disabled={sending}
                  />
                  <Button type="submit" size="icon" disabled={sending || !text.trim()} aria-label="Send">
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
              </>
            )}
          </section>
        </div>
      </div>
    </Layout>
  );
}

function Avatar({ conversation }: { conversation: Conversation }) {
  const logo = conversation.other_vendor?.logo_url || conversation.other_profile?.avatar_url;
  if (logo) return <img src={logo} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />;
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
      {conversation.other_is_vendor ? <Store className="h-5 w-5" /> : <UserIcon className="h-5 w-5" />}
    </span>
  );
}
