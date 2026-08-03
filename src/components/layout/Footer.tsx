import { Link } from 'react-router-dom';
import { Mail, Phone } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-foreground text-background/80 mt-16">
      <div className="container py-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-8 text-sm">
        {/* Brand */}
        <div className="sm:col-span-2 lg:col-span-1">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <span className="text-primary-foreground font-heading font-bold text-sm">M</span>
            </div>
            <span className="font-heading font-bold text-lg text-background">MarketHub Africa</span>
          </div>
          <p className="text-background/60 leading-relaxed max-w-xs">
            Buy, Sell, and Grow With Confidence. Nigeria's trusted online marketplace.
          </p>
        </div>

        {/* Quick Links */}
        <div className="border-t border-background/10 pt-6 sm:border-0 sm:pt-0">
          <h4 className="font-heading font-semibold text-background mb-3">Quick Links</h4>
          <div className="flex flex-col gap-2.5">
            <Link to="/products" className="hover:text-primary transition-colors">All Products</Link>
            <Link to="/category/fashion" className="hover:text-primary transition-colors">Fashion</Link>
            <Link to="/category/electronics" className="hover:text-primary transition-colors">Electronics</Link>
            <Link to="/category/home-living" className="hover:text-primary transition-colors">Home & Living</Link>
          </div>
        </div>

        {/* Support */}
        <div className="border-t border-background/10 pt-6 sm:border-0 sm:pt-0">
          <h4 className="font-heading font-semibold text-background mb-3">Support</h4>
          <div className="flex flex-col gap-2.5">
            <Link to="/users-login" className="hover:text-primary transition-colors">My Account</Link>
            <Link to="/suppliers-login" className="hover:text-primary transition-colors">Supplier Login</Link>
            <Link to="/cart" className="hover:text-primary transition-colors">Cart</Link>
            <Link to="/wishlist" className="hover:text-primary transition-colors">Wishlist</Link>
            <Link to="/admin-login" className="text-background/40 hover:text-primary/80 transition-colors">Admin Login</Link>
          </div>
        </div>

        {/* Contact */}
        <div className="border-t border-background/10 pt-6 sm:border-0 sm:pt-0">
          <h4 className="font-heading font-semibold text-background mb-3">Contact</h4>
          <div className="flex flex-col gap-3">
            <a
              href="tel:+2348060474393"
              className="flex items-center gap-2.5 min-w-0 hover:text-primary transition-colors"
            >
              <Phone className="w-4 h-4 text-primary shrink-0" />
              <span className="truncate">+234 806 047 4393</span>
            </a>
            <a
              href="mailto:team@markethubafrica.com"
              className="flex items-center gap-2.5 min-w-0 hover:text-primary transition-colors"
            >
              <Mail className="w-4 h-4 text-primary shrink-0" />
              <span className="truncate">team@markethubafrica.com</span>
            </a>
          </div>
        </div>
      </div>

      <div className="border-t border-background/10 py-4 px-6">
        <p className="text-center text-xs text-background/40">
          © {new Date().getFullYear()} MarketHub Africa. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
