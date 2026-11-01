import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cloudinaryConfigured, sha1Hex, uploadRemoteImage } from "../_shared/cloudinary.ts";

// Scheduled sweep (see CLOUDINARY_SETUP.md): copies product pictures that still point at another website, or at the old
// Supabase bucket, into Cloudinary, so they survive if the original is removed. Runs with the shared secret in x-cron-secret.
//   * A product is changed only when EVERY picture on it was copied (main picture and extras, same order).
//   * The write applies only if the product was not edited meanwhile (updated_at guard) and touches only image_url and images.
//   * Originals are never deleted (old Supabase files stay). Failures are remembered and retried later; nothing else is touched.
// Secrets: IMAGE_MIRROR_CRON_SECRET, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const BATCH = 20;
const isCloudinary = (u: string) => u.startsWith("https://res.cloudinary.com/");

serve(async (req) => {
  try {
    const secret = Deno.env.get("IMAGE_MIRROR_CRON_SECRET");
    if (req.method !== "POST" || !secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "Unauthorized" }, 401);
    if (!cloudinaryConfigured()) return json({ error: "Cloudinary is not configured on this function." }, 503);
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: rows, error } = await db.rpc("products_needing_image_mirror", { _limit: BATCH });
    if (error) throw error;
    const totals = { checked: 0, migrated: 0, failed: 0, skippedChanged: 0 };

    for (const p of (rows ?? []) as { id: string; vendor_id: string | null; image_url: string; images: string[] | null; updated_at: string }[]) {
      totals.checked++;
      const vendor = p.vendor_id ?? "platform";
      const extras = (p.images ?? []).filter((u) => typeof u === "string" && u);
      try {
        const copy = async (src: string) => {
          if (isCloudinary(src)) return src;
          if (!/^https:\/\//i.test(src)) throw new Error("not an https link");
          return (await uploadRemoteImage(src, vendor, "products", `m${(await sha1Hex(src)).slice(0, 20)}`)).url; // same source -> same file
        };
        const main = await copy(p.image_url);
        const newExtras: string[] = [];
        for (const e of extras) newExtras.push(await copy(e));
        const { data: done, error: upErr } = await db.from("products").update({ image_url: main, images: newExtras })
          .eq("id", p.id).eq("updated_at", p.updated_at).select("id");
        if (upErr) throw upErr;
        if (!done?.length) { totals.skippedChanged++; continue; } // edited meanwhile: picked up next run
        await db.from("image_mirror_failures").delete().eq("product_id", p.id);
        totals.migrated++;
      } catch (e) {
        totals.failed++;
        const { data: f } = await db.from("image_mirror_failures").select("attempts").eq("product_id", p.id).maybeSingle();
        await db.from("image_mirror_failures").upsert({
          product_id: p.id, reason: (e instanceof Error ? e.message : String(e)).slice(0, 300),
          attempts: (f?.attempts ?? 0) + 1, last_attempt: new Date().toISOString(),
        });
      }
    }
    return json(totals);
  } catch (e) {
    console.error("mirror-product-images error:", e instanceof Error ? e.message : String(e));
    return json({ error: "Something went wrong." }, 500);
  }
});
