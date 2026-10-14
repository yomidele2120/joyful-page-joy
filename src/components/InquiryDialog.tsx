import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { submitInquiry } from '@/hooks/useInquiries';

export interface InquiryDialogTarget {
  vendorId: string;
  vendorUserId: string | null;
  vendorName: string | null;
  productId: string | null;
  productName: string | null;
  moq: number;
  unit: string;
}

interface InquiryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: InquiryDialogTarget | null;
  defaultQuantity?: number;
}

export default function InquiryDialog({ open, onOpenChange, target, defaultQuantity }: InquiryDialogProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open && target) {
      setQuantity(Math.max(defaultQuantity ?? target.moq, target.moq, 1));
      setMessage(target.productName
        ? `Hello, I am interested in "${target.productName}". Please send me your best price, availability and delivery time.`
        : '');
    }
  }, [open, target, defaultQuantity]);

  if (!target) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error('Please sign in to send an inquiry');
      onOpenChange(false);
      navigate('/users-login');
      return;
    }
    if (!target.vendorUserId) {
      toast.error('This supplier cannot receive inquiries right now');
      return;
    }
    if (user.id === target.vendorUserId) {
      toast.error('You cannot send an inquiry to your own store');
      return;
    }
    if (quantity < target.moq) {
      toast.error(`The supplier's minimum order is ${target.moq} ${target.unit}(s)`);
      return;
    }
    if (!message.trim()) {
      toast.error('Please write a message for the supplier');
      return;
    }

    setSending(true);
    try {
      const conversationId = await submitInquiry(user.id, {
        vendorId: target.vendorId,
        vendorUserId: target.vendorUserId,
        productId: target.productId,
        productName: target.productName,
        quantity,
      }, message);
      queryClient.invalidateQueries({ queryKey: ['inquiries'] });
      toast.success('Inquiry sent to the supplier');
      onOpenChange(false);
      navigate(`/messages?c=${conversationId}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not send your inquiry');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Send inquiry</DialogTitle>
            <DialogDescription>
              To <span className="font-medium text-foreground">{target.vendorName || 'the supplier'}</span>
              {target.productName && <> about <span className="font-medium text-foreground">{target.productName}</span></>}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="inquiry-qty">Quantity needed ({target.unit}s)</Label>
            <Input
              id="inquiry-qty"
              type="number"
              min={target.moq}
              value={quantity}
              onChange={e => setQuantity(Math.floor(Number(e.target.value)) || 0)}
              required
            />
            {target.moq > 1 && <p className="text-xs text-muted-foreground">Minimum order: {target.moq} {target.unit}s</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inquiry-message">Message</Label>
            <Textarea
              id="inquiry-message"
              rows={5}
              maxLength={4000}
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Tell the supplier what you need: specifications, delivery location, deadline..."
              required
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={sending}>
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send inquiry
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
