// Lets Node load the Deno edge functions: "npm:@supabase/supabase-js@2" is swapped for an in-memory fake.
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('npm:@supabase/supabase-js')) return { url: new URL('./fake-supabase.mjs', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
}
