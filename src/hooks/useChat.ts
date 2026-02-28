import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface Conversation {
  id: string;
  participant_1: string;
  participant_2: string;
  last_message: string | null;
  last_message_at: string;
  created_at: string;
  other_vendor?: { store_name: string; logo_url: string | null };
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  receiver_id: string;
  message: string;
  is_read: boolean;
  created_at: string;
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
      const otherIds = (data as Conversation[]).map(c => c.participant_1 === user.id ? c.participant_2 : c.participant_1);
      const { data: vendors } = await supabase
        .from('vendors')
        .select('user_id, store_name, logo_url')
        .in('user_id', otherIds);

      const enriched = (data as Conversation[]).map(c => {
        const otherId = c.participant_1 === user.id ? c.participant_2 : c.participant_1;
        const vendor = vendors?.find(v => v.user_id === otherId);
        return { ...c, other_vendor: vendor ? { store_name: vendor.store_name, logo_url: vendor.logo_url } : undefined };
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
        setMessages(prev => [...prev, payload.new as Message]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId, fetchMessages]);

  return { messages, loading };
}

export function useUnreadCount() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    const fetch = async () => {
      const { count: c } = await fromTable('messages')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_id', user.id)
        .eq('is_read', false);
      setCount(c || 0);
    };

    fetch();

    const channel = supabase
      .channel('unread-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => fetch())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, () => fetch())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  return count;
}

export async function sendMessage(conversationId: string, senderId: string, receiverId: string, message: string) {
  const { error } = await fromTable('messages').insert({
    conversation_id: conversationId,
    sender_id: senderId,
    receiver_id: receiverId,
    message,
  });

  if (!error) {
    await fromTable('conversations').update({
      last_message: message,
      last_message_at: new Date().toISOString(),
    }).eq('id', conversationId);
  }

  return { error };
}

export async function getOrCreateConversation(userId1: string, userId2: string) {
  // Check existing
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
