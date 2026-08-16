import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/hooks/useAuth';
import { useMessages, sendMessage, getOrCreateConversation } from '@/hooks/useChat';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Send, MessageCircle, Store } from 'lucide-react';
import { toast } from 'sonner';
import MediaPreview from '@/components/chat/MediaPreview';

export default function BuyerChat() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const vendorUserId = searchParams.get('vendor');
  const productName = searchParams.get('product');

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [vendorInfo, setVendorInfo] = useState<{ store_name: string; logo_url: string | null } | null>(null);
  const { messages, loading: msgLoading } = useMessages(conversationId);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      toast.error('Please log in to chat with the seller');
      navigate('/users-login');
    }
  }, [user, authLoading, navigate]);

  // Initialize conversation
  useEffect(() => {
    if (!user || !vendorUserId) return;

    const init = async () => {
      setInitializing(true);
      try {
        // Get vendor info
        const { data: vendor } = await supabase
          .from('vendors')
          .select('store_name, logo_url')
          .eq('user_id', vendorUserId)
          .single();
        if (vendor) setVendorInfo(vendor);

        // Get or create conversation
        const convo = await getOrCreateConversation(user.id, vendorUserId);
        setConversationId(convo.id);
      } catch {
        toast.error('Failed to start conversation');
      }
      setInitializing(false);
    };

    init();
  }, [user, vendorUserId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Mark messages as read
  useEffect(() => {
    if (!conversationId || !user) return;
    (supabase as any).from('messages').update({ is_read: true })
      .eq('conversation_id', conversationId)
      .neq('sender_id', user.id)
      .eq('is_read', false)
      .then(() => {});
  }, [conversationId, user, messages]);

  const handleSend = async () => {
    if (!newMessage.trim() || !conversationId || !user || !vendorUserId) return;
    setSending(true);
    const { error } = await sendMessage(conversationId, user.id, vendorUserId, newMessage.trim());
    if (error) toast.error('Failed to send message');
    setNewMessage('');
    setSending(false);
  };

  if (authLoading || initializing) {
    return (
      <Layout>
        <div className="container py-16 text-center">
          <MessageCircle className="w-10 h-10 mx-auto mb-3 text-muted-foreground animate-pulse" />
          <p className="text-muted-foreground">Starting conversation...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container max-w-2xl py-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4 pb-3 border-b border-border">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          {vendorInfo?.logo_url ? (
            <img src={vendorInfo.logo_url} className="w-10 h-10 rounded-full object-cover" alt="" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Store className="w-5 h-5 text-primary" />
            </div>
          )}
          <div>
            <p className="font-heading font-semibold">{vendorInfo?.store_name || 'Seller'}</p>
            <p className="text-xs text-muted-foreground">In-app messaging</p>
          </div>
        </div>

        {/* Messages */}
        <div className="bg-secondary/30 rounded-lg p-4 min-h-[400px] max-h-[60vh] overflow-y-auto space-y-3">
          {productName && messages.length === 0 && (
            <div className="text-center text-xs text-muted-foreground py-2">
              Inquiring about: <span className="font-medium text-foreground">{productName}</span>
            </div>
          )}
          {msgLoading ? (
            <p className="text-center text-muted-foreground text-sm">Loading messages...</p>
          ) : messages.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">No messages yet. Say hello!</p>
          ) : (
            messages.map(m => (
              <div key={m.id} className={`flex ${m.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] px-4 py-2 rounded-2xl text-sm ${
                  m.sender_id === user?.id
                    ? 'bg-primary text-primary-foreground rounded-br-md'
                    : 'bg-card border border-border rounded-bl-md'
                }`}>
                  {m.media_url && m.media_type ? (
                    <div className="mb-1">
                      <MediaPreview url={m.media_url} type={m.media_type} isOwn={m.sender_id === user?.id} />
                    </div>
                  ) : (
                    <p>{m.content}</p>
                  )}
                  <span className={`text-[10px] mt-1 block ${
                    m.sender_id === user?.id ? 'text-primary-foreground/70' : 'text-muted-foreground'
                  }`}>
                    {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={e => { e.preventDefault(); handleSend(); }} className="flex items-center gap-2 mt-3">
          <Input
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            placeholder={productName ? `Ask about ${productName}...` : 'Type a message...'}
            className="flex-1"
            disabled={sending}
          />
          <Button type="submit" size="icon" disabled={sending || !newMessage.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </Layout>
  );
}
