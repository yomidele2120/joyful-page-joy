// Cloudinary upload for edge functions (Deno). Secrets come from the function's environment:
//   supabase secrets set CLOUDINARY_CLOUD_NAME=... CLOUDINARY_API_KEY=... CLOUDINARY_API_SECRET=...
// They are never sent to the browser or logged.

export function cloudinaryConfigured(): boolean {
  return !!(Deno.env.get("CLOUDINARY_CLOUD_NAME") && Deno.env.get("CLOUDINARY_API_KEY") && Deno.env.get("CLOUDINARY_API_SECRET"));
}

export async function sha1Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Uploads image bytes to `marketplace/vendors/<vendorId>/products/<name>`. Re-running with the same name replaces the same file. */
export async function uploadProductImage(
  bytes: Uint8Array, contentType: string, vendorId: string, name: string,
): Promise<{ url: string; publicId: string }> {
  const cloud = Deno.env.get("CLOUDINARY_CLOUD_NAME")!;
  const apiKey = Deno.env.get("CLOUDINARY_API_KEY")!;
  const secret = Deno.env.get("CLOUDINARY_API_SECRET")!;
  const publicId = `marketplace/vendors/${vendorId}/products/${name}`;
  const timestamp = Math.round(Date.now() / 1000);
  const allowed = "jpg,jpeg,png,webp,gif,avif";
  // Parameters are signed in alphabetical order, joined as key=value with &, followed by the secret.
  const signature = await sha1Hex(`allowed_formats=${allowed}&overwrite=true&public_id=${publicId}&timestamp=${timestamp}${secret}`);
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: contentType }), "image");
  form.append("api_key", apiKey);
  form.append("timestamp", String(timestamp));
  form.append("signature", signature);
  form.append("public_id", publicId);
  form.append("overwrite", "true");
  form.append("allowed_formats", allowed);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, {
    method: "POST", body: form, signal: AbortSignal.timeout(30_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || typeof json.secure_url !== "string") {
    throw new Error(`Cloudinary upload failed (${res.status})`);
  }
  return { url: json.secure_url, publicId: json.public_id };
}

/** Copies an image that lives at an https address (Cloudinary fetches it itself) into the vendor's folder. Used for TikTok covers, whose own links expire. */
export async function uploadRemoteImage(
  remoteUrl: string, vendorId: string, folder: string, name: string,
): Promise<{ url: string; publicId: string }> {
  const cloud = Deno.env.get("CLOUDINARY_CLOUD_NAME")!;
  const apiKey = Deno.env.get("CLOUDINARY_API_KEY")!;
  const secret = Deno.env.get("CLOUDINARY_API_SECRET")!;
  const publicId = `marketplace/vendors/${vendorId}/${folder}/${name}`;
  const timestamp = Math.round(Date.now() / 1000);
  const allowed = "jpg,jpeg,png,webp,gif,avif";
  const signature = await sha1Hex(`allowed_formats=${allowed}&overwrite=true&public_id=${publicId}&timestamp=${timestamp}${secret}`);
  const form = new FormData();
  form.append("file", remoteUrl);
  form.append("api_key", apiKey);
  form.append("timestamp", String(timestamp));
  form.append("signature", signature);
  form.append("public_id", publicId);
  form.append("overwrite", "true");
  form.append("allowed_formats", allowed);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: "POST", body: form, signal: AbortSignal.timeout(30_000) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || typeof json.secure_url !== "string") throw new Error(`Cloudinary upload failed (${res.status})`);
  return { url: json.secure_url, publicId: json.public_id };
}
