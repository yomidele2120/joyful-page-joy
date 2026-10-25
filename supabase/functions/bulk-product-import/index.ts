import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const preflight = (req: Request) => new Response(null, {
  headers: {
    ...corsHeaders,
    "Access-Control-Allow-Headers": req.headers.get("Access-Control-Request-Headers")
      ?? corsHeaders["Access-Control-Allow-Headers"],
  },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const cleanString = (value: unknown, max = 500) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

function imageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")
      || /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)
      || host.includes(":") || host.endsWith(".internal") || host === "metadata.google.internal") return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function retryFetch(url: string, init: RequestInit = {}, attempts = 3): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url, init);
      if ((response.status < 500 && response.status !== 408 && response.status !== 429) || attempt === attempts - 1) return response;
      lastError = new Error(`Upstream server returned ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
  }
  throw lastError;
}

async function serpSearch(engine: "google_shopping" | "google_images", query: string) {
  const key = Deno.env.get("SERPAPI_API_KEY");
  if (!key) throw new Error("SERPAPI_API_KEY is not configured in Supabase Edge Function secrets.");
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", engine);
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", key);
  const response = await retryFetch(url.toString(), { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`SerpApi ${engine} search failed (${response.status}).`);
  const data = await response.json();
  if (data.error) throw new Error(`SerpApi ${engine} search failed: ${cleanString(data.error, 300)}`);
  return data;
}

function titleMatch(query: string, title: string): number {
  const tokens = (value: string) => new Set(value.toLowerCase().match(/[a-z0-9]+/g) ?? []);
  const sought = tokens(query);
  const found = tokens(title);
  if (!sought.size || !found.size) return 0;
  let matched = 0;
  for (const token of sought) if (found.has(token)) matched++;
  return matched / sought.size;
}

async function accessibleImage(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
    });
    return response.status === 200 && (response.headers.get("content-type") ?? "").startsWith("image/");
  } catch {
    return false;
  }
}

async function enrich(item: Record<string, unknown>, categoryNames: string[]) {
  const name = cleanString(item.source_name, 250);
  const [shopping, images] = await Promise.all([
    serpSearch("google_shopping", name),
    serpSearch("google_images", name),
  ]);

  const shoppingResults = Array.isArray(shopping.shopping_results) ? shopping.shopping_results.slice(0, 8) : [];
  const imageResults = Array.isArray(images.images_results) ? images.images_results.slice(0, 8) : [];
  const sourceUrls = shoppingResults
    .map((result: Record<string, unknown>) => cleanString(result.link, 1000))
    .filter((link: string) => /^https?:\/\//i.test(link));
  const evidence = shoppingResults.map((result: Record<string, unknown>) => ({
    title: cleanString(result.title, 250),
    source: cleanString(result.source, 150),
    snippet: cleanString(result.snippet, 500),
    link: cleanString(result.link, 1000),
  }));

  if (!evidence.length) {
    const candidates = imageResults.map((result: Record<string, unknown>) => ({
      title: cleanString(result.title, 250),
      url: imageUrl(result.original) ?? imageUrl(result.thumbnail),
    })).filter((result: { title: string; url: string | null }) => result.url)
      .sort((a: { title: string; url: string | null }, b: { title: string; url: string | null }) =>
        titleMatch(name, b.title) - titleMatch(name, a.title));
    const candidate = candidates[0];
    const candidateAccessible = candidate?.url ? await accessibleImage(candidate.url) : false;
    return {
      normalized_name: name,
      brand: null,
      category_name: null,
      description: null,
      specs: {},
      image_url: candidate?.url ?? null,
      image_status: candidateAccessible ? "uncertain" : "missing",
      source_urls: [],
      review_notes: "No Google Shopping product evidence was found. Verify product identity and any image manually.",
      raw_data: { evidence: [], identity_confidence: 0, image_match_score: candidate ? titleMatch(name, candidate.title) : 0 },
    };
  }

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) throw new Error("GEMINI_API_KEY is not configured in Supabase Edge Function secrets.");
  const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) throw new Error("GEMINI_MODEL contains unsupported characters.");
  const geminiUrl = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`);
  geminiUrl.searchParams.set("key", geminiKey);
  const geminiResponse = await retryFetch(geminiUrl.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{
          text: "You enrich marketplace product listings using only the supplied product search evidence. Do not invent facts, technical specifications, model identifiers, or source URLs. If product identity or a detail is not supported, use null or omit it. The input name is authoritative for which item is being researched. Return JSON with normalized_name, brand, category_name (choose only an exact supplied category or null), description (only supported claims), specs (object containing only supported facts), and identity_confidence (0 to 1). Do not return any price.",
        }],
      },
      contents: [{
        role: "user",
        parts: [{
          text: JSON.stringify({ product_name: name, allowed_categories: categoryNames, evidence }),
        }],
      }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!geminiResponse.ok) throw new Error(`Gemini enrichment failed (${geminiResponse.status}).`);
  const completion = await geminiResponse.json();
  const content = completion.candidates?.[0]?.content?.parts
    ?.map((part: { text?: unknown }) => typeof part.text === "string" ? part.text : "")
    .join("");
  if (typeof content !== "string" || !content) throw new Error("Gemini returned no product enrichment.");
  let result: Record<string, unknown>;
  try {
    result = JSON.parse(content);
  } catch {
    throw new Error("Gemini returned invalid structured product data.");
  }

  const imageCandidates = [
    ...shoppingResults.map((result: Record<string, unknown>) => ({
      title: cleanString(result.title, 250),
      url: imageUrl(result.thumbnail),
    })),
    ...imageResults.map((result: Record<string, unknown>) => ({
      title: cleanString(result.title, 250),
      url: imageUrl(result.original) ?? imageUrl(result.thumbnail),
    })),
  ].filter((candidate: { title: string; url: string | null }) => candidate.url)
    .sort((a: { title: string; url: string | null }, b: { title: string; url: string | null }) =>
      titleMatch(name, b.title) - titleMatch(name, a.title));

  const checkedImages = await Promise.all(imageCandidates.slice(0, 5).map(async candidate => ({
    ...candidate,
    accessible: candidate.url ? await accessibleImage(candidate.url) : false,
  })));
  const verifiedImage = checkedImages.find(candidate =>
    candidate.accessible && titleMatch(name, candidate.title) >= 0.6);
  const fallbackImage = checkedImages.find(candidate => candidate.accessible) ?? checkedImages[0];
  const best = verifiedImage ?? fallbackImage;
  const chosenImage = best?.url ?? null;
  const imageStatus = verifiedImage ? "verified" : fallbackImage?.accessible ? "uncertain" : "missing";

  const categoryName = cleanString(result.category_name, 120);
  const allowedCategory = categoryNames.find(category => category.toLowerCase() === categoryName.toLowerCase());
  const confidence = typeof result.identity_confidence === "number" ? result.identity_confidence : 0;
  const specs = result.specs && typeof result.specs === "object" && !Array.isArray(result.specs) ? result.specs : {};
  const reviewNotes = confidence < 0.6
    ? "Low product identity confidence. Verify the model and all specifications against the research sources."
    : imageStatus === "uncertain" || imageStatus === "missing"
      ? "Product identity researched, but the image requires manual verification."
      : null;

  return {
    normalized_name: cleanString(result.normalized_name, 250) || name,
    brand: cleanString(result.brand, 120) || null,
    category_name: allowedCategory ?? null,
    description: cleanString(result.description, 4000) || null,
    specs,
    image_url: chosenImage,
    image_status: imageStatus,
    source_urls: sourceUrls,
    review_notes: reviewNotes,
    raw_data: {
      evidence,
      identity_confidence: Math.max(0, Math.min(1, confidence)),
      image_match_score: best ? titleMatch(name, best.title) : 0,
    },
  };
}

function slugify(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100) || "product";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Administrator sign-in is required." }, 401);
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return json({ error: "Supabase server configuration is incomplete." }, 500);
    const db = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: { user }, error: authError } = await db.auth.getUser(token);
    if (authError || !user) return json({ error: "Your session is invalid or expired." }, 401);
    const { data: role, error: roleError } = await db.from("user_roles").select("user_id")
      .eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (roleError) throw roleError;
    if (!role) return json({ error: "Administrator permission is required." }, 403);

    const body = await req.json();
    const action = cleanString(body?.action, 30);
    const jobId = cleanString(body?.job_id, 60);
    if (!jobId) return json({ error: "A valid import job is required." }, 400);
    const { data: job, error: jobError } = await db.from("product_import_jobs").select("*").eq("id", jobId).maybeSingle();
    if (jobError) throw jobError;
    if (!job) return json({ error: "Import job not found." }, 404);

    if (action === "process") {
      if (!Number.isInteger(job.total_rows) || job.total_rows < 1 || job.total_rows > 1000) {
        return json({ error: "Import jobs must contain between 1 and 1,000 product rows." }, 400);
      }
      if (!Deno.env.get("SERPAPI_API_KEY") || !Deno.env.get("GEMINI_API_KEY")) {
        return json({ error: "Configure SERPAPI_API_KEY and GEMINI_API_KEY in Supabase Edge Function secrets before processing." }, 500);
      }
      const { count, error: countError } = await db.from("product_import_items")
        .select("id", { count: "exact", head: true }).eq("job_id", jobId);
      if (countError) throw countError;
      if (count !== job.total_rows) {
        return json({ error: "The job's product rows are incomplete. Upload a complete file as a new job before processing." }, 409);
      }
      const { data: categories, error: categoryError } = await db.from("categories").select("name");
      if (categoryError) throw categoryError;
      const categoryNames = (categories ?? []).map((category: { name: string }) => category.name);
      const { data: candidates, error: candidateError } = await db.from("product_import_items")
        .select("*").eq("job_id", jobId).in("status", ["queued", "failed"])
        .lt("attempt_count", 3).order("created_at").limit(5);
      if (candidateError) throw candidateError;
      const { data: abandoned, error: abandonedError } = await db.from("product_import_items")
        .select("*").eq("job_id", jobId).eq("status", "processing")
        .lt("updated_at", new Date(Date.now() - 5 * 60_000).toISOString())
        .order("updated_at").limit(5);
      if (abandonedError) throw abandonedError;
      const work = [...(candidates ?? []), ...(abandoned ?? [])].slice(0, 5);

      let processed = 0;
      for (const candidate of work) {
        if (candidate.attempt_count >= 3) {
          const { error } = await db.from("product_import_items").update({
            status: "failed",
            error_message: "Processing was interrupted on the final retry. Use Retry failed to try again.",
          }).eq("id", candidate.id).eq("status", "processing").eq("updated_at", candidate.updated_at);
          if (error) throw error;
          continue;
        }
        const { data: claimed, error: claimError } = await db.from("product_import_items")
          .update({ status: "processing", attempt_count: candidate.attempt_count + 1, error_message: null })
          .eq("id", candidate.id).eq("status", candidate.status)
          .eq("updated_at", candidate.updated_at).select("*").maybeSingle();
        if (claimError) throw claimError;
        if (!claimed) continue;
        try {
          const enriched = await enrich(claimed, categoryNames);
          const { error } = await db.from("product_import_items").update({ ...enriched, status: "review" }).eq("id", claimed.id);
          if (error) throw error;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Product enrichment failed.";
          const { error: saveError } = await db.from("product_import_items")
            .update({ status: "failed", error_message: message }).eq("id", claimed.id);
          if (saveError) throw saveError;
        }
        processed++;
      }

      const { data: rows, error: rowsError } = await db.from("product_import_items")
        .select("status, attempt_count").eq("job_id", jobId);
      if (rowsError) throw rowsError;
      const allRows = rows ?? [];
      const remaining = allRows.filter((row: { status: string; attempt_count: number }) =>
        row.status === "queued" || row.status === "processing"
          || (row.status === "failed" && row.attempt_count < 3)).length;
      const failed = allRows.filter((row: { status: string }) => row.status === "failed").length;
      const reviewed = allRows.filter((row: { status: string }) =>
        ["review", "approved", "rejected", "published"].includes(row.status)).length;
      const status = remaining > 0 ? "processing" : failed > 0 ? "failed" : "review";
      const { error: updateJobError } = await db.from("product_import_jobs").update({
        status, processed_rows: reviewed + failed, success_count: reviewed, failed_count: failed,
        error_message: failed ? `${failed} product(s) need retry or manual attention.` : null,
      }).eq("id", jobId);
      if (updateJobError) throw updateJobError;
      return json({ processed, remaining, failed, status });
    }

    if (action === "retry") {
      const { error } = await db.from("product_import_items")
        .update({ status: "queued", attempt_count: 0, error_message: null })
        .eq("job_id", jobId).eq("status", "failed");
      if (error) throw error;
      const { error: updateError } = await db.from("product_import_jobs")
        .update({ status: "queued", error_message: null }).eq("id", jobId);
      if (updateError) throw updateError;
      return json({ status: "queued" });
    }

    if (action === "publish") {
      const itemId = cleanString(body?.item_id, 60);
      const storeImage = body?.store_image === true;
      if (!itemId) return json({ error: "A valid reviewed product is required." }, 400);
      const { data: item, error: itemError } = await db.from("product_import_items")
        .select("*").eq("id", itemId).eq("job_id", jobId).maybeSingle();
      if (itemError) throw itemError;
      if (!item || item.status !== "approved") return json({ error: "Approve this product before publishing it." }, 409);
      if (item.published_product_id) return json({ product_id: item.published_product_id, status: "published" });

      let image = imageUrl(item.image_url);
      if (item.image_url && !image) return json({ error: "The image URL must be a safe HTTPS URL." }, 422);
      if (storeImage && image) {
        const response = await retryFetch(image, { redirect: "manual", signal: AbortSignal.timeout(15_000) }, 2);
        if (!response.ok || response.status !== 200) {
          return json({ error: "The selected image could not be downloaded. Leave storage disabled or choose another image." }, 422);
        }
        const type = response.headers.get("content-type")?.split(";")[0] ?? "";
        if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(type)) {
          return json({ error: "The selected image is not an allowed image format." }, 422);
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength > 10 * 1024 * 1024) return json({ error: "The selected image exceeds the 10 MB storage limit." }, 413);
        const extension = type.split("/")[1] === "jpeg" ? "jpg" : type.split("/")[1];
        const path = `${job.vendor_id}/${item.id}.${extension}`;
        const { error: uploadError } = await db.storage.from("product-images").upload(path, bytes, {
          contentType: type, upsert: true,
        });
        if (uploadError) throw uploadError;
        image = db.storage.from("product-images").getPublicUrl(path).data.publicUrl;
      }

      const { data: category, error: categoryError } = item.category_name
        ? await db.from("categories").select("id").eq("name", item.category_name).maybeSingle()
        : { data: null };
      if (categoryError) throw categoryError;
      if (item.category_name && !category) {
        return json({ error: `Category "${item.category_name}" is not an exact match for an existing marketplace category.` }, 422);
      }
      const productName = item.normalized_name || item.source_name;
      const slug = `${slugify(productName)}-${item.id.slice(0, 8)}`;
      const { data: existingProduct, error: existingError } = await db.from("products")
        .select("id").eq("slug", slug).maybeSingle();
      if (existingError) throw existingError;
      const escapedName = productName.replace(/[\\%_]/g, "\\$&");
      const { data: duplicate, error: duplicateError } = await db.from("products")
        .select("id").eq("vendor_id", job.vendor_id).ilike("name", escapedName).limit(1).maybeSingle();
      if (duplicateError) throw duplicateError;
      if (duplicate && duplicate.id !== existingProduct?.id) {
        return json({ error: "A product with this name already exists in this vendor shop. Edit the imported name or reject this duplicate." }, 409);
      }
      const productData = {
        name: productName,
        slug,
        description: item.description,
        price: item.original_price,
        image_url: image,
        images: image ? [image] : [],
        category_id: category?.id ?? null,
        vendor_id: job.vendor_id,
        brand: item.brand,
        stock_quantity: 0,
        is_active: true,
        specs: item.specs ?? {},
      };
      let productId = existingProduct?.id;
      if (!productId) {
        const { data: product, error: insertError } = await db.from("products")
          .insert(productData).select("id").single();
        if (insertError) throw insertError;
        productId = product.id;
      }
      const { error: markError } = await db.from("product_import_items")
        .update({ status: "published", published_product_id: productId, image_url: image,
          image_status: storeImage && image ? "uploaded" : item.image_status })
        .eq("id", itemId).eq("status", "approved");
      if (markError) throw markError;
      const { data: jobItems, error: jobItemsError } = await db.from("product_import_items")
        .select("status").eq("job_id", jobId);
      if (jobItemsError) throw jobItemsError;
      const terminal = (jobItems ?? []).every((row: { status: string }) =>
        row.status === "published" || row.status === "rejected");
      if (terminal) {
        const { error: jobUpdateError } = await db.from("product_import_jobs")
          .update({ status: (jobItems ?? []).some((row: { status: string }) => row.status === "published") ? "published" : "rejected" })
          .eq("id", jobId);
        if (jobUpdateError) throw jobUpdateError;
      }
      return json({ product_id: productId, status: "published" });
    }

    return json({ error: "Unsupported import action." }, 400);
  } catch (error) {
    console.error("bulk-product-import error:", error);
    return json({ error: error instanceof Error ? error.message : "Bulk import request failed." }, 500);
  }
});
