import { Suspense, lazy } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useSearchParams } from "react-router-dom";
import { CartProvider } from "@/contexts/CartContext";
import { InquiryBasketProvider } from "@/contexts/InquiryBasketContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import ScrollToTop from "@/components/ScrollToTop";
import Index from "./pages/Index";

// Lazy-loaded: the video feed pulls in its own components and isn't
// needed for people who just land on the marketplace to shop, so it's
// kept out of the main bundle and only fetched when visited.
const Feed = lazy(() => import("./pages/Feed"));
import Products from "./pages/Products";
import ProductDetail from "./pages/ProductDetail";
import CategoryPage from "./pages/CategoryPage";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import Auth from "./pages/Auth";
import UserLogin from "./pages/UserLogin";
import UserDashboard from "./pages/UserDashboard";
import SupplierLogin from "./pages/SupplierLogin";
import SupplierSignup from "./pages/SupplierSignup";
import SupplierDashboard from "./pages/SupplierDashboard";
import SupplierChat from "./pages/SupplierChat";
import SupplierShop from "./pages/SupplierShop";
import AdminLogin from "./pages/AdminLogin";
import Wishlist from "./pages/Wishlist";
import AdminDashboard from "./pages/admin/AdminDashboard";
import Messages from "./pages/Messages";
import Inquiries from "./pages/Inquiries";
import RfqNew from "./pages/RfqNew";
import Rfqs from "./pages/Rfqs";
import NotFound from "./pages/NotFound";

// Keep fetched data for a minute so moving between pages doesn't refetch everything.
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: 1 } },
});

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
        <CartProvider>
          <InquiryBasketProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <ScrollToTop />
            <Routes>
              <Route path="/" element={<Index />} />
              <Route
                path="/feed"
                element={
                  <Suspense
                    fallback={<div className="fixed inset-0 bg-black flex items-center justify-center text-white">Loading...</div>}
                  >
                    <Feed />
                  </Suspense>
                }
              />
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
          </BrowserRouter>
          </InquiryBasketProvider>
        </CartProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
