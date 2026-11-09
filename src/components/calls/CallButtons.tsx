import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, Video } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useCallsEnabled } from '@/hooks/useCallsEnabled';
import { useCalls } from '@/contexts/CallContext';
import { pairMayCall, type CallType } from '@/lib/zego';

interface Props { peerUserId?: string | null; peerName: string; peerIsVendor: boolean; className?: string }

/** Voice and video call buttons. They appear only when an admin has switched calling on and the pair is allowed to call. */
export default function CallButtons({ peerUserId, peerName, peerIsVendor, className }: Props) {
  const { user, isVendor } = useAuth();
  const { data: enabled } = useCallsEnabled();
  const { startCall } = useCalls();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  if (enabled !== true || !peerUserId || peerUserId === user?.id) return null;
  if (user && !pairMayCall(isVendor, peerIsVendor)) return null;

  const go = async (type: CallType) => {
    if (!user) { toast.message('Sign in to call this supplier'); navigate('/users-login'); return; }
    setBusy(true);
    try { await startCall(peerUserId, peerName, type); } finally { setBusy(false); }
  };
  return (
    <div className={`flex items-center gap-1 ${className ?? ''}`}>
      <Button type="button" variant="ghost" size="icon" disabled={busy} onClick={() => go('voice')} aria-label={`Voice call ${peerName}`} title="Voice call"><Phone className="h-4 w-4" /></Button>
      <Button type="button" variant="ghost" size="icon" disabled={busy} onClick={() => go('video')} aria-label={`Video call ${peerName}`} title="Video call"><Video className="h-4 w-4" /></Button>
    </div>
  );
}
