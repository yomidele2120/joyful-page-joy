export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'npm:@supabase/supabase-js@2') {
    return { url: new URL('./supabase-stub.mjs', import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
