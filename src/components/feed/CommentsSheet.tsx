import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Send, MessageCircle, MoreVertical, Trash2, Flag } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useComments, useAddComment } from '@/hooks/usePosts';
import { useReportContent, useDeleteComment } from '@/hooks/useReports';
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
  const reportContent = useReportContent();
  const deleteComment = useDeleteComment();
  const [text, setText] = useState('');

  const handleReport = (commentId: string) => {
    if (!user) {
      toast.error('Sign in to report content');
      return;
    }
    reportContent.mutate(
      { commentId, reason: 'inappropriate' },
      { onSuccess: () => toast.success('Reported — our team will review this') }
    );
  };

  const handleDelete = (commentId: string) => {
    if (!postId) return;
    deleteComment.mutate({ commentId, postId });
  };

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
              <div key={c.id} className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium">Buyer</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-sm">{c.content}</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="text-muted-foreground shrink-0 p-1">
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {user?.id === c.user_id ? (
                      <DropdownMenuItem onClick={() => handleDelete(c.id)}>
                        <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={() => handleReport(c.id)}>
                        <Flag className="w-3.5 h-3.5 mr-2" /> Report
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
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
