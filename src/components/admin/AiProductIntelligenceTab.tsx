import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { summarizeAiSuggestions } from '@/lib/aiProductSuggestions';

type AiFeatureSettings = {
  id: boolean;
  description_generation_enabled: boolean;
  listing_enhancement_enabled: boolean;
  categorization_enabled: boolean;
  search_enhancement_enabled: boolean;
  recommendation_enabled: boolean;
  creative_generation_enabled: boolean;
  updated_at: string | null;
};

type AiSuggestionRow = {
  id: string;
  product_id: string | null;
  suggestion_type: string;
  status: string;
  suggested_text: string | null;
  rationale: string | null;
  created_at: string;
  products?: { name?: string | null } | null;
};

export default function AiProductIntelligenceTab() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['admin-ai-feature-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('ai_feature_settings').select('*').maybeSingle();
      if (error) throw error;
      return (data ?? {
        id: true,
        description_generation_enabled: false,
        listing_enhancement_enabled: false,
        categorization_enabled: false,
        search_enhancement_enabled: false,
        recommendation_enabled: false,
        creative_generation_enabled: false,
        updated_at: null,
      }) as AiFeatureSettings;
    },
  });

  const { data: suggestions = [], isLoading: suggestionsLoading } = useQuery({
    queryKey: ['admin-ai-suggestions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_ai_suggestions')
        .select('id, product_id, suggestion_type, status, suggested_text, rationale, created_at, products(name)')
        .order('created_at', { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data ?? []) as AiSuggestionRow[];
    },
  });

  const summary = useMemo(() => summarizeAiSuggestions(suggestions), [suggestions]);

  const updateFeature = async (field: keyof AiFeatureSettings, value: boolean) => {
    if (!settings) return;
    const { error } = await supabase.from('ai_feature_settings').upsert({
      id: true,
      [field]: value,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('AI feature setting saved');
    queryClient.invalidateQueries({ queryKey: ['admin-ai-feature-settings'] });
  };

  const updateSuggestionStatus = async (id: string, status: 'approved' | 'rejected' | 'published') => {
    const { error } = await supabase.from('product_ai_suggestions').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Suggestion marked as ${status}`);
    queryClient.invalidateQueries({ queryKey: ['admin-ai-suggestions'] });
  };

  const row = (label: string, value: boolean, key: keyof AiFeatureSettings) => (
    <div key={key} className="flex items-center justify-between rounded-lg border border-border bg-background p-3">
      <div>
        <p className="font-medium text-sm">{label}</p>
        <p className="text-xs text-muted-foreground">Guardrail: no invented product facts, prices or photos.</p>
      </div>
      <Switch checked={value} onCheckedChange={(checked) => updateFeature(key, checked)} />
    </div>
  );

  if (settingsLoading) return <p className="text-sm text-muted-foreground">Loading AI settings...</p>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total" value={String(summary.total)} />
        <StatCard label="Draft" value={String(summary.draft)} />
        <StatCard label="Review" value={String(summary.review)} />
        <StatCard label="Approved" value={String(summary.approved)} />
        <StatCard label="Published" value={String(summary.published)} />
      </div>

      <div className="space-y-3">
        <h3 className="font-heading font-semibold">AI feature controls</h3>
        {settings && (
          <div className="space-y-3">
            {row('Product description generation', settings.description_generation_enabled, 'description_generation_enabled')}
            {row('Listing enhancement suggestions', settings.listing_enhancement_enabled, 'listing_enhancement_enabled')}
            {row('Category and listing suggestions', settings.categorization_enabled, 'categorization_enabled')}
            {row('Natural-language search enhancement', settings.search_enhancement_enabled, 'search_enhancement_enabled')}
            {row('Recommendation tuning', settings.recommendation_enabled, 'recommendation_enabled')}
            {row('Creative generation for campaigns', settings.creative_generation_enabled, 'creative_generation_enabled')}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-semibold">AI review queue</h3>
          <p className="text-xs text-muted-foreground">Vendor-edited suggestions stay reviewable before publishing.</p>
        </div>
        {suggestionsLoading ? (
          <p className="text-sm text-muted-foreground">Loading suggestions...</p>
        ) : suggestions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No AI suggestions yet. Once a vendor requests product copy or categorization help, they will appear here.
          </div>
        ) : (
          <div className="space-y-3">
            {suggestions.map((rowItem) => (
              <div key={rowItem.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">{rowItem.products?.name ?? 'Product suggestion'}</p>
                    <p className="text-xs text-muted-foreground">{rowItem.suggestion_type} • {new Date(rowItem.created_at).toLocaleDateString()}</p>
                  </div>
                  <span className="rounded-full bg-secondary px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {rowItem.status}
                  </span>
                </div>
                <p className="mt-3 text-sm text-muted-foreground whitespace-pre-wrap">{rowItem.suggested_text || 'No suggestion text yet.'}</p>
                {rowItem.rationale && <p className="mt-2 text-xs text-muted-foreground">Rationale: {rowItem.rationale}</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => updateSuggestionStatus(rowItem.id, 'approved')}>Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => updateSuggestionStatus(rowItem.id, 'rejected')}>Reject</Button>
                  <Button size="sm" onClick={() => updateSuggestionStatus(rowItem.id, 'published')}>Publish</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}
