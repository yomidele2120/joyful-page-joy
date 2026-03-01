import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useConversations, useMessages, sendMessage, getOrCreateConversation } from '@/hooks/useChat';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Send, MessageCircle, Store, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import MediaPreview from '@/components/chat/MediaPreview';
import VoiceRecorder from '@/components/chat/VoiceRecorder';
import MediaUploadButton from '@/components/chat/MediaUploadButton';

export default function SupplierChat() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { conversations, loading: convoLoading } = useConversations();
  const [activeConvoId, setActiveConvoId] = useState<string | null>(null);
  const [activeReceiverId, setActiveReceiverId] = useState<string | null>(null);
  const { messages, loading: msgLoading } = useMessages(activeConvoId);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate('/suppliers-login');
  }, [user, authLoading, navigate]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Mark messages as read when viewing
  useEffect(() => {
    if (!activeConvoId || !user) return;
    (supabase as any).from('messages').update({ is_read: true })
      .eq('conversation_id', activeConvoId)
      .neq('sender_id', user.id)
      .eq('is_read', false)
      .then(() => {});
  }, [activeConvoId, user, messages]);

  const uploadMedia = async (file: Blob, ext: string): Promise<string | null> => {
    const fileName = `${user!.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('chat-media').upload(fileName, file);
    if (error) { toast.error('Upload failed'); return null; }
    const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(fileName);
    return urlData.publicUrl;
  };

  const handleSend = async () => {
    if (!newMessage.trim() || !activeConvoId || !user || !activeReceiverId) return;
    setSending(true);
    const { error } = await sendMessage(activeConvoId, user.id, activeReceiverId, newMessage.trim());
    if (error) toast.error('Failed to send message');
    setNewMessage('');
    setSending(false);
  };

  const handleMediaUpload = async (file: File) => {
    if (!activeConvoId || !user || !activeReceiverId) return;
    setSending(true);
    const isVideo = file.type.startsWith('video/');
    const ext = file.name.split('.').pop() || (isVideo ? 'mp4' : 'jpg');
    const mediaType = isVideo ? 'video' as const : 'image' as const;
    const url = await uploadMedia(file, ext);
    if (url) {
      const { error } = await sendMessage(activeConvoId, user.id, activeReceiverId, mediaType === 'image' ? '📷 Photo' : '🎬 Video', url, mediaType);
      if (error) toast.error('Failed to send');
    }
    setSending(false);
  };

  const handleVoiceNote = async (blob: Blob) => {
    if (!activeConvoId || !user || !activeReceiverId) return;
    setSending(true);
    const url = await uploadMedia(blob, 'webm');
    if (url) {
      const { error } = await sendMessage(activeConvoId, user.id, activeReceiverId, '🎤 Voice note', url, 'voice');
      if (error) toast.error('Failed to send');
    }
    setSending(false);
  };

  const handleSearchVendors = async (q: string) => {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); return; }
    const { data } = await supabase
      .from('vendors')
      .select('user_id, store_name, logo_url')
      .neq('user_id', user?.id || '')
      .ilike('store_name', `%${q}%`)
      .limit(10);
    setSearchResults(data || []);
  };

  const startChat = async (otherUserId: string) => {
    if (!user) return;
    try {
      const convo = await getOrCreateConversation(user.id, otherUserId);
      setActiveConvoId(convo.id);
      setActiveReceiverId(otherUserId);
      setSearchQuery('');
      setSearchResults([]);
    } catch {
      toast.error('Failed to start conversation');
    }
  };

  const selectConversation = (convo: any) => {
    setActiveConvoId(convo.id);
    const otherId = convo.participant_1 === user?.id ? convo.participant_2 : convo.participant_1;
    setActiveReceiverId(otherId);
  };

  const activeConvo = conversations.find(c => c.id === activeConvoId);

  if (authLoading) return <div className="flex items-center justify-center min-h-screen"><p>Loading...</p></div>;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <Link to="/supplier-dashboard"><ArrowLeft className="w-5 h-5 text-muted-foreground" /></Link>
            <MessageCircle className="w-5 h-5 text-primary" />
            <h1 className="font-heading font-bold text-lg">Supplier Chat</h1>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden" style={{ height: 'calc(100vh - 56px)' }}>
        {/* Sidebar */}
        <div className={`w-full md:w-80 border-r border-border bg-card flex flex-col ${activeConvoId ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search suppliers..."
                value={searchQuery}
                onChange={e => handleSearchVendors(e.target.value)}
                className="pl-9"
              />
            </div>
            {searchResults.length > 0 && (
              <div className="mt-2 bg-background rounded-md border border-border max-h-40 overflow-y-auto">
                {searchResults.map(v => (
                  <button key={v.user_id} className="w-full text-left px-3 py-2 hover:bg-secondary flex items-center gap-2 text-sm"
                    onClick={() => startChat(v.user_id)}>
                    {v.logo_url ? <img src={v.logo_url} className="w-6 h-6 rounded-full object-cover" /> : <Store className="w-4 h-4 text-muted-foreground" />}
                    {v.store_name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {convoLoading ? (
              <p className="p-4 text-sm text-muted-foreground">Loading...</p>
            ) : conversations.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground text-center">No conversations yet. Search for a supplier to start chatting.</p>
            ) : (
              conversations.map(c => (
                <button key={c.id}
                  className={`w-full text-left px-4 py-3 border-b border-border hover:bg-secondary transition-colors ${c.id === activeConvoId ? 'bg-secondary' : ''}`}
                  onClick={() => selectConversation(c)}>
                  <div className="flex items-center gap-3">
                    {c.other_vendor?.logo_url ? (
                      <img src={c.other_vendor.logo_url} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Store className="w-5 h-5 text-primary" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{c.other_vendor?.store_name || 'Supplier'}</p>
                      <p className="text-xs text-muted-foreground truncate">{c.last_message || 'No messages yet'}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(c.last_message_at).toLocaleDateString()}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Chat area */}
        <div className={`flex-1 flex flex-col ${!activeConvoId ? 'hidden md:flex' : 'flex'}`}>
          {!activeConvoId ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Select a conversation or search for a supplier</p>
              </div>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="px-4 py-3 border-b border-border bg-card flex items-center gap-3">
                <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setActiveConvoId(null)}>
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                {activeConvo?.other_vendor?.logo_url ? (
                  <img src={activeConvo.other_vendor.logo_url} className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Store className="w-4 h-4 text-primary" />
                  </div>
                )}
                <span className="font-heading font-semibold">{activeConvo?.other_vendor?.store_name || 'Supplier'}</span>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {msgLoading ? (
                  <p className="text-center text-muted-foreground text-sm">Loading messages...</p>
                ) : messages.length === 0 ? (
                  <p className="text-center text-muted-foreground text-sm">No messages yet. Say hello!</p>
                ) : (
                  messages.map(m => (
                    <div key={m.id} className={`flex ${m.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] px-4 py-2 rounded-2xl text-sm ${
                        m.sender_id === user?.id
                          ? 'bg-primary text-primary-foreground rounded-br-md'
                          : 'bg-secondary rounded-bl-md'
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
              <div className="p-3 border-t border-border bg-card">
                <form onSubmit={e => { e.preventDefault(); handleSend(); }} className="flex items-center gap-1">
                  <MediaUploadButton onFileSelected={handleMediaUpload} disabled={sending} />
                  <VoiceRecorder onRecorded={handleVoiceNote} disabled={sending} />
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
