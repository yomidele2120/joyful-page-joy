import { useCallback, useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Check, Download, FileSpreadsheet, Loader2, Play, RefreshCw, Save, ShieldCheck, Sparkles, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { parseProductImportFile } from '@/lib/productImportFile';

type Vendor = { id: string; store_name: string };
type ImportJob = {
  id: string;
  vendor_id: string;
  file_name: string;
  source_type: 'csv' | 'excel';
  status: string;
  total_rows: number;
  processed_rows: number;
  success_count: number;
  failed_count: number;
  skipped_count: number;
  created_at: string;
};
type ImportItem = {
  id: string;
  job_id: string;
  source_name: string;
  source_price: number | null;
  normalized_name: string | null;
  category_name: string | null;
  brand: string | null;
  description: string | null;
  specs: Json;
  image_url: string | null;
  image_status: string;
  price: number;
  original_price: number;
  source_urls: string[];
  source_fields: Json;
  attempt_count: number;
  published_product_id: string | null;
  status: string;
  review_notes: string | null;
  error_message: string | null;
  raw_data: { evidence?: Array<{ title?: string; source?: string; link?: string }> };
};
const statusLabel = (status: string) => status.replace(/_/g, ' ');

function downloadCsv(job: ImportJob, items: ImportItem[]) {
  const specNames = [...new Set(items.flatMap(item => Object.keys(item.specs ?? {})))];
  const fields = ['Source Product Name', 'Client Selling Price', 'Enriched Name', 'Brand', 'Category', 'Description', 'Image URL', 'Image Status', 'Status', 'Review Notes', 'Research Sources', ...specNames];
  const quote = (value: unknown) => {
    let text = String(value ?? '');
    if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const rows = items.map(item => [
    item.source_name, item.original_price, item.normalized_name, item.brand, item.category_name,
    item.description, item.image_url, item.image_status, item.status, item.review_notes,
    item.source_urls.join(' | '), ...specNames.map(name => {
      const specs = item.specs && typeof item.specs === 'object' && !Array.isArray(item.specs)
        ? item.specs as Record<string, Json>
        : {};
      return specs[name] ?? '';
    }),
  ]);
  const csv = [fields, ...rows].map(row => row.map(quote).join(',')).join('\r\n');
  const link = document.createElement('a');
  const objectUrl = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  link.href = objectUrl;
  link.download = `${job.file_name.replace(/\.[^.]+$/, '')}-review.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

function downloadExcel(job: ImportJob, items: ImportItem[]) {
  const specNames = [...new Set(items.flatMap(item => Object.keys(item.specs ?? {})))];
  const rows = items.map(item => {
    const specs = item.specs && typeof item.specs === 'object' && !Array.isArray(item.specs)
      ? item.specs as Record<string, Json>
      : {};
    return {
      'Source Product Name': item.source_name,
      'Client Selling Price': item.original_price,
      'Enriched Name': item.normalized_name ?? '',
      Brand: item.brand ?? '',
      Category: item.category_name ?? '',
      Description: item.description ?? '',
      'Image URL': item.image_url ?? '',
      'Image Status': item.image_status,
      Status: item.status,
      'Review Notes': item.review_notes ?? '',
      'Research Sources': item.source_urls.join(' | '),
      ...Object.fromEntries(specNames.map(name => [name, specs[name] ?? ''])),
    };
  });
  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Product review');
  XLSX.writeFile(workbook, `${job.file_name.replace(/\.[^.]+$/, '')}-review.xlsx`);
}

function downloadCsvTemplate() {
  const headers = ['Product Name', 'Selling Price', 'Brand', 'Category', 'Category ID', 'Description', 'Image URL', 'SKU', 'Stock Quantity', 'Color', 'Storage', 'Size'];
  const csv = `${headers.map(value => `"${value}"`).join(',')}\r\n`;
  const objectUrl = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = 'bulk-product-import-template.csv';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

export default function BulkProductImportTab({ vendors }: { vendors: Vendor[] }) {
  const [vendorId, setVendorId] = useState('');
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [items, setItems] = useState<ImportItem[]>([]);
  const [reviewPage, setReviewPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [processingStopped, setProcessingStopped] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [storeImage, setStoreImage] = useState(false);
  const stopRef = useRef(false);

  useEffect(() => {
    if (!vendorId && vendors.length) setVendorId(vendors[0].id);
  }, [vendorId, vendors]);

  const loadJobs = useCallback(async () => {
    if (!vendorId) { setJobs([]); return; }
    const { data, error } = await supabase.from('product_import_jobs')
      .select('*').eq('vendor_id', vendorId).order('created_at', { ascending: false }).limit(30);
    if (error) throw error;
    const found = (data ?? []) as ImportJob[];
    setJobs(found);
    setSelectedJobId(current => found.some(job => job.id === current) ? current : found[0]?.id ?? '');
  }, [vendorId]);

  const loadItems = useCallback(async (jobId: string) => {
    if (!jobId) { setItems([]); return; }
    const { data, error } = await supabase.from('product_import_items')
      .select('*').eq('job_id', jobId).order('created_at').limit(1000);
    if (error) throw error;
    setItems((data ?? []) as ImportItem[]);
  }, []);

  useEffect(() => {
    setLoading(true);
    void loadJobs().catch(error => toast.error(`Could not load import jobs: ${error.message}`))
      .finally(() => setLoading(false));
  }, [loadJobs]);

  useEffect(() => {
    void loadItems(selectedJobId).catch(error => toast.error(`Could not load review items: ${error.message}`));
  }, [loadItems, selectedJobId]);

  useEffect(() => setReviewPage(1), [selectedJobId]);

  const refresh = async () => {
    await loadJobs();
    await loadItems(selectedJobId);
  };

  const createImport = async () => {
    if (!file || !vendorId) return;
    setBusy(true);
    try {
      const { rows, sourceType } = await parseProductImportFile(file);
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw authError ?? new Error('Administrator session expired. Sign in again.');
      const { data: job, error: jobError } = await supabase.from('product_import_jobs').insert({
        vendor_id: vendorId,
        admin_user_id: authData.user.id,
        file_name: file.name,
        source_type: sourceType,
        total_rows: rows.length,
        status: 'queued',
      }).select('*').single();
      if (jobError) throw jobError;
      for (let offset = 0; offset < rows.length; offset += 250) {
        const batch = rows.slice(offset, offset + 250).map(row => ({
          job_id: job.id,
          source_name: row.name,
          source_price: row.price,
          price: row.price,
          original_price: row.price,
          source_fields: {
            brand: row.brand,
            category_name: row.categoryName,
            category_id: row.categoryId,
            description: row.description,
            image_url: row.imageUrl,
            sku: row.sku,
            stock_quantity: row.stockQuantity,
            specs: row.specs,
          },
        }));
        const { error } = await supabase.from('product_import_items').insert(batch);
        if (error) {
          await supabase.from('product_import_jobs').update({ status: 'failed', error_message: error.message }).eq('id', job.id);
          throw error;
        }
      }
      setFile(null);
      const input = document.getElementById('bulk-import-file') as HTMLInputElement | null;
      if (input) input.value = '';
      await loadJobs();
      setSelectedJobId(job.id);
      toast.success(`${rows.length} products queued. The original selling prices are locked.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create the import job.');
    } finally {
      setBusy(false);
    }
  };

  const runAction = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('bulk-product-import', { body });
    if (error) throw new Error(error.message || 'Bulk import request failed.');
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const processJob = async () => {
    if (!selectedJobId) return;
    stopRef.current = false;
    setProcessingStopped(false);
    setBusy(true);
    let processedTotal = 0;
    try {
      for (let batch = 0; batch < 250 && !stopRef.current; batch++) {
        const result = await runAction({ action: 'process', job_id: selectedJobId });
        processedTotal += Number(result.processed ?? 0);
        await loadJobs();
        await loadItems(selectedJobId);
        if (!result.remaining || !result.processed) break;
      }
      if (stopRef.current) {
        setProcessingStopped(true);
        toast.message('Processing paused. You can resume this job at any time.');
      } else {
        toast.success(`${processedTotal} product(s) processed. Review the results before approving.`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Product enrichment failed.');
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const retryFailed = async () => {
    if (!selectedJobId) return;
    try {
      await runAction({ action: 'retry', job_id: selectedJobId });
      await loadJobs();
      toast.success('Failed products have been queued for another attempt.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not retry failed products.');
    }
  };

  const updateItem = async (itemId: string, values: Partial<ImportItem>) => {
    const { error } = await supabase.from('product_import_items').update(values).eq('id', itemId);
    if (error) throw error;
    await loadItems(selectedJobId);
  };

  const reviewItem = async (item: ImportItem, status: 'approved' | 'rejected') => {
    try {
      await updateItem(item.id, { status });
      toast.success(status === 'approved' ? 'Product approved for publishing.' : 'Product rejected.');
      await loadJobs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update product review.');
    }
  };

  const publishItem = async (item: ImportItem) => {
    try {
      const result = await runAction({ action: 'publish', job_id: item.job_id, item_id: item.id, store_image: storeImage });
      toast.success(result.status === 'skipped'
        ? 'Product skipped because the selected shop already has a matching listing.'
        : 'Approved product published to the selected vendor shop.');
      await loadItems(selectedJobId);
      await loadJobs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not publish product.');
    }
  };

  const job = jobs.find(candidate => candidate.id === selectedJobId);
  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const visibleItems = items.slice((reviewPage - 1) * pageSize, reviewPage * pageSize);
  const statusCounts = items.reduce<Record<string, number>>((counts, item) => {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
    return counts;
  }, {});

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary"><Sparkles className="h-5 w-5" /></div>
          <div>
            <h2 className="font-heading text-lg font-bold">AI product import</h2>
            <p className="text-sm text-muted-foreground">Upload up to 1,000 products for one vendor shop. Repeated names are accepted; products already listed in that shop are skipped and reported. Client prices are never replaced with online prices.</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Vendor shop</Label>
            <Select value={vendorId} onValueChange={setVendorId}>
              <SelectTrigger><SelectValue placeholder="Choose a shop" /></SelectTrigger>
              <SelectContent>{vendors.map(vendor => <SelectItem key={vendor.id} value={vendor.id}>{vendor.store_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bulk-import-file">CSV or Excel file</Label>
            <Input id="bulk-import-file" type="file" accept=".csv,.xlsx,.xls" onChange={event => setFile(event.target.files?.[0] ?? null)} />
            <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={downloadCsvTemplate}>Download CSV template</Button>
          </div>
        </div>
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>Required: <strong>Product Name</strong> and <strong>Selling Price</strong>. Optional product columns: Brand, Category (name), Category ID, Description, Image URL, SKU, Stock Quantity. Add technical specifications as separate columns, such as Color, Storage, or Size. Leave any optional cell blank to skip that field. Repeated product names are allowed.</p>
          <p>Prices must be non-negative with at most 2 decimals. Existing products in the selected shop will be skipped, with a reason shown in the review results.</p>
        </div>
        <Button onClick={createImport} disabled={!file || !vendorId || busy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          Create import job
        </Button>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-64 flex-1 space-y-2">
            <Label>Import job</Label>
            <Select value={selectedJobId} onValueChange={setSelectedJobId}>
              <SelectTrigger><SelectValue placeholder={loading ? 'Loading jobs…' : 'Select an import job'} /></SelectTrigger>
              <SelectContent>{jobs.map(current => <SelectItem key={current.id} value={current.id}>{current.file_name} · {statusLabel(current.status)} · {new Date(current.created_at).toLocaleString()}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={!job || busy || !items.length} onClick={() => job && downloadCsv(job, items)}><Download className="mr-2 h-4 w-4" />CSV export</Button>
            <Button variant="outline" size="sm" disabled={!job || busy || !items.length} onClick={() => job && downloadExcel(job, items)}><FileSpreadsheet className="mr-2 h-4 w-4" />Excel export</Button>
            {job && job.failed_count > 0 && <Button variant="outline" size="sm" disabled={busy} onClick={retryFailed}><RefreshCw className="mr-2 h-4 w-4" />Retry failed</Button>}
            {job && items.some(item => item.status === 'queued' || item.status === 'processing' || item.status === 'failed' && item.attempt_count < 3) && (
              <Button size="sm" disabled={busy} onClick={processJob}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                {job.status === 'processing' ? 'Resume processing' : 'Enrich products'}
              </Button>
            )}
            {busy && <Button variant="outline" size="sm" onClick={() => { stopRef.current = true; }}>Pause</Button>}
          </div>
        </div>

        {job && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg bg-secondary/60 p-3 text-xs">
            <span>Progress: <strong>{items.filter(item => item.status !== 'queued' && item.status !== 'processing').length}/{job.total_rows}</strong></span>
            {Object.entries(statusCounts).map(([status, count]) => <span key={status} className="capitalize">{statusLabel(status)}: <strong>{count}</strong></span>)}
            <span>Skipped existing: <strong>{job.skipped_count}</strong></span>
            {processingStopped && <span className="text-amber-700">Paused; resume to continue.</span>}
          </div>
        )}

        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <Checkbox id="store-approved-image" checked={storeImage} onCheckedChange={checked => setStoreImage(checked === true)} />
          <Label htmlFor="store-approved-image" className="text-xs leading-relaxed">I have permission to store an approved product image in this marketplace's Supabase Storage. If unchecked, the verified source URL is retained.</Label>
        </div>

        {!selectedJobId ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Create an import job or choose a saved job to review.</p>
        ) : !items.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No products are in this job yet.</p>
        ) : (
          <div className="space-y-3">
            {visibleItems.map(item => (
              <ReviewItem
                key={item.id}
                item={item}
                disabled={busy}
                onSave={values => updateItem(item.id, values)}
                onReview={status => reviewItem(item, status)}
                onPublish={() => publishItem(item)}
              />
            ))}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-2">
                <Button variant="outline" size="sm" disabled={reviewPage <= 1} onClick={() => setReviewPage(page => page - 1)}>Previous</Button>
                <span className="text-xs text-muted-foreground">Page {reviewPage} of {totalPages}</span>
                <Button variant="outline" size="sm" disabled={reviewPage >= totalPages} onClick={() => setReviewPage(page => page + 1)}>Next</Button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function ReviewItem({
  item, disabled, onSave, onReview, onPublish,
}: {
  item: ImportItem;
  disabled: boolean;
  onSave: (values: Partial<ImportItem>) => Promise<void>;
  onReview: (status: 'approved' | 'rejected') => void;
  onPublish: () => void;
}) {
  const [name, setName] = useState(item.normalized_name ?? item.source_name);
  const [brand, setBrand] = useState(item.brand ?? '');
  const [category, setCategory] = useState(item.category_name ?? '');
  const [description, setDescription] = useState(item.description ?? '');
  const [imageUrl, setImageUrl] = useState(item.image_url ?? '');
  const [imageVerified, setImageVerified] = useState(item.image_status === 'verified' || item.image_status === 'uploaded');
  const [specs, setSpecs] = useState(JSON.stringify(item.specs ?? {}, null, 2));
  const [notes, setNotes] = useState(item.review_notes ?? '');
  const [saving, setSaving] = useState(false);
  const updateRef = useRef(onSave);

  useEffect(() => { updateRef.current = onSave; }, [onSave]);
  useEffect(() => {
    setName(item.normalized_name ?? item.source_name);
    setBrand(item.brand ?? '');
    setCategory(item.category_name ?? '');
    setDescription(item.description ?? '');
    setImageUrl(item.image_url ?? '');
    setImageVerified(item.image_status === 'verified' || item.image_status === 'uploaded');
    setSpecs(JSON.stringify(item.specs ?? {}, null, 2));
    setNotes(item.review_notes ?? '');
  }, [item]);

  const save = async () => {
    setSaving(true);
    try {
      let parsedSpecs: Json;
      try {
        parsedSpecs = JSON.parse(specs);
      } catch {
        throw new Error('Specifications must be valid JSON.');
      }
      if (!parsedSpecs || Array.isArray(parsedSpecs) || typeof parsedSpecs !== 'object') throw new Error('Specifications must be a JSON object.');
      const imageStatus = !imageUrl.trim()
        ? 'missing'
        : !imageVerified
          ? 'uncertain'
          : item.image_status === 'uploaded' ? 'uploaded' : 'verified';
      await updateRef.current({
        normalized_name: name.trim(),
        brand: brand.trim() || null,
        category_name: category.trim() || null,
        description: description.trim() || null,
        image_url: imageUrl.trim() || null,
        image_status: imageStatus,
        specs: parsedSpecs,
        review_notes: notes.trim() || null,
      });
      toast.success('Review changes saved.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save review changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="rounded-xl border border-border p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{item.source_name}</p>
          <p className="text-sm font-semibold text-primary">Client selling price: {new Intl.NumberFormat(undefined, { style: 'currency', currency: 'NGN' }).format(item.original_price)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-secondary px-2 py-1 capitalize">{statusLabel(item.status)}</span>
          <span className={`rounded-full px-2 py-1 capitalize ${item.image_status === 'verified' || item.image_status === 'uploaded' ? 'bg-green-500/10 text-green-700' : 'bg-amber-500/10 text-amber-800'}`}>Image: {statusLabel(item.image_status)}</span>
        </div>
      </div>

      {item.error_message && <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">{item.error_message}</p>}
      {item.status === 'skipped' && item.review_notes && <p className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-900">{item.review_notes}</p>}
      {item.image_url && <img src={item.image_url} alt="" className="h-32 max-w-full rounded-md border border-border object-contain" loading="lazy" />}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1"><Label>Enriched product name</Label><Input value={name} onChange={event => setName(event.target.value)} maxLength={250} /></div>
        <div className="space-y-1"><Label>Brand</Label><Input value={brand} onChange={event => setBrand(event.target.value)} /></div>
        <div className="space-y-1"><Label>Category</Label><Input value={category} onChange={event => setCategory(event.target.value)} /></div>
        <div className="space-y-1">
          <Label>Image URL</Label>
          <Input value={imageUrl} onChange={event => { setImageUrl(event.target.value); setImageVerified(false); }} type="url" placeholder="https://…" />
          <div className="flex items-center gap-2 pt-1">
            <Checkbox id={`verify-image-${item.id}`} checked={imageVerified} disabled={!imageUrl.trim()} onCheckedChange={checked => setImageVerified(checked === true)} />
            <Label htmlFor={`verify-image-${item.id}`} className="text-xs">I manually confirmed this image matches the product</Label>
          </div>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1"><Label>Description</Label><Textarea value={description} onChange={event => setDescription(event.target.value)} rows={4} /></div>
        <div className="space-y-1"><Label>Technical specifications (JSON)</Label><Textarea value={specs} onChange={event => setSpecs(event.target.value)} rows={4} className="font-mono text-xs" /></div>
      </div>
      <div className="space-y-1"><Label>Admin review notes</Label><Input value={notes} onChange={event => setNotes(event.target.value)} placeholder="Add a note for this product" /></div>
      {item.source_urls.length > 0 && (
        <div className="space-y-1 text-xs">
          <p className="font-medium">Research sources</p>
          <ul className="list-inside list-disc space-y-1">{item.source_urls.slice(0, 5).map((url, index) => <li key={`${url}-${index}`}><a className="break-all text-primary underline" href={url} target="_blank" rel="noreferrer">{item.raw_data.evidence?.[index]?.title || url}</a></li>)}</ul>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={disabled || saving} onClick={save}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save edits</Button>
        {item.status === 'review' && <Button size="sm" disabled={disabled} onClick={() => onReview('approved')}><Check className="mr-2 h-4 w-4" />Approve</Button>}
        {item.status === 'review' && <Button variant="destructive" size="sm" disabled={disabled} onClick={() => onReview('rejected')}><X className="mr-2 h-4 w-4" />Reject</Button>}
        {item.status === 'approved' && <Button size="sm" disabled={disabled} onClick={onPublish}><ShieldCheck className="mr-2 h-4 w-4" />Publish to shop</Button>}
        {item.status === 'published' && <span className="inline-flex items-center text-xs text-green-700"><Check className="mr-1 h-4 w-4" />Published{item.published_product_id ? ` · ${item.published_product_id.slice(0, 8)}` : ''}</span>}
        {item.image_status !== 'verified' && item.image_status !== 'uploaded' && <span className="self-center text-xs text-amber-800">Image needs manual verification.</span>}
      </div>
    </article>
  );
}
