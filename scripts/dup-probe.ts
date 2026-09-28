import { loadEnv, getSupabaseCredentials } from '../src/storage/database/supabase-client';

async function main() {
  loadEnv();
  const creds = getSupabaseCredentials();
  console.log('SUPABASE_URL_HOST:', creds.url);
  console.log('KEY_PREFIX:', creds.serviceRoleKey ? creds.serviceRoleKey.substring(0, 10) + '...' : 'EMPTY');
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(creds.url, creds.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.from('workers').select('id').limit(1);
  console.log('workers_conn_test:', data ? 'OK' : 'FAIL', error ? error.message : '');
}

main().catch((e) => { console.error(e); process.exit(1); });