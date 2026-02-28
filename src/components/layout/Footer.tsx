import { Link } from 'react-router-dom';
import { Mail, Phone, MapPin } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-foreground text-background/80 mt-16">
      <div className="container py-12 grid grid-cols-1 md:grid-cols-4 gap-8">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-heading font-bold text-sm">IT</span>
            </div>
            <span className="font-heading font-bold text-lg text-background">IT Hub Africa</span>
          </div>
          <p className="text-sm text-background/60">Buy, Sell, and Grow With Confidence. Nigeria's trusted tech marketplace.</p>
        </div>

        <div>
          <h4 className="font-heading font-semibold text-background mb-3">Quick Links</h4>
          <div className="space-y-2 text-sm">
            <Link to="/products" className="block hover:text-primary transition-colors">All Products</Link>
            <Link to="/category/laptops-computers" className="block hover:text-primary transition-colors">Laptops</Link>
            <Link to="/category/electronics" className="block hover:text-primary transition-colors">Electronics</Link>
            <Link to="/category/accessories" className="block hover:text-primary transition-colors">Accessories</Link>
          </div>
        </div>

        <div>
          <h4 className="font-heading font-semibold text-background mb-3">Support</h4>
          <div className="space-y-2 text-sm">
            <Link to="/users-login" className="block hover:text-primary transition-colors">My Account</Link>
            <Link to="/suppliers-login" className="block hover:text-primary transition-colors">Supplier Login</Link>
            <Link to="/cart" className="block hover:text-primary transition-colors">Cart</Link>
            <Link to="/wishlist" className="block hover:text-primary transition-colors">Wishlist</Link>
            <Link to="/admin-login" className="block hover:text-primary transition-colors text-background/40 hover:text-primary/80">Admin Login</Link>
          </div>
        </div>

        <div>
          <h4 className="font-heading font-semibold text-background mb-3">Contact</h4>
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 mt-0.5 text-primary shrink-0" />
              <span>Suite 108, Foramot Plaza, Computer Village, Ikeja, Lagos</span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-primary" />
              <span>+234 806 047 4393</span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-primary" />
              <span>team@ithubafrica.com</span>
            </div>
          </div>
        </div>
      </div>
      <div className="border-t border-background/10 py-4 text-center text-xs text-background/40">
        © {new Date().getFullYear()} IT Hub Africa. All rights reserved.
      </div>
    </footer>
  );
}
