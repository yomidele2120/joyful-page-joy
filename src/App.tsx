import { Suspense } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useSearchParams } from "react-router-dom";
import { CartProvider } from "@/contexts/CartContext";
import { InquiryBasketProvider } from "@/contexts/InquiryBasketContext";
import { ConsentProvider } from "@/contexts/ConsentContext";
import CookieConsent from "@/components/CookieConsent";
import ProtectedRoute from "@/components/ProtectedRoute";
import ScrollToTop from "@/components/ScrollToTop";
import Tracker from "@/components/Tracker";
import Index from "./pages/Index";
import { lazyPage } from "@/lib/lazyPage";
import { persistQueryCache, restoreQueryCache } from "@/lib/queryPersist";

// Every page except the home page is loaded only when it is visited, so a first-time visitor downloads
// the home page and not the admin dashboard, charts, video feed and so on.
const Feed = lazyPage(() => import("./pages/Feed"));
const Products = lazyPage(() => import("./pages/Products"));
const ProductDetail = lazyPage(() => import("./pages/ProductDetail"));
const CategoryPage = lazyPage(() => import("./pages/CategoryPage"));
const Cart = lazyPage(() => import("./pages/Cart"));
const Checkout = lazyPage(() => import("./pages/Checkout"));
const Auth = lazyPage(() => import("./pages/Auth"));
const UserLogin = lazyPage(() => import("./pages/UserLogin"));
const UserDashboard = lazyPage(() => import("./pages/UserDashboard"));
const SupplierLogin = lazyPage(() => import("./pages/SupplierLogin"));
const SupplierSignup = lazyPage(() => import("./pages/SupplierSignup"));
const SupplierDashboard = lazyPage(() => import("./pages/SupplierDashboard"));
const SupplierChat = lazyPage(() => import("./pages/SupplierChat"));
const SupplierShop = lazyPage(() => import("./pages/SupplierShop"));
const AdminLogin = lazyPage(() => import("./pages/AdminLogin"));
const Wishlist = lazyPage(() => import("./pages/Wishlist"));
const AdminDashboard = lazyPage(() => import("./pages/admin/AdminDashboard"));
const Messages = lazyPage(() => import("./pages/Messages"));
const Inquiries = lazyPage(() => import("./pages/Inquiries"));
const RfqNew = lazyPage(() => import("./pages/RfqNew"));
const Rfqs = lazyPage(() => import("./pages/Rfqs"));
const NotFound = lazyPage(() => import("./pages/NotFound"));
// Marketplace sections, account pages, legal and company pages
const PayLater = lazyPage(() => import("./pages/PayLater"));
const Preorders = lazyPage(() => import("./pages/Preorders"));
const MyOrders = lazyPage(() => import("./pages/MyOrders"));
const ForgotPassword = lazyPage(() => import("./pages/ForgotPassword"));
const ResetPassword = lazyPage(() => import("./pages/ResetPassword"));
const PrivacyPolicy = lazyPage(() => import("./pages/LegalPages").then(m => ({ default: m.PrivacyPolicy })));
const TermsAndConditions = lazyPage(() => import("./pages/LegalPages").then(m => ({ default: m.TermsAndConditions })));
const CookiePolicy = lazyPage(() => import("./pages/LegalPages").then(m => ({ default: m.CookiePolicy })));
const ShippingPolicy = lazyPage(() => import("./pages/LegalPages").then(m => ({ default: m.ShippingPolicy })));
const ReturnsPolicy = lazyPage(() => import("./pages/LegalPages").then(m => ({ default: m.ReturnsPolicy })));
const SellerAgreement = lazyPage(() => import("./pages/LegalPages").then(m => ({ default: m.SellerAgreement })));
const BnplTerms = lazyPage(() => import("./pages/LegalPages").then(m => ({ default: m.BnplTerms })));
const PreorderPolicy = lazyPage(() => import("./pages/LegalPages").then(m => ({ default: m.PreorderPolicy })));
const DisputePolicy = lazyPage(() => import("./pages/LegalPages").then(m => ({ default: m.DisputePolicy })));
const AboutUs = lazyPage(() => import("./pages/CompanyPages").then(m => ({ default: m.AboutUs })));
const ContactUs = lazyPage(() => import("./pages/CompanyPages").then(m => ({ default: m.ContactUs })));
const Faq = lazyPage(() => import("./pages/CompanyPages").then(m => ({ default: m.Faq })));

// Once the home page has settled, quietly download the pages shoppers visit next (skipped on Data Saver),
// so tapping a product or going to checkout does not wait for a code download.
const SHOPPING_PAGES = [Products, ProductDetail, Cart, Checkout];
function prefetchShoppingPages() {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData) return;
  SHOPPING_PAGES.forEach(page => { void page.preload(); });
}

function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="Loading">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

// Keep fetched data for a minute so moving between pages doesn't refetch everything. Public data (products,
// categories, flyers) has longer lifetimes set in lib/cachePolicy.ts and is saved between visits.
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: 1 } },
});
if (typeof window !== "undefined") {
  restoreQueryCache(queryClient);
  persistQueryCache(queryClient);
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
  window.addEventListener("load", () => (idle ? idle(prefetchShoppingPages) : window.setTimeout(prefetchShoppingPages, 2500)), { once: true });
}

// Old /chat?vendor=... links now open the unified inbox.
function ChatRedirect() {
  const [params] = useSearchParams();
  const vendor = params.get('vendor');
  return <Navigate to={vendor ? `/messages?vendor=${encodeURIComponent(vendor)}` : '/messages'} replace />;
}

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ConsentProvider>
        <CartProvider>
          <InquiryBasketProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <ScrollToTop />
            <CookieConsent />
            <Tracker />
            <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/feed" element={<Feed />} />
              <Route path="/products" element={<Products />} />
              <Route path="/product/:slug" element={<ProductDetail />} />
              <Route path="/category/:slug" element={<CategoryPage />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/users-login" element={<UserLogin />} />
              <Route path="/suppliers-login" element={<SupplierLogin />} />
              <Route path="/supplier-signup" element={<SupplierSignup />} />
              <Route path="/shop/:vendorId" element={<SupplierShop />} />
              <Route path="/admin-login" element={<AdminLogin />} />
              <Route path="/dashboard" element={<Navigate to="/admin" replace />} />
              <Route path="/wishlist" element={<Wishlist />} />
              <Route path="/chat" element={<ChatRedirect />} />
              <Route path="/messages" element={<Messages />} />
              <Route path="/inquiries" element={<Inquiries />} />
              <Route path="/rfq" element={<Rfqs />} />
              <Route path="/pay-later" element={<PayLater />} />
              <Route path="/preorders" element={<Preorders />} />
              <Route path="/my-orders" element={<MyOrders />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<TermsAndConditions />} />
              <Route path="/cookie-policy" element={<CookiePolicy />} />
              <Route path="/shipping-policy" element={<ShippingPolicy />} />
              <Route path="/returns-policy" element={<ReturnsPolicy />} />
              <Route path="/seller-agreement" element={<SellerAgreement />} />
              <Route path="/bnpl-terms" element={<BnplTerms />} />
              <Route path="/preorder-policy" element={<PreorderPolicy />} />
              <Route path="/dispute-resolution" element={<DisputePolicy />} />
              <Route path="/about" element={<AboutUs />} />
              <Route path="/contact" element={<ContactUs />} />
              <Route path="/faq" element={<Faq />} />
              <Route path="/rfq/new" element={<RfqNew />} />

              {/* Protected routes */}
              <Route path="/user-dashboard" element={
                <ProtectedRoute allowedRoles={['user']}>
                  <UserDashboard />
                </ProtectedRoute>
              } />
              <Route path="/supplier-dashboard" element={
                <ProtectedRoute allowedRoles={['vendor']}>
                  <SupplierDashboard />
                </ProtectedRoute>
              } />
              <Route path="/supplier-chat" element={
                <ProtectedRoute allowedRoles={['vendor']}>
                  <SupplierChat />
                </ProtectedRoute>
              } />
              <Route path="/admin" element={
                <ProtectedRoute allowedRoles={['admin']} redirectTo="/admin-login">
                  <AdminDashboard />
                </ProtectedRoute>
              } />

              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
          </BrowserRouter>
          </InquiryBasketProvider>
        </CartProvider>
        </ConsentProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
