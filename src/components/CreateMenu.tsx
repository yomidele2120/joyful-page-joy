import { useNavigate } from 'react-router-dom';
import { Package, Film, Store } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';

// Shared "create" sheet used by the mobile bottom-nav "+" tab and the desktop
// navbar "+" button, so the action behaves identically everywhere on the site.
export default function CreateMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const { user, isVendor } = useAuth();

  const go = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{isVendor ? 'Create' : 'Start selling'}</DrawerTitle>
        </DrawerHeader>

        {isVendor ? (
          <div className="p-4 pt-0 grid grid-cols-2 gap-3 pb-[calc(1rem+env(safe-area-inset-bottom))] max-w-md mx-auto w-full">
            <button
              onClick={() => go('/supplier-dashboard?tab=add-product')}
              className="flex flex-col items-center gap-2 rounded-xl border border-border p-5 active:scale-[0.98] transition-transform"
            >
              <Package className="w-7 h-7 text-primary" />
              <span className="text-sm font-medium">Add Product</span>
            </button>
            <button
              onClick={() => go('/supplier-dashboard?tab=videos&compose=1')}
              className="flex flex-col items-center gap-2 rounded-xl border border-border p-5 active:scale-[0.98] transition-transform"
            >
              <Film className="w-7 h-7 text-primary" />
              <span className="text-sm font-medium">Create Post</span>
            </button>
          </div>
        ) : (
          <div className="p-4 pt-0 pb-[calc(1rem+env(safe-area-inset-bottom))] max-w-md mx-auto w-full">
            <p className="text-sm text-muted-foreground mb-4">
              Only vendors can list products or post videos. Open your shop to start selling on MarketHub.
            </p>
            <button
              onClick={() => go(user ? '/supplier-signup' : '/users-login')}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground py-3 font-medium active:scale-[0.98] transition-transform"
            >
              <Store className="w-4 h-4" />
              Become a Vendor
            </button>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
