import { Link, useLocation } from 'react-router-dom';
import { Home, Clapperboard, Plus, ShoppingCart, User } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useCart } from '@/contexts/CartContext';
import { Badge } from '@/components/ui/badge';
import CreateMenu from '@/components/CreateMenu';
import { cn } from '@/lib/utils';


// Fixed, mobile-only bottom tab bar shown across the whole site (including
// the immersive /feed page, where it sits below the video rather than
// overlapping it — see the height calc in Feed.tsx). Desktop keeps the
// existing top Navbar as the only nav; this never renders at md+.
export default function BottomNav() {
  const location = useLocation();
  const { user, isVendor } = useAuth();
  const { totalItems } = useCart();

  const [composerOpen, setComposerOpen] = useState(false);

  const isActive = (path: string) => (path === '/' ? location.pathname === '/' : location.pathname.startsWith(path));

  const handlePlusClick = () => {
    setComposerOpen(true);
  };

  return (
    <>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-background border-t border-border pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5 h-14">
          <NavTab to="/" icon={<Home className="w-5 h-5" />} label="Home" active={isActive('/')} />
          <NavTab to="/feed" icon={<Clapperboard className="w-5 h-5" />} label="Watch" active={isActive('/feed')} />

          <button onClick={handlePlusClick} className="flex flex-col items-center justify-center gap-0.5" aria-label="Create">
            <span className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center -mt-1">
              <Plus className="w-5 h-5" />
            </span>
          </button>

          <NavTab
            to="/cart"
            icon={
              <span className="relative">
                <ShoppingCart className="w-5 h-5" />
                {totalItems > 0 && (
                  <Badge className="absolute -top-1.5 -right-2 w-4 h-4 flex items-center justify-center p-0 text-[8px] bg-accent text-accent-foreground border-none">
                    {totalItems}
                  </Badge>
                )}
              </span>
            }
            label="Cart"
            active={isActive('/cart')}
          />

          <NavTab
            to={user ? (isVendor ? '/supplier-dashboard' : '/user-dashboard') : '/users-login'}
            icon={<User className="w-5 h-5" />}
            label="Account"
            active={isActive('/user-dashboard') || isActive('/supplier-dashboard') || isActive('/users-login')}
          />
        </div>
      </nav>

      <Drawer open={composerOpen} onOpenChange={setComposerOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{isVendor ? 'Create' : 'Start selling'}</DrawerTitle>
          </DrawerHeader>

          {isVendor ? (
            <div className="p-4 pt-0 grid grid-cols-2 gap-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <button
                onClick={() => { setComposerOpen(false); navigate('/supplier-dashboard?tab=add-product'); }}
                className="flex flex-col items-center gap-2 rounded-xl border border-border p-5 active:scale-[0.98] transition-transform"
              >
                <Package className="w-7 h-7 text-primary" />
                <span className="text-sm font-medium">Add Product</span>
              </button>
              <button
                onClick={() => { setComposerOpen(false); navigate('/supplier-dashboard?tab=videos&compose=1'); }}
                className="flex flex-col items-center gap-2 rounded-xl border border-border p-5 active:scale-[0.98] transition-transform"
              >
                <Film className="w-7 h-7 text-primary" />
                <span className="text-sm font-medium">Create Post</span>
              </button>
            </div>
          ) : (
            <div className="p-4 pt-0 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <p className="text-sm text-muted-foreground mb-4">
                Only vendors can list products or post videos. Open your shop to start selling on MarketHub.
              </p>
              <button
                onClick={() => { setComposerOpen(false); navigate(user ? '/supplier-signup' : '/users-login'); }}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground py-3 font-medium active:scale-[0.98] transition-transform"
              >
                <Store className="w-4 h-4" />
                Become a Vendor
              </button>
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </>
  );
}

function NavTab({ to, icon, label, active }: { to: string; icon: React.ReactNode; label: string; active: boolean }) {
  return (
    <Link
      to={to}
      className={cn(
        'flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium',
        active ? 'text-primary' : 'text-muted-foreground'
      )}
    >
      {icon}
      {label}
    </Link>
  );
}
