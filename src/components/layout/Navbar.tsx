import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ShoppingCart, Search, User, Menu, Heart, LogOut, Store, Clapperboard, Bell, MessageSquare,
  FileText, ClipboardList, ChevronDown, LayoutGrid, Inbox, Package,
} from 'lucide-react';
import logo from '@/assets/logo.jpeg';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from '@/components/ui/sheet';
import { useCart } from '@/contexts/CartContext';
import { useInquiryBasket } from '@/contexts/InquiryBasketContext';
import { useAuth } from '@/hooks/useAuth';
import { useCategories } from '@/hooks/useProducts';
import { useUnreadCount } from '@/hooks/useChat';
import { Badge } from '@/components/ui/badge';
import ThemeToggle, { ThemeSwitchRow } from '@/components/ThemeToggle';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useNotifications, useUnreadNotificationCount, useMarkNotificationsRead } from '@/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';

type SearchScope = 'products' | 'suppliers';

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <Badge className="absolute -top-1 -right-1 min-w-4 h-4 flex items-center justify-center px-1 text-[9px] bg-accent text-accent-foreground border-none">
      {count > 99 ? '99+' : count}
    </Badge>
  );
}

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [scope, setScope] = useState<SearchScope>('products');
  const { totalItems } = useCart();
  const { count: basketCount } = useInquiryBasket();
  const { user, isAdmin, isVendor, signOut } = useAuth();
  const { data: categories } = useCategories();
  const unreadNotifications = useUnreadNotificationCount();
  const unreadMessages = useUnreadCount();
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    const params = new URLSearchParams({ search: q });
    if (scope === 'suppliers') params.set('tab', 'suppliers');
    navigate(`/products?${params.toString()}`);
    setMenuOpen(false);
  };

  const accountHref = isAdmin ? '/admin' : isVendor ? '/supplier-dashboard' : '/user-dashboard';
  const topCategories = (categories ?? []).slice(0, 7);

  return (
    <header className="sticky top-0 z-50 bg-card/95 backdrop-blur-md border-b border-border">
      {/* Utility bar */}
      <div className="bg-primary text-primary-foreground text-xs py-1">
        <div className="container flex items-center justify-between">
          <span className="truncate">Source in bulk from verified Nigerian suppliers</span>
          <div className="flex items-center gap-4 shrink-0">
            <Link to="/rfq/new" className="hidden sm:inline hover:underline">Request a quote</Link>
            {isVendor ? (
              <Link to="/supplier-dashboard" className="flex items-center gap-1 hover:underline">
                <Store className="w-3 h-3" /> Seller Dashboard
              </Link>
            ) : (
              <Link to="/supplier-signup" className="flex items-center gap-1 hover:underline">
                <Store className="w-3 h-3" /> Become a Supplier
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Row 1: logo, search, actions */}
      <div className="container flex items-center justify-between h-14 gap-3">
        <Link to="/" className="flex items-center shrink-0">
          <img src={logo} alt="MarketHub Africa" className="h-8 md:h-9 w-auto object-contain dark:invert" />
        </Link>

        {/* Desktop search with scope switch */}
        <form onSubmit={handleSearch} className="hidden md:flex flex-1 max-w-2xl">
          <div className="flex w-full items-stretch overflow-hidden rounded-full border-2 border-primary bg-background">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="flex shrink-0 items-center gap-1 border-r border-border bg-secondary/50 px-4 text-sm font-medium">
                  {scope === 'products' ? 'Products' : 'Suppliers'} <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => setScope('products')}>Products</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setScope('suppliers')}>Suppliers</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Input
              placeholder={scope === 'products' ? 'Enter a keyword to search products' : 'Enter a supplier name'}
              aria-label="Search"
              className="h-10 flex-1 rounded-none border-none bg-transparent text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            <button type="submit" aria-label="Search" className="flex shrink-0 items-center justify-center bg-primary px-5 text-primary-foreground">
              <Search className="h-4 w-4" />
            </button>
          </div>
        </form>

        {/* Desktop actions */}
        <div className="hidden md:flex items-center gap-1">
          <Link to="/rfq/new" className="flex flex-col items-center px-2 text-[11px] text-muted-foreground hover:text-primary" title="Post a request for quotation">
            <FileText className="h-5 w-5" /> Post RFQ
          </Link>
          <Link to="/messages" className="relative flex flex-col items-center px-2 text-[11px] text-muted-foreground hover:text-primary">
            <span className="relative"><MessageSquare className="h-5 w-5" /><CountBadge count={unreadMessages} /></span>
            Messages
          </Link>
          <Link to="/inquiries?tab=basket" className="relative flex flex-col items-center px-2 text-[11px] text-muted-foreground hover:text-primary">
            <span className="relative"><ClipboardList className="h-5 w-5" /><CountBadge count={basketCount} /></span>
            Inquiry Basket
          </Link>
          <Link to="/cart" className="relative flex flex-col items-center px-2 text-[11px] text-muted-foreground hover:text-primary">
            <span className="relative"><ShoppingCart className="h-5 w-5" /><CountBadge count={totalItems} /></span>
            Cart
          </Link>
          {user && <NotificationBell />}
          <AccountMenu user={!!user} isAdmin={isAdmin} isVendor={isVendor} accountHref={accountHref} signOut={signOut} />
          <span className="w-px h-5 bg-border mx-1" aria-hidden="true" />
          <ThemeToggle />
        </div>

        {/* Mobile: quick icons + menu */}
        <div className="flex items-center gap-1 md:hidden">
          <Link to="/messages" className="relative p-2" aria-label="Messages">
            <MessageSquare className="h-5 w-5" /><CountBadge count={unreadMessages} />
          </Link>
          <Link to="/cart" className="relative p-2" aria-label="Cart">
            <ShoppingCart className="h-5 w-5" /><CountBadge count={totalItems} />
          </Link>
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <Button variant="ghost" size="icon" className="w-9 h-9 relative" onClick={() => setMenuOpen(true)} aria-label="Open menu">
              <Menu className="w-5 h-5" />
              {unreadNotifications > 0 && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-accent" />}
            </Button>
            <SheetContent side="left" className="w-[85vw] sm:w-80 p-0 flex flex-col" onOpenAutoFocus={(e) => e.preventDefault()}>
              <SheetHeader className="p-4 border-b border-border text-left">
                <SheetTitle className="flex items-center gap-2">
                  <img src={logo} alt="MarketHub Africa" className="h-7 w-auto object-contain dark:invert" />
                </SheetTitle>
              </SheetHeader>

              <div className="overflow-y-auto flex-1">
                <div className="grid grid-cols-4 gap-1 p-4 border-b border-border">
                  <MenuTile to="/rfq/new" icon={<FileText className="w-5 h-5" />} label="Post RFQ" />
                  <MenuTile to="/inquiries" icon={<Inbox className="w-5 h-5" />} label="Inquiries" badge={basketCount} />
                  <MenuTile to="/feed" icon={<Clapperboard className="w-5 h-5" />} label="Watch" />
                  <MenuTile to="/wishlist" icon={<Heart className="w-5 h-5" />} label="Wishlist" />
                  <MenuTile to="/messages" icon={<MessageSquare className="w-5 h-5" />} label="Messages" badge={unreadMessages} />
                  <MenuTile to="/cart" icon={<ShoppingCart className="w-5 h-5" />} label="Cart" badge={totalItems} />
                  <MenuTile to="/products?tab=suppliers" icon={<Store className="w-5 h-5" />} label="Suppliers" />
                  {user ? (
                    <MenuTile to={accountHref} icon={<Bell className="w-5 h-5" />} label="Account" badge={unreadNotifications} />
                  ) : (
                    <MenuTile to="/users-login" icon={<User className="w-5 h-5" />} label="Sign in" />
                  )}
                </div>

                <div className="border-b border-border"><ThemeSwitchRow /></div>

                <div className="py-2">
                  <p className="px-4 pt-2 pb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">Categories</p>
                  {(categories ?? []).map(cat => (
                    <SheetClose asChild key={cat.id}>
                      <Link to={`/category/${cat.slug}`} className="block px-4 py-2 text-sm text-foreground hover:bg-secondary">{cat.name}</Link>
                    </SheetClose>
                  ))}
                  <SheetClose asChild>
                    <Link to="/products" className="block px-4 py-2 text-sm font-medium text-primary">All Products</Link>
                  </SheetClose>
                </div>

                {user && (
                  <div className="border-t border-border py-2">
                    <button onClick={() => { signOut(); setMenuOpen(false); }} className="flex items-center gap-2 px-4 py-2.5 text-sm text-destructive w-full text-left">
                      <LogOut className="w-4 h-4" /> Logout
                    </button>
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Mobile search */}
      <form onSubmit={handleSearch} className="md:hidden border-t border-border/70 px-3 py-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search products"
            aria-label="Search products"
            className="h-10 rounded-full border-primary bg-secondary/40 pl-10 pr-4 text-sm"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </form>

      {/* Row 2: categories and primary links (desktop) */}
      <nav className="hidden md:block border-t border-border">
        <div className="container flex items-center gap-5 h-10 text-sm">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1.5 font-medium hover:text-primary">
                <LayoutGrid className="h-4 w-4" /> All Categories <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64 max-h-[70vh] overflow-y-auto">
              {(categories ?? []).map(cat => (
                <DropdownMenuItem key={cat.id} asChild>
                  <Link to={`/category/${cat.slug}`}>{cat.name}</Link>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild><Link to="/products" className="font-medium text-primary">View all products</Link></DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="h-4 w-px bg-border" aria-hidden="true" />
          <Link to="/products?tab=suppliers" className="hover:text-primary">Suppliers</Link>
          <Link to="/rfq/new" className="hover:text-primary">Request for Quotation</Link>
          <Link to="/feed" className="hover:text-primary">Watch &amp; Shop</Link>
          <span className="h-4 w-px bg-border" aria-hidden="true" />
          <div className="flex items-center gap-5 overflow-x-auto text-xs text-muted-foreground">
            {topCategories.map(cat => (
              <Link key={cat.id} to={`/category/${cat.slug}`} className="whitespace-nowrap hover:text-primary transition-colors">{cat.name}</Link>
            ))}
          </div>
        </div>
      </nav>
    </header>
  );
}

function MenuTile({ to, icon, label, badge = 0 }: { to: string; icon: React.ReactNode; label: string; badge?: number }) {
  return (
    <SheetClose asChild>
      <Link to={to} className="relative flex flex-col items-center gap-1.5 py-2 rounded-lg hover:bg-secondary text-center">
        <span className="relative">{icon}<CountBadge count={badge} /></span>
        <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
      </Link>
    </SheetClose>
  );
}

function AccountMenu({ user, isAdmin, isVendor, accountHref, signOut }: {
  user: boolean; isAdmin: boolean; isVendor: boolean; accountHref: string; signOut: () => void;
}) {
  if (!user) {
    return (
      <Link to="/users-login" className="flex flex-col items-center px-2 text-[11px] text-muted-foreground hover:text-primary">
        <User className="h-5 w-5" /> Sign in
      </Link>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex flex-col items-center px-2 text-[11px] text-muted-foreground hover:text-primary">
          <User className="h-5 w-5" /> Account
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem asChild><Link to={accountHref}><Package className="mr-2 h-4 w-4" />{isAdmin ? 'Admin' : isVendor ? 'Seller Dashboard' : 'My Account'}</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link to="/inquiries"><Inbox className="mr-2 h-4 w-4" />Inquiries</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link to="/messages"><MessageSquare className="mr-2 h-4 w-4" />Chats</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link to="/rfq"><FileText className="mr-2 h-4 w-4" />Quotations</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link to="/wishlist"><Heart className="mr-2 h-4 w-4" />Favorites</Link></DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut} className="text-destructive"><LogOut className="mr-2 h-4 w-4" />Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationBell() {
  const { data: notifications } = useNotifications();
  const unreadCount = useUnreadNotificationCount();
  const markRead = useMarkNotificationsRead();
  const navigate = useNavigate();

  const handleOpenChange = (open: boolean) => {
    if (open) {
      const unreadIds = (notifications ?? []).filter((n) => !n.is_read).map((n) => n.id);
      if (unreadIds.length) markRead.mutate(unreadIds);
    }
  };

  return (
    <DropdownMenu onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button className="relative flex flex-col items-center px-2 text-[11px] text-muted-foreground hover:text-primary" aria-label="Notifications">
          <span className="relative"><Bell className="h-5 w-5" /><CountBadge count={unreadCount} /></span>
          Alerts
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(!notifications || notifications.length === 0) && (
          <p className="px-2 py-4 text-sm text-muted-foreground text-center">No notifications yet</p>
        )}
        {notifications?.map((n) => (
          <DropdownMenuItem
            key={n.id}
            className="flex flex-col items-start gap-0.5 whitespace-normal cursor-pointer"
            onClick={() => { if (n.link) navigate(n.link); }}
          >
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
