import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface Conversation {
  id: string;
  participant_1: string;
  participant_2: string;
  last_message: string | null;
  last_message_at: string;
  created_at: string;
  other_vendor?: { store_name: string; logo_url: string | null; vendor_id?: string };
  other_profile?: { full_name: string | null; avatar_url?: string | null; phone?: string | null; city?: string | null; state?: string | null; created_at?: string };
  other_is_vendor: boolean;
  other_user_id: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  read_at?: string | null;
  created_at: string;
  media_url?: string | null;
  media_type?: 'image' | 'video' | 'voice' | null;
  product_id?: string | null;
}

function fromTable(table: string) {
  return (supabase as any).from(table);
}

export function useConversations() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConversations = useCallback(async () => {
    if (!user) return;
    const { data } = await fromTable('conversations')
      .select('*')
      .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`)
      .order('last_message_at', { ascending: false });

    if (data) {
      const otherIds = (data as any[]).map(c => c.participant_1 === user.id ? c.participant_2 : c.participant_1);

      // Fetch vendor info for all other participants
      const { data: vendors } = await supabase
        .from('vendors')
        .select('user_id, store_name, logo_url, id')
        .in('user_id', otherIds);

      // Fetch profile info for all other participants
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, avatar_url, phone, city, state, created_at')
        .in('user_id', otherIds);

      const enriched: Conversation[] = (data as any[]).map(c => {
        const otherId = c.participant_1 === user.id ? c.participant_2 : c.participant_1;
        const vendor = vendors?.find(v => v.user_id === otherId);
        const profile = profiles?.find(p => p.user_id === otherId);
        return {
          ...c,
          other_user_id: otherId,
          other_is_vendor: !!vendor,
          other_vendor: vendor ? { store_name: vendor.store_name, logo_url: vendor.logo_url, vendor_id: vendor.id } : undefined,
          other_profile: profile ? { full_name: profile.full_name, avatar_url: (profile as any).avatar_url, phone: (profile as any).phone, city: (profile as any).city, state: (profile as any).state, created_at: (profile as any).created_at } : undefined,
        };
      });
      setConversations(enriched);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchConversations();

    const channel = supabase
      .channel('conversations-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => {
        fetchConversations();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchConversations]);

  return { conversations, loading, refetch: fetchConversations };
}

export function useMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchMessages = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    const { data } = await fromTable('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    setMessages((data as Message[]) || []);
    setLoading(false);
  }, [conversationId]);

  useEffect(() => {
    fetchMessages();

    if (!conversationId) return;

    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        setMessages(prev => prev.some(m => m.id === (payload.new as Message).id) ? prev : [...prev, payload.new as Message]);
      })
      // The other person opened the chat: the message row changes to is_read = true, so the sender's
      // single tick turns into the blue double tick straight away.
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        const updated = payload.new as Message;
        setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, is_read: updated.is_read, read_at: updated.read_at ?? null } : m));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId, fetchMessages]);

  return { messages, loading };
}

/**
 * Marks the other person's messages in this chat as read, but only while the page is actually on screen.
 * (A chat left open in a background tab must not show "seen" to the sender.)
 * Runs again when a new message arrives and when the tab comes back to the front.
 */
export function useMarkConversationRead(conversationId: string | null, userId: string | undefined, messageCount: number) {
  useEffect(() => {
    if (!conversationId || !userId) return;
    const mark = () => {
      if (document.visibilityState !== 'visible') return;
      fromTable('messages').update({ is_read: true })
        .eq('conversation_id', conversationId)
        .neq('sender_id', userId)
        .eq('is_read', false)
        .then(() => {});
    };
    mark();
    document.addEventListener('visibilitychange', mark);
    return () => document.removeEventListener('visibilitychange', mark);
  }, [conversationId, userId, messageCount]);
}

export function useUnreadCount() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  // Several components can mount this hook at once (header + tab bar), so each
  // instance needs its own realtime channel name.
  const channelName = useRef(`unread-messages-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    if (!user) return;

    const fetch = async () => {
      const { data: convos } = await fromTable('conversations')
        .select('id')
        .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`);
      const convoIds = (convos || []).map((c: any) => c.id);
      let c = 0;
      if (convoIds.length > 0) {
        const { count: cnt } = await fromTable('messages')
          .select('*', { count: 'exact', head: true })
          .in('conversation_id', convoIds)
          .neq('sender_id', user.id)
          .eq('is_read', false);
        c = cnt || 0;
      }
      setCount(c || 0);
    };

    fetch();

    const channel = supabase
      .channel(channelName.current)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => fetch())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, () => fetch())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  return count;
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  _receiverId: string,
  message: string,
  mediaUrl?: string,
  mediaType?: 'image' | 'video' | 'voice',
  productId?: string | null
) {
  const insertData: any = {
    conversation_id: conversationId,
    sender_id: senderId,
    content: message,
  };
  if (mediaUrl) {
    insertData.media_url = mediaUrl;
    insertData.media_type = mediaType;
  }
  if (productId) insertData.product_id = productId;
  const { error } = await fromTable('messages').insert(insertData);

  if (!error) {
    await fromTable('conversations').update({
      last_message: message || (mediaType === 'voice' ? 'Voice note' : mediaType === 'video' ? 'Video' : mediaType === 'image' ? 'Photo' : ''),
      last_message_at: new Date().toISOString(),
    }).eq('id', conversationId);
  }

  return { error };
}

export async function getOrCreateConversation(userId1: string, userId2: string) {
  const { data: existing } = await fromTable('conversations')
    .select('*')
    .or(`and(participant_1.eq.${userId1},participant_2.eq.${userId2}),and(participant_1.eq.${userId2},participant_2.eq.${userId1})`)
    .maybeSingle();

  if (existing) return existing as Conversation;

  const { data, error } = await fromTable('conversations')
    .insert({ participant_1: userId1, participant_2: userId2 })
    .select()
    .single();

  if (error) throw error;
  return data as Conversation;
}
