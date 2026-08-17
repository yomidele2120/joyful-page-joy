import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, Search, User, Menu, Heart, LogOut, Store, Clapperboard, Bell } from 'lucide-react';
import logo from '@/assets/logo.jpeg';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from '@/components/ui/sheet';
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import ThemeToggle, { ThemeSwitchRow } from '@/components/ThemeToggle';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useNotifications, useUnreadNotificationCount, useMarkNotificationsRead } from '@/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';

const CATEGORIES = ['Fashion', 'Electronics', 'Home & Living', 'Beauty & Health', 'Groceries', 'Baby & Kids', 'Sports & Outdoors', 'Phones & Accessories'];

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { totalItems } = useCart();
  const { user, isAdmin, isVendor, signOut } = useAuth();
  const unreadCount = useUnreadNotificationCount();
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
      setMenuOpen(false);
    }
  };

  const accountHref = isAdmin ? '/admin' : isVendor ? '/supplier-dashboard' : '/user-dashboard';

  return (
    <header className="sticky top-0 z-50 bg-card/95 backdrop-blur-md border-b border-border">
      {/* Top Bar */}
      <div className="bg-primary text-primary-foreground text-xs py-1">
        <div className="container flex items-center justify-between">
          <span className="text-xs">Fashion, Electronics, Home & More</span>
          {!user && !isVendor && (
            <Link to="/supplier-signup" className="flex items-center gap-1 text-xs hover:underline">
              <Store className="w-3 h-3" />
              Become a Supplier
            </Link>
          )}
          {isVendor && (
            <Link to="/supplier-dashboard" className="flex items-center gap-1 text-xs hover:underline">
              <Store className="w-3 h-3" />
              Seller Dashboard
            </Link>
          )}
        </div>
      </div>

      {/* Main Nav */}
      <div className="container flex items-center justify-between h-12 gap-2">
        <Link to="/" className="flex items-center shrink-0">
          <img src={logo} alt="MarketHub Africa" className="h-8 w-auto object-contain dark:invert" />
        </Link>

        {/* Desktop Search */}
        <form onSubmit={handleSearch} className="hidden md:flex flex-1 max-w-lg">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search for products, brands and categories..."
              className="pl-10 bg-secondary border-none h-9 text-sm"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </form>

        {/* Desktop icons — hidden on mobile; mobile gets everything in the menu sheet below */}
        <div className="hidden md:flex items-center gap-0.5">
          <Link to="/feed" title="Watch">
            <Button variant="ghost" size="icon" className="w-8 h-8">
              <Clapperboard className="w-4 h-4" />
            </Button>
          </Link>

          <Link to="/wishlist">
            <Button variant="ghost" size="icon" className="w-8 h-8">
              <Heart className="w-4 h-4" />
            </Button>
          </Link>

          <Link to="/cart" className="relative">
            <Button variant="ghost" size="icon" className="w-8 h-8">
              <ShoppingCart className="w-4 h-4" />
              {totalItems > 0 && (
                <Badge className="absolute -top-0.5 -right-0.5 w-4 h-4 flex items-center justify-center p-0 text-[8px] bg-accent text-accent-foreground border-none">
                  {totalItems}
                </Badge>
              )}
            </Button>
          </Link>

          {user ? (
            <>
              <NotificationBell />
              <Link to={accountHref}>
                <Button variant="ghost" size="icon" className="w-8 h-8">
                  <User className="w-4 h-4" />
                </Button>
              </Link>
              <Button variant="ghost" size="icon" className="w-8 h-8" onClick={signOut} title="Logout">
                <LogOut className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <Link to="/users-login">
              <Button variant="ghost" size="icon" className="w-8 h-8">
                <User className="w-4 h-4" />
              </Button>
            </Link>
          )}

          <span className="w-px h-5 bg-border mx-1" aria-hidden="true" />
          <ThemeToggle />
        </div>

        {/* Mobile: a single menu trigger holds everything — search, icons, categories */}
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <Button variant="ghost" size="icon" className="md:hidden w-9 h-9 relative" onClick={() => setMenuOpen(true)}>
            <Menu className="w-5 h-5" />
            {(totalItems > 0 || unreadCount > 0) && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-accent" />
            )}
          </Button>
          <SheetContent
            side="left"
            className="w-[85vw] sm:w-80 p-0 flex flex-col"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <SheetHeader className="p-4 border-b border-border text-left">
              <SheetTitle className="flex items-center gap-2">
                <img src={logo} alt="MarketHub Africa" className="h-7 w-auto object-contain dark:invert" />
              </SheetTitle>
            </SheetHeader>

            <div className="overflow-y-auto flex-1">
              <form onSubmit={handleSearch} className="p-4 border-b border-border">
                <div className="relative w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search products..."
                    className="pl-10 h-10 text-sm"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
              </form>

              {/* Quick actions */}
              <div className="grid grid-cols-4 gap-1 p-4 border-b border-border">
                <SheetClose asChild>
                  <Link to="/feed" className="flex flex-col items-center gap-1.5 py-2 rounded-lg hover:bg-secondary text-center">
                    <Clapperboard className="w-5 h-5" />
                    <span className="text-[10px] font-medium text-muted-foreground">Watch</span>
                  </Link>
                </SheetClose>
                <SheetClose asChild>
                  <Link to="/wishlist" className="flex flex-col items-center gap-1.5 py-2 rounded-lg hover:bg-secondary text-center">
                    <Heart className="w-5 h-5" />
                    <span className="text-[10px] font-medium text-muted-foreground">Wishlist</span>
                  </Link>
                </SheetClose>
                <SheetClose asChild>
                  <Link to="/cart" className="relative flex flex-col items-center gap-1.5 py-2 rounded-lg hover:bg-secondary text-center">
                    <span className="relative">
                      <ShoppingCart className="w-5 h-5" />
                      {totalItems > 0 && (
                        <Badge className="absolute -top-1.5 -right-2 w-4 h-4 flex items-center justify-center p-0 text-[8px] bg-accent text-accent-foreground border-none">
                          {totalItems}
                        </Badge>
                      )}
                    </span>
                    <span className="text-[10px] font-medium text-muted-foreground">Cart</span>
                  </Link>
                </SheetClose>
                {user ? (
                  <SheetClose asChild>
                    <Link to={accountHref} className="relative flex flex-col items-center gap-1.5 py-2 rounded-lg hover:bg-secondary text-center">
                      <span className="relative">
                        <Bell className="w-5 h-5" />
                        {unreadCount > 0 && (
                          <Badge className="absolute -top-1.5 -right-2 w-4 h-4 flex items-center justify-center p-0 text-[8px] bg-accent text-accent-foreground border-none">
                            {unreadCount}
                          </Badge>
                        )}
                      </span>
                      <span className="text-[10px] font-medium text-muted-foreground">Account</span>
                    </Link>
                  </SheetClose>
                ) : (
                  <SheetClose asChild>
                    <Link to="/users-login" className="flex flex-col items-center gap-1.5 py-2 rounded-lg hover:bg-secondary text-center">
                      <User className="w-5 h-5" />
                      <span className="text-[10px] font-medium text-muted-foreground">Login</span>
                    </Link>
                  </SheetClose>
                )}
              </div>

              <div className="border-b border-border">
                <ThemeSwitchRow />
              </div>

              {!user && !isVendor && (
                <SheetClose asChild>
                  <Link
                    to="/supplier-signup"
                    className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-primary border-b border-border"
                  >
                    <Store className="w-4 h-4" />
                    Become a Supplier
                  </Link>
                </SheetClose>
              )}

              <div className="py-2">
                <p className="px-4 pt-2 pb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">Categories</p>
                {CATEGORIES.map(cat => (
                  <SheetClose asChild key={cat}>
                    <Link
                      to={`/category/${cat.toLowerCase().replace(/ & /g, '-').replace(/ /g, '-')}`}
                      className="block px-4 py-2 text-sm text-foreground hover:bg-secondary"
                    >
                      {cat}
                    </Link>
                  </SheetClose>
                ))}
                <SheetClose asChild>
                  <Link to="/products" className="block px-4 py-2 text-sm font-medium text-primary">
                    All Products
                  </Link>
                </SheetClose>
              </div>

              {user && (
                <div className="border-t border-border py-2">
                  <button
                    onClick={() => { signOut(); setMenuOpen(false); }}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-destructive w-full text-left"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Category Nav (desktop only) */}
      <nav className="hidden md:block border-t border-border">
        <div className="container flex items-center gap-5 h-9 text-xs overflow-x-auto">
          {CATEGORIES.map(cat => (
            <Link
              key={cat}
              to={`/category/${cat.toLowerCase().replace(/ & /g, '-').replace(/ /g, '-')}`}
              className="text-muted-foreground hover:text-primary whitespace-nowrap transition-colors"
            >
              {cat}
            </Link>
          ))}
          <Link to="/products" className="text-primary font-medium whitespace-nowrap">All Products</Link>
        </div>
      </nav>
    </header>
  );
}

function NotificationBell() {
  const { data: notifications } = useNotifications();
  const unreadCount = useUnreadNotificationCount();
  const markRead = useMarkNotificationsRead();

  const handleOpenChange = (open: boolean) => {
    if (open) {
      const unreadIds = (notifications ?? []).filter((n) => !n.is_read).map((n) => n.id);
      if (unreadIds.length) markRead.mutate(unreadIds);
    }
  };

  return (
    <DropdownMenu onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="w-8 h-8 relative">
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-0.5 -right-0.5 w-4 h-4 flex items-center justify-center p-0 text-[8px] bg-accent text-accent-foreground border-none">
              {unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(!notifications || notifications.length === 0) && (
          <p className="px-2 py-4 text-sm text-muted-foreground text-center">No notifications yet</p>
        )}
        {notifications?.map((n) => (
          <DropdownMenuItem key={n.id} className="flex flex-col items-start gap-0.5 whitespace-normal">
            <span className="text-sm">{n.message}</span>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
