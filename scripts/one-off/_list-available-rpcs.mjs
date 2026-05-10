import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
const supabase = createSupabaseServiceClient();

// Query pg_proc for available functions in public schema
const { data, error } = await supabase
  .from('pg_proc')
  .select('proname')
  .limit(5);
if (error) console.error('direct pg_proc query failed (expected):', error.message);
console.log('Trying common DDL-exec RPCs:');
for (const fnName of ['exec', 'exec_sql', 'execute_sql', 'run_sql', 'admin_exec', 'sql_exec']) {
  const { error: e } = await supabase.rpc(fnName, { query: 'SELECT 1' });
  console.log(`  ${fnName}: ${e ? 'NOT_FOUND/' + (e.code || 'ERR') : 'EXISTS'}`);
}
process.exit(0);
