import Layout from '@/components/layout/Layout';
import { Heart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function Wishlist() {
  return (
    <Layout>
      <div className="container py-16 text-center">
        <Heart className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
        <h1 className="font-heading text-2xl font-bold mb-2">Your Wishlist</h1>
        <p className="text-muted-foreground mb-6">Sign in to save your favorite products.</p>
        <Link to="/auth"><Button>Sign In</Button></Link>
      </div>
    </Layout>
  );
}
