import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Send, MessageCircle } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useComments, useAddComment } from '@/hooks/usePosts';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface CommentsSheetProps {
  postId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CommentsSheet({ postId, open, onOpenChange }: CommentsSheetProps) {
  const { user } = useAuth();
  const { data: comments, isLoading } = useComments(open ? postId : null);
  const addComment = useAddComment();
  const [text, setText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!postId || !text.trim()) return;
    if (!user) {
      toast.error('Sign in to comment');
      return;
    }
    addComment.mutate(
      { postId, content: text.trim() },
      { onSuccess: () => setText('') }
    );
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[75vh]">
        <DrawerHeader className="border-b border-border">
          <DrawerTitle>Comments {comments?.length ? `(${comments.length})` : ''}</DrawerTitle>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto px-4 py-2 min-h-[30vh]">
          {isLoading && (
            <p className="text-sm text-muted-foreground text-center py-8">Loading comments...</p>
          )}
          {!isLoading && comments?.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
              <MessageCircle className="w-8 h-8" />
              <p className="text-sm">Be the first to comment</p>
            </div>
          )}
          <div className="space-y-4">
            {comments?.map((c) => (
              <div key={c.id} className="flex flex-col gap-0.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium">Buyer</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-sm">{c.content}</p>
              </div>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex items-center gap-2 p-4 border-t border-border">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={user ? 'Add a comment...' : 'Sign in to comment'}
            disabled={!user}
            className="flex-1"
          />
          <Button type="submit" size="icon" disabled={!user || !text.trim() || addComment.isPending}>
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
