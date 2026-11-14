import { BrandLogoPill } from '@/components/BrandLogo';
import { Link } from 'react-router-dom';
import { Globe, Mail, MapPin, Phone } from 'lucide-react';
import { useCategories } from '@/hooks/useProducts';
import { BUSINESS, COMPANY_LINKS, LEGAL_LINKS } from '@/config/business';
import { useConsent } from '@/contexts/ConsentContext';
import { useMarketplaceSettings, usePayLaterAvailable } from '@/hooks/useMarketplace';

const linkCls = 'text-white/70 transition-colors hover:text-white';

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-white/90">{title}</h4>
      <ul className="space-y-2.5 text-sm">{children}</ul>
    </div>
  );
}

export default function Footer({ flush = false }: { flush?: boolean }) {
  const { data: categories } = useCategories();
  const { openPreferences } = useConsent();
  const payLaterOn = usePayLaterAvailable();
  const { data: marketplace } = useMarketplaceSettings();
  const year = new Date().getFullYear();

  return (
    <footer
      className={`bg-[#0b1220] text-white ${
        flush
          // No gap above; a thin line separates it from the section above; bottom room clears the mobile nav bar.
          ? 'border-t border-white/10 pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0'
          : 'mt-16'
      }`}
    >
      <div className="container grid grid-cols-2 gap-x-6 gap-y-10 py-12 lg:grid-cols-12 lg:gap-x-8">
        {/* Brand */}
        <div className="col-span-2 lg:col-span-4">
          <Link to="/" aria-label="IT Hub Africa home" className="mb-4 inline-block">
            <BrandLogoPill logoClassName="h-10" />
          </Link>
          <p className="max-w-xs text-sm leading-relaxed text-white/60">
            Buy, Sell, and Grow With Confidence. Nigeria's trusted online marketplace.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/products" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">Shop now</Link>
            <Link to="/sell" className="rounded-md border border-white/20 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10">Sell with us</Link>
          </div>
        </div>

        {/* Shop */}
        <div className="lg:col-span-2">
          <Column title="Shop">
            <li><Link to="/products" className={linkCls}>All Products</Link></li>
            <li><Link to="/products?tab=suppliers" className={linkCls}>Find Suppliers</Link></li>
            <li><Link to="/rfq/new" className={linkCls}>Request a Quote</Link></li>
            {payLaterOn && <li><Link to="/pay-later" className={linkCls}>Pay Later</Link></li>}
            {marketplace?.preorder_enabled !== false && <li><Link to="/preorders" className={linkCls}>Preorders</Link></li>}
            {(categories ?? []).slice(0, 3).map(cat => (
              <li key={cat.id}><Link to={`/category/${cat.slug}`} className={linkCls}>{cat.name}</Link></li>
            ))}
          </Column>
        </div>

        {/* Account */}
        <div className="lg:col-span-2">
          <Column title="Account">
            <li><Link to="/users-login" className={linkCls}>My Account</Link></li>
            <li><Link to="/my-orders" className={linkCls}>My Orders</Link></li>
            <li><Link to="/inquiries" className={linkCls}>My Inquiries</Link></li>
            <li><Link to="/messages" className={linkCls}>Messages</Link></li>
            <li><Link to="/wishlist" className={linkCls}>Wishlist</Link></li>
            <li><Link to="/cart" className={linkCls}>Cart</Link></li>
            <li><Link to="/suppliers-login" className={linkCls}>Supplier Login</Link></li>
          </Column>
        </div>

        {/* Contact */}
        <div className="col-span-2 lg:col-span-4">
          <Column title="Contact us">
            <li className="flex items-start gap-3 text-white/70">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <address className="not-italic leading-relaxed">
                {BUSINESS.addressLines.map((line, i) => (
                  <span key={line}>{line}{i < BUSINESS.addressLines.length - 1 && <br />}</span>
                ))}
              </address>
            </li>
            <li>
              <a href={BUSINESS.phoneHref} className={`flex min-w-0 items-center gap-3 ${linkCls}`}>
                <Phone className="h-4 w-4 shrink-0 text-primary" /><span className="truncate">{BUSINESS.phone}</span>
              </a>
            </li>
            <li>
              <a href={`mailto:${BUSINESS.email}`} className={`flex min-w-0 items-center gap-3 ${linkCls}`}>
                <Mail className="h-4 w-4 shrink-0 text-primary" /><span className="truncate">{BUSINESS.email}</span>
              </a>
            </li>
            <li>
              <a href="https://www.ithubafrica.com" target="_blank" rel="noopener noreferrer" className={`flex min-w-0 items-center gap-3 ${linkCls}`}>
                <Globe className="h-4 w-4 shrink-0 text-primary" /><span className="truncate">www.ithubafrica.com</span>
              </a>
            </li>
          </Column>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container flex flex-col items-center gap-4 py-5 text-xs text-white/50 md:flex-row md:justify-between">
          <p>© {year} IT Hub Africa. All rights reserved.</p>
          <nav aria-label="Policies and company">
            <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2">
              {[...LEGAL_LINKS, ...COMPANY_LINKS].map(link => (
                <li key={link.to}><Link to={link.to} className="transition-colors hover:text-white">{link.label}</Link></li>
              ))}
              <li><button type="button" onClick={openPreferences} className="transition-colors hover:text-white">Cookie settings</button></li>
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  );
}
