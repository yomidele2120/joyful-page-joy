import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { CartProvider } from "@/contexts/CartContext";
import Index from "./pages/Index";
import Products from "./pages/Products";
import ProductDetail from "./pages/ProductDetail";
import CategoryPage from "./pages/CategoryPage";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import Auth from "./pages/Auth";
import UserLogin from "./pages/UserLogin";
import SupplierLogin from "./pages/SupplierLogin";
import SupplierSignup from "./pages/SupplierSignup";
import SupplierDashboard from "./pages/SupplierDashboard";
import SupplierShop from "./pages/SupplierShop";
import AdminLogin from "./pages/AdminLogin";
import Wishlist from "./pages/Wishlist";
import AdminDashboard from "./pages/admin/AdminDashboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <CartProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/products" element={<Products />} />
            <Route path="/product/:slug" element={<ProductDetail />} />
            <Route path="/category/:slug" element={<CategoryPage />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/users-login" element={<UserLogin />} />
            <Route path="/suppliers-login" element={<SupplierLogin />} />
            <Route path="/supplier-signup" element={<SupplierSignup />} />
            <Route path="/supplier-dashboard" element={<SupplierDashboard />} />
            <Route path="/shop/:vendorId" element={<SupplierShop />} />
            <Route path="/admin-login" element={<AdminLogin />} />
            <Route path="/wishlist" element={<Wishlist />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </CartProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
