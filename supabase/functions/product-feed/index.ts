// Public product feed for the TikTok catalog ("Upload a feed" -> online feed). Returns every eligible marketplace product
// as CSV (default) or TSV. Open it in a browser to preview. Only public, active products of approved shops are listed;
// no prices or stock beyond what the shop page already shows.
//   GET /functions/v1/product-feed              -> CSV
//   GET /functions/v1/product-feed?format=tsv   -> TSV
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildFeedRow, toFeedText, type FeedRow } from "../_shared/productFeedCore.ts";

const PAGE = 1000;
const MAX_PRODUCTS = 20000;
const columns = [
  "id", "name", "slug", "description", "price", "image_url", "images", "brand", "specs", "stock_quantity",
  "is_preorder", "preorder_approved", "preorder_status", "is_public", "is_active",
  "categories(name)", "vendors!inner(store_name,is_approved)",
].join(",");

const text = (body: string, status: number, extra: Record<string, string> = {}) =>
  new Response(body, { status, headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "text/plain; charset=utf-8", ...extra } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS" } });
  if (req.method !== "GET" && req.method !== "HEAD") return text("Method not allowed", 405);
  try {
    const url = new URL(req.url);
    const format = url.searchParams.get("format") === "tsv" ? "tsv" : "csv";
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: settings } = await db.from("google_merchant_settings").select("website_url").eq("id", true).maybeSingle();
    const siteUrl = String(settings?.website_url || "https://www.ithubafrica.com");

    const rows: FeedRow[] = [];
    let seen = 0;
    for (let from = 0; from < MAX_PRODUCTS; from += PAGE) {
      const { data, error } = await db.from("products").select(columns)
        .eq("is_public", true).neq("is_active", false).eq("vendors.is_approved", true)
        .order("id").range(from, from + PAGE - 1);
      if (error) throw error;
      for (const p of data ?? []) {
        seen++;
        const row = buildFeedRow(p as Record<string, unknown>, { siteUrl });
        if (row) rows.push(row);
      }
      if (!data || data.length < PAGE) break;
    }

    const body = toFeedText(rows, format);
    return new Response(req.method === "HEAD" ? null : body, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": format === "tsv" ? "text/tab-separated-values; charset=utf-8" : "text/csv; charset=utf-8",
        "Content-Disposition": `inline; filename="ithubafrica-products.${format}"`,
        "Cache-Control": "public, max-age=600",
        "X-Products-Listed": String(rows.length),
        "X-Products-Skipped": String(seen - rows.length),
      },
    });
  } catch (e) {
    console.error("product-feed failed", e);
    return text("The product feed is not available right now.", 500);
  }
});
