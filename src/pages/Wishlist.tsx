import { Navigate, Link } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';

// Signed-in shoppers see their saved products in their dashboard; guests are asked to sign in.
export default function Wishlist() {
  const { user, loading } = useAuth();
  if (!loading && user) return <Navigate to="/user-dashboard?tab=wishlist" replace />;
  return (
    <Layout>
      <div className="container py-16 text-center">
        <Heart className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
        <h1 className="font-heading text-2xl font-bold mb-2">Your Wishlist</h1>
        <p className="text-muted-foreground mb-6">Sign in to save your favorite products.</p>
        <Link to="/users-login"><Button>Sign In</Button></Link>
      </div>
    </Layout>
  );
}
