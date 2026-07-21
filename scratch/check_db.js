import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Set SUPABASE_URL and SUPABASE_ANON_KEY outside the repository.');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Read-only diagnostic. Schema changes must use reviewed migrations.
const { error } = await supabase.from('profiles').select('id').limit(1);

if (error) {
  console.error(`Profiles diagnostic failed: ${error.code ?? 'unknown_error'}`);
  process.exitCode = 1;
} else {
  console.log('Profiles endpoint reachable under the current RLS identity.');
}
