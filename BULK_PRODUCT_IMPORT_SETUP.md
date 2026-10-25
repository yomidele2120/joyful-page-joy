# Admin bulk product import

The importer is available only in the authenticated admin console under **Marketplace → Bulk product import**. Each job targets one vendor shop. It accepts CSV, XLS, or XLSX files with `Product Name` and `Selling Price` columns and up to 1,000 unique products. Client prices are locked for the lifetime of the import; enrichment and online research prices are never used as selling prices.

## Configure server-side credentials

Set these as **Supabase Edge Function secrets**, not as `VITE_` variables:

- `SERPAPI_API_KEY` — SerpApi key with Google Shopping and Google Images access.
- `GEMINI_API_KEY` — Google AI Studio API key for Gemini.
- `GEMINI_MODEL` — optional; defaults to `gemini-2.5-flash`.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to deployed Supabase Edge Functions. Do not add the service-role key or provider keys to frontend environment files.

Using the Supabase CLI:

```powershell
supabase secrets set SERPAPI_API_KEY=your-serpapi-key GEMINI_API_KEY=your-gemini-api-key
supabase db push
supabase functions deploy bulk-product-import
```

Alternatively, add the provider secrets in the Supabase Dashboard under **Edge Functions → Secrets**, then deploy the function and apply migrations from the repository.

The migration creates the admin-only import/review tables and a public-read `product-images` bucket. Admins can store a selected image only after confirming they have permission to do so; otherwise the product retains its researched source URL.

## Workflow and safety

Create an import job for the chosen shop, then select **Enrich products**. Work is persisted in small batches, so the admin can pause, leave the page, and resume from the saved job. Failed requests are retried up to three times, with an explicit manual retry option. Products remain unpublished in the review queue until an admin edits/reviews them, approves them, and separately chooses **Publish to shop**. Rejected or uncertain products are not published automatically.

The export buttons produce CSV and Excel review copies. Product images are taken only from SerpApi results; inaccessible or weakly matched images are labeled for manual verification. Specifications and description claims are generated from the gathered search evidence, which is linked on each review card.

## Validation

Run the focused 10-row parser and price-preservation test with:

```powershell
npm test -- src/lib/__tests__/productImportFile.test.ts
```

This local test validates the 10-row CSV/XLSX import boundary and exact client prices; it does not call paid provider APIs. A live enrichment run requires the Supabase secrets above and should first be run with a real 10-product file supplied by the marketplace administrator.
