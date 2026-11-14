// Test-only: lets Node import the edge function, which uses Deno-style imports.  Used by worker.test.ts:
//   node --import ./supabase/functions/ad-process-jobs/testing/loader.mjs --test supabase/functions/ad-process-jobs/worker.test.ts
import { register } from 'node:module';
register('./hooks.mjs', import.meta.url);
