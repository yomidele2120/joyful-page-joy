import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Store, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export default function SupplierLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await signIn(email, password);
      if (error) throw error;

      // Check if user is a vendor
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Login failed');

      const { data: vendor } = await supabase
        .from('vendors')
        .select('id, is_approved')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!vendor) {
        toast.error('No supplier account found. Please sign up first.');
        await supabase.auth.signOut();
        navigate('/supplier-signup');
        return;
      }

      if (!vendor.is_approved) {
        toast.info('Your supplier account is pending approval. You can still set up your shop.');
      }

      toast.success('Welcome back, Supplier!');
      navigate('/supplier-dashboard');
    } catch (err: any) {
      toast.error(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="container max-w-md py-16">
        <div className="bg-card p-8 rounded-lg card-shadow border-2 border-primary/20">
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
              <Store className="w-5 h-5 text-primary-foreground" />
            </div>
            <h1 className="font-heading text-2xl font-bold">Supplier Sign In</h1>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
            </div>
            <Button type="submit" className="w-full font-heading font-semibold" disabled={loading}>
              {loading ? 'Please wait...' : 'Sign In as Supplier'}
            </Button>
          </form>
          <div className="mt-4 text-center">
            <Link to="/supplier-signup" className="text-primary font-medium hover:underline text-sm">
              Don't have a supplier account? Register here
            </Link>
          </div>
          <div className="mt-6 pt-4 border-t border-border text-center">
            <Link to="/users-login" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1">
              Are you a buyer? Sign in here <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}
