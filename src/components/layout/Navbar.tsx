import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, Search, User, Menu, X, Heart } from 'lucide-react';
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
  const { user, isAdmin, signOut } = useAuth();
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
      <div className="bg-primary text-primary-foreground text-xs py-1.5">
        <div className="container flex items-center justify-between">
          <span>📍 Computer Village, Ikeja, Lagos</span>
          <span className="hidden sm:block">📞 +234 806 047 4393</span>
        </div>
      </div>

      {/* Main Nav */}
      <div className="container flex items-center justify-between h-16 gap-4">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-heading font-bold text-sm">IT</span>
          </div>
          <div className="hidden sm:block">
            <span className="font-heading font-bold text-lg leading-none text-foreground">IT Hub Africa</span>
            <span className="block text-[10px] text-muted-foreground leading-none">Buy, Sell & Grow</span>
          </div>
        </Link>

        {/* Desktop Search */}
        <form onSubmit={handleSearch} className="hidden md:flex flex-1 max-w-lg">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search laptops, electronics..."
              className="pl-10 bg-secondary border-none"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </form>

        {/* Right icons */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSearchOpen(!searchOpen)}>
            <Search className="w-5 h-5" />
          </Button>

          <Link to="/wishlist">
            <Button variant="ghost" size="icon">
              <Heart className="w-5 h-5" />
            </Button>
          </Link>

          <Link to="/cart" className="relative">
            <Button variant="ghost" size="icon">
              <ShoppingCart className="w-5 h-5" />
              {totalItems > 0 && (
                <Badge className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center p-0 text-[10px] bg-accent text-accent-foreground border-none">
                  {totalItems}
                </Badge>
              )}
            </Button>
          </Link>

          {user ? (
            <div className="flex items-center gap-1">
              {isAdmin && (
                <Link to="/admin">
                  <Button variant="ghost" size="sm" className="hidden sm:inline-flex text-xs">Admin</Button>
                </Link>
              )}
              <Button variant="ghost" size="sm" onClick={signOut} className="text-xs">Logout</Button>
            </div>
          ) : (
            <Link to="/users-login">
              <Button variant="ghost" size="icon">
                <User className="w-5 h-5" />
              </Button>
            </Link>
          )}

          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Search */}
      {searchOpen && (
        <div className="md:hidden px-4 pb-3">
          <form onSubmit={handleSearch}>
            <Input
              placeholder="Search products..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              autoFocus
            />
          </form>
        </div>
      )}

      {/* Category Nav */}
      <nav className="hidden md:block border-t border-border">
        <div className="container flex items-center gap-6 h-10 text-sm overflow-x-auto">
          {['Laptops & Computers', 'Desktop Computers', 'Printers', 'Monitors', 'Gaming Devices', 'Electronics', 'Accessories'].map(cat => (
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
          <div className="container py-4 space-y-2">
            {['Laptops & Computers', 'Desktop Computers', 'Printers', 'Monitors', 'Gaming Devices', 'Electronics', 'Accessories'].map(cat => (
              <Link
                key={cat}
                to={`/category/${cat.toLowerCase().replace(/ & /g, '-').replace(/ /g, '-')}`}
                className="block py-2 text-sm text-muted-foreground hover:text-primary"
                onClick={() => setMenuOpen(false)}
              >
                {cat}
              </Link>
            ))}
            <Link to="/products" className="block py-2 text-sm font-medium text-primary" onClick={() => setMenuOpen(false)}>
              All Products
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
