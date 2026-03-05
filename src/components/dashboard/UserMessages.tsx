import { useState, useEffect, useRef } from 'react';
import { useConversations, useMessages, sendMessage, Conversation } from '@/hooks/useChat';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Send, MessageCircle, Store, User, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import MediaPreview from '@/components/chat/MediaPreview';

export default function UserMessages() {
  const { user } = useAuth();
  const { conversations, loading: convoLoading } = useConversations();
  const [activeConvoId, setActiveConvoId] = useState<string | null>(null);
  const [activeReceiverId, setActiveReceiverId] = useState<string | null>(null);
  const { messages, loading: msgLoading } = useMessages(activeConvoId);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeConvo = conversations.find(c => c.id === activeConvoId);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Mark messages as read
  useEffect(() => {
    if (!activeConvoId || !user) return;
    (supabase as any).from('messages').update({ is_read: true })
      .eq('conversation_id', activeConvoId)
      .neq('sender_id', user.id)
      .eq('is_read', false)
      .then(() => {});
  }, [activeConvoId, user, messages]);

  const handleSend = async () => {
    if (!newMessage.trim() || !activeConvoId || !user || !activeReceiverId) return;
    setSending(true);
    const { error } = await sendMessage(activeConvoId, user.id, activeReceiverId, newMessage.trim());
    if (error) {
      const { toast } = await import('sonner');
      toast.error('Failed to send message');
    }
    setNewMessage('');
    setSending(false);
  };

  const selectConversation = (convo: Conversation) => {
    setActiveConvoId(convo.id);
    setActiveReceiverId(convo.other_user_id);
  };

  const getDisplayName = (convo: Conversation) => {
    if (convo.other_is_vendor && convo.other_vendor) return convo.other_vendor.store_name;
    return convo.other_profile?.full_name || 'User';
  };

  const getAvatar = (convo: Conversation) => {
    if (convo.other_is_vendor && convo.other_vendor?.logo_url) {
      return <img src={convo.other_vendor.logo_url} className="w-10 h-10 rounded-full object-cover" alt="" />;
    }
    return (
      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
        {convo.other_is_vendor ? <Store className="w-5 h-5 text-primary" /> : <User className="w-5 h-5 text-primary" />}
      </div>
    );
  };

  if (convoLoading) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50 animate-pulse" />
          <p>Loading conversations...</p>
        </CardContent>
      </Card>
    );
  }

  if (conversations.length === 0 && !activeConvoId) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No messages yet.</p>
          <p className="text-xs mt-1">Message a seller from any product page to start a conversation.</p>
        </CardContent>
      </Card>
    );
  }

  // Active chat view
  if (activeConvoId && activeConvo) {
    return (
      <Card className="overflow-hidden">
        {/* Chat header */}
        <div className="px-4 py-3 border-b border-border flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setActiveConvoId(null)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          {getAvatar(activeConvo)}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-heading font-semibold text-sm truncate">{getDisplayName(activeConvo)}</span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {activeConvo.other_is_vendor ? 'Supplier' : 'Buyer'}
              </Badge>
            </div>
          </div>
          {activeConvo.other_is_vendor && activeConvo.other_vendor?.vendor_id && (
            <Link to={`/shop/${activeConvo.other_vendor.vendor_id}`}>
              <Button variant="outline" size="sm" className="gap-1 text-xs">
                <Store className="w-3 h-3" /> View Shop <ExternalLink className="w-3 h-3" />
              </Button>
            </Link>
          )}
        </div>

        {/* Messages */}
        <div className="p-4 min-h-[350px] max-h-[50vh] overflow-y-auto space-y-3 bg-secondary/20">
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
        <div className="p-3 border-t border-border">
          <form onSubmit={e => { e.preventDefault(); handleSend(); }} className="flex items-center gap-2">
            <Input
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              className="flex-1"
              disabled={sending}
            />
            <Button type="submit" size="icon" disabled={sending || !newMessage.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </Card>
    );
  }

  // Conversation list
  return (
    <div className="space-y-2">
      {conversations.map(c => (
        <Card key={c.id} className="cursor-pointer hover:bg-secondary/50 transition-colors" onClick={() => selectConversation(c)}>
          <CardContent className="p-3 flex items-center gap-3">
            {getAvatar(c)}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm truncate">{getDisplayName(c)}</p>
                <Badge variant={c.other_is_vendor ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
                  {c.other_is_vendor ? 'Supplier' : 'Buyer'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground truncate">{c.last_message || 'No messages yet'}</p>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-muted-foreground">
                {c.last_message_at ? new Date(c.last_message_at).toLocaleDateString() : ''}
              </span>
              {c.other_is_vendor && c.other_vendor?.vendor_id && (
                <Link to={`/shop/${c.other_vendor.vendor_id}`} onClick={e => e.stopPropagation()}>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 mt-1 text-primary">
                    <Store className="w-3 h-3" /> Shop
                  </Button>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
