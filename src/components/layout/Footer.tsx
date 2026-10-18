import { BrandLogoPill } from '@/components/BrandLogo';
import { Link } from 'react-router-dom';
import { Globe, Mail, MapPin, Phone } from 'lucide-react';
import { useCategories } from '@/hooks/useProducts';
import { COMPANY_LINKS, LEGAL_LINKS } from '@/config/business';
import { useConsent } from '@/contexts/ConsentContext';
import { useMarketplaceSettings, usePayLaterAvailable } from '@/hooks/useMarketplace';

export default function Footer() {
  const { data: categories } = useCategories();
  const { openPreferences } = useConsent();
  const payLaterOn = usePayLaterAvailable();
  const { data: marketplace } = useMarketplaceSettings();
  return (
    <footer className="bg-foreground dark:bg-black text-background dark:text-white mt-16">
      <div className="container py-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-8 text-sm">
        {/* Brand */}
        <div className="sm:col-span-2 lg:col-span-1">
          <Link to="/" aria-label="IT Hub Africa home" className="mb-4 inline-block">
            <BrandLogoPill logoClassName="h-10" />
          </Link>
          <p className="text-background/60 dark:text-white/60 leading-relaxed max-w-xs">
            Buy, Sell, and Grow With Confidence. Nigeria's trusted online marketplace.
          </p>
        </div>

        {/* Buyers */}
        <div className="border-t border-background/10 dark:border-white/10 pt-6 sm:border-0 sm:pt-0">
          <h4 className="font-heading font-semibold text-background dark:text-white mb-3">For Buyers</h4>
          <div className="flex flex-col gap-2.5 text-background/80 dark:text-white/80">
            <Link to="/products" className="hover:text-primary transition-colors">All Products</Link>
            <Link to="/products?tab=suppliers" className="hover:text-primary transition-colors">Find Suppliers</Link>
            <Link to="/rfq/new" className="hover:text-primary transition-colors">Request for Quotation</Link>
            {payLaterOn && <Link to="/pay-later" className="hover:text-primary transition-colors">Pay Later</Link>}
            {marketplace?.preorder_enabled !== false && <Link to="/preorders" className="hover:text-primary transition-colors">Preorders</Link>}
            <Link to="/my-orders" className="hover:text-primary transition-colors">My Orders</Link>
            <Link to="/inquiries" className="hover:text-primary transition-colors">My Inquiries</Link>
            <Link to="/messages" className="hover:text-primary transition-colors">Messages</Link>
            {(categories ?? []).slice(0, 3).map(cat => (
              <Link key={cat.id} to={`/category/${cat.slug}`} className="hover:text-primary transition-colors">{cat.name}</Link>
            ))}
          </div>
        </div>

        {/* Suppliers & account */}
        <div className="border-t border-background/10 dark:border-white/10 pt-6 sm:border-0 sm:pt-0">
          <h4 className="font-heading font-semibold text-background dark:text-white mb-3">Suppliers &amp; Account</h4>
          <div className="flex flex-col gap-2.5 text-background/80 dark:text-white/80">
            <Link to="/supplier-signup" className="hover:text-primary transition-colors">Become a Supplier</Link>
            <Link to="/suppliers-login" className="hover:text-primary transition-colors">Supplier Login</Link>
            <Link to="/users-login" className="hover:text-primary transition-colors">My Account</Link>
            <Link to="/cart" className="hover:text-primary transition-colors">Cart</Link>
            <Link to="/wishlist" className="hover:text-primary transition-colors">Wishlist</Link>
          </div>
        </div>

        {/* Contact */}
        <div className="border-t border-background/10 dark:border-white/10 pt-6 sm:border-0 sm:pt-0">
          <h4 className="font-heading font-semibold text-background dark:text-white mb-3">Contact</h4>
          <div className="flex flex-col gap-3 text-background/80 dark:text-white/80">
            <div className="flex items-start gap-2.5">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <address className="not-italic leading-relaxed">
                Suite 108, Foramot Plaza, Somoye Osundairo,<br />
                by Polaris Bank, Oremeji,<br />
                Computer Village, Ikeja, Lagos,
              </address>
            </div>
            <a
              href="tel:+2348060474393"
              className="flex items-center gap-2.5 min-w-0 hover:text-primary transition-colors"
            >
              <Phone className="w-4 h-4 text-primary shrink-0" />
              <span className="truncate">+234 806 047 4393</span>
            </a>
            <a
              href="mailto:team@ithubafrica.com"
              className="flex items-center gap-2.5 min-w-0 hover:text-primary transition-colors"
            >
              <Mail className="w-4 h-4 text-primary shrink-0" />
              <span className="truncate">team@ithubafrica.com</span>
            </a>
            <a
              href="https://www.ithubafrica.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 min-w-0 hover:text-primary transition-colors"
            >
              <Globe className="w-4 h-4 text-primary shrink-0" />
              <span className="truncate">www.ithubafrica.com</span>
            </a>
          </div>
        </div>
      </div>

      <nav aria-label="Policies and company" className="border-t border-background/10 dark:border-white/10 py-5">
        <ul className="container flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-background/70 dark:text-white/70">
          {[...LEGAL_LINKS, ...COMPANY_LINKS].map(link => (
            <li key={link.to}><Link to={link.to} className="hover:text-primary transition-colors">{link.label}</Link></li>
          ))}
          <li><button type="button" onClick={openPreferences} className="hover:text-primary transition-colors">Cookie settings</button></li>
        </ul>
      </nav>

      <div className="border-t border-background/10 dark:border-white/10 py-4 px-6">
        <p className="text-center text-xs text-background/40 dark:text-white/40">
          © {new Date().getFullYear()} IT Hub Africa. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
