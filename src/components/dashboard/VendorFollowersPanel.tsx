import { Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Panel, StatCard } from '@/components/dashboard/DashboardShell';
import { useVendorFollowerCount } from '@/hooks/usePosts';
import { formatCompactNumber } from '@/lib/format';

// Shows how many shoppers follow the shop. Names are not listed: shoppers' details stay private.
export default function VendorFollowersPanel({ vendorId }: { vendorId: string }) {
  const { data, isLoading } = useVendorFollowerCount(vendorId);
  return (
    <div className="max-w-3xl space-y-4">
      <StatCard icon={<Users />} label="Shoppers following your shop" value={formatCompactNumber(data ?? 0)} loading={isLoading} />
      <Panel title="Get more followers">
        <p className="text-sm text-muted-foreground">Post videos and keep your products fresh. Shoppers who follow you see your new posts first.</p>
        <Button asChild size="sm" className="mt-3"><Link to={`/shop/${vendorId}`}>View my shop</Link></Button>
      </Panel>
    </div>
  );
}
