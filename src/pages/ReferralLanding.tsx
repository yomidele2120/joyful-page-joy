import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { storeReferralCode } from '@/lib/referral';

export default function ReferralLanding() {
  const { code = '' } = useParams();
  const { data, isLoading } = useQuery({
    queryKey: ['referral-public', code],
    queryFn: async () => {
      const { data } = await (supabase as any).rpc('referral_public_profile', { _code: code });
      return data as { code: string; display_name: string | null; bio: string | null; avatar_url: string | null } | null;
    },
  });

  useEffect(() => { storeReferralCode(code); }, [code]);

  const name = data?.display_name;
  return (
    <Layout>
      <main className="container mx-auto max-w-2xl px-4 py-12">
        {isLoading ? <p className="text-sm text-muted-foreground">Loading...</p> : (
          <div className="rounded-2xl border border-border bg-card p-6 text-center sm:p-10">
            {data?.avatar_url && <img src={data.avatar_url} alt="" className="mx-auto mb-4 h-20 w-20 rounded-full object-cover" />}
            <h1 className="font-heading text-2xl font-bold sm:text-3xl">
              {name ? `${name} invites you to sell on IT Hub Africa` : 'Sell your products on IT Hub Africa'}
            </h1>
            {data?.bio && <p className="mt-3 text-muted-foreground">{data.bio}</p>}
            <p className="mt-4 text-sm text-muted-foreground">Open a free supplier account, list your products, and reach buyers across Africa. Upgrade to a paid plan whenever you want more listings and visibility.</p>
            <Button asChild variant="cta" size="lg" className="mt-6 rounded-xl">
              <Link to="/supplier-signup">Create a supplier account</Link>
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">Referral code {code.toUpperCase()} is saved and will be applied when you register.</p>
          </div>
        )}
      </main>
    </Layout>
  );
}
