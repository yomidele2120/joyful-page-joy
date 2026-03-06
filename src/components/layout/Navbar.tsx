import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, Search, User, Menu, X, Heart, LogOut, Store } from 'lucide-react';
import logo from '@/assets/logo.jpeg';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { totalItems } = useCart();
  const { user, isAdmin, isVendor, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchOpen(false);
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-card/95 backdrop-blur-md border-b border-border">
      {/* Top Bar */}
      <div className="bg-primary text-primary-foreground text-xs py-1">
        <div className="container flex items-center justify-between">
          <span className="text-xs">Tech, Phones & Accessories</span>
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
          <img src={logo} alt="IT Hub Africa" className="h-8 w-auto object-contain" />
        </Link>

        {/* Desktop Search */}
        <form onSubmit={handleSearch} className="hidden md:flex flex-1 max-w-lg">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search laptops, electronics..."
              className="pl-10 bg-secondary border-none h-9 text-sm"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </form>

        {/* Right icons */}
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="md:hidden w-8 h-8" onClick={() => setSearchOpen(!searchOpen)}>
            <Search className="w-4 h-4" />
          </Button>

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
              <Link to={isAdmin ? '/admin' : isVendor ? '/supplier-dashboard' : '/user-dashboard'}>
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

          <Button variant="ghost" size="icon" className="md:hidden w-8 h-8" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Mobile Search */}
      {searchOpen && (
        <div className="md:hidden px-4 pb-2">
          <form onSubmit={handleSearch}>
            <Input
              placeholder="Search products..."
              className="h-9 text-sm"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              autoFocus
            />
          </form>
        </div>
      )}

      {/* Category Nav */}
      <nav className="hidden md:block border-t border-border">
        <div className="container flex items-center gap-5 h-9 text-xs overflow-x-auto">
          {['Laptops & Computers', 'Desktop Computers', 'Phones', 'Printers', 'Monitors', 'Gaming Devices', 'Electronics', 'Accessories'].map(cat => (
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

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-border bg-card animate-slide-in">
          <div className="container py-3 space-y-1">
            {!user && !isVendor && (
              <Link
                to="/supplier-signup"
                className="flex items-center gap-2 py-2 text-sm font-medium text-primary"
                onClick={() => setMenuOpen(false)}
              >
                <Store className="w-4 h-4" />
                Become a Supplier
              </Link>
            )}
            {['Laptops & Computers', 'Desktop Computers', 'Phones', 'Printers', 'Monitors', 'Gaming Devices', 'Electronics', 'Accessories'].map(cat => (
              <Link
                key={cat}
                to={`/category/${cat.toLowerCase().replace(/ & /g, '-').replace(/ /g, '-')}`}
                className="block py-1.5 text-sm text-muted-foreground hover:text-primary"
                onClick={() => setMenuOpen(false)}
              >
                {cat}
              </Link>
            ))}
            <Link to="/products" className="block py-1.5 text-sm font-medium text-primary" onClick={() => setMenuOpen(false)}>
              All Products
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
